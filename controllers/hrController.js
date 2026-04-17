import StaffProfile from "../models/StaffProfile.js";
import Contract from "../models/Contract.js";
import LeaveType from "../models/LeaveType.js";
import LeaveBalance from "../models/LeaveBalance.js";
import LeaveRequest from "../models/LeaveRequest.js";
import Certification from "../models/Certification.js";
import ProfessionalDevelopment from "../models/ProfessionalDevelopment.js";
import PerformanceReview from "../models/PerformanceReview.js";
import HRSettings from "../models/HRSettings.js";
import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import mongoose from "mongoose";

// ═══════════════════════════════════════════════════════════
// HR SETTINGS
// ═══════════════════════════════════════════════════════════

export const getHRSettings = asyncHandler(async (req, res) => {
  let settings = await HRSettings.findOne({ school: req.user.school });
  if (!settings) {
    settings = await HRSettings.create({
      school: req.user.school,
      reviewDefaults: {
        defaultCategories: [
          { name: "Instruction Quality", weight: 2 },
          { name: "Classroom Management", weight: 1.5 },
          { name: "Professionalism", weight: 1 },
          { name: "Communication", weight: 1 },
          { name: "Collaboration", weight: 1 },
        ],
      },
    });
  }
  res.json({ success: true, data: settings });
});

export const updateHRSettings = asyncHandler(async (req, res) => {
  const settings = await HRSettings.findOneAndUpdate(
    { school: req.user.school },
    { $set: req.body },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, data: settings });
});

// ═══════════════════════════════════════════════════════════
// STAFF PROFILES
// ═══════════════════════════════════════════════════════════

const generateEmployeeId = async (schoolId) => {
  const settings = await HRSettings.findOne({ school: schoolId });
  const prefix = settings?.employeeIdFormat?.prefix || "EMP";
  const padding = settings?.employeeIdFormat?.zeroPadding || 4;
  const next = settings?.employeeIdFormat?.nextNumber || 1;
  const id = `${prefix}-${String(next).padStart(padding, "0")}`;
  if (settings) {
    settings.employeeIdFormat.nextNumber = next + 1;
    await settings.save();
  }
  return id;
};

export const getStaffProfiles = asyncHandler(async (req, res) => {
  const { staffType, department, status, search, page = 1, limit = 50 } = req.query;
  const filter = { school: req.user.school };
  if (staffType) filter.staffType = staffType;
  if (department) filter.department = department;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  let query = StaffProfile.find(filter)
    .populate("user", "firstName lastName email phone avatar role")
    .populate("department", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  if (search) {
    // We'll search by user name via a separate lookup, or use staff employeeId
    filter.$or = [
      { employeeId: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: "i" } },
      { "personalInfo.nationality": { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: "i" } },
    ];
  }

  const [staff, total] = await Promise.all([
    query,
    StaffProfile.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: staff,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

export const getStaffProfile = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({
    _id: req.params.id,
    school: req.user.school,
  })
    .populate("user", "firstName lastName email phone avatar role")
    .populate("department", "name")
    .populate("teacher", "employeeId subjects assignedClasses");

  if (!profile) {
    res.status(404);
    throw new Error("Staff profile not found");
  }
  res.json({ success: true, data: profile });
});

export const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({
    user: req.user._id,
    school: req.user.school,
  })
    .populate("user", "firstName lastName email phone avatar role")
    .populate("department", "name");

  if (!profile) {
    res.status(404);
    throw new Error("No HR profile found for your account");
  }
  res.json({ success: true, data: profile });
});

