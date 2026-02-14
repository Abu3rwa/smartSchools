import AttendanceRequest from '../models/AttendanceRequest.js';
import AttendanceRequestType from '../models/AttendanceRequestType.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import notificationService from '../services/notificationService.js';
import { getAttachmentUrl } from '../middleware/uploadAttendanceRequest.js';

/**
 * Resolve principals to notify: school admins + department principals for request.department
 */
async function getPrincipalsForRequest(schoolId, departmentId) {
    const conditions = [{ role: 'admin' }];
    if (departmentId) {
        conditions.push({ role: 'department_principal', department: departmentId });
    }
    const principals = await User.find({ school: schoolId, $or: conditions })
        .select('_id email')
        .setOptions({ skipTenantFilter: true });
    return principals;
}

/**
 * @desc    Get requester context for form prefill (e.g. teacher: department + direct supervisor)
 * @route   GET /api/attendance-requests/requester-context
 * @access  Private
 */
export const getRequesterContext = asyncHandler(async (req, res) => {
    const user = req.user;
    const schoolId = req.schoolId;
    let departmentOrSupervisor = '';

    if (user.role === 'teacher') {
        const teacherProfile = await Teacher.findOne({ user: user._id, school: schoolId })
            .populate('department', 'name')
            .setOptions({ skipTenantFilter: true });
        if (teacherProfile?.department) {
            const deptName = teacherProfile.department.name || '';
            const principal = await User.findOne({
                school: schoolId,
                role: 'department_principal',
                department: teacherProfile.department._id,
            })
                .select('firstName lastName')
                .setOptions({ skipTenantFilter: true });
            const principalName = principal ? `${principal.firstName} ${principal.lastName}`.trim() : '';
            departmentOrSupervisor = principalName ? `${deptName} - ${principalName}` : deptName;
        }
    }

    res.status(200).json({
        success: true,
        data: { departmentOrSupervisor },
    });
});

/**
 * @desc    Get students the current user can submit an attendance request for (parent: children; student: self)
 * @route   GET /api/attendance-requests/eligible-students
 * @access  Private (parent, student)
 */
