import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import Schedule from '../models/Schedule.js';
import Class from '../models/Class.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Room from '../models/Room.js';
import { isWorkingDayForSchool, resolvePeriodForSchedule, hasTeacherAssignmentForSchedule } from '../helpers/attendanceEligibility.js';
import { evaluateRoomOperationalState } from '../helpers/roomAvailability.js';
import {
    getClassIdsForAcademicYear,
    resolveAcademicYearDateRangeForRequest,
    clampDateRangeToAcademicYear,
    isDateInAcademicYear
} from '../helpers/academicYearScope.js';

const buildScheduleYearOrConditions = (classIds = [], dateFilter = null) => {
    const conditions = [];

    if (classIds.length > 0) {
        conditions.push({ class: { $in: classIds } });
    }
    if (dateFilter?.$gte && dateFilter?.$lte) {
        conditions.push(
            { class: { $exists: false }, startTime: dateFilter },
            { class: null, startTime: dateFilter }
        );
    }

    return conditions;
};

const resolveScheduleYearScope = async (req, candidateClassIds = null) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const classIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear,
        candidateClassIds
    });

    return {
        academicYear,
        dateFilter,
        classIds,
        classIdSet: new Set(classIds.map((id) => id.toString()))
    };
};

const isScheduleInAcademicYearScope = (schedule, scope) => {
    const scheduleClassId = schedule?.class?._id || schedule?.class;
    if (scheduleClassId) {
        return scope.classIdSet.has(scheduleClassId.toString());
    }
    return isDateInAcademicYear(schedule?.startTime, scope.dateFilter);
};

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

    const candidateClassIds = classId ? [classId] : null;
    const yearScope = await resolveScheduleYearScope(req, candidateClassIds);
    const yearScopeOrConditions = buildScheduleYearOrConditions(yearScope.classIds, yearScope.dateFilter);

    if (yearScopeOrConditions.length === 0) {
        return res.json({
            success: true,
            data: {
                schedules: [],
                pagination: {
                    page: parseInt(page, 10),
                    limit: parseInt(limit, 10),
                    total: 0,
                    pages: 0
                },
                academicYear: yearScope.academicYear
            }
        });
    }

    const andConditions = [{ $or: yearScopeOrConditions }];
    const query = { school: req.school._id };

    if (type) query.type = type;
    if (status) query.status = status;
    if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        query.tags = { $in: tagArray };
    }

    if (classId) {
        if (!yearScope.classIdSet.has(classId.toString())) {
            return res.json({
                success: true,
                data: {
                    schedules: [],
                    pagination: {
                        page: parseInt(page, 10),
                        limit: parseInt(limit, 10),
                        total: 0,
                        pages: 0
                    },
                    academicYear: yearScope.academicYear
                }
            });
        }
        query.class = classId;
    }

    if (search) {
        andConditions.push({
            $or: [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ]
        });
    }

    if (startDate || endDate) {
        const requestedRange = {};
        if (startDate) requestedRange.$gte = new Date(startDate);
        if (endDate) requestedRange.$lte = new Date(endDate);
        const scopedRange = clampDateRangeToAcademicYear(requestedRange, yearScope.dateFilter);
        if (!scopedRange) {
            return res.json({
                success: true,
                data: {
                    schedules: [],
                    pagination: {
                        page: parseInt(page, 10),
                        limit: parseInt(limit, 10),
                        total: 0,
                        pages: 0
                    },
                    academicYear: yearScope.academicYear
                }
            });
        }
        query.startTime = scopedRange;
    }

    if (req.user.role === 'teacher') {
        query.teacher = req.user._id;
    } else if (teacher) {
        query.teacher = teacher;
    }

    if (req.user.role === 'student') {
        const studentProfile = await Student.findOne({ user: req.user._id, school: req.schoolId })
            .select('currentClass')
            .lean();
        const studentClassId = studentProfile?.currentClass?.toString();
        const studentAccessOr = [{ 'participants.user': req.user._id }];
        if (studentClassId && yearScope.classIdSet.has(studentClassId)) {
            studentAccessOr.push({ class: studentProfile.currentClass });
        }
        andConditions.push({ $or: studentAccessOr });
    }

    if (andConditions.length > 0) {
        query.$and = andConditions;
    }

    const numericPage = parseInt(page, 10);
    const numericLimit = parseInt(limit, 10);
    const skip = (numericPage - 1) * numericLimit;

    const schedules = await Schedule.find(query)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade')
        .populate('subject', 'name')
        .populate('participants.user', 'firstName lastName email')
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(numericLimit)
        .lean();

    const total = await Schedule.countDocuments(query);

    res.json({
        success: true,
        data: {
            schedules,
            pagination: {
                page: numericPage,
                limit: numericLimit,
                total,
                pages: Math.ceil(total / numericLimit)
            },
            academicYear: yearScope.academicYear
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
        .populate('updatedBy', 'firstName lastName')
        .lean();

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const yearScope = await resolveScheduleYearScope(req);
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
    }

    // Role-based access control
    const isParticipant = schedule.participants.some(p => p.user._id.toString() === req.user._id.toString());
    const isTeacher = schedule.teacher?._id?.toString() === req.user._id.toString();
    const studentProfile = req.user.role === 'student'
        ? await Student.findOne({ user: req.user._id, school: req.schoolId }).select('currentClass').lean()
        : null;
    const isInClass = schedule.class?._id?.toString() === studentProfile?.currentClass?.toString();

    if (req.user.role === 'student' && !isParticipant && !isInClass) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.user.role === 'teacher' && !isTeacher && !isParticipant) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.json({
        success: true,
        data: { schedule, academicYear: yearScope.academicYear }
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
    const yearScope = await resolveScheduleYearScope(req, classId ? [classId] : null);

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
    if (!isDateInAcademicYear(start, yearScope.dateFilter) || !isDateInAcademicYear(end, yearScope.dateFilter)) {
        return res.status(400).json({
            success: false,
            message: `Schedule time must be inside academic year ${yearScope.academicYear}`
        });
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
        if (!yearScope.classIdSet.has(classId.toString())) {
            return res.status(400).json({
                success: false,
                message: `Class must belong to academic year ${yearScope.academicYear}`
            });
        }
    }

    // Validate room exists and belongs to school
    let roomDoc = null;
    if (room) {
        roomDoc = await Room.findById(room);
        if (!roomDoc || roomDoc.school.toString() !== req.school._id.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid room' });
        }
        const roomReadiness = evaluateRoomOperationalState(roomDoc, { startTime: start, endTime: end });
        if (!roomReadiness.available) {
            return res.status(400).json({
                success: false,
                message: roomReadiness.message || 'Selected room is unavailable for the requested time.',
                code: roomReadiness.code
            });
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
        const students = await Student.find({
            currentClass: classId,
            academicYear: yearScope.academicYear
        });
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
        data: { schedule: populatedSchedule, academicYear: yearScope.academicYear },
        message: 'Schedule created successfully'
    });
});

// @desc    Update schedule
// @route   PUT /api/schedules/:id
// @access  Private (School Admin, Teacher)
export const updateSchedule = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveScheduleYearScope(req);

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
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
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

    let nextTeacher = schedule.teacher;
    if (teacher !== undefined) {
        const teacherUser = await User.findById(teacher);
        if (!teacherUser || teacherUser.school.toString() !== req.school._id.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid teacher' });
        }
        nextTeacher = teacher;
    }

    if (classId !== undefined && classId) {
        const classDoc = await Class.findById(classId);
        if (!classDoc || classDoc.school.toString() !== req.school._id.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid class' });
        }
        if ((classDoc.academicYear || '').toString() !== yearScope.academicYear) {
            return res.status(400).json({
                success: false,
                message: `Class must belong to academic year ${yearScope.academicYear}`
            });
        }
    }
    const nextClass = classId !== undefined ? classId : schedule.class;

    let nextRoom = room !== undefined ? room : schedule.room;
    if (room !== undefined) {
        const roomDoc = await Room.findById(room);
        if (!roomDoc || roomDoc.school.toString() !== req.school._id.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid room' });
        }
        nextRoom = roomDoc._id;
    }

    // Validate time range if provided
    const nextStart = startTime ? new Date(startTime) : new Date(schedule.startTime);
    const nextEnd = endTime ? new Date(endTime) : new Date(schedule.endTime);

    if (startTime || endTime) {
        const start = nextStart;
        const end = nextEnd;
        if (start >= end) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }
        if (!isDateInAcademicYear(start, yearScope.dateFilter) || !isDateInAcademicYear(end, yearScope.dateFilter)) {
            return res.status(400).json({
                success: false,
                message: `Schedule time must be inside academic year ${yearScope.academicYear}`
            });
        }
    }

    if (nextRoom) {
        const roomDoc = await Room.findById(nextRoom);
        if (!roomDoc || roomDoc.school.toString() !== req.school._id.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid room' });
        }
        const roomReadiness = evaluateRoomOperationalState(roomDoc, { startTime: nextStart, endTime: nextEnd });
        if (!roomReadiness.available) {
            return res.status(400).json({
                success: false,
                message: roomReadiness.message || 'Selected room is unavailable for the requested time.',
                code: roomReadiness.code
            });
        }
    }

    if (startTime || endTime || teacher !== undefined || room !== undefined || classId !== undefined) {
        // Check for conflicts (excluding current schedule)
        const conflicts = await Schedule.findConflicts(
            req.school._id,
            nextStart,
            nextEnd,
            nextTeacher,
            nextRoom,
            nextClass,
            schedule._id
        );
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
        data: { schedule: updatedSchedule, academicYear: yearScope.academicYear },
        message: 'Schedule updated successfully'
    });
});