export const createStaffProfile = asyncHandler(async (req, res) => {
  const { userId, staffType, department, personalInfo, hireDate, notes, customFields } = req.body;

  const user = await User.findOne({ _id: userId, school: req.user.school });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Check if profile already exists
  const existing = await StaffProfile.findOne({ user: userId, school: req.user.school });
  if (existing) {
    res.status(400);
    throw new Error("Staff profile already exists for this user");
  }

  const employeeId = await generateEmployeeId(req.user.school);

  // Auto-link to Teacher record if applicable
  let teacher = null;
  if (staffType === "teacher") {
    const teacherRecord = await Teacher.findOne({ user: userId, school: req.user.school });
    if (teacherRecord) teacher = teacherRecord._id;
  }

  const profile = await StaffProfile.create({
    school: req.user.school,
    user: userId,
    teacher,
    staffType,
    employeeId,
    department: department || null,
    personalInfo: personalInfo || {},
    hireDate: hireDate || new Date(),
    notes,
    customFields,
  });

  // Auto-allocate leave balances
  await allocateLeaveBalances(req.user.school, profile._id, staffType);

  const populated = await StaffProfile.findById(profile._id)
    .populate("user", "firstName lastName email phone avatar role")
    .populate("department", "name");

  res.status(201).json({ success: true, data: populated });
});

export const updateStaffProfile = asyncHandler(async (req, res) => {
  const allowedFields = [
    "staffType", "department", "personalInfo", "status", "hireDate",
    "endDate", "probationEndDate", "qualifications", "bankInfo", "notes", "customFields",
  ];
  const updates = {};
  allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const profile = await StaffProfile.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $set: updates },
    { new: true, runValidators: true }
  )
    .populate("user", "firstName lastName email phone avatar role")
    .populate("department", "name");

  if (!profile) {
    res.status(404);
    throw new Error("Staff profile not found");
  }
  res.json({ success: true, data: profile });
});

export const getStaffDirectory = asyncHandler(async (req, res) => {
  const staff = await StaffProfile.find({
    school: req.user.school,
    isActive: true,
    status: { $in: ["active", "probation"] },
  })
    .populate("user", "firstName lastName email phone avatar")
    .populate("department", "name")
    .select("employeeId staffType department personalInfo.photoUrl")
    .sort({ staffType: 1 });

  res.json({ success: true, data: staff });
});

// ═══════════════════════════════════════════════════════════
// CONTRACTS
// ═══════════════════════════════════════════════════════════

export const getContracts = asyncHandler(async (req, res) => {
  const { staffId, status } = req.query;
  const filter = { school: req.user.school };
  if (staffId) filter.staff = staffId;
  if (status) filter.status = status;

  const contracts = await Contract.find(filter)
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName" } })
    .sort({ createdAt: -1 });

  res.json({ success: true, data: contracts });
});

export const createContract = asyncHandler(async (req, res) => {
  const { staffId, type, startDate, endDate, salary, allowances, benefits, workSchedule, documentUrl, renewalDate } = req.body;

  const staff = await StaffProfile.findOne({ _id: staffId, school: req.user.school });
  if (!staff) {
    res.status(404);
    throw new Error("Staff profile not found");
  }

  // Deactivate any previous active contract
  await Contract.updateMany(
    { staff: staffId, school: req.user.school, status: "active" },
    { status: "expired" }
  );

  const contract = await Contract.create({
    school: req.user.school,
    staff: staffId,
    type,
    startDate,
    endDate: endDate || null,
    salary: salary || {},
    allowances: allowances || [],
    benefits: benefits || [],
    workSchedule: workSchedule || {},
    documentUrl,
    renewalDate,
    status: "active",
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: contract });
});

export const updateContract = asyncHandler(async (req, res) => {
  const contract = await Contract.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!contract) {
    res.status(404);
    throw new Error("Contract not found");
  }
  res.json({ success: true, data: contract });
});

export const terminateContract = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const contract = await Contract.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school, status: "active" },
    { status: "terminated", terminationDate: new Date(), terminationReason: reason },
    { new: true }
  );
  if (!contract) {
    res.status(404);
    throw new Error("Active contract not found");
  }
  res.json({ success: true, data: contract });
});

