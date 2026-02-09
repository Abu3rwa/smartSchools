import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import Schedule from '../models/Schedule.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Room from '../models/Room.js';
import { isWorkingDayForSchool, resolvePeriodForSchedule, hasTeacherAssignmentForSchedule } from '../helpers/attendanceEligibility.js';

// @desc    Get all schedules for a school
// @route   GET /api/schedules
// @access  Private (School Admin, Teacher, Student)
export const getSchedules = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        type,
        teacher,
        class: classId,
        status,
        startDate,
        endDate,
        tags,
        search
    } = req.query;

    // Build query
    const query = { school: req.school._id };

    // Apply filters
    if (type) query.type = type;
    if (teacher) query.teacher = teacher;
    if (classId) query.class = classId;
    if (status) query.status = status;
    if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        query.tags = { $in: tagArray };
    }

    // Date range filter
    if (startDate || endDate) {
        query.startTime = {};
        if (startDate) query.startTime.$gte = new Date(startDate);
        if (endDate) query.startTime.$lte = new Date(endDate);
    }

    // Search functionality
    if (search) {
        query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { room: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
        ];
    }

    // Role-based filtering
    if (req.user.role === 'teacher') {
        query.teacher = req.user._id;
    } else if (req.user.role === 'student') {
        // For students, show schedules they're participants in or their class schedules
        query.$or = [
            { 'participants.user': req.user._id },
            { class: req.user.class }
        ];
    }

    const skip = (page - 1) * limit;

    const schedules = await Schedule.find(query)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade')
        .populate('subject', 'name')
        .populate('participants.user', 'firstName lastName email')
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Schedule.countDocuments(query);

    res.json({
        success: true,
        data: {
            schedules,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

// @desc    Get single schedule by ID
// @route   GET /api/schedules/:id
// @access  Private
export const getScheduleById = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade')
        .populate('subject', 'name')
        .populate('participants.user', 'firstName lastName email')
        .populate('attendance.student', 'firstName lastName')
        .populate('materials.uploadedBy', 'firstName lastName')
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName');

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Role-based access control
    const isParticipant = schedule.participants.some(p => p.user._id.toString() === req.user._id.toString());
    const isTeacher = schedule.teacher?._id?.toString() === req.user._id.toString();
    const isInClass = schedule.class?._id?.toString() === req.user.class?.toString();

    if (req.user.role === 'student' && !isParticipant && !isInClass) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && !isTeacher && !isParticipant) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.json({
        success: true,
        data: { schedule }
    });
});

