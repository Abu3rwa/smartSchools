import mongoose from 'mongoose';
import Teacher from '../models/Teacher.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Department from '../models/Department.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { applyDepartmentScope } from '../helpers/departmentScope.js';
import { runImportPipeline } from '../services/import/importPipeline.js';
import {
    deliverLoginInvite,
    generateInvitePassword,
    upsertInvitedUser
} from '../services/accountInviteService.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const generateStrongTempPassword = generateInvitePassword;

/**
 * If the value is already a valid ObjectId, return it.
 * If it's a department name string (e.g. "General"), look it up and return the _id.
 * Returns null if nothing matches.
 */
async function resolveDepartmentId(value, schoolId) {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    // Treat as department name and look up
    const dept = await Department.findOne({ school: schoolId, name: { $regex: new RegExp(`^${value}$`, 'i') } }).select('_id').lean();
    return dept ? dept._id : null;
}

/**
 * Legacy data fix:
 * Some historical records stored Teacher.department as plain text (e.g. "General")
 * instead of ObjectId. This breaks validations on updates. Normalize once on write paths.
 */
async function normalizeLegacyTeacherDepartment(teacherId, schoolId) {
    if (!mongoose.Types.ObjectId.isValid(teacherId) || !mongoose.Types.ObjectId.isValid(schoolId)) {
        return;
    }

    const rawTeacher = await Teacher.collection.findOne(
        { _id: new mongoose.Types.ObjectId(teacherId), school: new mongoose.Types.ObjectId(schoolId) },
        { projection: { department: 1, departmentName: 1 } }
    );

    if (!rawTeacher) return;

    const legacyDepartment = rawTeacher.department;
    if (typeof legacyDepartment !== 'string') return;
    if (mongoose.Types.ObjectId.isValid(legacyDepartment)) return;

    await Teacher.collection.updateOne(
        { _id: rawTeacher._id },
        {
            $set: {
                departmentName: rawTeacher.departmentName || legacyDepartment,
                department: null
            }
        }
    );
}

const prepareTeacherLoginInvite = async ({
    teacher,
    actorUserId,
    sendEmail = true
}) => {
    const teacherUser = await User.findById(teacher.user)
        .select('firstName lastName email')
        .setOptions({ skipTenantFilter: true });

    if (!teacherUser?.email) {
        throw new Error('Teacher account does not have an email address');
    }

    const tempPassword = generateStrongTempPassword();
    const inviteProvision = await upsertInvitedUser({
        existingUserId: teacherUser._id,
        schoolId: teacher.school,
        email: teacherUser.email,
        firstName: teacherUser.firstName,
        lastName: teacherUser.lastName,
        role: 'teacher',
        tempPassword
    });

    const inviteDelivery = sendEmail
        ? await deliverLoginInvite({
            schoolId: teacher.school,
            actorUserId,
            recipientUser: inviteProvision.user,
            recipientEmail: inviteProvision.email,
            recipientName: `${teacherUser.firstName || ''} ${teacherUser.lastName || ''}`.trim(),
            role: 'teacher',
            tempPassword
        })
        : { emailSent: false, error: null };

    return {
        teacherId: teacher._id,
        userId: inviteProvision.user._id,
        email: inviteProvision.email,
        tempPassword,
        created: inviteProvision.created,
        emailSent: inviteDelivery.emailSent,
        error: inviteDelivery.error || null
    };
};

/**
 * @desc    Get all teachers
 * @route   GET /api/teachers
 * @access  Private
 */