export const getExpiringContracts = asyncHandler(async (req, res) => {
  const { days = 60 } = req.query;
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + Number(days));

  const contracts = await Contract.find({
    school: req.user.school,
    status: "active",
    endDate: { $ne: null, $lte: deadline },
  })
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName email" } })
    .sort({ endDate: 1 });

  res.json({ success: true, data: contracts });
});

// ═══════════════════════════════════════════════════════════
// LEAVE TYPES
// ═══════════════════════════════════════════════════════════

export const getLeaveTypes = asyncHandler(async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.active === "true") filter.isActive = true;

  const types = await LeaveType.find(filter).sort({ order: 1, name: 1 });
  res.json({ success: true, data: types });
});

export const createLeaveType = asyncHandler(async (req, res) => {
  const type = await LeaveType.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: type });
});

export const updateLeaveType = asyncHandler(async (req, res) => {
  const type = await LeaveType.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!type) {
    res.status(404);
    throw new Error("Leave type not found");
  }
  res.json({ success: true, data: type });
});

export const deleteLeaveType = asyncHandler(async (req, res) => {
  const type = await LeaveType.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { isActive: false },
    { new: true }
  );
  if (!type) {
    res.status(404);
    throw new Error("Leave type not found");
  }
  res.json({ success: true, data: type });
});

// ═══════════════════════════════════════════════════════════
// LEAVE BALANCES
// ═══════════════════════════════════════════════════════════

const allocateLeaveBalances = async (schoolId, staffId, staffType) => {
  const settings = await HRSettings.findOne({ school: schoolId });
  const year = settings?.currentAcademicYear || new Date().getFullYear().toString();

  const types = await LeaveType.find({ school: schoolId, isActive: true });

  for (const lt of types) {
    if (lt.appliesTo.length > 0 && !lt.appliesTo.includes(staffType)) continue;

    const existing = await LeaveBalance.findOne({
      school: schoolId, staff: staffId, leaveType: lt._id, academicYear: year,
    });
    if (existing) continue;

    await LeaveBalance.create({
      school: schoolId,
      staff: staffId,
      leaveType: lt._id,
      academicYear: year,
      allocated: lt.daysPerYear,
    });
  }
};

export const getLeaveBalances = asyncHandler(async (req, res) => {
  const { staffId, academicYear } = req.query;
  const filter = { school: req.user.school };
  if (staffId) filter.staff = staffId;
  if (academicYear) filter.academicYear = academicYear;

  const balances = await LeaveBalance.find(filter)
    .populate("leaveType", "name code color")
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName" } });

  res.json({ success: true, data: balances });
});

export const getMyLeaveBalances = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
  if (!profile) {
    res.status(404);
    throw new Error("No HR profile found");
  }

  const settings = await HRSettings.findOne({ school: req.user.school });
  const year = req.query.academicYear || settings?.currentAcademicYear || new Date().getFullYear().toString();

  const balances = await LeaveBalance.find({
    school: req.user.school,
    staff: profile._id,
    academicYear: year,
  }).populate("leaveType", "name code color daysPerYear allowHalfDay");

  res.json({ success: true, data: balances });
});

export const adjustLeaveBalance = asyncHandler(async (req, res) => {
  const { adjustment, notes } = req.body;
  const balance = await LeaveBalance.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $inc: { adjustment: Number(adjustment) }, adjustmentNotes: notes },
    { new: true }
  ).populate("leaveType", "name code");

  if (!balance) {
    res.status(404);
    throw new Error("Leave balance not found");
  }
  res.json({ success: true, data: balance });
});

