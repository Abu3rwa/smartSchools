import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { applyDepartmentScope } from '../helpers/departmentScope.js';
import { uploadFile, deleteFile } from '../services/firebaseStorageService.js';
import { runImportPipeline } from '../services/import/importPipeline.js';
import {
    deliverLoginInvite,
    generateInvitePassword,
    upsertInvitedUser
} from '../services/accountInviteService.js';

const generateTempPassword = generateInvitePassword;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const splitContactName = (fullName = '', fallbackLastName = 'Parent') => {
    const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
        return { firstName: 'Parent', lastName: fallbackLastName || 'User' };
    }
    const parts = normalized.split(' ');
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: fallbackLastName || 'User' };
    }
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ') || fallbackLastName || 'User'
    };
};

const buildParentContacts = (student) => {
    const parentInfo = student.parentInfo || {};
    const rawContacts = [
        {
            relation: 'father',
            relationLabel: 'Father',
            name: parentInfo.fatherName || '',
            email: parentInfo.fatherEmail || ''
        },
        {
            relation: 'mother',
            relationLabel: 'Mother',
            name: parentInfo.motherName || '',
            email: parentInfo.motherEmail || ''
        },
        {
            relation: 'guardian',
            relationLabel: 'Guardian',
            name: parentInfo.guardianName || '',
            email: parentInfo.guardianEmail || ''
        }
    ];

    const byEmail = new Map();
    for (const contact of rawContacts) {
        const email = String(contact.email || '').trim().toLowerCase();
        if (!email) continue;
        if (!byEmail.has(email)) {
            byEmail.set(email, {
                email,
                name: String(contact.name || '').trim(),
                relationLabels: [contact.relationLabel]
            });
            continue;
        }
        const existing = byEmail.get(email);
        if (contact.name && !existing.name) existing.name = String(contact.name).trim();
        if (!existing.relationLabels.includes(contact.relationLabel)) {
            existing.relationLabels.push(contact.relationLabel);
        }
    }

    return Array.from(byEmail.values()).map((item) => ({
        ...item,
        relationLabel: item.relationLabels.join('/')
    }));
};

const buildParentInviteGroups = (students = []) => {
    const byEmail = new Map();

    for (const student of students) {
        const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.studentId || 'Student';
        for (const contact of buildParentContacts(student)) {
            const email = String(contact.email || '').trim().toLowerCase();
            if (!email) continue;

            if (!byEmail.has(email)) {
                byEmail.set(email, {
                    email,
                    name: contact.name || '',
                    relationLabels: new Set([contact.relationLabel]),
                    linkedStudents: new Set([studentName]),
                    studentIds: new Map([[String(student._id), student._id]])
                });
                continue;
            }

            const existing = byEmail.get(email);
            if (!existing.name && contact.name) existing.name = contact.name;
            existing.relationLabels.add(contact.relationLabel);
            existing.linkedStudents.add(studentName);
            existing.studentIds.set(String(student._id), student._id);
        }
    }

    return Array.from(byEmail.values()).map((item) => ({
        email: item.email,
        name: item.name,
        relationLabel: Array.from(item.relationLabels).join('/'),
        linkedStudents: Array.from(item.linkedStudents),
        studentIds: Array.from(item.studentIds.values())
    }));
};

const ensureStudentUserLink = async (student, userId) => {
    if (student.user?.toString() === userId.toString()) {
        return;
    }
    student.user = userId;
    await student.save();
};

