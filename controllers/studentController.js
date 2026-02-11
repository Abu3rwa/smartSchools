import crypto from 'crypto';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';

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

/**
 * @desc    Get all students
 * @route   GET /api/students
 * @access  Private
 */
export const getStudents = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, classId, status, academicYear } = req.query;

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
    if (academicYear) query.academicYear = academicYear;

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
        .populate('currentClass', 'name grade section academicYear')
        .populate('user', 'email');

    if (!student) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
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
        'firstName', 'lastName', 'dateOfBirth', 'email', 'gender', 'currentClass',
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
    }).populate('currentClass', 'name grade section');

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

    const result = await Student.updateMany(
        { _id: { $in: studentIds }, school: req.schoolId },
        { currentClass: classId }
    );

    res.json({
        success: true,
        message: `${result.modifiedCount} students enrolled successfully`
    });
});

/**
 * @desc    Import students from CSV data
 * @route   POST /api/students/import
 * @access  Private (Admin)
 */
export const importStudents = asyncHandler(async (req, res) => {
    const { students: rows, classId } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No student data provided'
        });
    }

    if (rows.length > 500) {
        return res.status(400).json({
            success: false,
            message: 'Maximum 500 students per import'
        });
    }

    // Validate class exists if provided
    if (classId) {
        const cls = await Class.findById(classId);
        if (!cls) {
            return res.status(400).json({
                success: false,
                message: 'Selected class not found'
            });
        }
    }

    // Get current count for ID generation
    let count = await Student.countDocuments({ school: req.schoolId });
    const year = new Date().getFullYear().toString().slice(-2);

    const created = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;

        // Validate required fields
        if (!row.firstName || !row.lastName || !row.dateOfBirth || !row.gender) {
            errors.push({ row: rowNum, message: `Missing required fields (firstName, lastName, dateOfBirth, gender)`, data: row });
            continue;
        }

        // Validate gender
        const gender = row.gender.toLowerCase();
        if (!['male', 'female', 'other'].includes(gender)) {
            errors.push({ row: rowNum, message: `Invalid gender "${row.gender}". Must be male, female, or other`, data: row });
            continue;
        }

        // Validate date
        const dob = new Date(row.dateOfBirth);
        if (isNaN(dob.getTime())) {
            errors.push({ row: rowNum, message: `Invalid date of birth "${row.dateOfBirth}"`, data: row });
            continue;
        }

        // Build student data
        count++;
        const studentData = {
            school: req.schoolId,
            studentId: row.studentId || `STU${year}${String(count).padStart(4, '0')}`,
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            dateOfBirth: dob,
            gender,
            academicYear: row.academicYear || '2025-2026',
            status: 'active'
        };

        if (classId) studentData.currentClass = classId;
        if (row.email && row.email.trim()) studentData.email = row.email.trim().toLowerCase();

        // Optional parent info
        if (row.fatherName || row.fatherPhone || row.motherName || row.motherPhone) {
            studentData.parentInfo = {};
            if (row.fatherName) studentData.parentInfo.fatherName = row.fatherName.trim();
            if (row.fatherPhone) studentData.parentInfo.fatherPhone = row.fatherPhone.trim();
            if (row.fatherEmail) studentData.parentInfo.fatherEmail = row.fatherEmail.trim();
            if (row.motherName) studentData.parentInfo.motherName = row.motherName.trim();
            if (row.motherPhone) studentData.parentInfo.motherPhone = row.motherPhone.trim();
            if (row.motherEmail) studentData.parentInfo.motherEmail = row.motherEmail.trim();
            studentData.parentInfo.primaryContact = row.primaryContact || 'father';
        }

        try {
            const student = await Student.create(studentData);
            created.push(student);
        } catch (error) {
            const msg = error.code === 11000
                ? 'Duplicate student ID or email'
                : error.message;
            errors.push({ row: rowNum, message: msg, data: row });
        }
    }

    res.status(created.length > 0 ? 201 : 400).json({
        success: created.length > 0,
        message: `${created.length} of ${rows.length} students imported successfully`,
        data: {
            imported: created.length,
            failed: errors.length,
            total: rows.length,
            errors: errors.length > 0 ? errors : undefined
        }
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
 * @desc    Transfer student to another class
 * @route   PUT /api/students/:id/transfer
 * @access  Private (Admin)
 */
export const transferStudent = asyncHandler(async (req, res) => {
    const { newClassId, reason } = req.body;

    const student = await Student.findByIdAndUpdate(
        req.params.id,
        {
            currentClass: newClassId,
            $push: {
                notes: `Transferred on ${new Date().toLocaleDateString()}. Reason: ${reason || 'N/A'}`
            }
        },
        { new: true }
    ).populate('currentClass', 'name grade section');

    if (!student) {
        return res.status(404).json({
            success: false,
            message: 'Student not found'
        });
    }

    res.json({
        success: true,
        message: 'Student transferred successfully',
        data: { student }
    });
});