export const bulkAllocateBalances = asyncHandler(async (req, res) => {
  const { academicYear } = req.body;
  if (!academicYear) {
    res.status(400);
    throw new Error("academicYear is required");
  }

  const staffProfiles = await StaffProfile.find({ school: req.user.school, isActive: true });
  let created = 0;

  for (const sp of staffProfiles) {
    const types = await LeaveType.find({ school: req.user.school, isActive: true });
    for (const lt of types) {
      if (lt.appliesTo.length > 0 && !lt.appliesTo.includes(sp.staffType)) continue;
      const exists = await LeaveBalance.findOne({
        school: req.user.school, staff: sp._id, leaveType: lt._id, academicYear,
      });
      if (exists) continue;

      // Carry-over calculation
      let carriedOver = 0;
      if (lt.carryOver) {
        const prevYear = (parseInt(academicYear) - 1).toString();
        const prevBalance = await LeaveBalance.findOne({
          school: req.user.school, staff: sp._id, leaveType: lt._id, academicYear: prevYear,
        });
        if (prevBalance) {
          const remaining = prevBalance.allocated + prevBalance.carriedOver + prevBalance.adjustment - prevBalance.used;
          carriedOver = Math.min(Math.max(remaining, 0), lt.maxCarryDays || Infinity);
        }
      }

      await LeaveBalance.create({
        school: req.user.school,
        staff: sp._id,
        leaveType: lt._id,
        academicYear,
        allocated: lt.daysPerYear,
        carriedOver,
      });
      created++;
    }
  }

  res.json({ success: true, data: { created } });
});

// ═══════════════════════════════════════════════════════════
// LEAVE REQUESTS
// ═══════════════════════════════════════════════════════════

export const getLeaveRequests = asyncHandler(async (req, res) => {
  const { status, staffId, startDate, endDate, page = 1, limit = 30 } = req.query;
  const filter = { school: req.user.school };
  if (status) filter.status = status;
  if (staffId) filter.staff = staffId;
  if (startDate || endDate) {
    filter.startDate = {};
    if (startDate) filter.startDate.$gte = new Date(startDate);
    if (endDate) filter.startDate.$lte = new Date(endDate);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [requests, total] = await Promise.all([
    LeaveRequest.find(filter)
      .populate("leaveType", "name code color")
      .populate({ path: "staff", populate: { path: "user", select: "firstName lastName avatar" } })
      .populate("reviewedBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    LeaveRequest.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: requests,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

export const getMyLeaveRequests = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
  if (!profile) {
    res.status(404);
    throw new Error("No HR profile found");
  }

  const requests = await LeaveRequest.find({ school: req.user.school, staff: profile._id })
    .populate("leaveType", "name code color")
    .sort({ createdAt: -1 });

  res.json({ success: true, data: requests });
});

export const submitLeaveRequest = asyncHandler(async (req, res) => {
  const { leaveTypeId, startDate, endDate, days, reason, documentUrl, documentFileName, contactPhone, delegateTo, isHalfDay, halfDayPeriod } = req.body;

  const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
  if (!profile) {
    res.status(400);
    throw new Error("No HR profile found for your account");
  }

  const leaveType = await LeaveType.findOne({ _id: leaveTypeId, school: req.user.school, isActive: true });
  if (!leaveType) {
    res.status(404);
    throw new Error("Leave type not found or inactive");
  }

  // Balance check
  const settings = await HRSettings.findOne({ school: req.user.school });
  const year = settings?.currentAcademicYear || new Date().getFullYear().toString();
  const balance = await LeaveBalance.findOne({
    school: req.user.school, staff: profile._id, leaveType: leaveTypeId, academicYear: year,
  });

  const requestedDays = Number(days) || 1;

  if (balance && !leaveType.allowNegativeBalance) {
    const remaining = balance.allocated + balance.carriedOver + balance.adjustment - balance.used - balance.pending;
    if (requestedDays > remaining) {
      res.status(400);
      throw new Error(`Insufficient leave balance. Available: ${remaining} days`);
    }
  }

  const request = await LeaveRequest.create({
    school: req.user.school,
    staff: profile._id,
    leaveType: leaveTypeId,
    startDate, endDate,
    days: requestedDays,
    isHalfDay: isHalfDay || false,
    halfDayPeriod: halfDayPeriod || "",
    reason,
    documentUrl, documentFileName,
    contactPhone,
    delegateTo: delegateTo || null,
    status: leaveType.autoApprove ? "approved" : "pending",
  });

  // Update pending count
  if (balance) {
    if (leaveType.autoApprove) {
      balance.used += requestedDays;
    } else {
      balance.pending += requestedDays;
    }
    await balance.save();
  }

  const populated = await LeaveRequest.findById(request._id)
    .populate("leaveType", "name code color")
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName" } });

  res.status(201).json({ success: true, data: populated });
});

export const approveLeaveRequest = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const request = await LeaveRequest.findOne({
    _id: req.params.id, school: req.user.school, status: "pending",
  });
  if (!request) {
    res.status(404);
    throw new Error("Pending leave request not found");
  }

  request.status = "approved";
  request.reviewedBy = req.user._id;
  request.reviewedAt = new Date();
  request.reviewNote = note || "";
  await request.save();

  // Move from pending to used
  const settings = await HRSettings.findOne({ school: req.user.school });
  const year = settings?.currentAcademicYear || new Date().getFullYear().toString();
  await LeaveBalance.findOneAndUpdate(
    { school: req.user.school, staff: request.staff, leaveType: request.leaveType, academicYear: year },
    { $inc: { pending: -request.days, used: request.days } }
  );

  const populated = await LeaveRequest.findById(request._id)
    .populate("leaveType", "name code color")
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName" } });

  res.json({ success: true, data: populated });
});

export const rejectLeaveRequest = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const request = await LeaveRequest.findOne({
    _id: req.params.id, school: req.user.school, status: "pending",
  });
  if (!request) {
    res.status(404);
    throw new Error("Pending leave request not found");
  }

  request.status = "rejected";
  request.reviewedBy = req.user._id;
  request.reviewedAt = new Date();
  request.reviewNote = note || "";
  await request.save();

  // Release pending days
  const settings = await HRSettings.findOne({ school: req.user.school });
  const year = settings?.currentAcademicYear || new Date().getFullYear().toString();
  await LeaveBalance.findOneAndUpdate(
    { school: req.user.school, staff: request.staff, leaveType: request.leaveType, academicYear: year },
    { $inc: { pending: -request.days } }
  );

  res.json({ success: true, data: request });
});