const prepareStudentLoginCredentials = async ({
    student,
    email,
    actorUserId,
    sendEmail = false
}) => {
    const tempPassword = generateTempPassword();
    const inviteProvision = await upsertInvitedUser({
        existingUserId: student.user || null,
        schoolId: student.school,
        email,
        firstName: student.firstName,
        lastName: student.lastName,
        role: 'student',
        tempPassword
    });

    await ensureStudentUserLink(student, inviteProvision.user._id);

    const inviteDelivery = sendEmail
        ? await deliverLoginInvite({
            schoolId: student.school,
            actorUserId,
            recipientUser: inviteProvision.user,
            recipientEmail: inviteProvision.email,
            recipientName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            role: 'student',
            tempPassword,
            studentId: student._id
        })
        : { emailSent: false, error: null };

    return {
        studentId: student._id,
        userId: inviteProvision.user._id,
        email: inviteProvision.email,
        tempPassword,
        created: inviteProvision.created,
        emailSent: inviteDelivery.emailSent,
        error: inviteDelivery.error || null
    };
};

const inviteParentContactGroup = async ({
    schoolId,
    actorUserId,
    contactGroup,
    fallbackLastName = 'Parent'
}) => {
    const tempPassword = generateTempPassword();
    const parsedName = splitContactName(contactGroup.name, fallbackLastName);
    const inviteProvision = await upsertInvitedUser({
        schoolId,
        email: contactGroup.email,
        firstName: parsedName.firstName,
        lastName: parsedName.lastName,
        role: 'parent',
        tempPassword
    });

    const inviteDelivery = await deliverLoginInvite({
        schoolId,
        actorUserId,
        recipientUser: inviteProvision.user,
        recipientEmail: inviteProvision.email,
        recipientName: contactGroup.name || `${parsedName.firstName} ${parsedName.lastName}`.trim(),
        role: 'parent',
        tempPassword,
        linkedStudents: contactGroup.linkedStudents,
        studentId: contactGroup.studentIds.length === 1 ? contactGroup.studentIds[0] : null
    });

    return {
        relation: contactGroup.relationLabel,
        name: contactGroup.name || `${parsedName.firstName} ${parsedName.lastName}`.trim(),
        email: inviteProvision.email,
        userId: inviteProvision.user._id,
        created: inviteProvision.created,
        tempPassword,
        emailSent: inviteDelivery.emailSent,
        linkedStudents: contactGroup.linkedStudents,
        error: inviteDelivery.error || null
    };
};

/**
 * @desc    Get all students
 * @route   GET /api/students
 * @access  Private
 */
export const getStudents = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, classId, status, academicYear } = req.query;
    const effectiveAcademicYear = academicYear || req.academicYear;
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = String(limit).toLowerCase() === 'all'
        ? 0
        : Math.max(parseInt(limit, 10) || 0, 0);
    const shouldPaginate = parsedLimit > 0;

    const query = {};

    if (search) {
        query.$or = [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { studentId: { $regex: search, $options: 'i' } }
        ];
    }

    if (classId) query.currentClass = classId;
    if (status) query.status = status;
    if (effectiveAcademicYear) query.academicYear = effectiveAcademicYear;

    applyDepartmentScope(query, req.departmentId);
    if (req.queryFilter?.departmentId) query.department = req.queryFilter.departmentId;

    // Access Control: Teachers see only students in their assigned classes
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const teacherClassIds = await getTeacherClassIds(teacher._id);

        if (classId) {
            const canAccess = teacherClassIds.some(id => id.toString() === classId);
            if (!canAccess) {
                return res.status(403).json({ success: false, message: 'Not authorized for this class' });
            }
        } else {
            query.currentClass = { $in: teacherClassIds };
        }
    }

    const students = await Student.find(query)
        .populate('department', 'name type')
        .populate('currentClass', 'name grade section')
        .populate('user', 'email isActive mustChangePassword loginInvite')
        .sort({ firstName: 1, lastName: 1 })
        .skip(shouldPaginate ? (parsedPage - 1) * parsedLimit : 0)
        .limit(shouldPaginate ? parsedLimit : 0);

    const total = await Student.countDocuments(query);

    res.json({
        success: true,
        data: {
            students,
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
 * @desc    Get single student
 * @route   GET /api/students/:id
 * @access  Private
 */
export const getStudent = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id)
        .populate('department', 'name type')
        .populate('currentClass', 'name grade section academicYear')
        .populate('classEnrollmentHistory.class', 'name grade section academicYear')
        .populate('user', 'email isActive mustChangePassword loginInvite');

    if (!student) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    // Access Control: Teachers can only view students in their assigned classes
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const teacherClassIds = await getTeacherClassIds(teacher._id);
        const currentClassId = student.currentClass?._id?.toString() || student.currentClass?.toString();
        const canAccess = currentClassId && teacherClassIds.some((id) => id.toString() === currentClassId);
        if (!canAccess) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this student'
            });
        }
    }

    // Department scope: department-scoped principal cannot see student with no department or other department
    if (req.departmentId) {
        const studentDeptId = student.department?._id || student.department;
        if (!studentDeptId || studentDeptId.toString() !== req.departmentId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this student'
            });
        }
    }

    res.json({
        success: true,
        data: { student }
    });
});

