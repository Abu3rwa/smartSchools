import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import Schedule from '../models/Schedule.js';
import Attendance from '../models/Attendance.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Room from '../models/Room.js';
import { isWorkingDayForSchool, resolvePeriodForSchedule, hasTeacherAssignmentForSchedule } from '../helpers/attendanceEligibility.js';

/** Map UI status to Attendance schema enum: late->tardy, excused->absent_excused */
function mapAttendanceStatus(status) {
    if (status === 'late') return 'tardy';
    if (status === 'excused') return 'absent_excused';
    if (['present', 'absent', 'tardy', 'tardy_excused', 'absent_excused'].includes(status)) return status;
    return 'present';
}

/** Enrich schedules with attendanceRecorded (from Attendance model) */
async function enrichSchedulesWithAttendanceRecorded(schedules) {
    if (!schedules || schedules.length === 0) return schedules;
    const ids = schedules.map(s => s._id);
    const attendanceRecords = await Attendance.find({ schedule: { $in: ids } }).select('schedule date').lean();
    const recordedSet = new Set(
        attendanceRecords.map(a => `${a.schedule}|${a.date ? new Date(a.date).toISOString().slice(0, 10) : ''}`)
    );
    return schedules.map(s => {
        const d = s.startTime;
        const dateKey = d ? new Date(d).toISOString().slice(0, 10) : '';
        const key = `${s._id}|${dateKey}`;
        const obj = s.toObject ? s.toObject() : (typeof s === 'object' && s !== null ? { ...s } : s);
        return { ...obj, attendanceRecorded: recordedSet.has(key) };
    });
}

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

    // Search functionality (title, description, location only - room is ObjectId)
    if (search) {
        query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
        ];
    }

    // Role-based filtering
    if (req.user.role === 'teacher') {
        query.teacher = req.user._id;
    } else if (req.user.role === 'student') {
        // Resolve student's currentClass from Student model (User has no class field)
        const student = await Student.findOne({ user: req.user._id }).select('currentClass').lean();
        const studentClassId = student?.currentClass;
        const orConditions = [{ 'participants.user': req.user._id }];
        if (studentClassId) orConditions.push({ class: studentClassId });
        query.$or = orConditions;
    }

    const skip = (page - 1) * limit;

    let schedules = await Schedule.find(query)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade')
        .populate('subject', 'name')
        .populate('participants.user', 'firstName lastName email')
        .populate('room', 'name')
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(parseInt(limit));

    if (req.user.role === 'teacher' || req.user.role === 'admin' || req.user.role === 'school_admin') {
        schedules = await enrichSchedulesWithAttendanceRecorded(schedules);
    }

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
        .populate('room', 'name')
        .populate('participants.user', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName')
        .populate('lastModifiedBy', 'firstName lastName')
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
        // Resolve student's currentClass from Student model
        const student = await Student.findOne({ user: req.user._id }).select('currentClass').lean();
        const studentClassId = student?.currentClass;
        const orConditions = [{ 'participants.user': req.user._id }];
        if (studentClassId) orConditions.push({ class: studentClassId });
        // Use overlap query: schedule overlaps [start,end] when startTime < end AND endTime > start
        const studentSchedules = await Schedule.find({
            school: req.school._id,
            startTime: { $lt: end },
            endTime: { $gt: start },
            status: { $ne: 'cancelled' },
            $or: orConditions,
            ...filters
        }).populate('teacher', 'firstName lastName')
         .populate('class', 'name grade')
         .populate('subject', 'name')
         .populate('room', 'name')
         .sort({ startTime: 1 });

        return res.json({
            success: true,
            data: { schedules: studentSchedules }
        });
    }

    let schedules = await Schedule.findByDateRange(req.school._id, start, end, filters);
    if (req.user.role === 'teacher' || req.user.role === 'admin' || req.user.role === 'school_admin') {
        schedules = await enrichSchedulesWithAttendanceRecorded(schedules);
    }

    res.json({
        success: true,
        data: { schedules }
    });
});