// @desc    Create new schedule
// @route   POST /api/schedules
// @access  Private (School Admin, Teacher)
export const createSchedule = asyncHandler(async (req, res) => {
    const {
        title,
        description,
        type,
        class: classId,
        subject,
        teacher,
        room,
        location,
        startTime,
        endTime,
        isRecurring,
        recurrencePattern,
        recurrenceEnd,
        requiresAttendance,
        participants,
        materials,
        tags,
        color
    } = req.body;

    // Validate required fields
    if (!title || !type || !startTime || !endTime || !teacher || !room) {
        return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    // Validate time range
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
        return res.status(400).json({ success: false, message: 'End time must be after start time' });
    }

    // Validate teacher exists and belongs to school
    if (teacher) {
        const teacherUser = await User.findById(teacher);
        if (!teacherUser || teacherUser.school.toString() !== req.school._id.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid teacher' });
        }
    }

    // Validate class exists and belongs to school
    if (classId) {
        const classDoc = await Class.findById(classId);
        if (!classDoc || classDoc.school.toString() !== req.school._id.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid class' });
        }
    }

    // Validate room exists and belongs to school
    if (room) {
        const roomDoc = await Room.findById(room);
        if (!roomDoc || roomDoc.school.toString() !== req.school._id.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid room' });
        }
    }

    // Check for conflicts
    const conflicts = await Schedule.findConflicts(req.school._id, start, end, teacher, room, classId);
    if (conflicts.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Schedule conflicts detected',
            conflicts: conflicts.map(c => ({
                id: c._id,
                title: c.title,
                startTime: c.startTime,
                endTime: c.endTime,
                teacher: c.teacher
            }))
        });
    }

    // Create schedule
    const scheduleData = {
        title,
        description,
        type,
        school: req.school._id,
        class: classId,
        subject,
        teacher,
        room,
        location,
        startTime: start,
        endTime: end,
        isRecurring,
        recurrencePattern,
        recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : undefined,
        requiresAttendance,
        participants: participants || [],
        materials: materials || [],
        tags: tags || [],
        color: color || '#3B82F6',
        createdBy: req.user._id
    };

    const schedule = new Schedule(scheduleData);
    await schedule.save();

    // Add creator as organizer participant
    if (!schedule.participants.some(p => p.user.toString() === req.user._id.toString())) {
        schedule.participants.push({
            user: req.user._id,
            role: 'required',
            status: 'accepted'
        });
        await schedule.save();
    }

    // If it's a class schedule, add all students as participants
    if (classId && type === 'class') {
        const students = await Student.find({ currentClass: classId });
        const studentParticipants = students.map(student => ({
            user: student.user,
            role: 'required',
            status: 'pending'
        }));
        
        schedule.participants.push(...studentParticipants);
        await schedule.save();
    }

    const populatedSchedule = await Schedule.findById(schedule._id)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade')
        .populate('subject', 'name')
        .populate('room', 'name')
        .populate('participants.user', 'firstName lastName email');

    res.status(201).json({
        success: true,
        data: { schedule: populatedSchedule },
        message: 'Schedule created successfully'
    });
});

// @desc    Update schedule
// @route   PUT /api/schedules/:id
// @access  Private (School Admin, Teacher)
export const updateSchedule = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && schedule.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to update this schedule' });
    }

    const {
        title,
        description,
        type,
        class: classId,
        subject,
        teacher,
        room,
        location,
        startTime,
        endTime,
        isRecurring,
        recurrencePattern,
        recurrenceEnd,
        requiresAttendance,
        participants,
        materials,
        tags,
        color,
        status
    } = req.body;

    // Validate time range if provided
    if (startTime && endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        if (start >= end) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }

        const nextTeacher = teacher !== undefined ? teacher : schedule.teacher;
        const nextRoom = room !== undefined ? room : schedule.room;
        const nextClass = classId !== undefined ? classId : schedule.class;

        // Check for conflicts (excluding current schedule)
        const conflicts = await Schedule.findConflicts(req.school._id, start, end, nextTeacher, nextRoom, nextClass, schedule._id);
        if (conflicts.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Schedule conflicts detected',
                conflicts: conflicts.map(c => ({
                    id: c._id,
                    title: c.title,
                    startTime: c.startTime,
                    endTime: c.endTime,
                    teacher: c.teacher
                }))
            });
        }
    }

    // Update fields
    if (title !== undefined) schedule.title = title;
    if (description !== undefined) schedule.description = description;
    if (type !== undefined) schedule.type = type;
    if (classId !== undefined) schedule.class = classId;
    if (subject !== undefined) schedule.subject = subject;
    if (teacher !== undefined) schedule.teacher = teacher;
    if (room !== undefined) schedule.room = room;
    if (location !== undefined) schedule.location = location;
    if (startTime !== undefined) schedule.startTime = new Date(startTime);
    if (endTime !== undefined) schedule.endTime = new Date(endTime);
    if (isRecurring !== undefined) schedule.isRecurring = isRecurring;
    if (recurrencePattern !== undefined) schedule.recurrencePattern = recurrencePattern;
    if (recurrenceEnd !== undefined) schedule.recurrenceEnd = recurrenceEnd ? new Date(recurrenceEnd) : undefined;
    if (requiresAttendance !== undefined) schedule.requiresAttendance = requiresAttendance;
    if (participants !== undefined) schedule.participants = participants;
    if (materials !== undefined) schedule.materials = materials;
    if (tags !== undefined) schedule.tags = tags;
    if (color !== undefined) schedule.color = color;
    if (status !== undefined) schedule.status = status;

    schedule.updatedBy = req.user._id;
    await schedule.save();

    const updatedSchedule = await Schedule.findById(schedule._id)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade')
        .populate('subject', 'name')
        .populate('room', 'name')
        .populate('participants.user', 'firstName lastName email');

    res.json({
        success: true,
        data: { schedule: updatedSchedule },
        message: 'Schedule updated successfully'
    });
});