/**
 * @desc    Create student
 * @route   POST /api/students
 * @access  Private (Admin, Teacher)
 */
export const createStudent = asyncHandler(async (req, res) => {
    const studentData = req.body;

    // Inject school context
    studentData.school = req.schoolId;
    if (!studentData.academicYear && req.academicYear) {
        studentData.academicYear = req.academicYear;
    }
    
    // Generate student ID if not provided
    if (!studentData.studentId) {
        const count = await Student.countDocuments({ school: req.schoolId });
        const year = new Date().getFullYear().toString().slice(-2);
        studentData.studentId = `STU${year}${String(count + 1).padStart(4, '0')}`;
    }

    // Handle empty email to allow it to be sparse/unique
    if (studentData.email === '') {
        delete studentData.email;
    }

    try {
        const student = await Student.create(studentData);

        res.status(201).json({
            success: true,
            message: 'Student created successfully',
            data: { student }
        });
    } catch (error) {
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(val => val.message).join(', ');
            return res.status(400).json({
                success: false,
                message: 'Validation failed: ' + validationErrors
            });
        }
        throw error; // Let errorHandler middleware handle it
    }
});

/**
 * @desc    Update student
 * @route   PUT /api/students/:id
 * @access  Private (Admin, Teacher)
 */
export const updateStudent = asyncHandler(async (req, res) => {
    let student = await Student.findById(req.params.id);

    if (!student) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    const allowedFields = [
        'firstName', 'lastName', 'dateOfBirth', 'email', 'gender', 'department', 'currentClass',
        'academicYear', 'enrollmentDate', 'parentInfo', 'address', 'medicalInfo',
        'previousSchool', 'studentEmail', 'reportPreferences', 'status', 'notes'
    ];
    const updates = {};
    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    if (updates.email === '') updates.email = null;

    student = await Student.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    }).populate('department', 'name type').populate('currentClass', 'name grade section');

    res.json({
        success: true,
        message: 'Student updated successfully',
        data: { student }
    });
});

/**
 * @desc    Delete student
 * @route   DELETE /api/students/:id
 * @access  Private (Admin)
 */
export const deleteStudent = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id);

    if (!student) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    // Soft delete - mark as inactive
    student.status = 'inactive';
    await student.save();

    res.json({
        success: true,
        message: 'Student deleted successfully'
    });
});

/**
 * @desc    Get students by class
 * @route   GET /api/students/class/:classId
 * @access  Private
 */
export const getStudentsByClass = asyncHandler(async (req, res) => {
    // Access Control: Teachers can only view students in their assigned classes
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const classIds = await getTeacherClassIds(teacher._id);
        const canAccess = classIds.some(id => id.toString() === req.params.classId);
        if (!canAccess) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class' });
        }
    }

    const students = await Student.find({
        currentClass: req.params.classId,
        status: 'active'
    }).sort({ firstName: 1, lastName: 1 });

    res.json({
        success: true,
        data: { students, count: students.length }
    });
});

/**
 * @desc    Bulk enroll students to a class
 * @route   POST /api/students/bulk-enroll
 * @access  Private (Admin)
 */