export const cancelLeaveRequest = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const request = await LeaveRequest.findOne({
    _id: req.params.id, school: req.user.school,
    status: { $in: ["pending", "approved"] },
  });
  if (!request) {
    res.status(404);
    throw new Error("Leave request not found or cannot be cancelled");
  }

  const prevStatus = request.status;
  request.status = "cancelled";
  request.cancelledAt = new Date();
  request.cancelledBy = req.user._id;
  request.cancellationReason = reason || "";
  await request.save();

  // Restore balance
  const settings = await HRSettings.findOne({ school: req.user.school });
  const year = settings?.currentAcademicYear || new Date().getFullYear().toString();
  const inc = prevStatus === "approved"
    ? { used: -request.days }
    : { pending: -request.days };

  await LeaveBalance.findOneAndUpdate(
    { school: req.user.school, staff: request.staff, leaveType: request.leaveType, academicYear: year },
    { $inc: inc }
  );

  res.json({ success: true, data: request });
});

export const getLeaveCalendar = asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  const startOfMonth = new Date(Number(year), Number(month) - 1, 1);
  const endOfMonth = new Date(Number(year), Number(month), 0, 23, 59, 59);

  const requests = await LeaveRequest.find({
    school: req.user.school,
    status: "approved",
    startDate: { $lte: endOfMonth },
    endDate: { $gte: startOfMonth },
  })
    .populate("leaveType", "name code color")
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName avatar" } })
    .select("staff leaveType startDate endDate days isHalfDay halfDayPeriod");

  res.json({ success: true, data: requests });
});