// @desc    Delete schedule
// @route   DELETE /api/schedules/:id
// @access  Private (School Admin, Teacher)
export const deleteSchedule = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveScheduleYearScope(req);

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
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
    }

    await Schedule.findByIdAndDelete(req.params.id);

    res.json({
        success: true,
        message: 'Schedule deleted successfully',
        data: { academicYear: yearScope.academicYear }
    });
});

// @desc    Cancel schedule
// @route   POST /api/schedules/:id/cancel
// @access  Private (School Admin, Teacher)
export const cancelSchedule = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveScheduleYearScope(req);

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
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
    }

    schedule.status = 'cancelled';
    schedule.cancelledAt = new Date();
    schedule.cancelledBy = req.user._id;
    schedule.cancellationReason = reason;

    await schedule.save();

    res.json({
        success: true,
        data: { schedule, academicYear: yearScope.academicYear },
        message: 'Schedule cancelled successfully'
    });
});

// @desc    Get schedules by date range
// @route   GET /api/schedules/calendar
// @access  Private
export const getSchedulesByDateRange = asyncHandler(async (req, res) => {
    const { startDate, endDate, type, teacher, class: classId } = req.query;
    const yearScope = await resolveScheduleYearScope(req, classId ? [classId] : null);

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const scopedRange = clampDateRangeToAcademicYear({ $gte: start, $lte: end }, yearScope.dateFilter);
    if (!scopedRange) {
        return res.json({
            success: true,
            data: { schedules: [], academicYear: yearScope.academicYear }
        });
    }
    if (classId && !yearScope.classIdSet.has(classId.toString())) {
        return res.json({
            success: true,
            data: { schedules: [], academicYear: yearScope.academicYear }
        });
    }

    const filters = {
        school: req.school._id,
        startTime: scopedRange,
        status: { $ne: 'cancelled' },
        $and: [{ $or: buildScheduleYearOrConditions(yearScope.classIds, yearScope.dateFilter) }]
    };
    if (type) filters.type = type;
    if (teacher) filters.teacher = teacher;
    if (classId) filters.class = classId;

    // Role-based filtering
    if (req.user.role === 'teacher') {
        filters.teacher = req.user._id;
    } else if (req.user.role === 'student') {
        const studentProfile = await Student.findOne({ user: req.user._id, school: req.schoolId })
            .select('currentClass')
            .lean();
        const studentClassId = studentProfile?.currentClass?.toString();
        const accessOr = [{ 'participants.user': req.user._id }];
        if (studentClassId && yearScope.classIdSet.has(studentClassId)) {
            accessOr.push({ class: studentProfile.currentClass });
        }
        filters.$and.push({ $or: accessOr });
    }
    const schedules = await Schedule.find(filters)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .sort({ startTime: 1 })
        .lean();

    res.json({
        success: true,
        data: { schedules, academicYear: yearScope.academicYear }
    });
});

