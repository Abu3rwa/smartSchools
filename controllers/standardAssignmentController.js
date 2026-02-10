import StandardAssignment from '../models/StandardAssignment.js';
import Standard from '../models/Standard.js';
import Student from '../models/Student.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';

/**
 * @desc    Get assignments (teacher sees own, admin sees all)
 * @route   GET /api/standard-assignments
 * @access  Private (Admin, Teacher)
 */
export const getAssignments = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, classId, subjectId, standardId } = req.query;

    const query = {};

    // Teacher scoping: only see their own assignments
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        query.teacher = teacher._id;
    }

    if (classId) query.class = classId;
    if (subjectId) query.subject = subjectId;
    if (standardId) query.standard = standardId;

    const assignments = await StandardAssignment.find(query)
        .populate('standard', 'code name description gradeLevel category')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('teacher', 'employeeId')
        .populate({
            path: 'teacher',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .populate('students', 'firstName lastName studentId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await StandardAssignment.countDocuments(query);

    res.json({
        success: true,
        data: {
            assignments,
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
 * @desc    Get single assignment with student progress
 * @route   GET /api/standard-assignments/:id
 * @access  Private
 */
export const getAssignment = asyncHandler(async (req, res) => {
    const assignment = await StandardAssignment.findById(req.params.id)
        .populate('standard')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('teacher', 'employeeId')
        .populate({
            path: 'teacher',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .populate('students', 'firstName lastName studentId');

    if (!assignment) {
        return res.status(404).json({
            success: false,
            message: 'Assignment not found'
        });
    }

    // Get students who are part of this assignment
    let studentList;
    if (assignment.students.length > 0) {
        studentList = assignment.students;
    } else {
        // All students in the class
        studentList = await Student.find({
            currentClass: assignment.class._id,
            status: 'active'
        }).select('firstName lastName studentId');
    }

    // Get progress for each student
    const studentsWithProgress = await Promise.all(
        studentList.map(async (student) => {
            const mastery = await PracticeAttempt.calculateMastery(
                student._id,
                assignment.standard._id,
                assignment.standard.masteryThreshold,
                assignment.standard.masteryMinQuestions
            );
            return {
                student: student.toObject ? student.toObject() : student,
                mastery
            };
        })
    );

    res.json({
        success: true,
        data: {
            assignment,
            studentsWithProgress
        }
    });
});

/**
 * @desc    Create assignment (teacher assigns standard to class/students)
 * @route   POST /api/standard-assignments
 * @access  Private (Admin, Teacher)
 */
export const createAssignment = asyncHandler(async (req, res) => {
    const { standardId, classId, subjectId, students, dueDate, instructions } = req.body;

    // Verify standard exists
    const standard = await Standard.findById(standardId);
    if (!standard) {
        return res.status(404).json({ success: false, message: 'Standard not found' });
    }

    // Resolve teacher
    let teacherId;
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        teacherId = teacher._id;
    } else {
        // Admin must provide teacher or it's auto-resolved
        teacherId = req.body.teacherId;
    }

    // Check for duplicate assignment
    const existing = await StandardAssignment.findOne({
        school: req.schoolId,
        standard: standardId,
        class: classId,
        subject: subjectId,
        teacher: teacherId,
        isActive: true
    });
    if (existing) {
        return res.status(400).json({
            success: false,
            message: 'This standard is already assigned to this class'
        });
    }

    const assignment = await StandardAssignment.create({
        school: req.schoolId,
        standard: standardId,
        teacher: teacherId,
        class: classId,
        subject: subjectId,
        students: students || [],
        dueDate: dueDate || null,
        instructions: instructions || ''
    });

    const populated = await StandardAssignment.findById(assignment._id)
        .populate('standard', 'code name description gradeLevel')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('students', 'firstName lastName studentId');

    res.status(201).json({
        success: true,
        message: 'Standard assigned successfully',
        data: { assignment: populated }
    });
});

/**
 * @desc    Update assignment
 * @route   PUT /api/standard-assignments/:id
 * @access  Private (Admin, Teacher)
 */
export const updateAssignment = asyncHandler(async (req, res) => {
    let assignment = await StandardAssignment.findById(req.params.id);

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Teacher can only update their own
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || assignment.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
    }

    const allowedFields = ['students', 'dueDate', 'instructions', 'isActive'];
    const updates = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    assignment = await StandardAssignment.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    })
        .populate('standard', 'code name description gradeLevel')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('students', 'firstName lastName studentId');

    res.json({
        success: true,
        message: 'Assignment updated successfully',
        data: { assignment }
    });
});

/**
 * @desc    Delete assignment (soft delete)
 * @route   DELETE /api/standard-assignments/:id
 * @access  Private (Admin, Teacher)
 */
export const deleteAssignment = asyncHandler(async (req, res) => {
    const assignment = await StandardAssignment.findById(req.params.id);

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || assignment.teacher.toString() !== teacher._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
    }

    assignment.isActive = false;
    await assignment.save();

    res.json({
        success: true,
        message: 'Assignment removed successfully'
    });
});