export const bulkEnrollStudents = asyncHandler(async (req, res) => {
    const { studentIds, classId } = req.body;

    const update = { currentClass: classId };
    if (classId) {
        const cls = await Class.findById(classId).select('department academicYear').lean();
        if (cls?.department) update.department = cls.department;
        if (cls?.academicYear) update.academicYear = cls.academicYear;
    }

    const result = await Student.updateMany(
        { _id: { $in: studentIds }, school: req.schoolId },
        update
    );

    res.json({
        success: true,
        message: `${result.modifiedCount} students enrolled successfully`
    });
});

/**
 * @desc    Enroll or move student to a class (appends to enrollment history first)
 * @route   PUT /api/students/:id/enroll
 * @access  Private (Admin)
 */
export const enrollStudent = asyncHandler(async (req, res) => {
    const { classId, academicYear } = req.body;
    if (!classId || !academicYear) {
        return res.status(400).json({
            success: false,
            message: 'classId and academicYear are required'
        });
    }

    const student = await Student.findById(req.params.id);
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (student.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Student does not belong to your school' });
    }

    const newClass = await Class.findOne({ _id: classId, school: req.schoolId, academicYear });
    if (!newClass) {
        return res.status(400).json({
            success: false,
            message: 'Class not found or academic year does not match'
        });
    }

    const updates = { currentClass: newClass._id, academicYear };
    if (student.currentClass) {
        updates.$push = {
            classEnrollmentHistory: {
                $each: [{
                    academicYear: student.academicYear,
                    class: student.currentClass,
                    leftAt: new Date()
                }],
                $position: 0
            }
        };
    }
    const updated = await Student.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true, runValidators: true }
    ).populate('currentClass', 'name grade section academicYear');

    res.json({
        success: true,
        message: 'Student enrolled successfully',
        data: { student: updated }
    });
});

/**
 * @desc    Import students from CSV data
 * @route   POST /api/students/import
 * @access  Private (Admin)
 */
export const importStudents = asyncHandler(async (req, res) => {
    const result = await runImportPipeline({
        entityType: 'students',
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
            total: result.summary.totalRows,
            skipped: result.summary.skippedRows,
            importRunId: result.importRunId,
            errorReportUrl: result.errorReportUrl,
            errors: result.errors.length > 0 ? result.errors : undefined
        },
        summary: result.summary,
        errors: result.errors,
        warnings: result.warnings
    });
});

/**
 * @desc    Create a login account (User) for a student
 * @route   POST /api/students/:id/create-login
 * @access  Private (Admin)
 *
 * Generates a temporary password and returns it **once** so the admin can
 * hand it to the student.  The password is bcrypt-hashed in the DB and can
 * never be retrieved again.
 */
export const createStudentLogin = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id);
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (student.user) {
        return res.status(400).json({
            success: false,
            message: 'This student already has a login account. Use reset password or send login invite instead.'
        });
    }

    const email = (req.body.email || student.email || student.studentEmail || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'No email available. Please provide an email in the request body or add one to the student record first.'
        });
    }

    const credentials = await prepareStudentLoginCredentials({
        student,
        email,
        actorUserId: req.user?._id,
        sendEmail: false
    });

    res.status(201).json({
        success: true,
        message: 'Student login created successfully',
        data: credentials
    });
});

/**
 * @desc    Bulk create login accounts for students (no login yet).
 * @route   POST /api/students/bulk-create-login
 * @access  Private (Admin)
 *
 * Body: { studentIds: string[] } (max 100 per request).
 * Returns created credentials (email, tempPassword per student) and any errors.
 */
