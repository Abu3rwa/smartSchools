import { asyncHandler } from '../middleware/errorHandler.js';
import Schedule from '../models/Schedule.js';
import Room from '../models/Room.js';
import Class from '../models/Class.js';
import { generateNotification } from '../utils/notificationService.js';
import {
    getClassIdsForAcademicYear,
    resolveAcademicYearDateRangeForRequest,
    clampDateRangeToAcademicYear,
    isDateInAcademicYear
} from '../helpers/academicYearScope.js';

const buildScheduleYearOrConditions = (classIds = [], dateFilter = null) => {
    const conditions = [];
    if (classIds.length > 0) conditions.push({ class: { $in: classIds } });
    if (dateFilter?.$gte && dateFilter?.$lte) {
        conditions.push(
            { class: { $exists: false }, startTime: dateFilter },
            { class: null, startTime: dateFilter }
        );
    }
    return conditions;
};

const resolveAdvancedYearScope = async (req, candidateClassIds = null) => {
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

const isScheduleInYearScope = (schedule, scope) => {
    const scheduleClassId = schedule?.class?._id || schedule?.class;
    if (scheduleClassId) return scope.classIdSet.has(scheduleClassId.toString());
    return isDateInAcademicYear(schedule?.startTime, scope.dateFilter);
};

// @desc    Get schedules with filtering and conflict detection
// @route   GET /api/schedules
// @access  Private (Admin, Teacher)
export const getSchedules = asyncHandler(async (req, res) => {
    const { 
        startDate, 
        endDate, 
        teacher, 
        class: classId, 
        subject, 
        room, 
        status = 'scheduled',
        viewMode = 'week',
        checkConflicts = true 
    } = req.query;
    const yearScope = await resolveAdvancedYearScope(req, classId ? [classId] : null);
    
    // Calculate date range
    let start, end;
    const today = new Date();
    
    if (viewMode === 'today') {
        start = new Date(today.setHours(0, 0, 0, 0));
        end = new Date(today.setHours(23, 59, 59, 999));
    } else if (viewMode === 'week') {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        start = new Date(startOfWeek.setHours(0, 0, 0, 0));
        end = new Date(startOfWeek);
        end.setDate(startOfWeek.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    } else if (viewMode === 'month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
    } else {
        start = new Date(startDate);
        end = new Date(endDate);
    }
    const scopedRange = clampDateRangeToAcademicYear({ $gte: start, $lte: end }, yearScope.dateFilter);
    if (!scopedRange) {
        return res.json({
            schedules: [],
            dateRange: { start, end },
            summary: { totalSchedules: 0, conflictCount: 0 },
            academicYear: yearScope.academicYear
        });
    }
    if (classId && !yearScope.classIdSet.has(classId.toString())) {
        return res.json({
            schedules: [],
            dateRange: { start, end },
            summary: { totalSchedules: 0, conflictCount: 0 },
            academicYear: yearScope.academicYear
        });
    }
    
    // Build query
    const query = {
        school: req.user.school,
        startTime: scopedRange,
        status,
        $and: [{ $or: buildScheduleYearOrConditions(yearScope.classIds, yearScope.dateFilter) }]
    };
    
    // Apply filters based on user role
    if (req.user.role === 'teacher') {
        query.teacher = req.user._id;
    } else if (teacher) {
        query.teacher = teacher;
    }
    
    if (classId) query.class = classId;
    if (subject) query.subject = subject;
    if (room) query.room = room;
    
    // Get schedules
    const schedules = await Schedule.find(query)
        .populate('teacher class subject room')
        .populate('substituteTeacher', 'firstName lastName')
        .sort({ startTime: 1 });
    
    // Check for conflicts if requested
    let schedulesWithConflicts = schedules;
    if (checkConflicts && req.user.role === 'admin') {
        schedulesWithConflicts = await Promise.all(
            schedules.map(async schedule => {
                const conflicts = await schedule.detectConflicts();
                return {
                    ...schedule.toObject(),
                    conflicts
                };
            })
        );
    }
    
    res.json({
        schedules: schedulesWithConflicts,
        dateRange: { start, end },
        summary: {
            totalSchedules: schedules.length,
            conflictCount: schedulesWithConflicts.filter(s => s.conflicts && s.conflicts.length > 0).length
        },
        academicYear: yearScope.academicYear
    });
});

// @desc    Create new schedule with real-time conflict detection
// @route   POST /api/schedules
// @access  Private (Admin)
export const createSchedule = asyncHandler(async (req, res) => {
    const {
        title,
        description,
        type,
        class: classId,
        subject,
        teacher,
        room,
        startTime,
        endTime,
        isRecurring,
        recurrencePattern,
        semester,
        term,
        requiresAttendance,
        color
    } = req.body;
    const yearScope = await resolveAdvancedYearScope(req, classId ? [classId] : null);
    
    // Validate required fields
    if (!title || !teacher || !room || !startTime || !endTime) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    
    const parsedStartTime = new Date(startTime);
    const parsedEndTime = new Date(endTime);

    // Check time validity
    if (parsedStartTime >= parsedEndTime) {
        return res.status(400).json({ message: 'End time must be after start time' });
    }
    if (!isDateInAcademicYear(parsedStartTime, yearScope.dateFilter) || !isDateInAcademicYear(parsedEndTime, yearScope.dateFilter)) {
        return res.status(400).json({ message: `Schedule time must be inside academic year ${yearScope.academicYear}` });
    }
    if (classId && !yearScope.classIdSet.has(classId.toString())) {
        return res.status(400).json({ message: `Class must belong to academic year ${yearScope.academicYear}` });
    }
    
    // Check for conflicts in real-time
    const conflicts = await Schedule.findConflicts(
        req.user.school,
        startTime,
        endTime,
        teacher,
        room,
        classId
    );
    
    if (conflicts.length > 0) {
        return res.status(409).json({
            message: 'Schedule conflicts detected',
            conflicts: conflicts.map(conflict => ({
                type: conflict._doc.type === 'teacher' ? 'teacher_conflict' : 
                      conflict._doc.type === 'room' ? 'room_conflict' : 'class_conflict',
                description: `Conflict with ${conflict.title} (${new Date(conflict.startTime).toLocaleString()} - ${new Date(conflict.endTime).toLocaleString()})`,
                conflictingSchedule: conflict._doc
            }))
        });
    }
    
    // Create schedule
    const schedule = new Schedule({
        school: req.user.school,
        title,
        description,
        type,
        class: classId,
        subject,
        teacher,
        room,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        isRecurring,
        recurrencePattern,
        semester,
        term,
        requiresAttendance,
        color: color || '#3B82F6',
        createdBy: req.user._id,
        auditTrail: [{
            action: 'created',
            performedBy: req.user._id,
            details: 'Schedule created',
            newValues: req.body
        }]
    });
    
    await schedule.save();
    
    // Populate related data
    await schedule.populate('teacher class subject room');
    
    // Send notifications to affected users
    if (type === 'class') {
        // Notify teacher
        await generateNotification({
            type: 'schedule_update',
            recipient: teacher,
            message: `New schedule created: ${title} on ${new Date(startTime).toLocaleDateString()} at ${new Date(startTime).toLocaleTimeString()}`,
            metadata: {
                scheduleId: schedule._id,
                type: 'created'
            }
        });
        
        // Notify students if it's a class
        if (classId) {
            const classData = await Class.findById(classId).populate('students');
            if (classData && classData.students) {
                for (const student of classData.students) {
                    await generateNotification({
                        type: 'schedule_update',
                        recipient: student._id,
                        message: `New class schedule: ${title} on ${new Date(startTime).toLocaleDateString()}`,
                        metadata: {
                            scheduleId: schedule._id,
                            type: 'created'
                        }
                    });
                }
            }
        }
    }
    
    res.status(201).json({ ...schedule.toObject(), academicYear: yearScope.academicYear });
});

// @desc    Update schedule with conflict detection
// @route   PUT /api/schedules/:id
// @access  Private (Admin)
export const updateSchedule = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveAdvancedYearScope(req);
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    if (!isScheduleInYearScope(schedule, yearScope)) {
        return res.status(404).json({ message: `Schedule not found for academic year ${yearScope.academicYear}` });
    }
    
    // Store previous values for audit trail
    const previousValues = schedule.toObject();
    
    // Check for conflicts if time, teacher, or room is being changed
    const { startTime, endTime, teacher, room, class: classId } = req.body;
    const timeChanged = startTime && new Date(startTime).getTime() !== new Date(schedule.startTime).getTime();
    const teacherChanged = teacher && teacher !== schedule.teacher.toString();
    const roomChanged = room && room !== schedule.room.toString();
    const classChanged = classId && classId !== schedule.class?.toString();

    if (classId) {
        const classDoc = await Class.findById(classId).select('school academicYear').lean();
        if (!classDoc || classDoc.school.toString() !== req.schoolId.toString()) {
            return res.status(400).json({ message: 'Invalid class' });
        }
        if ((classDoc.academicYear || '').toString() !== yearScope.academicYear) {
            return res.status(400).json({ message: `Class must belong to academic year ${yearScope.academicYear}` });
        }
    }

    const nextStart = startTime ? new Date(startTime) : new Date(schedule.startTime);
    const nextEnd = endTime ? new Date(endTime) : new Date(schedule.endTime);
    if (nextStart >= nextEnd) {
        return res.status(400).json({ message: 'End time must be after start time' });
    }
    if (!isDateInAcademicYear(nextStart, yearScope.dateFilter) || !isDateInAcademicYear(nextEnd, yearScope.dateFilter)) {
        return res.status(400).json({ message: `Schedule time must be inside academic year ${yearScope.academicYear}` });
    }
    
    if (timeChanged || teacherChanged || roomChanged || classChanged) {
        const conflicts = await Schedule.findConflicts(
            req.user.school,
            startTime || schedule.startTime,
            endTime || schedule.endTime,
            teacher || schedule.teacher,
            room || schedule.room,
            classId || schedule.class,
            schedule._id
        );
        
        if (conflicts.length > 0) {
            return res.status(409).json({
                message: 'Schedule conflicts detected',
                conflicts: conflicts.map(conflict => ({
                    type: conflict._doc.type === 'teacher' ? 'teacher_conflict' : 
                          conflict._doc.type === 'room' ? 'room_conflict' : 'class_conflict',
                    description: `Conflict with ${conflict.title} (${new Date(conflict.startTime).toLocaleString()} - ${new Date(conflict.endTime).toLocaleString()})`,
                    conflictingSchedule: conflict._doc
                }))
            });
        }
    }
    
    // Update schedule
    Object.assign(schedule, req.body);
    schedule.lastModifiedBy = req.user._id;
    
    // Add to audit trail
    schedule.auditTrail.push({
        action: 'updated',
        performedBy: req.user._id,
        details: 'Schedule updated',
        previousValues,
        newValues: req.body
    });
    
    await schedule.save();
    
    // Populate related data
    await schedule.populate('teacher class subject room substituteTeacher');
    
    // Send notifications for significant changes
    if (timeChanged || teacherChanged || roomChanged) {
        await generateNotification({
            type: 'schedule_update',
            recipient: schedule.teacher._id,
            message: `Schedule updated: ${schedule.title} - ${timeChanged ? 'Time changed' : ''}${teacherChanged ? 'Teacher changed' : ''}${roomChanged ? 'Room changed' : ''}`,
            metadata: {
                scheduleId: schedule._id,
                type: 'updated',
                changes: { timeChanged, teacherChanged, roomChanged }
            }
        });
    }
    
    res.json({ ...schedule.toObject(), academicYear: yearScope.academicYear });
});