// @desc    Get room availability for a time range (for schedule creation: which rooms are free)
// @route   GET /api/schedules/room-availability
// @access  Private (Admin, Teacher)
export const getRoomAvailability = asyncHandler(async (req, res) => {
    const { startTime, endTime, excludeScheduleId } = req.query;
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    if (!startTime || !endTime) {
        return res.status(400).json({ success: false, message: 'startTime and endTime are required (ISO strings)' });
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start >= end) {
        return res.status(400).json({ success: false, message: 'End time must be after start time' });
    }
    if (!isDateInAcademicYear(start, dateFilter) || !isDateInAcademicYear(end, dateFilter)) {
        return res.status(400).json({
            success: false,
            message: `Requested time must be inside academic year ${academicYear}`
        });
    }

    const schoolId = req.school._id;
    const rooms = await Room.find({ school: schoolId }).lean();
    const availability = await Promise.all(
        rooms.map(async (room) => {
            const operationalState = evaluateRoomOperationalState(room, { startTime: start, endTime: end });
            if (!operationalState.available) {
                return {
                    _id: room._id,
                    name: room.name,
                    type: room.type,
                    capacity: room.capacity,
                    status: room.status,
                    isAvailable: room.isAvailable,
                    building: room.building || null,
                    floor: room.floor || null,
                    number: room.number || null,
                    available: false,
                    unavailabilityCode: operationalState.code,
                    unavailabilityReason: operationalState.message,
                    conflictingWith: null
                };
            }

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
                status: room.status,
                isAvailable: room.isAvailable,
                building: room.building || null,
                floor: room.floor || null,
                number: room.number || null,
                available,
                unavailabilityCode: available ? null : 'occupied',
                unavailabilityReason: available ? null : 'Room is occupied during this time.',
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
        data: { rooms: availability, academicYear }
    });
});

// @desc    Get teacher schedule
// @route   GET /api/schedules/teacher/:teacherId
// @access  Private
export const getTeacherSchedule = asyncHandler(async (req, res) => {
    const { teacherId } = req.params;
    const { startDate, endDate } = req.query;
    const yearScope = await resolveScheduleYearScope(req);

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    // Check permissions (only admin or the teacher themselves can view)
    if (req.user.role === 'teacher' && req.user._id.toString() !== teacherId) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
        return res.status(400).json({ success: false, message: 'Invalid teacher ID' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const scopedRange = clampDateRangeToAcademicYear({ $gte: start, $lte: end }, yearScope.dateFilter);
    if (!scopedRange) {
        return res.json({ success: true, data: { schedules: [], academicYear: yearScope.academicYear } });
    }

    const schedules = await Schedule.find({
        school: req.school._id,
        teacher: new mongoose.Types.ObjectId(teacherId),
        startTime: scopedRange,
        status: { $ne: 'cancelled' },
        $and: [{ $or: buildScheduleYearOrConditions(yearScope.classIds, yearScope.dateFilter) }]
    })
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .sort({ startTime: 1 });

    res.json({
        success: true,
        data: { schedules, academicYear: yearScope.academicYear }
    });
});

// @desc    Get student schedule
// @route   GET /api/schedules/student/:studentId
// @access  Private
export const getStudentSchedule = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;
    const yearScope = await resolveScheduleYearScope(req);

    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ success: false, message: 'Invalid student ID' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const scopedRange = clampDateRangeToAcademicYear({ $gte: start, $lte: end }, yearScope.dateFilter);
    if (!scopedRange) {
        return res.json({ success: true, data: { schedules: [], academicYear: yearScope.academicYear } });
    }

    const studentProfile = await Student.findById(studentId).select('school currentClass user').lean();
    if (!studentProfile || studentProfile.school.toString() !== req.schoolId.toString()) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (req.user.role === 'student' && studentProfile.user?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const studentAccessOr = [];
    if (studentProfile.user) {
        studentAccessOr.push({ 'participants.user': studentProfile.user });
    }
    if (studentProfile.currentClass && yearScope.classIdSet.has(studentProfile.currentClass.toString())) {
        studentAccessOr.push({ class: studentProfile.currentClass });
    }
    if (studentAccessOr.length === 0) {
        return res.json({ success: true, data: { schedules: [], academicYear: yearScope.academicYear } });
    }

    const schedules = await Schedule.find({
        school: req.school._id,
        startTime: scopedRange,
        status: { $ne: 'cancelled' },
        $and: [
            { $or: buildScheduleYearOrConditions(yearScope.classIds, yearScope.dateFilter) },
            { $or: studentAccessOr }
        ]
    })
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .sort({ startTime: 1 });

    res.json({
        success: true,
        data: { schedules, academicYear: yearScope.academicYear }
    });
});

// @desc    Record attendance for schedule
// @route   POST /api/schedules/:id/attendance
// @access  Private (Teacher, School Admin)
export const recordAttendance = asyncHandler(async (req, res) => {
    const { attendance } = req.body; // Array of { student, status, notes }
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveScheduleYearScope(req);

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
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
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
            attendanceStats,
            academicYear: yearScope.academicYear
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
    const yearScope = await resolveScheduleYearScope(req);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Check permissions
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
    }

    const attendanceStats = schedule.checkAttendance();

    res.json({
        success: true,
        data: {
            attendance: schedule.attendance,
            stats: attendanceStats,
            academicYear: yearScope.academicYear
        }
    });
});

// @desc    Add participant to schedule
// @route   POST /api/schedules/:id/participants
// @access  Private (School Admin, Teacher)
export const addParticipant = asyncHandler(async (req, res) => {
    const { user, role } = req.body;
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveScheduleYearScope(req);

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
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
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
        data: { schedule: updatedSchedule, academicYear: yearScope.academicYear },
        message: 'Participant added successfully'
    });
});

// @desc    Remove participant from schedule
// @route   DELETE /api/schedules/:id/participants/:userId
// @access  Private (School Admin, Teacher)
export const removeParticipant = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveScheduleYearScope(req);

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
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
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
    const yearScope = await resolveScheduleYearScope(req);

    if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule not found' });
    }
    if (schedule.school.toString() !== req.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!isScheduleInAcademicYearScope(schedule, yearScope)) {
        return res.status(404).json({
            success: false,
            message: `Schedule not found for academic year ${yearScope.academicYear}`
        });
    }

    // Check permissions (user can update their own status, or admin/teacher can update any)
    if (req.user._id.toString() !== userId && 
        req.user.role !== 'admin' &&
        req.user.role !== 'department_principal' &&
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