export const bulkCreateStudentLogin = asyncHandler(async (req, res) => {
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Provide an array of student IDs (studentIds).',
        });
    }

    if (studentIds.length > 100) {
        return res.status(400).json({
            success: false,
            message: 'Maximum 100 students per batch.',
        });
    }

    const students = await Student.find({
        _id: { $in: studentIds }
    });

    const created = [];
    const errors = [];

    for (const student of students) {
        const email = (student.email || student.studentEmail || '').trim().toLowerCase();
        const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || 'Student';

        if (student.user) {
            errors.push({ studentId: student._id, name, error: 'Student already has a login account' });
            continue;
        }

        if (!email) {
            errors.push({ studentId: student._id, name, error: 'No email on file' });
            continue;
        }

        try {
            const credentials = await prepareStudentLoginCredentials({
                student,
                email,
                actorUserId: req.user?._id,
                sendEmail: false
            });

            created.push({
                studentId: credentials.studentId,
                name,
                email: credentials.email,
                tempPassword: credentials.tempPassword
            });
        } catch (err) {
            errors.push({
                studentId: student._id,
                name,
                error: err.message || 'Failed to create user',
            });
        }
    }

    const notFoundCount = studentIds.length - students.length;
    if (notFoundCount > 0) {
        errors.push({
            studentId: null,
            name: null,
            error: `${notFoundCount} student(s) were not found.`,
        });
    }

    res.status(201).json({
        success: true,
        message: `Created ${created.length} login(s).${errors.length ? ` ${errors.length} issue(s) reported.` : ''}`,
        data: {
            created,
            errors,
            total: studentIds.length,
        },
    });
});

/**
 * @desc    Reset a student's login password
 * @route   POST /api/students/:id/reset-password
 * @access  Private (Admin)
 *
 * Generates a new temporary password and returns it once.
 */
export const resetStudentPassword = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id).populate('user', 'email');
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!student.user) {
        return res.status(400).json({
            success: false,
            message: 'This student does not have a login account yet. Create one first.'
        });
    }

    const credentials = await prepareStudentLoginCredentials({
        student,
        email: student.user.email || student.email || student.studentEmail,
        actorUserId: req.user?._id,
        sendEmail: false
    });

    res.json({
        success: true,
        message: 'Password reset successfully',
        data: credentials
    });
});

/**
 * @desc    Create or rotate a student login and send invite email
 * @route   POST /api/students/:id/send-login-invite
 * @access  Private (Admin)
 */
export const sendStudentLoginInvite = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id).setOptions({ skipTenantFilter: true });
    if (!student || student.school?.toString() !== req.schoolId.toString()) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const email = (req.body.email || student.email || student.studentEmail || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'No email available. Add a student email before sending an invite.'
        });
    }

    const credentials = await prepareStudentLoginCredentials({
        student,
        email,
        actorUserId: req.user?._id,
        sendEmail: true
    });

    const message = credentials.emailSent
        ? 'Student invite sent successfully'
        : 'Student credentials prepared, but email delivery failed';

    res.status(200).json({
        success: true,
        message,
        data: credentials
    });
});

/**
 * @desc    Bulk create or rotate student logins and send invite emails
 * @route   POST /api/students/bulk-send-login-invites
 * @access  Private (Admin)
 */
export const bulkSendStudentLoginInvites = asyncHandler(async (req, res) => {
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Provide an array of student IDs (studentIds).'
        });
    }

    if (studentIds.length > 100) {
        return res.status(400).json({
            success: false,
            message: 'Maximum 100 students per batch.'
        });
    }

    const students = await Student.find({
        _id: { $in: studentIds },
        school: req.schoolId
    }).setOptions({ skipTenantFilter: true });

    const created = [];
    const errors = [];

    for (const student of students) {
        const email = (student.email || student.studentEmail || '').trim().toLowerCase();
        const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || 'Student';

        if (!email) {
            errors.push({ studentId: student._id, name, error: 'No email on file' });
            continue;
        }

        try {
            const credentials = await prepareStudentLoginCredentials({
                student,
                email,
                actorUserId: req.user?._id,
                sendEmail: true
            });

            created.push({
                studentId: credentials.studentId,
                name,
                email: credentials.email,
                tempPassword: credentials.tempPassword,
                emailSent: credentials.emailSent
            });

            if (!credentials.emailSent) {
                errors.push({
                    studentId: student._id,
                    name,
                    error: credentials.error || 'Credentials prepared but email delivery failed'
                });
            }
        } catch (error) {
            errors.push({
                studentId: student._id,
                name,
                error: error.message || 'Failed to prepare invite'
            });
        }
    }

    const notFoundCount = studentIds.length - students.length;
    if (notFoundCount > 0) {
        errors.push({
            studentId: null,
            name: null,
            error: `${notFoundCount} student(s) were not found.`
        });
    }

    res.status(200).json({
        success: true,
        message: `Prepared ${created.length} student invite(s).${errors.length ? ` ${errors.length} issue(s) reported.` : ''}`,
        data: {
            created,
            errors,
            total: studentIds.length
        }
    });
});