// @desc    Delete schedule
// @route   DELETE /api/schedules/:id
// @access  Private (Admin)
export const deleteSchedule = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveAdvancedYearScope(req);
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    if (!isScheduleInYearScope(schedule, yearScope)) {
        return res.status(404).json({ message: `Schedule not found for academic year ${yearScope.academicYear}` });
    }
    
    // Add to audit trail before deletion
    schedule.auditTrail.push({
        action: 'cancelled',
        performedBy: req.user._id,
        details: 'Schedule cancelled'
    });
    
    // Mark as cancelled instead of deleting
    schedule.status = 'cancelled';
    schedule.lastModifiedBy = req.user._id;
    await schedule.save();
    
    // Send notifications
    await generateNotification({
        type: 'schedule_cancellation',
        recipient: schedule.teacher._id,
        message: `Schedule cancelled: ${schedule.title} on ${new Date(schedule.startTime).toLocaleDateString()}`,
        metadata: {
            scheduleId: schedule._id
        }
    });
    
    res.json({ message: 'Schedule cancelled successfully', academicYear: yearScope.academicYear });
});

// @desc    Assign substitute teacher
// @route   POST /api/schedules/:id/substitute
// @access  Private (Admin)
export const assignSubstituteTeacher = asyncHandler(async (req, res) => {
    const { substituteTeacher, substituteReason } = req.body;
    
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveAdvancedYearScope(req);
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    if (!isScheduleInYearScope(schedule, yearScope)) {
        return res.status(404).json({ message: `Schedule not found for academic year ${yearScope.academicYear}` });
    }
    
    // Check if substitute is available at that time
    const substituteConflicts = await Schedule.findConflicts(
        req.user.school,
        schedule.startTime,
        schedule.endTime,
        substituteTeacher,
        null,
        null,
        schedule._id
    );
    
    if (substituteConflicts.length > 0) {
        return res.status(409).json({
            message: 'Substitute teacher has a scheduling conflict',
            conflicts: substituteConflicts
        });
    }
    
    // Assign substitute
    schedule.substituteTeacher = substituteTeacher;
    schedule.substituteReason = substituteReason;
    schedule.substituteAssignedBy = req.user._id;
    schedule.substituteAssignedAt = new Date();
    schedule.lastModifiedBy = req.user._id;
    
    // Add to audit trail
    schedule.auditTrail.push({
        action: 'substitute_assigned',
        performedBy: req.user._id,
        details: `Substitute teacher assigned: ${substituteReason}`,
        newValues: { substituteTeacher, substituteReason }
    });
    
    await schedule.save();
    
    // Populate related data
    await schedule.populate('teacher substituteTeacher class subject room');
    
    // Send notifications
    await generateNotification({
        type: 'substitute_assignment',
        recipient: substituteTeacher,
        message: `You have been assigned as substitute for ${schedule.title} on ${new Date(schedule.startTime).toLocaleDateString()} at ${new Date(schedule.startTime).toLocaleTimeString()}`,
        metadata: {
            scheduleId: schedule._id,
            reason: substituteReason
        }
    });
    
    await generateNotification({
        type: 'substitute_assignment',
        recipient: schedule.teacher._id,
        message: `Substitute teacher assigned for your ${schedule.title} class on ${new Date(schedule.startTime).toLocaleDateString()}`,
        metadata: {
            scheduleId: schedule._id,
            substitute: substituteTeacher
        }
    });
    
    res.json({ ...schedule.toObject(), academicYear: yearScope.academicYear });
});