export const getTeachers = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, department, isActive, includeInactive } = req.query;

    const query = {};
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = String(limit).toLowerCase() === 'all'
        ? 0
        : Math.max(parseInt(limit, 10) || 0, 0);
    const shouldPaginate = parsedLimit > 0;

    applyDepartmentScope(query, req.departmentId);
    if (req.queryFilter?.departmentId) query.department = req.queryFilter.departmentId;
    else if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    else if (includeInactive !== 'true') query.isActive = true;

    // Apply search filter at DB level for performance and consistent pagination
    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        const matchingUsers = await User.find({
            school: req.schoolId,
            $or: [
                { firstName: regex },
                { lastName: regex },
                { email: regex }
            ]
        }).select('_id').lean();
        const userIds = matchingUsers.map((userDoc) => userDoc._id);

        query.$or = [
            { employeeId: regex },
            ...(userIds.length > 0 ? [{ user: { $in: userIds } }] : [])
        ];
    }

    const total = await Teacher.countDocuments(query);

    let teachersQuery = Teacher.find(query)
        .populate('user', 'firstName lastName email phone mustChangePassword loginInvite')
        .populate('department', 'name type')
        .populate('subjects', 'name code')
        .populate('assignedClasses.class', 'name grade section')
        .populate('assignedClasses.subject', 'name code')
        .sort({ createdAt: -1 });

    if (shouldPaginate) {
        teachersQuery = teachersQuery
            .skip((parsedPage - 1) * parsedLimit)
            .limit(parsedLimit);
    }

    const teachers = await teachersQuery;

    res.json({
        success: true,
        data: {
            teachers,
            pagination: {
                page: parsedPage,
                limit: shouldPaginate ? parsedLimit : total,
                total,
                pages: shouldPaginate ? Math.ceil(total / parsedLimit) : 1
            }
        }
    });
});

/**
 * @desc    Get single teacher
 * @route   GET /api/teachers/:id
 * @access  Private
 */
export const getTeacher = asyncHandler(async (req, res) => {
    const teacherQuery = { _id: req.params.id };
    if (req.query.includeInactive !== 'true') {
        teacherQuery.isActive = true;
    }

    const teacher = await Teacher.findOne(teacherQuery)
        .populate('user', 'firstName lastName email phone avatar mustChangePassword loginInvite')
        .populate('department', 'name type')
        .populate('subjects', 'name code description')
        .populate('assignedClasses.class', 'name grade section academicYear')
        .populate('assignedClasses.subject', 'name code');

    if (!teacher) {
        return res.status(404).json({
            success: false,
            message: 'Teacher not found'
        });
    }

    // Department principal can only view teachers in their department
    if (req.departmentId && teacher.department?.toString() !== req.departmentId.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to view this teacher'
        });
    }

    res.json({
        success: true,
        data: { teacher }
    });
});

/**
 * @desc    Create teacher
 * @route   POST /api/teachers
 * @access  Private (Admin)
 */