/**
 * @desc    Upload or replace student photo
 * @route   PUT /api/students/:id/photo
 * @access  Private (Admin)
 */
export const uploadStudentPhoto = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a valid image file.'
        });
    }

    const student = await Student.findById(req.params.id);
    if (!student || student.school?.toString() !== req.schoolId.toString()) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    if (student.photoUrl && student.photoUrl.includes('storage.googleapis.com')) {
        await deleteFile(student.photoUrl);
    }

    const destinationPath = `schools/${req.schoolId}/students/${student._id}/photo-${Date.now()}`;
    const newPhotoUrl = await uploadFile(req.file.buffer, req.file.mimetype, destinationPath);

    student.photoUrl = newPhotoUrl;
    await student.save();

    res.json({
        success: true,
        message: 'Student photo updated successfully',
        data: { student }
    });
});

/**
 * @desc    Remove student photo
 * @route   DELETE /api/students/:id/photo
 * @access  Private (Admin)
 */
export const removeStudentPhoto = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id);
    if (!student || student.school?.toString() !== req.schoolId.toString()) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    if (student.photoUrl && student.photoUrl.includes('storage.googleapis.com')) {
        await deleteFile(student.photoUrl);
    }

    student.photoUrl = null;
    await student.save();

    res.json({
        success: true,
        message: 'Student photo removed successfully',
        data: { student }
    });
});

/**
 * @desc    Create/reset parent account credentials for a student and send by email
 * @route   POST /api/students/:id/send-parent-credentials
 * @access  Private (Admin)
 */
export const sendParentCredentials = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id).setOptions({ skipTenantFilter: true });
    if (!student || student.school?.toString() !== req.schoolId.toString()) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    const parentGroups = buildParentInviteGroups([student]);
    if (parentGroups.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No parent/guardian emails found for this student'
        });
    }

    const sent = [];
    const errors = [];
    for (const contactGroup of parentGroups) {
        if (!EMAIL_PATTERN.test(contactGroup.email)) {
            errors.push({
                relation: contactGroup.relationLabel,
                email: contactGroup.email,
                error: 'Invalid email format'
            });
            continue;
        }

        try {
            const result = await inviteParentContactGroup({
                schoolId: student.school,
                actorUserId: req.user._id,
                contactGroup,
                fallbackLastName: student.lastName || 'Parent'
            });

            if (!result.emailSent) {
                errors.push({
                    relation: result.relation,
                    name: result.name || '',
                    email: result.email,
                    error: result.error || 'Credentials created but email delivery failed'
                });
            }

            sent.push({
                relation: result.relation,
                name: result.name,
                email: result.email,
                userId: result.userId,
                created: result.created,
                tempPassword: result.tempPassword,
                emailSent: result.emailSent,
                linkedStudents: result.linkedStudents
            });
        } catch (error) {
            errors.push({
                relation: contactGroup.relationLabel,
                name: contactGroup.name || '',
                email: contactGroup.email,
                error: error.message || 'Failed to send credentials'
            });
        }
    }

    if (sent.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Unable to send parent credentials',
            data: {
                studentId: student._id,
                studentName: `${student.firstName} ${student.lastName}`.trim(),
                sent,
                errors
            }
        });
    }

    const successfulEmailCount = sent.filter((item) => item.emailSent).length;

    res.status(200).json({
            success: true,
            message: `Credentials prepared for ${sent.length} parent contact(s). ${successfulEmailCount} email(s) delivered.${errors.length ? ` ${errors.length} issue(s) reported.` : ''}`,
            data: {
            studentId: student._id,
            studentName: `${student.firstName} ${student.lastName}`.trim(),
                sent,
                errors
            }
        });
});

