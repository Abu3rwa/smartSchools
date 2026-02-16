import Teacher from '../models/Teacher.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { applyDepartmentScope } from '../helpers/departmentScope.js';

/**
 * @desc    Get all teachers
 * @route   GET /api/teachers
 * @access  Private
 */
export const getTeachers = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, department, isActive } = req.query;

    const query = {};

    applyDepartmentScope(query, req.departmentId);
    if (req.queryFilter?.departmentId) query.department = req.queryFilter.departmentId;
    else if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Apply search filter at DB level for performance
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        // Need to search on populated user fields - use aggregation or post-filter
        // For now, search on employeeId which is on Teacher model
        query.employeeId = searchRegex;
    }

    const total = await Teacher.countDocuments(query);

    let teachers = await Teacher.find(query)
        .populate('user', 'firstName lastName email phone')
        .populate('department', 'name type')
        .populate('subjects', 'name code')
        .populate('assignedClasses.class', 'name grade section')
        .populate('assignedClasses.subject', 'name code')
        .sort({ 'user.firstName': 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    // Post-filter on user name fields if search was provided (client-side for populated fields)
    if (search) {
        teachers = teachers.filter(t => {
            const fullName = `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.toLowerCase();
            const searchLower = search.toLowerCase();
            return fullName.includes(searchLower) ||
                (t.employeeId && t.employeeId.toLowerCase().includes(searchLower));
        });
    }

    res.json({
        success: true,
        data: {
            teachers,
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
 * @desc    Get single teacher
 * @route   GET /api/teachers/:id
 * @access  Private
 */
export const getTeacher = asyncHandler(async (req, res) => {
    const teacher = await Teacher.findById(req.params.id)
        .populate('user', 'firstName lastName email phone avatar')
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
    const department = req.departmentId || bodyDepartment || null;

    // Check if user already exists (global email lookup)
    let user = await User.findOne({ email }).setOptions({ skipTenantFilter: true });
    let isNewUser = false;
    
    if (!user) {
        // Create new user if doesn't exist
        user = await User.create({
            email,
            password: password || 'Teacher@123',
            firstName,
            lastName,
            phone,
            role: 'teacher',
            school: req.schoolId
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
        .populate('user', 'firstName lastName email phone')
        .populate('department', 'name type')
        .populate('subjects', 'name code');

    res.status(isNewUser ? 201 : 200).json({
        success: true,
        message: isNewUser ? 'Teacher created successfully' : 'Teacher profile linked to existing user',
        data: { teacher: populatedTeacher }
    });
});

/**
 * @desc    Update teacher
 * @route   PUT /api/teachers/:id
 * @access  Private (Admin)
 */
export const updateTeacher = asyncHandler(async (req, res) => {
    let teacher = await Teacher.findById(req.params.id);

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

    const { firstName, lastName, phone, ...rest } = req.body;

    const allowedTeacherFields = ['department', 'qualification', 'specialization', 'subjects', 'joiningDate', 'address', 'isActive'];
    const updates = {};
    allowedTeacherFields.forEach((field) => {
        if (rest[field] !== undefined) updates[field] = rest[field];
    });

    // Department principal cannot change a teacher's department
    if (req.departmentId && updates.department !== undefined) {
        delete updates.department;
    }

    // Update user info if provided
    if (firstName !== undefined || lastName !== undefined || phone !== undefined) {
        await User.findByIdAndUpdate(teacher.user, { firstName, lastName, phone });
    }

    // Update teacher profile (whitelist only; no school, user, employeeId, assignedClasses)
    teacher = await Teacher.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    })
        .populate('user', 'firstName lastName email phone')
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
    const teacher = await Teacher.findById(req.params.id);

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

    // Soft delete
    teacher.isActive = false;
    await teacher.save();

    // Also deactivate user account
    await User.findByIdAndUpdate(teacher.user, { isActive: false });

    res.json({
        success: true,
        message: 'Teacher deleted successfully'
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

    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
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
    teacher.assignedClasses.push(...newAssignments);
    await teacher.save();

    // Keep Class.subjects in sync so grade authorization works
    for (const newAssignment of newAssignments) {
        const classDoc = await Class.findById(newAssignment.class);
        if (!classDoc) continue;

        const alreadyInClass = classDoc.subjects.some(
            s => s.subject?.toString() === newAssignment.subject.toString() &&
                 s.teacher?.toString() === teacher._id.toString()
        );

        if (!alreadyInClass) {
            classDoc.subjects.push({ subject: newAssignment.subject, teacher: teacher._id });
        }
        if (newAssignment.isClassTeacher) {
            classDoc.classTeacher = teacher._id;
        }
        await classDoc.save();
    }

    const updatedTeacher = await Teacher.findById(req.params.id)
        .populate('user', 'firstName lastName email')
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
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
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

    teacher.assignedClasses = teacher.assignedClasses.filter(
        ac => ac._id.toString() !== req.params.assignmentId
    );

    await teacher.save();

    // Keep Class.subjects in sync; clear classTeacher if this teacher was class teacher
    if (removed) {
        await Class.findByIdAndUpdate(removed.class, {
            $pull: { subjects: { subject: removed.subject, teacher: teacher._id } }
        });
        await Class.findOneAndUpdate(
            { _id: removed.class, classTeacher: teacher._id },
            { $unset: { classTeacher: 1 } }
        );
    }

    res.json({
        success: true,
        message: 'Class assignment removed successfully'
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