export const createTeacher = asyncHandler(async (req, res) => {
    const {
        email,
        password,
        firstName,
        lastName,
        phone,
        employeeId,
        department: bodyDepartment,
        qualification,
        specialization,
        subjects
    } = req.body;

    // Department principal can only create teachers in their department
    const department = req.departmentId || await resolveDepartmentId(bodyDepartment, req.schoolId);

    const resolvedPassword = (password && String(password).trim()) || generateStrongTempPassword();
    const passwordAutoGenerated = !(password && String(password).trim());

    // Check if user already exists (global email lookup)
    let user = await User.findOne({ email }).setOptions({ skipTenantFilter: true });
    let isNewUser = false;

    if (!user) {
        // Create new user if doesn't exist
        user = await User.create({
            email,
            password: resolvedPassword,
            firstName,
            lastName,
            phone,
            role: 'teacher',
            school: req.schoolId,
            mustChangePassword: passwordAutoGenerated
        });
        isNewUser = true;
    } else if (user.role !== 'teacher') {
        return res.status(400).json({
            success: false,
            message: `User exists with role '${user.role}'. Only users with 'teacher' role can be linked to teacher profiles.`
        });
    }

    // Generate employee ID if not provided (use max+1 to avoid reuse after deletions or race)
    let empId = employeeId?.trim() || null;
    if (!empId) {
        const year = new Date().getFullYear().toString().slice(-2);
        const prefix = `TCH${year}`;
        const existing = await Teacher.find({ school: req.schoolId, employeeId: new RegExp('^' + prefix) })
            .select('employeeId')
            .lean();
        const maxSeq = existing.length
            ? Math.max(...existing.map((t) => parseInt(t.employeeId.slice(-4), 10) || 0))
            : 0;
        empId = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
    } else {
        const exists = await Teacher.findOne({ school: req.schoolId, employeeId: empId });
        if (exists) {
            return res.status(400).json({
                success: false,
                message: `Employee ID "${empId}" is already in use. Please use another value.`
            });
        }
    }

    // Create teacher profile (retry once on duplicate key race)
    let teacher;
    try {
        teacher = await Teacher.create({
            school: req.schoolId,
            user: user._id,
            employeeId: empId,
            department: department || undefined,
            qualification,
            specialization,
            subjects: subjects || []
        });
    } catch (createErr) {
        if (createErr.code === 11000 && createErr.keyValue?.employeeId && !employeeId?.trim()) {
            const year = new Date().getFullYear().toString().slice(-2);
            const prefix = `TCH${year}`;
            const existing = await Teacher.find({ school: req.schoolId, employeeId: new RegExp('^' + prefix) })
                .select('employeeId')
                .lean();
            const maxSeq = existing.length
                ? Math.max(...existing.map((t) => parseInt(t.employeeId.slice(-4), 10) || 0))
                : 0;
            const retryId = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
            teacher = await Teacher.create({
                school: req.schoolId,
                user: user._id,
                employeeId: retryId,
                department: department || undefined,
                qualification,
                specialization,
                subjects: subjects || []
            });
        } else {
            throw createErr;
        }
    }

    const populatedTeacher = await Teacher.findById(teacher._id)
        .populate('user', 'firstName lastName email phone mustChangePassword loginInvite')
        .populate('department', 'name type')
        .populate('subjects', 'name code');

    res.status(isNewUser ? 201 : 200).json({
        success: true,
        message: isNewUser ? 'Teacher created successfully' : 'Teacher profile linked to existing user',
        data: {
            teacher: populatedTeacher,
            ...(passwordAutoGenerated && isNewUser ? { temporaryPassword: resolvedPassword } : {})
        }
    });
});

/**
 * @desc    Import teachers
 * @route   POST /api/teachers/import
 * @access  Private (Admin, Department Principal)
 */
export const importTeachers = asyncHandler(async (req, res) => {
    const result = await runImportPipeline({
        entityType: 'teachers',
        mode: 'commit',
        payload: req.body,
        context: {
            schoolId: req.schoolId,
            school: req.school,
            userId: req.user?._id,
            academicYear: req.academicYear
        }
    });

    res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        data: {
            imported: result.summary.importedRows,
            failed: result.summary.failedRows,
            skipped: result.summary.skippedRows,
            total: result.summary.totalRows,
            importRunId: result.importRunId,
            errorReportUrl: result.errorReportUrl,
            errors: result.errors
        },
        summary: result.summary,
        warnings: result.warnings
    });
});

/**
 * @desc    Update teacher
 * @route   PUT /api/teachers/:id
 * @access  Private (Admin)
 */