// @desc    Create schedule from template
// @route   POST /api/schedules/from-template/:templateId
// @access  Private (Admin)
export const createFromTemplate = asyncHandler(async (req, res) => {
    const { newDate, overrides } = req.body;
    const { templateId } = req.params;
    const yearScope = await resolveAdvancedYearScope(req, overrides?.class ? [overrides.class] : null);
    const templateDate = new Date(newDate);
    if (!isDateInAcademicYear(templateDate, yearScope.dateFilter)) {
        return res.status(400).json({ message: `Schedule time must be inside academic year ${yearScope.academicYear}` });
    }
    
    const schedule = await Schedule.createFromTemplate(templateId, newDate, {
        ...overrides,
        createdBy: req.user._id,
        school: req.user.school
    });
    
    await schedule.populate('teacher class subject room');
    
    if (!isScheduleInYearScope(schedule, yearScope)) {
        await Schedule.findByIdAndDelete(schedule._id);
        return res.status(400).json({ message: `Template output must belong to academic year ${yearScope.academicYear}` });
    }

    res.status(201).json({ ...schedule.toObject(), academicYear: yearScope.academicYear });
});

// @desc    Get available rooms for a time slot
// @route   GET /api/schedules/available-rooms
// @access  Private (Admin)
export const getAvailableRooms = asyncHandler(async (req, res) => {
    const { startTime, endTime, minCapacity, type, equipment } = req.query;
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!isDateInAcademicYear(start, dateFilter) || !isDateInAcademicYear(end, dateFilter)) {
        return res.status(400).json({ message: `Requested time must be inside academic year ${academicYear}` });
    }
    
    const requirements = {
        minCapacity: minCapacity ? parseInt(minCapacity) : undefined,
        type,
        equipment: equipment ? equipment.split(',') : undefined
    };
    
    const availableRooms = await Room.findAvailableRooms(
        req.user.school,
        startTime,
        endTime,
        requirements
    );
    
    res.json(availableRooms);
});