/**
 * @desc    Create/reset parent account credentials for a student and send by email
 * @route   POST /api/students/:id/send-parent-login-invite
 * @access  Private (Admin)
 */
export const sendParentLoginInvite = sendParentCredentials;

/**
 * @desc    Bulk create/reset parent account credentials across selected students and send by email
 * @route   POST /api/students/bulk-send-parent-login-invites
 * @access  Private (Admin)
 */
export const bulkSendParentLoginInvites = asyncHandler(async (req, res) => {
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Provide an array of student IDs (studentIds).'
        });
    }

    if (studentIds.length > 100) {
        return res.status(400).json({
            success: false,
            message: 'Maximum 100 students per batch.'
        });
    }

    const students = await Student.find({
        _id: { $in: studentIds },
        school: req.schoolId
    }).setOptions({ skipTenantFilter: true });

    const studentNames = students.map((student) => `${student.firstName || ''} ${student.lastName || ''}`.trim());
    const parentGroups = buildParentInviteGroups(students);
    if (parentGroups.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No parent/guardian emails found for the selected students'
        });
    }

    const sent = [];
    const errors = [];

    for (const contactGroup of parentGroups) {
        if (!EMAIL_PATTERN.test(contactGroup.email)) {
            errors.push({
                relation: contactGroup.relationLabel,
                name: contactGroup.name || '',
                email: contactGroup.email,
                error: 'Invalid email format'
            });
            continue;
        }

        try {
            const result = await inviteParentContactGroup({
                schoolId: req.schoolId,
                actorUserId: req.user._id,
                contactGroup,
                fallbackLastName: 'Parent'
            });

            sent.push({
                relation: result.relation,
                name: result.name,
                email: result.email,
                userId: result.userId,
                created: result.created,
                tempPassword: result.tempPassword,
                emailSent: result.emailSent,
                linkedStudents: result.linkedStudents
            });

            if (!result.emailSent) {
                errors.push({
                    relation: result.relation,
                    name: result.name || '',
                    email: result.email,
                    error: result.error || 'Credentials created but email delivery failed'
                });
            }
        } catch (error) {
            errors.push({
                relation: contactGroup.relationLabel,
                name: contactGroup.name || '',
                email: contactGroup.email,
                error: error.message || 'Failed to send credentials'
            });
        }
    }

    const notFoundCount = studentIds.length - students.length;
    if (notFoundCount > 0) {
        errors.push({
            relation: null,
            name: null,
            email: null,
            error: `${notFoundCount} student(s) were not found.`
        });
    }

    res.status(200).json({
        success: true,
        message: `Prepared ${sent.length} parent invite(s). ${sent.filter((item) => item.emailSent).length} email(s) delivered.${errors.length ? ` ${errors.length} issue(s) reported.` : ''}`,
        data: {
            studentNames,
            sent,
            errors
        }
    });
});

/**
 * @desc    Transfer student to another class
 * @route   PUT /api/students/:id/transfer
 * @access  Private (Admin)
 */
export const transferStudent = asyncHandler(async (req, res) => {
    const { newClassId, reason } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    const transferNote = `Transferred on ${new Date().toLocaleDateString()}. Reason: ${reason || 'N/A'}`;
    const existingNotes = String(student.notes || '').trim();
    student.currentClass = newClassId;
    student.notes = existingNotes ? `${existingNotes}\n${transferNote}` : transferNote;
    await student.save();

    await student.populate('currentClass', 'name grade section');

    res.json({
        success: true,
        message: 'Student transferred successfully',
        data: { student }
    });
});