export const updateTeacher = asyncHandler(async (req, res) => {
    let teacher = await Teacher.findOne({ _id: req.params.id, isActive: true });

    if (!teacher) {
        return res.status(404).json({
            success: false,
            message: 'Teacher not found'
        });
    }

    // Department principal can only update teachers in their department
    if (req.departmentId && teacher.department?.toString() !== req.departmentId.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to update this teacher'
        });
    }

    const { firstName, lastName, phone, email, ...rest } = req.body;

    const allowedTeacherFields = ['department', 'qualification', 'specialization', 'subjects', 'joiningDate', 'address', 'isActive'];
    const updates = {};
    allowedTeacherFields.forEach((field) => {
        if (rest[field] !== undefined) updates[field] = rest[field];
    });

    // Resolve department name to ObjectId if needed
    if (updates.department) {
        updates.department = await resolveDepartmentId(updates.department, req.schoolId);
    }

    // Department principal cannot change a teacher's department
    if (req.departmentId && updates.department !== undefined) {
        delete updates.department;
    }

    const userUpdates = {};

    if (firstName !== undefined) userUpdates.firstName = firstName;
    if (lastName !== undefined) userUpdates.lastName = lastName;
    if (phone !== undefined) userUpdates.phone = phone;

    if (email !== undefined) {
        const normalizedEmail = String(email).trim().toLowerCase();
        const isValidEmail = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/.test(normalizedEmail);

        if (!isValidEmail) {
            return res.status(400).json({
                success: false,
                message: 'Valid email is required'
            });
        }

        const existingUser = await User.findOne({
            email: normalizedEmail,
            _id: { $ne: teacher.user }
        }).setOptions({ skipTenantFilter: true });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email address is already in use'
            });
        }

        userUpdates.email = normalizedEmail;
    }

    if (Object.keys(userUpdates).length > 0) {
        await User.findByIdAndUpdate(teacher.user, userUpdates, {
            runValidators: true
        }).setOptions({ skipTenantFilter: true });
    }

    // Update teacher profile (whitelist only; no school, user, employeeId, assignedClasses)
    teacher = await Teacher.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    })
        .populate('user', 'firstName lastName email phone mustChangePassword loginInvite')
        .populate('department', 'name type')
        .populate('subjects', 'name code')
        .populate('assignedClasses.class', 'name grade section')
        .populate('assignedClasses.subject', 'name code');

    res.json({
        success: true,
        message: 'Teacher updated successfully',
        data: { teacher }
    });
});

/**
 * @desc    Delete teacher
 * @route   DELETE /api/teachers/:id
 * @access  Private (Admin)
 */
export const deleteTeacher = asyncHandler(async (req, res) => {
    const teacher = await Teacher.findOne({ _id: req.params.id, isActive: true });

    if (!teacher) {
        return res.status(404).json({
            success: false,
            message: 'Teacher not found'
        });
    }

    // Department principal can only delete teachers in their department
    if (req.departmentId && teacher.department?.toString() !== req.departmentId.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to delete this teacher'
        });
    }

    await Promise.all([
        Teacher.updateOne(
            { _id: teacher._id },
            {
                $set: {
                    isActive: false,
                    assignedClasses: []
                }
            }
        ),
        User.findByIdAndUpdate(teacher.user, { isActive: false }).setOptions({ skipTenantFilter: true }),
        TeacherPeriodAssignment.deleteMany({ teacher: teacher.user }),
        Class.updateMany(
            { classTeacher: teacher._id },
            { $unset: { classTeacher: 1 } }
        ),
        Class.updateMany(
            { 'subjects.teacher': teacher._id },
            { $pull: { subjects: { teacher: teacher._id } } }
        )
    ]);

    res.json({
        success: true,
        message: 'Teacher deleted successfully'
    });
});

/**
 * @desc    Rotate teacher credentials and send login invite
 * @route   POST /api/teachers/:id/send-login-invite
 * @access  Private (Admin, Department Principal)
 */
export const sendTeacherLoginInvite = asyncHandler(async (req, res) => {
    const teacher = await Teacher.findOne({
        _id: req.params.id,
        isActive: true
    }).setOptions({ skipTenantFilter: true });

    if (!teacher || teacher.school?.toString() !== req.schoolId.toString()) {
        return res.status(404).json({
            success: false,
            message: 'Teacher not found'
        });
    }

    if (req.departmentId && teacher.department?.toString() !== req.departmentId.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to invite this teacher'
        });
    }

    const inviteResult = await prepareTeacherLoginInvite({
        teacher,
        actorUserId: req.user?._id,
        sendEmail: true
    });

    res.status(200).json({
        success: true,
        message: inviteResult.emailSent
            ? 'Teacher invite sent successfully'
            : 'Teacher credentials prepared, but email delivery failed',
        data: inviteResult
    });
});