// @desc    Get teacher schedule
// @route   GET /api/schedules/teacher/:teacherId
// @access  Private (Admin, Teacher)
export const getTeacherSchedule = asyncHandler(async (req, res) => {
    const { teacherId } = req.params;
    const { startDate, endDate } = req.query;
    const yearScope = await resolveAdvancedYearScope(req);
    
    // Check permissions
    if (req.user.role === 'teacher' && teacherId !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    const scopedRange = clampDateRangeToAcademicYear(
        { $gte: new Date(startDate), $lte: new Date(endDate) },
        yearScope.dateFilter
    );
    if (!scopedRange) return res.json([]);

    const schedules = await Schedule.find({
        school: req.schoolId,
        teacher: teacherId,
        startTime: scopedRange,
        status: { $ne: 'cancelled' },
        $and: [{ $or: buildScheduleYearOrConditions(yearScope.classIds, yearScope.dateFilter) }]
    })
        .populate('class subject room')
        .sort({ startTime: 1 });
    
    res.json(schedules);
});

// @desc    Get room schedule
// @route   GET /api/schedules/room/:roomId
// @access  Private (Admin)
export const getRoomSchedule = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { startDate, endDate } = req.query;
    const yearScope = await resolveAdvancedYearScope(req);
    
    const scopedRange = clampDateRangeToAcademicYear(
        { $gte: new Date(startDate), $lte: new Date(endDate) },
        yearScope.dateFilter
    );
    if (!scopedRange) return res.json([]);

    const schedules = await Schedule.find({
        school: req.schoolId,
        room: roomId,
        startTime: scopedRange,
        status: { $ne: 'cancelled' },
        $and: [{ $or: buildScheduleYearOrConditions(yearScope.classIds, yearScope.dateFilter) }]
    })
        .populate('teacher class subject room')
        .sort({ startTime: 1 });
    
    res.json(schedules);
});