// @desc    Delete schedule
// @route   DELETE /api/schedules/:id
// @access  Private (School Admin, Teacher)
export const deleteSchedule = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && schedule.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to delete this schedule' });
    }

    await Schedule.findByIdAndDelete(req.params.id);

    res.json({
        success: true,
        message: 'Schedule deleted successfully'
    });
});

// @desc    Cancel schedule
// @route   POST /api/schedules/:id/cancel
// @access  Private (School Admin, Teacher)
export const cancelSchedule = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && schedule.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to cancel this schedule' });
    }

    schedule.status = 'cancelled';
    schedule.cancelledAt = new Date();
    schedule.cancelledBy = req.user._id;
    schedule.cancellationReason = reason;

    await schedule.save();

    res.json({
        success: true,
        data: { schedule },
        message: 'Schedule cancelled successfully'
    });
});

// @desc    Get schedules by date range
// @route   GET /api/schedules/calendar
// @access  Private
export const getSchedulesByDateRange = asyncHandler(async (req, res) => {
    const { startDate, endDate, type, teacher, class: classId } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const filters = {};
    if (type) filters.type = type;
    if (teacher) filters.teacher = teacher;
    if (classId) filters.class = classId;

    // Role-based filtering
    if (req.user.role === 'teacher') {
        filters.teacher = req.user._id;
    } else if (req.user.role === 'student') {
        // For students, get schedules they're participants in or their class schedules
        const studentSchedules = await Schedule.find({
            school: req.school._id,
            startTime: { $gte: start },
            endTime: { $lte: end },
            $or: [
                { 'participants.user': req.user._id },
                { class: req.user.class }
            ],
            ...filters
        }).populate('teacher', 'firstName lastName')
         .populate('class', 'name grade')
         .populate('subject', 'name')
         .sort({ startTime: 1 });

        return res.json({
            success: true,
            data: { schedules: studentSchedules }
        });
    }

    const schedules = await Schedule.findByDateRange(req.school._id, start, end, filters);

    res.json({
        success: true,
        data: { schedules }
    });
});

// @desc    Get teacher schedule
// @route   GET /api/schedules/teacher/:teacherId
// @access  Private
export const getTeacherSchedule = asyncHandler(async (req, res) => {
    const { teacherId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    // Check permissions (only admin or the teacher themselves can view)
    if (req.user.role === 'teacher' && req.user._id.toString() !== teacherId) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const schedules = await Schedule.getTeacherSchedule(teacherId, start, end);

    res.json({
        success: true,
        data: { schedules }
    });
});

// @desc    Get student schedule
// @route   GET /api/schedules/student/:studentId
// @access  Private
export const getStudentSchedule = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    // Check permissions (only admin, the student themselves, or their teacher can view)
    if (req.user.role === 'student' && req.user._id.toString() !== studentId) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const schedules = await Schedule.getStudentSchedule(studentId, start, end);

    res.json({
        success: true,
        data: { schedules }
    });
});