/**
 * @desc    Bulk rotate teacher credentials and send login invites
 * @route   POST /api/teachers/bulk-send-login-invites
 * @access  Private (Admin, Department Principal)
 */
export const bulkSendTeacherLoginInvites = asyncHandler(async (req, res) => {
    const { teacherIds } = req.body;

    if (!Array.isArray(teacherIds) || teacherIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Provide an array of teacher IDs (teacherIds).'
        });
    }

    if (teacherIds.length > 100) {
        return res.status(400).json({
            success: false,
            message: 'Maximum 100 teachers per batch.'
        });
    }

    const query = {
        _id: { $in: teacherIds },
        school: req.schoolId,
        isActive: true
    };
    if (req.departmentId) {
        query.department = req.departmentId;
    }

    const teachers = await Teacher.find(query).setOptions({ skipTenantFilter: true });
    const created = [];
    const errors = [];

    for (const teacher of teachers) {
        try {
            const inviteResult = await prepareTeacherLoginInvite({
                teacher,
                actorUserId: req.user?._id,
                sendEmail: true
            });

            const teacherUser = await User.findById(teacher.user)
                .select('firstName lastName')
                .setOptions({ skipTenantFilter: true });
            const name = `${teacherUser?.firstName || ''} ${teacherUser?.lastName || ''}`.trim() || teacher.employeeId;

            created.push({
                teacherId: inviteResult.teacherId,
                name,
                email: inviteResult.email,
                tempPassword: inviteResult.tempPassword,
                emailSent: inviteResult.emailSent
            });

            if (!inviteResult.emailSent) {
                errors.push({
                    teacherId: teacher._id,
                    name,
                    error: inviteResult.error || 'Credentials prepared but email delivery failed'
                });
            }
        } catch (error) {
            errors.push({
                teacherId: teacher._id,
                error: error.message || 'Failed to prepare invite'
            });
        }
    }

    const notFoundCount = teacherIds.length - teachers.length;
    if (notFoundCount > 0) {
        errors.push({
            teacherId: null,
            error: `${notFoundCount} teacher(s) were not found or are outside your scope.`
        });
    }

    res.status(200).json({
        success: true,
        message: `Prepared ${created.length} teacher invite(s).${errors.length ? ` ${errors.length} issue(s) reported.` : ''}`,
        data: {
            created,
            errors,
            total: teacherIds.length
        }
    });
});

/**
 * @desc    Assign multiple classes and subjects to teacher
 * @route   POST /api/teachers/:id/assign-classes
 * @access  Private (Admin)
 */
export const assignMultipleClasses = asyncHandler(async (req, res) => {
    const { assignments } = req.body; // Array of { classId, subjectId, isClassTeacher }

    if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Assignments array is required with at least one item'
        });
    }

    await normalizeLegacyTeacherDepartment(req.params.id, req.schoolId);

    // Use lean + narrow select to avoid hydration cast failures on legacy invalid fields
    // (e.g. department stored as "General" instead of ObjectId in old records).
    const teacher = await Teacher.findById(req.params.id)
        .select('department assignedClasses isActive')
        .lean();

    if (!teacher || teacher.isActive === false) {
        return res.status(404).json({
            success: false,
            message: 'Teacher not found'
        });
    }

    // Department principal can only assign classes to teachers in their department
    if (req.departmentId && teacher.department?.toString() !== req.departmentId.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to assign classes for this teacher'
        });
    }

    const newAssignments = [];
    const errors = [];

    // Process each assignment
    for (const assignment of assignments) {
        const { classId, subjectId, isClassTeacher = false } = assignment;

        // Check if already assigned
        const existingAssignment = teacher.assignedClasses.find(
            ac => ac.class.toString() === classId && ac.subject.toString() === subjectId
        );

        if (existingAssignment) {
            errors.push(`Already assigned to class ${classId} and subject ${subjectId}`);
            continue;
        }

        newAssignments.push({
            class: classId,
            subject: subjectId,
            isClassTeacher
        });
    }

    if (newAssignments.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No valid assignments to process',
            errors
        });
    }

    // Add all new assignments
    await Teacher.updateOne(
        { _id: req.params.id },
        { $push: { assignedClasses: { $each: newAssignments } } }
    );

    // Keep Class.subjects in sync so grade authorization works.
    // Use atomic updates instead of doc.save() to avoid failing on legacy unrelated field casts
    // (e.g. old class documents with invalid non-ObjectId department values).
    for (const newAssignment of newAssignments) {
        const update = {
            $addToSet: { subjects: { subject: newAssignment.subject, teacher: teacher._id } }
        };
        if (newAssignment.isClassTeacher) {
            update.$set = { classTeacher: teacher._id };
        }

        await Class.updateOne({ _id: newAssignment.class }, update);
    }

    const updatedTeacher = await Teacher.findById(req.params.id)
        .select('user employeeId qualification specialization subjects assignedClasses joiningDate address isActive')
        .populate('user', 'firstName lastName email mustChangePassword loginInvite')
        .populate('assignedClasses.class', 'name grade section')
        .populate('assignedClasses.subject', 'name code');

    res.json({
        success: true,
        message: `${newAssignments.length} classes assigned successfully`,
        data: {
            teacher: updatedTeacher,
            errors: errors.length > 0 ? errors : undefined
        }
    });
});