// ═══════════════════════════════════════════════════════════
// CERTIFICATIONS
// ═══════════════════════════════════════════════════════════

export const getCertifications = asyncHandler(async (req, res) => {
  const { staffId, category, expiring } = req.query;
  const filter = { school: req.user.school };
  if (staffId) filter.staff = staffId;
  if (category) filter.category = category;
  if (expiring === "true") {
    const alertDays = 30;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + alertDays);
    filter.expiryDate = { $ne: null, $lte: deadline };
  }

  const certs = await Certification.find(filter)
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName" } })
    .sort({ expiryDate: 1 });

  res.json({ success: true, data: certs });
});

export const getMyCertifications = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
  if (!profile) {
    res.status(404);
    throw new Error("No HR profile found");
  }

  const certs = await Certification.find({ school: req.user.school, staff: profile._id })
    .sort({ expiryDate: 1 });
  res.json({ success: true, data: certs });
});

export const createCertification = asyncHandler(async (req, res) => {
  const { staffId, name, category, issuedBy, issueDate, expiryDate, credentialId, documentUrl, documentFileName, isRequired, notes } = req.body;

  // Determine staff: if staffId is provided (admin), use that; otherwise use own profile
  let targetStaffId = staffId;
  if (!targetStaffId) {
    const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
    if (!profile) {
      res.status(400);
      throw new Error("No HR profile found");
    }
    targetStaffId = profile._id;
  }

  const cert = await Certification.create({
    school: req.user.school,
    staff: targetStaffId,
    name, category, issuedBy, issueDate, expiryDate, credentialId,
    documentUrl, documentFileName, isRequired, notes,
  });

  res.status(201).json({ success: true, data: cert });
});

export const updateCertification = asyncHandler(async (req, res) => {
  const cert = await Certification.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!cert) {
    res.status(404);
    throw new Error("Certification not found");
  }
  res.json({ success: true, data: cert });
});

export const deleteCertification = asyncHandler(async (req, res) => {
  const cert = await Certification.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  if (!cert) {
    res.status(404);
    throw new Error("Certification not found");
  }
  res.json({ success: true, message: "Certification deleted" });
});

// ═══════════════════════════════════════════════════════════
// PROFESSIONAL DEVELOPMENT
// ═══════════════════════════════════════════════════════════

export const getPDRecords = asyncHandler(async (req, res) => {
  const { staffId, category, status } = req.query;
  const filter = { school: req.user.school };
  if (staffId) filter.staff = staffId;
  if (category) filter.category = category;
  if (status) filter.status = status;

  const records = await ProfessionalDevelopment.find(filter)
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName" } })
    .sort({ startDate: -1 });

  res.json({ success: true, data: records });
});

export const getMyPDRecords = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
  if (!profile) {
    res.status(404);
    throw new Error("No HR profile found");
  }

  const records = await ProfessionalDevelopment.find({ school: req.user.school, staff: profile._id })
    .sort({ startDate: -1 });
  res.json({ success: true, data: records });
});

export const createPDRecord = asyncHandler(async (req, res) => {
  let targetStaffId = req.body.staffId;
  if (!targetStaffId) {
    const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
    if (!profile) {
      res.status(400);
      throw new Error("No HR profile found");
    }
    targetStaffId = profile._id;
  }

  const record = await ProfessionalDevelopment.create({
    ...req.body,
    school: req.user.school,
    staff: targetStaffId,
  });

  res.status(201).json({ success: true, data: record });
});

export const updatePDRecord = asyncHandler(async (req, res) => {
  const record = await ProfessionalDevelopment.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!record) {
    res.status(404);
    throw new Error("PD record not found");
  }
  res.json({ success: true, data: record });
});