// @desc    Get room availability for a time range (for schedule creation: which rooms are free)
// @route   GET /api/schedules/room-availability
// @access  Private (Admin, Teacher)
export const getRoomAvailability = asyncHandler(async (req, res) => {
    const { startTime, endTime, excludeScheduleId } = req.query;
    if (!startTime || !endTime) {
        return res.status(400).json({ success: false, message: 'startTime and endTime are required (ISO strings)' });
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
        return res.status(400).json({ success: false, message: 'End time must be after start time' });
    }

    const schoolId = req.school._id;
    const rooms = await Room.find({ school: schoolId }).lean();
    const availability = await Promise.all(
        rooms.map(async (room) => {
            let conflict = await Schedule.findOne({
                school: schoolId,
                room: room._id,
                status: { $ne: 'cancelled' },
                startTime: { $lt: end },
                endTime: { $gt: start }
            })
                .select('title startTime endTime')
                .lean();
            if (conflict && excludeScheduleId && conflict._id.toString() === excludeScheduleId.toString()) {
                conflict = null;
            }
            const available = !conflict;
            return {
                _id: room._id,
                name: room.name,
                type: room.type,
                capacity: room.capacity,
                available,
                conflictingWith: available ? null : {
                    title: conflict?.title,
                    startTime: conflict?.startTime,
                    endTime: conflict?.endTime
                }
            };
        })
    );

    res.json({
        success: true,
        data: { rooms: availability }
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

    let schedules = await Schedule.getTeacherSchedule(teacherId, start, end);
    schedules = await enrichSchedulesWithAttendanceRecorded(schedules);

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

    if (!schedule.class) {
        return res.status(400).json({ success: false, message: 'Attendance can only be recorded for class schedules' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && schedule.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to record attendance' });
    }

    // Attendance eligibility enforcement (teacher only; admin can override)
    const schoolId = req.schoolId || req.school?._id;
    if (req.user.role === 'teacher') {
        const isWorkingDay = await isWorkingDayForSchool(schoolId, schedule.startTime);
        if (!isWorkingDay) {
            return res.status(400).json({ success: false, message: 'Attendance is disabled for non-working days' });
        }

        const period = await resolvePeriodForSchedule(schoolId, schedule);
        if (period) {
            const hasAssignment = await hasTeacherAssignmentForSchedule(
                schoolId,
                schedule,
                req.user._id,
                period._id
            );
            if (!hasAssignment) {
                return res.status(403).json({ success: false, message: 'Attendance is disabled for periods you are not assigned to' });
            }
        }
    }

    const schedulePopulated = await Schedule.findById(req.params.id)
        .populate('class subject teacher room');

    const attendanceDate = new Date(schedule.startTime);
    attendanceDate.setHours(0, 0, 0, 0);

    const studentAttendance = attendance.map(record => ({
        student: record.student,
        status: mapAttendanceStatus(record.status),
        notes: record.notes || '',
        checkInTime: record.status === 'present' ? new Date() : undefined,
        recordedBy: req.user._id,
        recordedAt: new Date()
    }));

    let attendanceDoc = await Attendance.findOne({ schedule: schedule._id, date: attendanceDate });

    if (attendanceDoc) {
        attendanceDoc.studentAttendance = studentAttendance;
        attendanceDoc.lastModifiedBy = req.user._id;
        attendanceDoc.lastModifiedAt = new Date();
        await attendanceDoc.save();
    } else {
        const roomName = schedulePopulated?.room?.name || (await mongoose.model('Room').findById(schedule.room).select('name').lean())?.name || 'Unknown';
        attendanceDoc = new Attendance({
            school: req.school._id,
            schedule: schedule._id,
            teacher: schedule.teacher,
            class: schedule.class,
            subject: schedule.subject,
            date: attendanceDate,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            room: roomName,
            totalStudents: studentAttendance.length,
            studentAttendance,
            recordedBy: req.user._id,
            status: 'submitted',
            auditTrail: [{ action: 'created', performedBy: req.user._id, details: 'Attendance created' }]
        });
        await attendanceDoc.save();
    }

    const attendanceStats = {
        present: attendanceDoc.present ?? 0,
        absent: attendanceDoc.absent ?? 0,
        late: attendanceDoc.late ?? 0,
        excused: attendanceDoc.excused ?? 0,
        totalStudents: attendanceDoc.totalStudents ?? 0,
        attendanceRate: attendanceDoc.attendanceRate ?? 0
    };

    res.json({
        success: true,
        data: {
            schedule: await Schedule.findById(schedule._id).populate('teacher class subject room'),
            attendanceStats
        },
        message: 'Attendance recorded successfully'
    });
});

// @desc    Get attendance statistics
// @route   GET /api/schedules/:id/attendance
// @access  Private
export const getAttendanceStats = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const attendanceDate = new Date(schedule.startTime);
    attendanceDate.setHours(0, 0, 0, 0);

    const attendanceDoc = await Attendance.findOne({ schedule: schedule._id, date: attendanceDate })
        .populate('studentAttendance.student', 'firstName lastName');

    const stats = attendanceDoc ? {
        present: attendanceDoc.present ?? 0,
        absent: attendanceDoc.absent ?? 0,
        late: attendanceDoc.late ?? 0,
        excused: attendanceDoc.excused ?? 0,
        totalStudents: attendanceDoc.totalStudents ?? 0,
        attendanceRate: attendanceDoc.attendanceRate ?? 0
    } : { present: 0, absent: 0, late: 0, excused: 0, totalStudents: 0, attendanceRate: 0 };

    res.json({
        success: true,
        data: {
            attendance: attendanceDoc?.studentAttendance ?? [],
            stats
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