// @desc    Get class schedule
// @route   GET /api/schedules/class/:classId
// @access  Private (Admin, Teacher)
export const getClassSchedule = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { startDate, endDate } = req.query;
    const yearScope = await resolveAdvancedYearScope(req, [classId]);
    if (!yearScope.classIdSet.has(classId.toString())) return res.json([]);
    
    const scopedRange = clampDateRangeToAcademicYear(
        { $gte: new Date(startDate), $lte: new Date(endDate) },
        yearScope.dateFilter
    );
    if (!scopedRange) return res.json([]);

    const schedules = await Schedule.find({
        school: req.schoolId,
        class: classId,
        type: 'class',
        startTime: scopedRange,
        status: { $ne: 'cancelled' }
    })
        .populate('teacher subject room')
        .sort({ startTime: 1 });
    
    res.json(schedules);
});

// @desc    Resolve schedule conflict
// @route   POST /api/schedules/:id/resolve-conflict
// @access  Private (Admin)
export const resolveConflict = asyncHandler(async (req, res) => {
    const { conflictIndex, resolution } = req.body;
    
    const schedule = await Schedule.findById(req.params.id);
    const yearScope = await resolveAdvancedYearScope(req);
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    if (!isScheduleInYearScope(schedule, yearScope)) {
        return res.status(404).json({ message: `Schedule not found for academic year ${yearScope.academicYear}` });
    }
    
    if (!schedule.conflicts[conflictIndex]) {
        return res.status(404).json({ message: 'Conflict not found' });
    }
    
    // Mark conflict as resolved
    schedule.conflicts[conflictIndex].resolved = true;
    schedule.conflicts[conflictIndex].resolvedAt = new Date();
    schedule.conflicts[conflictIndex].resolvedBy = req.user._id;
    
    // Add to audit trail
    schedule.auditTrail.push({
        action: 'conflict_resolved',
        performedBy: req.user._id,
        details: `Conflict resolved: ${resolution}`,
        newValues: { conflictIndex, resolution }
    });
    
    await schedule.save();
    
    res.json({ message: 'Conflict resolved successfully', academicYear: yearScope.academicYear });
});