export const deletePDRecord = asyncHandler(async (req, res) => {
  const record = await ProfessionalDevelopment.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  if (!record) {
    res.status(404);
    throw new Error("PD record not found");
  }
  res.json({ success: true, message: "PD record deleted" });
});

export const getPDSummary = asyncHandler(async (req, res) => {
  const { academicYear } = req.query;
  const matchStage = { school: new mongoose.Types.ObjectId(req.user.school) };
  if (academicYear) {
    const yearStart = new Date(`${academicYear}-01-01`);
    const yearEnd = new Date(`${parseInt(academicYear) + 1}-01-01`);
    matchStage.startDate = { $gte: yearStart, $lt: yearEnd };
  }

  const [byCategory, byStaff, totals] = await Promise.all([
    ProfessionalDevelopment.aggregate([
      { $match: matchStage },
      { $group: { _id: "$category", totalHours: { $sum: "$hours" }, count: { $sum: 1 } } },
      { $sort: { totalHours: -1 } },
    ]),
    ProfessionalDevelopment.aggregate([
      { $match: matchStage },
      { $group: { _id: "$staff", totalHours: { $sum: "$hours" }, count: { $sum: 1 } } },
      { $sort: { totalHours: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "staffprofiles", localField: "_id", foreignField: "_id", as: "profile",
        },
      },
      { $unwind: "$profile" },
      {
        $lookup: {
          from: "users", localField: "profile.user", foreignField: "_id", as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          totalHours: 1, count: 1,
          staffName: { $concat: ["$user.firstName", " ", "$user.lastName"] },
        },
      },
    ]),
    ProfessionalDevelopment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalHours: { $sum: "$hours" },
          totalActivities: { $sum: 1 },
          uniqueStaff: { $addToSet: "$staff" },
        },
      },
      { $project: { totalHours: 1, totalActivities: 1, staffCount: { $size: "$uniqueStaff" } } },
    ]),
  ]);

  res.json({ success: true, data: { byCategory, byStaff, totals: totals[0] || { totalHours: 0, totalActivities: 0, staffCount: 0 } } });
});

// ═══════════════════════════════════════════════════════════
// PERFORMANCE REVIEWS
// ═══════════════════════════════════════════════════════════

export const getReviews = asyncHandler(async (req, res) => {
  const { staffId, academicYear, status, period } = req.query;
  const filter = { school: req.user.school };
  if (staffId) filter.staff = staffId;
  if (academicYear) filter.academicYear = academicYear;
  if (status) filter.status = status;
  if (period) filter.period = period;

  const reviews = await PerformanceReview.find(filter)
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName avatar" } })
    .populate("reviewer", "firstName lastName")
    .sort({ createdAt: -1 });

  res.json({ success: true, data: reviews });
});

export const getMyReviews = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
  if (!profile) {
    res.status(404);
    throw new Error("No HR profile found");
  }

  const reviews = await PerformanceReview.find({ school: req.user.school, staff: profile._id })
    .populate("reviewer", "firstName lastName")
    .sort({ createdAt: -1 });

  res.json({ success: true, data: reviews });
});

export const createReview = asyncHandler(async (req, res) => {
  const { staffId, academicYear, period, dueDate, ratings, strengths, areasForGrowth, actionPlan, goals } = req.body;

  const staff = await StaffProfile.findOne({ _id: staffId, school: req.user.school });
  if (!staff) {
    res.status(404);
    throw new Error("Staff profile not found");
  }

  const review = await PerformanceReview.create({
    school: req.user.school,
    staff: staffId,
    reviewer: req.user._id,
    academicYear,
    period,
    dueDate,
    ratings: ratings || [],
    strengths,
    areasForGrowth,
    actionPlan,
    goals: goals || [],
    status: "draft",
  });

  res.status(201).json({ success: true, data: review });
});