/**
 * @desc    Remove class assignment from teacher
 * @route   DELETE /api/teachers/:id/remove-class/:assignmentId
 * @access  Private (Admin)
 */
export const removeClassAssignment = asyncHandler(async (req, res) => {
    const teacher = await Teacher.findById(req.params.id)
        .select('department assignedClasses user isActive')
        .lean();

    if (!teacher || teacher.isActive === false) {
        return res.status(404).json({
            success: false,
            message: 'Teacher not found'
        });
    }

    if (req.departmentId && teacher.department?.toString() !== req.departmentId.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to modify this teacher'
        });
    }

    const removed = teacher.assignedClasses.find(
        ac => ac._id.toString() === req.params.assignmentId
    );

    if (!removed) {
        return res.status(404).json({
            success: false,
            message: 'Class assignment not found'
        });
    }

    await Teacher.updateOne(
        { _id: req.params.id },
        { $pull: { assignedClasses: { _id: req.params.assignmentId } } }
    );

    // Keep Class.subjects in sync; clear classTeacher if this teacher was class teacher
    if (removed) {
        await Class.findByIdAndUpdate(removed.class, {
            $pull: { subjects: { subject: removed.subject, teacher: teacher._id } }
        });
        await Class.findOneAndUpdate(
            { _id: removed.class, classTeacher: teacher._id },
            { $unset: { classTeacher: 1 } }
        );
        await TeacherPeriodAssignment.deleteMany({
            teacher: teacher.user,
            class: removed.class,
            subject: removed.subject
        });
    }

    const updatedTeacher = await Teacher.findById(req.params.id)
        .populate('user', 'firstName lastName email phone mustChangePassword loginInvite')
        .populate('department', 'name type')
        .populate('subjects', 'name code')
        .populate('assignedClasses.class', 'name grade section academicYear')
        .populate('assignedClasses.subject', 'name code');

    res.json({
        success: true,
        message: 'Class assignment removed successfully',
        data: {
            teacher: updatedTeacher
        }
    });
});

/**
 * @desc    Get classes assigned to current teacher
 * @route   GET /api/teachers/my-classes
 * @access  Private (Teacher)
 */
export const getMyClasses = asyncHandler(async (req, res) => {
    const teacher = await Teacher.findOne({ user: req.user._id })
        .populate('assignedClasses.class', 'name grade section academicYear')
        .populate('assignedClasses.subject', 'name code');

    if (!teacher) {
        return res.status(404).json({
            success: false,
            message: 'Teacher profile not found'
        });
    }

    res.json({
        success: true,
        data: {
            classes: teacher.assignedClasses,
            count: teacher.assignedClasses.length
        }
    });
});