export const getEligibleStudents = asyncHandler(async (req, res) => {
    const user = req.user;
    if (user.role === 'parent') {
        const email = user.email?.toLowerCase();
        const students = await Student.find({
            school: req.schoolId,
            $or: [
                { 'parentInfo.fatherEmail': new RegExp(`^${(email || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                { 'parentInfo.motherEmail': new RegExp(`^${(email || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            ],
        })
            .select('_id firstName lastName studentId currentClass')
            .populate('currentClass', 'name')
            .sort({ firstName: 1 });
        return res.status(200).json({ success: true, data: students });
    }
    if (user.role === 'student') {
        const student = await Student.findOne({ school: req.schoolId, user: user._id })
            .select('_id firstName lastName studentId currentClass')
            .populate('currentClass', 'name');
        return res.status(200).json({ success: true, data: student ? [student] : [] });
    }
    res.status(200).json({ success: true, data: [] });
});

/**
 * @desc    Create attendance request (multipart: requestType, departmentOrSupervisor, notes, student?, attachment?)
 * @route   POST /api/attendance-requests
 * @access  Private (admin, department_principal, teacher, parent, student)
 */
export const createAttendanceRequest = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const user = req.user;
    const { requestType: requestTypeId, requestDate, fromTime, toTime, startDate, endDate, departmentOrSupervisor, notes, student: studentId } = req.body;
    const role = user.role === 'department_principal' ? 'teacher' : user.role;
    const allowedRequesterRoles = ['teacher', 'parent', 'student', 'admin'];
    if (!allowedRequesterRoles.includes(role)) {
        return res.status(403).json({ success: false, message: 'You cannot submit an attendance request' });
    }

    if (!requestTypeId) {
        return res.status(400).json({ success: false, message: 'Request type is required' });
    }

    const requestType = await AttendanceRequestType.findOne({ _id: requestTypeId, school: schoolId, isActive: true });
    if (!requestType) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive request type' });
    }

    if (requestType.requiresProof && (!req.file || !req.file.filename)) {
        return res.status(400).json({ success: false, message: 'Supporting proof document is required for this request type' });
    }

    const useDateRange = requestType.useDateRange === true;
    let parsedRequestDate = null;
    let parsedStartDate = null;
    let parsedEndDate = null;

    if (useDateRange) {
        if (!startDate) return res.status(400).json({ success: false, message: 'Start date is required' });
        if (!endDate) return res.status(400).json({ success: false, message: 'End date is required' });
        parsedStartDate = new Date(startDate);
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime())) return res.status(400).json({ success: false, message: 'Invalid start date' });
        if (isNaN(parsedEndDate.getTime())) return res.status(400).json({ success: false, message: 'Invalid end date' });
        if (parsedEndDate < parsedStartDate) return res.status(400).json({ success: false, message: 'End date must be on or after start date' });
    } else {
        if (!requestDate) return res.status(400).json({ success: false, message: 'Date is required' });
        if (!fromTime || !fromTime.trim()) return res.status(400).json({ success: false, message: 'From time is required' });
        if (!toTime || !toTime.trim()) return res.status(400).json({ success: false, message: 'To time is required' });
        parsedRequestDate = new Date(requestDate);
        if (isNaN(parsedRequestDate.getTime())) return res.status(400).json({ success: false, message: 'Invalid date' });
    }

    const needsDepartment = ['teacher', 'admin'].includes(role) || (role === 'department_principal');
    if (needsDepartment && (!departmentOrSupervisor || !departmentOrSupervisor.trim())) {
        return res.status(400).json({ success: false, message: 'Department / Direct supervisor is required' });
    }

    let student = null;
    let departmentId = null;

    if (studentId) {
        const studentDoc = await Student.findById(studentId).setOptions({ skipTenantFilter: true });
        if (!studentDoc || studentDoc.school.toString() !== schoolId.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid student' });
        }
        if (role === 'parent') {
            const parentEmail = user.email?.toLowerCase();
            const father = studentDoc.parentInfo?.fatherEmail?.toLowerCase();
            const mother = studentDoc.parentInfo?.motherEmail?.toLowerCase();
            if (father !== parentEmail && mother !== parentEmail) {
                return res.status(403).json({ success: false, message: 'You are not linked to this student' });
            }
        } else if (role === 'student') {
            const linkedUserId = studentDoc.user?.toString();
            if (linkedUserId !== user._id.toString()) {
                return res.status(403).json({ success: false, message: 'You can only submit for yourself' });
            }
        }
        student = studentDoc._id;
        departmentId = studentDoc.department || null;
    } else if (role === 'teacher') {
        const teacherProfile = await Teacher.findOne({ user: user._id, school: schoolId }).setOptions({ skipTenantFilter: true });
        if (teacherProfile?.department) departmentId = teacherProfile.department;
    }

    const requesterName = `${user.firstName} ${user.lastName}`.trim() || user.email;
    const attachmentUrl = req.file ? getAttachmentUrl(req.file.filename) : null;

    const request = await AttendanceRequest.create({
        school: schoolId,
        requester: user._id,
        requesterName,
        requesterEmail: user.email,
        requesterRole: role,
        student: student || undefined,
        department: departmentId || undefined,
        requestType: requestType._id,
        requestDate: useDateRange ? parsedStartDate : parsedRequestDate,
        startDate: useDateRange ? parsedStartDate : undefined,
        endDate: useDateRange ? parsedEndDate : undefined,
        fromTime: useDateRange ? '' : (fromTime || ''),
        toTime: useDateRange ? '' : (toTime || ''),
        departmentOrSupervisor: departmentOrSupervisor || '',
        notes: notes || '',
        attachmentUrl,
        status: 'pending',
    });

    const populated = await AttendanceRequest.findById(request._id).populate('requestType');
    const principals = await getPrincipalsForRequest(schoolId, departmentId);
    if (principals.length > 0) {
        try {
            await notificationService.sendAttendanceRequestNewToPrincipals(populated, principals, user._id.toString());
        } catch (err) {
            console.error('Failed to notify principals of new attendance request:', err?.message || err);
        }
    }

    const created = await AttendanceRequest.findById(request._id)
        .populate('requestType', 'labelEn labelAr requiresProof')
        .populate('student', 'firstName lastName studentId');
    res.status(201).json({
        success: true,
        message: 'Attendance request submitted. You will be notified when it is reviewed.',
        data: created,
    });
});