export const updateReview = asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findOne({ _id: req.params.id, school: req.user.school });
  if (!review) {
    res.status(404);
    throw new Error("Review not found");
  }

  // Staff can only update self-assessment fields
  if (review.staff.toString() !== req.body._staffProfileId) {
    // Admin/reviewer update
    Object.assign(review, req.body);
  }

  await review.save();

  const populated = await PerformanceReview.findById(review._id)
    .populate({ path: "staff", populate: { path: "user", select: "firstName lastName" } })
    .populate("reviewer", "firstName lastName");

  res.json({ success: true, data: populated });
});

export const submitSelfAssessment = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
  if (!profile) {
    res.status(404);
    throw new Error("No HR profile found");
  }

  const review = await PerformanceReview.findOne({
    _id: req.params.id, school: req.user.school, staff: profile._id,
  });
  if (!review) {
    res.status(404);
    throw new Error("Review not found");
  }

  review.selfAssessment = {
    ...req.body,
    submitted: true,
    submittedAt: new Date(),
  };
  if (review.status === "self_assessment") {
    review.status = "in_review";
  }
  await review.save();

  res.json({ success: true, data: review });
});

export const acknowledgeReview = asyncHandler(async (req, res) => {
  const profile = await StaffProfile.findOne({ user: req.user._id, school: req.user.school });
  if (!profile) {
    res.status(404);
    throw new Error("No HR profile found");
  }

  const review = await PerformanceReview.findOne({
    _id: req.params.id, school: req.user.school, staff: profile._id, status: "submitted",
  });
  if (!review) {
    res.status(404);
    throw new Error("Submitted review not found");
  }

  review.staffResponse = req.body.response || "";
  review.disagreement = req.body.disagreement || false;
  review.disagreementNote = req.body.disagreementNote || "";
  review.acknowledgedAt = new Date();
  review.status = "acknowledged";
  await review.save();

  res.json({ success: true, data: review });
});

// ═══════════════════════════════════════════════════════════
// HR DASHBOARD
// ═══════════════════════════════════════════════════════════

export const getHRDashboard = asyncHandler(async (req, res) => {
  const school = new mongoose.Types.ObjectId(req.user.school);

  const [
    staffCounts,
    pendingLeave,
    expiringCerts,
    expiringContracts,
    leaveToday,
    recentHires,
  ] = await Promise.all([
    // Staff by type
    StaffProfile.aggregate([
      { $match: { school, isActive: true } },
      { $group: { _id: "$staffType", count: { $sum: 1 } } },
    ]),
    // Pending leave requests
    LeaveRequest.countDocuments({ school: req.user.school, status: "pending" }),
    // Expiring certifications (30 days)
    Certification.countDocuments({
      school: req.user.school,
      expiryDate: { $ne: null, $lte: new Date(Date.now() + 30 * 86400000) },
    }),
    // Expiring contracts (60 days)
    Contract.countDocuments({
      school: req.user.school,
      status: "active",
      endDate: { $ne: null, $lte: new Date(Date.now() + 60 * 86400000) },
    }),
    // Who's on leave today
    LeaveRequest.find({
      school: req.user.school,
      status: "approved",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    })
      .populate({ path: "staff", populate: { path: "user", select: "firstName lastName avatar" } })
      .populate("leaveType", "name color")
      .select("staff leaveType startDate endDate days")
      .limit(20),
    // Recent hires (last 30 days)
    StaffProfile.find({
      school: req.user.school,
      hireDate: { $gte: new Date(Date.now() - 30 * 86400000) },
    })
      .populate("user", "firstName lastName avatar")
      .select("employeeId staffType hireDate")
      .sort({ hireDate: -1 })
      .limit(10),
  ]);

  const totalStaff = staffCounts.reduce((s, c) => s + c.count, 0);

  res.json({
    success: true,
    data: {
      totalStaff,
      staffByType: staffCounts,
      pendingLeaveRequests: pendingLeave,
      expiringCertifications: expiringCerts,
      expiringContracts,
      onLeaveToday: leaveToday,
      recentHires,
    },
  });
});
