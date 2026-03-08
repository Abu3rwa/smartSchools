import crypto from 'crypto';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Notification from '../models/Notification.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { applyDepartmentScope } from '../helpers/departmentScope.js';
import notificationService from '../services/notificationService.js';
import { uploadFile, deleteFile } from '../services/firebaseStorageService.js';
import { runImportPipeline } from '../services/import/importPipeline.js';

/**
 * Generate a human-readable temporary password.
 * Format: 3 letters + 4 digits + 1 special char  (e.g. "Abc1234!")
 */
function generateTempPassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const pick = (chars) => chars[crypto.randomInt(chars.length)];
    return (
        pick(upper) +
        pick(lower) +
        pick(lower) +
        pick(digits) +
        pick(digits) +
        pick(digits) +
        pick(digits) +
        '!'
    );
}

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

const createParentCredentialsEmailContent = ({
    parentDisplayName,
    studentFullName,
    relationLabel,
    email,
    tempPassword
}) => {
    const portalUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const greetingName = parentDisplayName || 'Parent';
    const subject = `Parent App Login Credentials for ${studentFullName}`;
    const message = [
        `Hello ${greetingName},`,
        '',
        `You have been granted parent access for ${studentFullName}.`,
        'Use these temporary credentials to sign in on the Parent Mobile App:',
        `Email: ${email}`,
        `Password: ${tempPassword}`,
        '',
        `Web Portal: ${portalUrl}`,
        '',
        'Please change your password after your first login.',
        'If you did not expect this message, contact your school administrator.'
    ].join('\n');
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto;">
            <h2>Parent App Login Credentials</h2>
            <p>Hello ${greetingName},</p>
            <p>You have been granted parent access for <strong>${studentFullName}</strong> (${relationLabel}).</p>
            <p>Use these temporary credentials to sign in on the Parent Mobile App:</p>
            <ul>
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Password:</strong> ${tempPassword}</li>
            </ul>
            <p><strong>Web Portal:</strong> <a href="${portalUrl}" target="_blank" rel="noreferrer">${portalUrl}</a></p>
            <p>Please change your password after your first login.</p>
            <p>If you did not expect this message, contact your school administrator.</p>
        </div>
    `;

    return { subject, message, htmlContent };
};

const findOrCreateParentUser = async ({
    schoolId,
    email,
    displayName,
    fallbackLastName,
    tempPassword
}) => {
    const existingUser = await User.findOne({ email })
        .select('+password')
        .setOptions({ skipTenantFilter: true });

    if (existingUser) {
        if (existingUser.school?.toString() !== schoolId.toString()) {
            throw new Error(`Email "${email}" is linked to another school account`);
        }
        if (existingUser.role !== 'parent') {
            throw new Error(`Email "${email}" is linked to a non-parent account`);
        }
        existingUser.password = tempPassword;
        existingUser.isActive = true;
        if (!existingUser.firstName || !existingUser.lastName) {
            const parsed = splitContactName(displayName, fallbackLastName);
            existingUser.firstName = existingUser.firstName || parsed.firstName;
            existingUser.lastName = existingUser.lastName || parsed.lastName;
        }
        await existingUser.save();
        return { user: existingUser, created: false };
    }

    const parsed = splitContactName(displayName, fallbackLastName);
    const user = await User.create({
        email,
        password: tempPassword,
        role: 'parent',
        school: schoolId,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        isActive: true
    });
    return { user, created: true };
};

const sendParentCredentialsEmail = async ({
    student,
    parentUser,
    contact,
    tempPassword,
    senderUserId
}) => {
    const studentFullName = `${student.firstName} ${student.lastName}`.trim();
    const emailContent = createParentCredentialsEmailContent({
        parentDisplayName: contact.name || parentUser.firstName,
        studentFullName,
        relationLabel: contact.relationLabel,
        email: contact.email,
        tempPassword
    });

    const notification = await Notification.create({
        school: student.school,
        recipient: parentUser._id,
        recipientEmail: contact.email,
        student: student._id,
        type: 'custom',
        subject: emailContent.subject,
        message: emailContent.message,
        htmlContent: emailContent.htmlContent,
        channels: ['email'],
        metadata: {
            category: 'parent_mobile_credentials',
            relation: contact.relationLabel
        },
        createdBy: senderUserId
    });

    await notificationService.sendEmail(notification, senderUserId);
};

/**
 * @desc    Get all students
 * @route   GET /api/students
 * @access  Private
 */
export const getStudents = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, classId, status, academicYear } = req.query;
    const effectiveAcademicYear = academicYear || req.academicYear;

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
        .populate('user', 'email isActive')
        .sort({ firstName: 1, lastName: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await Student.countDocuments(query);

    res.json({
        success: true,
        data: {
            students,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
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
        .populate('user', 'email');

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

    // Already has a linked user account?
    if (student.user) {
        const existingUser = await User.findById(student.user).select('email');
        return res.status(400).json({
            success: false,
            message: `This student already has a login account (${existingUser?.email || 'unknown email'})`
        });
    }

    // Determine email: prefer student.email, then student.studentEmail
    const email = (req.body.email || student.email || student.studentEmail || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'No email available. Please provide an email in the request body or add one to the student record first.'
        });
    }

    // Check if a User with that email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({
            success: false,
            message: `A user account with email "${email}" already exists.`
        });
    }

    const tempPassword = generateTempPassword();

    // Create the User document (pre-save hook hashes the password automatically)
    const user = await User.create({
        email,
        password: tempPassword,
        role: 'student',
        school: student.school,
        firstName: student.firstName,
        lastName: student.lastName,
        isActive: true
    });

    // Link User → Student
    student.user = user._id;
    await student.save();

    res.status(201).json({
        success: true,
        message: 'Student login created successfully',
        data: {
            studentId: student._id,
            userId: user._id,
            email: user.email,
            tempPassword        // shown once, never stored in plain text
        }
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
        _id: { $in: studentIds },
        $or: [{ user: { $exists: false } }, { user: null }],
    });

    const created = [];
    const errors = [];

    for (const student of students) {
        const email = (student.email || student.studentEmail || '').trim().toLowerCase();
        const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || 'Student';

        if (!email) {
            errors.push({ studentId: student._id, name, error: 'No email on file' });
            continue;
        }

        const existingUser = await User.findOne({ email }).setOptions({ skipTenantFilter: true });
        if (existingUser) {
            errors.push({ studentId: student._id, name, error: `Email "${email}" already in use` });
            continue;
        }

        try {
            const tempPassword = generateTempPassword();
            const user = await User.create({
                email,
                password: tempPassword,
                role: 'student',
                school: student.school,
                firstName: student.firstName,
                lastName: student.lastName,
                isActive: true,
            });

            student.user = user._id;
            await student.save();

            created.push({
                studentId: student._id,
                name,
                email: user.email,
                tempPassword,
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
            error: `${notFoundCount} student(s) already have a login or were not found.`,
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

    // Fetch user with password field so .save() triggers the hash hook
    const user = await User.findById(student.user._id || student.user).select('+password');
    if (!user) {
        return res.status(404).json({ success: false, message: 'Linked user account not found' });
    }

    const tempPassword = generateTempPassword();
    user.password = tempPassword;   // pre-save hook will bcrypt-hash this
    await user.save();

    res.json({
        success: true,
        message: 'Password reset successfully',
        data: {
            studentId: student._id,
            email: user.email,
            tempPassword        // shown once
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

    const contacts = buildParentContacts(student);
    if (contacts.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No parent/guardian emails found for this student'
        });
    }

    const sent = [];
    const errors = [];
    for (const contact of contacts) {
        if (!EMAIL_PATTERN.test(contact.email)) {
            errors.push({
                relation: contact.relationLabel,
                email: contact.email,
                error: 'Invalid email format'
            });
            continue;
        }

        const tempPassword = generateTempPassword();
        try {
            const { user, created } = await findOrCreateParentUser({
                schoolId: student.school,
                email: contact.email,
                displayName: contact.name,
                fallbackLastName: student.lastName || 'Parent',
                tempPassword
            });

            let emailSent = false;
            try {
                await sendParentCredentialsEmail({
                    student,
                    parentUser: user,
                    contact,
                    tempPassword,
                    senderUserId: req.user._id
                });
                emailSent = true;
            } catch (emailError) {
                errors.push({
                    relation: contact.relationLabel,
                    name: contact.name || '',
                    email: contact.email,
                    error: emailError.message || 'Credentials created but email delivery failed'
                });
            }

            sent.push({
                relation: contact.relationLabel,
                name: contact.name || `${user.firstName} ${user.lastName}`.trim(),
                email: contact.email,
                userId: user._id,
                created,
                tempPassword,
                emailSent
            });
        } catch (error) {
            errors.push({
                relation: contact.relationLabel,
                name: contact.name || '',
                email: contact.email,
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