/**
 * @desc    List attendance requests (scoped: principal sees all in scope, requester sees own)
 * @route   GET /api/attendance-requests
 * @access  Private
 */
export const listAttendanceRequests = asyncHandler(async (req, res) => {
    const { status, startDate, endDate, requester } = req.query;
    const user = req.user;
    const schoolId = req.schoolId;

    const isPrincipal = ['admin', 'department_principal'].includes(user.role);
    const query = { school: schoolId };

    if (isPrincipal) {
        if (user.role === 'department_principal' && user.department) {
            query.$or = [
                { department: user.department },
                { department: null },
            ];
        }
    } else {
        query.requester = user._id;
    }

    if (status) query.status = status;
    if (isPrincipal && requester) query.requester = requester;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const requests = await AttendanceRequest.find(query)
        .populate('requestType', 'labelEn labelAr requiresProof')
        .populate('student', 'firstName lastName studentId')
        .populate('requester', 'firstName lastName email')
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        data: requests,
    });
});

/**
 * @desc    Get one attendance request
 * @route   GET /api/attendance-requests/:id
 * @access  Private (requester or principal in scope)
 */
export const getAttendanceRequest = asyncHandler(async (req, res) => {
    const request = await AttendanceRequest.findById(req.params.id)
        .populate('requestType', 'labelEn labelAr requiresProof')
        .populate('student', 'firstName lastName studentId')
        .populate('requester', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName');
    if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
    }
    const user = req.user;
    const isPrincipal = ['admin', 'department_principal'].includes(user.role);
    const requesterId = request.requester?._id || request.requester;
    const isRequester = requesterId && requesterId.toString() === user._id.toString();
    if (!isRequester && !isPrincipal) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this request' });
    }
    if (isPrincipal && user.role === 'department_principal' && user.department) {
        const reqDept = request.department?.toString();
        const myDept = user.department.toString();
        if (reqDept && reqDept !== myDept) {
            return res.status(403).json({ success: false, message: 'Not in your department' });
        }
    }
    res.status(200).json({ success: true, data: request });
});

/**
 * @desc    Review (approve/reject) attendance request
 * @route   PATCH /api/attendance-requests/:id/review
 * @access  Private (admin, department_principal)
 */
export const reviewAttendanceRequest = asyncHandler(async (req, res) => {
    const { status, reviewNote } = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'status must be approved or rejected' });
    }
    const request = await AttendanceRequest.findById(req.params.id).populate('requestType', 'labelEn labelAr');
    if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
    }
    if (request.status !== 'pending') {
        return res.status(400).json({ success: false, message: 'Request has already been reviewed' });
    }
    const user = req.user;
    if (user.role === 'department_principal' && user.department) {
        const reqDept = request.department?.toString();
        const myDept = user.department.toString();
        if (!reqDept || reqDept !== myDept) {
            return res.status(403).json({ success: false, message: 'Not in your department' });
        }
    }
    request.status = status;
    request.reviewedBy = user._id;
    request.reviewedAt = new Date();
    request.reviewNote = reviewNote || '';
    await request.save();
    try {
        await notificationService.sendAttendanceRequestStatusToRequester(request, user._id.toString());
    } catch (err) {
        console.error('Failed to notify requester of status:', err?.message || err);
    }
    const updated = await AttendanceRequest.findById(request._id)
        .populate('requestType', 'labelEn labelAr')
        .populate('student', 'firstName lastName studentId')
        .populate('requester', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName');
    res.status(200).json({
        success: true,
        message: `Request ${status}`,
        data: updated,
    });
});
