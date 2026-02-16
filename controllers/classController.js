import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { applyDepartmentScope, enforceDepartmentOnWrite } from '../helpers/departmentScope.js';

/**
 * @desc    Get all classes
 * @route   GET /api/classes
 * @access  Private
 */
export const getClasses = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, grade, academicYear, isActive } = req.query;

    const query = {};
    if (grade) query.grade = grade;
    if (academicYear) query.academicYear = academicYear;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    applyDepartmentScope(query, req.departmentId);
    if (req.queryFilter?.departmentId) query.department = req.queryFilter.departmentId;

    // Access Control: Teachers see only their assigned classes
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const classIds = await getTeacherClassIds(teacher._id);
        query._id = { $in: classIds };
    }

    const classes = await Class.find(query)
        .populate('department', 'name type')
        .populate('classTeacher', 'user')
        .populate({
            path: 'classTeacher',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .populate('subjects.subject', 'name code')
        .populate({
            path: 'subjects.teacher',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .sort({ grade: 1, section: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    // Get student counts (single aggregation instead of N+1)
    const classIds = classes.map(c => c._id);
    let classesWithCounts;
    if (classIds.length === 0) {
        classesWithCounts = classes.map(cls => ({ ...cls.toObject(), studentCount: 0 }));
    } else {
        const counts = await Student.aggregate([
            { $match: { currentClass: { $in: classIds }, status: 'active' } },
            { $group: { _id: '$currentClass', count: { $sum: 1 } } }
        ]);
        const countByClass = {};
        counts.forEach(r => { countByClass[r._id.toString()] = r.count; });
        classesWithCounts = classes.map(cls => ({ ...cls.toObject(), studentCount: countByClass[cls._id.toString()] ?? 0 }));
    }

    const total = await Class.countDocuments(query);

    res.json({
        success: true,
        data: {
            classes: classesWithCounts,
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
 * @desc    Get single class
 * @route   GET /api/classes/:id
 * @access  Private
 */
export const getClass = asyncHandler(async (req, res) => {
    let classData = await Class.findById(req.params.id)
        .populate('department', 'name type')
        .populate({
            path: 'classTeacher',
            populate: { path: 'user', select: 'firstName lastName email' }
        })
        .populate('subjects.subject', 'name code maxMarks passingMarks')
        .populate({
            path: 'subjects.teacher',
            populate: { path: 'user', select: 'firstName lastName' }
        });

    if (!classData) {
        return res.status(404).json({
            success: false,
            message: 'Class not found'
        });
    }

    // Department scope: department-scoped principal cannot see class with no department or other department
    if (req.departmentId) {
        const classDeptId = classData.department?._id || classData.department;
        if (!classDeptId || classDeptId.toString() !== req.departmentId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this class'
            });
        }
    }

    // Access Control: Check if teacher has access to this specific class
    let teacherProfile = null;
    if (req.user.role === 'teacher') {
        teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const classIds = await getTeacherClassIds(teacherProfile._id);
        if (!classIds.some(id => id.toString() === req.params.id)) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to view this class'
            });
        }

        // Filter subjects to only those assigned to this teacher
        classData = classData.toObject();
        classData.subjects = classData.subjects.filter(
            s => s.teacher?._id?.toString() === teacherProfile._id.toString()
        );
    }

    // Get students in this class
    const students = await Student.find({
        currentClass: req.params.id,
        status: 'active'
    }).sort({ firstName: 1, lastName: 1 });

    res.json({
        success: true,
        data: {
            class: classData,
            students,
            studentCount: students.length
        }
    });
});

/**
 * @desc    Create class
 * @route   POST /api/classes
 * @route   POST /api/classes
 * @access  Private (Admin, Teacher)
 */
export const createClass = asyncHandler(async (req, res) => {
    const { grade, section, academicYear, classTeacher, room, capacity, department } = req.body;

    // Access Control
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Not authorized to create classes' });
    }

    // Check if class already exists in this school
    const existingClass = await Class.findOne({ school: req.schoolId, grade, section, academicYear });
    if (existingClass) {
        return res.status(400).json({
            success: false,
            message: 'Class already exists for this grade, section, and academic year'
        });
    }

    // Resolve classTeacher - if not provided and user is a teacher, use their Teacher profile ID
    let resolvedClassTeacher = classTeacher;
    if (!resolvedClassTeacher && req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        resolvedClassTeacher = teacher?._id;
    }

    const classData = await Class.create({
        school: req.schoolId,
        grade,
        section,
        academicYear,
        classTeacher: resolvedClassTeacher || undefined,
        room,
        capacity,
        department: department || undefined,
        name: `Grade ${grade}${section ? '-' + section : ''}`
    });

    res.status(201).json({
        success: true,
        message: 'Class created successfully',
        data: { class: classData }
    });
});

/**
 * @desc    Update class
 * @route   PUT /api/classes/:id
 * @access  Private (Admin)
 */
export const updateClass = asyncHandler(async (req, res) => {
    let classData = await Class.findById(req.params.id);

    if (!classData) {
        return res.status(404).json({
            success: false,
            message: 'Class not found'
        });
    }

    if (req.departmentId) {
        const classDeptId = classData.department?._id || classData.department;
        if (!classDeptId || classDeptId.toString() !== req.departmentId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to edit this class'
            });
        }
    }

    const allowedFields = ['grade', 'section', 'academicYear', 'classTeacher', 'room', 'capacity', 'name', 'isActive', 'department'];
    const updates = {};
    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const enforce = enforceDepartmentOnWrite(updates, req.departmentId);
    if (!enforce.allowed) {
        return res.status(403).json({ success: false, message: enforce.message });
    }

    classData = await Class.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    })
        .populate('department', 'name type')
        .populate({
            path: 'classTeacher',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .populate('subjects.subject', 'name code')
        .populate({
            path: 'subjects.teacher',
            populate: { path: 'user', select: 'firstName lastName' }
        });

    res.json({
        success: true,
        message: 'Class updated successfully',
        data: { class: classData }
    });
});

/**
 * @desc    Delete class
 * @route   DELETE /api/classes/:id
 * @access  Private (Admin)
 */
export const deleteClass = asyncHandler(async (req, res) => {
    const classData = await Class.findById(req.params.id);

    if (!classData) {
        return res.status(404).json({
            success: false,
            message: 'Class not found'
        });
    }

    // Check if class has students
    const studentCount = await Student.countDocuments({ currentClass: req.params.id });
    if (studentCount > 0) {
        return res.status(400).json({
            success: false,
            message: `Cannot delete class with ${studentCount} enrolled students. Transfer students first.`
        });
    }

    classData.isActive = false;
    await classData.save();

    res.json({
        success: true,
        message: 'Class deleted successfully'
    });
});

/**
 * @desc    Add subject with teacher to class
 * @route   POST /api/classes/:id/subjects
 * @access  Private (Admin)
 */
export const addSubjectToClass = asyncHandler(async (req, res) => {
    const { subjectId, teacherId } = req.body;

    const classData = await Class.findById(req.params.id);

    if (!classData) {
        return res.status(404).json({
            success: false,
            message: 'Class not found'
        });
    }

    // Check if subject already assigned
    const existing = classData.subjects.find(
        s => s.subject.toString() === subjectId
    );

    if (existing) {
        return res.status(400).json({
            success: false,
            message: 'Subject already assigned to this class'
        });
    }

    classData.subjects.push({
        subject: subjectId,
        teacher: teacherId
    });

    await classData.save();

    // Keep Teacher.assignedClasses in sync
    if (teacherId) {
        const teacher = await Teacher.findById(teacherId);
        if (teacher) {
            const alreadyAssigned = teacher.assignedClasses.some(
                a => a.class?.toString() === req.params.id &&
                     a.subject?.toString() === subjectId
            );
            if (!alreadyAssigned) {
                teacher.assignedClasses.push({ class: req.params.id, subject: subjectId });
                await teacher.save();
            }
        }
    }

    const updatedClass = await Class.findById(req.params.id)
        .populate('subjects.subject', 'name code')
        .populate({
            path: 'subjects.teacher',
            populate: { path: 'user', select: 'firstName lastName' }
        });

    res.json({
        success: true,
        message: 'Subject added to class successfully',
        data: { class: updatedClass }
    });
});

/**
 * @desc    Remove subject from class
 * @route   DELETE /api/classes/:id/subjects/:subjectId
 * @access  Private (Admin)
 */
export const removeSubjectFromClass = asyncHandler(async (req, res) => {
    const classData = await Class.findById(req.params.id);

    if (!classData) {
        return res.status(404).json({
            success: false,
            message: 'Class not found'
        });
    }

    // Find the entry before removing (to get the teacher ID)
    const removed = classData.subjects.find(
        s => s.subject.toString() === req.params.subjectId
    );

    classData.subjects = classData.subjects.filter(
        s => s.subject.toString() !== req.params.subjectId
    );

    await classData.save();

    // Keep Teacher.assignedClasses in sync
    if (removed?.teacher) {
        const teacher = await Teacher.findById(removed.teacher);
        if (teacher) {
            teacher.assignedClasses = teacher.assignedClasses.filter(
                a => !(a.class?.toString() === req.params.id &&
                       a.subject?.toString() === req.params.subjectId)
            );
            await teacher.save();
        }
    }

    res.json({
        success: true,
        message: 'Subject removed from class successfully'
    });
});

/**
 * @desc    Get class statistics
 * @route   GET /api/classes/:id/stats
 * @access  Private
 */
export const getClassStats = asyncHandler(async (req, res) => {
    const classId = req.params.id;

    const [totalStudents, maleCount, femaleCount] = await Promise.all([
        Student.countDocuments({ currentClass: classId, status: 'active' }),
        Student.countDocuments({ currentClass: classId, status: 'active', gender: 'male' }),
        Student.countDocuments({ currentClass: classId, status: 'active', gender: 'female' })
    ]);

    const classData = await Class.findById(classId);

    res.json({
        success: true,
        data: {
            totalStudents,
            maleCount,
            femaleCount,
            capacity: classData?.capacity || 40,
            availableSeats: (classData?.capacity || 40) - totalStudents,
            subjectCount: classData?.subjects?.length || 0
        }
    });
});