// @desc    Get schedule templates
// @route   GET /api/schedules/templates
// @access  Private (Admin)
export const getScheduleTemplates = asyncHandler(async (req, res) => {
    const { category } = req.query;
    const yearScope = await resolveAdvancedYearScope(req);
    
    const query = {
        school: req.user.school,
        isTemplate: true,
        $and: [{ $or: buildScheduleYearOrConditions(yearScope.classIds, yearScope.dateFilter) }]
    };
    
    if (category) {
        query.templateCategory = category;
    }
    
    const templates = await Schedule.find(query)
        .populate('teacher class subject room')
        .sort({ templateName: 1 });
    
    res.json(templates);
});

// @desc    Create schedule template
// @route   POST /api/schedules/templates
// @access  Private (Admin)
export const createScheduleTemplate = asyncHandler(async (req, res) => {
    const {
        templateName,
        templateCategory,
        title,
        description,
        type,
        class: classId,
        subject,
        teacher,
        room,
        duration,
        color
    } = req.body;
    const yearScope = await resolveAdvancedYearScope(req, classId ? [classId] : null);
    if (classId && !yearScope.classIdSet.has(classId.toString())) {
        return res.status(400).json({ message: `Class must belong to academic year ${yearScope.academicYear}` });
    }
    
    const templateStart = yearScope.dateFilter?.$gte ? new Date(yearScope.dateFilter.$gte) : new Date();
    const templateEnd = new Date(templateStart.getTime() + (duration || 60) * 60 * 1000);
    const template = new Schedule({
        school: req.user.school,
        title,
        description,
        type,
        class: classId,
        subject,
        teacher,
        room,
        startTime: templateStart,
        endTime: templateEnd,
        isTemplate: true,
        templateName,
        templateCategory,
        color: color || '#3B82F6',
        createdBy: req.user._id,
        auditTrail: [{
            action: 'created',
            performedBy: req.user._id,
            details: 'Template created',
            newValues: req.body
        }]
    });
    
    await template.save();
    
    await template.populate('teacher class subject room');
    
    res.status(201).json({ ...template.toObject(), academicYear: yearScope.academicYear });
});
