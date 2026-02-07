import Student from '../models/Student.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';

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

    // Handle empty email
    if (req.body.email === '') {
        req.body.email = null; // Set to null for sparse index
    }

    student = await Student.findByIdAndUpdate(req.params.id, req.body, {
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