// @desc    Record attendance for schedule
// @route   POST /api/schedules/:id/attendance
// @access  Private (Teacher, School Admin)
export const recordAttendance = asyncHandler(async (req, res) => {
    const { attendance } = req.body; // Array of { student, status, notes }
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    if (!schedule.requiresAttendance) {
        return res.status(400).json({ success: false, message: 'This schedule does not require attendance' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && schedule.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to record attendance' });
    }

    // Attendance eligibility enforcement (teacher only; admin can override)
    if (req.user.role === 'teacher') {
        const isWorkingDay = await isWorkingDayForSchool(req.schoolId, schedule.startTime);
        if (!isWorkingDay) {
            return res.status(400).json({ success: false, message: 'Attendance is disabled for non-working days' });
        }

        const period = await resolvePeriodForSchedule(req.schoolId, schedule);
        if (period) {
            const hasAssignment = await hasTeacherAssignmentForSchedule(
                req.schoolId,
                schedule,
                req.user._id,
                period._id
            );
            if (!hasAssignment) {
                return res.status(403).json({ success: false, message: 'Attendance is disabled for periods you are not assigned to' });
            }
        }
    }

    // Update attendance records
    attendance.forEach(record => {
        const existingIndex = schedule.attendance.findIndex(
            a => a.student.toString() === record.student
        );

        if (existingIndex !== -1) {
            schedule.attendance[existingIndex] = {
                ...schedule.attendance[existingIndex],
                status: record.status,
                notes: record.notes,
                checkInTime: record.status === 'present' ? new Date() : schedule.attendance[existingIndex].checkInTime,
                recordedBy: req.user._id,
                recordedAt: new Date()
            };
        } else {
            schedule.attendance.push({
                student: record.student,
                status: record.status,
                notes: record.notes,
                checkInTime: record.status === 'present' ? new Date() : undefined,
                recordedBy: req.user._id,
                recordedAt: new Date()
            });
        }
    });

    schedule.attendanceRecorded = true;
    await schedule.save();

    const attendanceStats = schedule.checkAttendance();

    res.json({
        success: true,
        data: {
            schedule,
            attendanceStats
        },
        message: 'Attendance recorded successfully'
    });
});

// @desc    Get attendance statistics
// @route   GET /api/schedules/:id/attendance
// @access  Private
export const getAttendanceStats = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id)
        .populate('attendance.student', 'firstName lastName');

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const attendanceStats = schedule.checkAttendance();

    res.json({
        success: true,
        data: {
            attendance: schedule.attendance,
            stats: attendanceStats
        }
    });
});

// @desc    Add participant to schedule
// @route   POST /api/schedules/:id/participants
// @access  Private (School Admin, Teacher)
export const addParticipant = asyncHandler(async (req, res) => {
    const { user, role } = req.body;
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && schedule.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Check if user is already a participant
    if (schedule.participants.some(p => p.user.toString() === user)) {
        return res.status(400).json({ success: false, message: 'User is already a participant' });
    }

    schedule.participants.push({
        user,
        role: role || 'participant',
        status: 'invited'
    });

    await schedule.save();

    const updatedSchedule = await Schedule.findById(schedule._id)
        .populate('participants.user', 'firstName lastName email');

    res.json({
        success: true,
        data: { schedule: updatedSchedule },
        message: 'Participant added successfully'
    });
});

// @desc    Remove participant from schedule
// @route   DELETE /api/schedules/:id/participants/:userId
// @access  Private (School Admin, Teacher)
export const removeParticipant = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && schedule.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    schedule.participants = schedule.participants.filter(
        p => p.user.toString() !== userId
    );

    await schedule.save();

    res.json({
        success: true,
        message: 'Participant removed successfully'
    });
});

// @desc    Update participant status
// @route   PUT /api/schedules/:id/participants/:userId
// @access  Private
export const updateParticipantStatus = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { status } = req.body;
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions (user can update their own status, or admin/teacher can update any)
    if (req.user._id.toString() !== userId && 
        req.user.role !== 'admin' &&
        req.user.role !== 'school_admin' && 
        (req.user.role !== 'teacher' || schedule.teacher.toString() !== req.user._id.toString())) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const participant = schedule.participants.find(p => p.user.toString() === userId);
    if (!participant) {
        return res.status(404).json({ success: false, message: 'Participant not found' });
    }

    participant.status = status;
    participant.responseTime = new Date();

    await schedule.save();

    res.json({
        success: true,
        message: 'Participant status updated successfully'
    });
});
