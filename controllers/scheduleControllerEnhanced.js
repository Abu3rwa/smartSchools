import asyncHandler from 'express-async-handler';
import Schedule from '../models/Schedule.js';
import Room from '../models/Room.js';
import User from '../models/User.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import { generateNotification } from '../utils/notificationService.js';

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
    
    // Build query
    const query = {
        school: req.user.school,
        startTime: { $gte: start, $lte: end },
        status
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
        }
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
    
    // Validate required fields
    if (!title || !teacher || !room || !startTime || !endTime) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Check time validity
    if (new Date(startTime) >= new Date(endTime)) {
        return res.status(400).json({ message: 'End time must be after start time' });
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
        startTime,
        endTime,
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
    
    res.status(201).json(schedule);
});

// @desc    Update schedule with conflict detection
// @route   PUT /api/schedules/:id
// @access  Private (Admin)
export const updateSchedule = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    // Store previous values for audit trail
    const previousValues = schedule.toObject();
    
    // Check for conflicts if time, teacher, or room is being changed
    const { startTime, endTime, teacher, room, class: classId } = req.body;
    const timeChanged = startTime && new Date(startTime) !== new Date(schedule.startTime);
    const teacherChanged = teacher && teacher !== schedule.teacher.toString();
    const roomChanged = room && room !== schedule.room.toString();
    const classChanged = classId && classId !== schedule.class?.toString();
    
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
    
    res.json(schedule);
});

// @desc    Delete schedule
// @route   DELETE /api/schedules/:id
// @access  Private (Admin)
export const deleteSchedule = asyncHandler(async (req, res) => {
    const schedule = await Schedule.findById(req.params.id);
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
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
    
    res.json({ message: 'Schedule cancelled successfully' });
});

// @desc    Assign substitute teacher
// @route   POST /api/schedules/:id/substitute
// @access  Private (Admin)
export const assignSubstituteTeacher = asyncHandler(async (req, res) => {
    const { substituteTeacher, substituteReason } = req.body;
    
    const schedule = await Schedule.findById(req.params.id);
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
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
    
    res.json(schedule);
});

// @desc    Create schedule from template
// @route   POST /api/schedules/from-template/:templateId
// @access  Private (Admin)
export const createFromTemplate = asyncHandler(async (req, res) => {
    const { newDate, overrides } = req.body;
    const { templateId } = req.params;
    
    const schedule = await Schedule.createFromTemplate(templateId, newDate, {
        ...overrides,
        createdBy: req.user._id,
        school: req.user.school
    });
    
    await schedule.populate('teacher class subject room');
    
    res.status(201).json(schedule);
});

// @desc    Get available rooms for a time slot
// @route   GET /api/schedules/available-rooms
// @access  Private (Admin)
export const getAvailableRooms = asyncHandler(async (req, res) => {
    const { startTime, endTime, minCapacity, type, equipment } = req.query;
    
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
    
    // Check permissions
    if (req.user.role === 'teacher' && teacherId !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    const schedules = await Schedule.getTeacherSchedule(teacherId, startDate, endDate);
    
    res.json(schedules);
});

// @desc    Get room schedule
// @route   GET /api/schedules/room/:roomId
// @access  Private (Admin)
export const getRoomSchedule = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { startDate, endDate } = req.query;
    
    const schedules = await Schedule.getRoomSchedule(roomId, startDate, endDate);
    
    res.json(schedules);
});

// @desc    Get class schedule
// @route   GET /api/schedules/class/:classId
// @access  Private (Admin, Teacher)
export const getClassSchedule = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { startDate, endDate } = req.query;
    
    const schedules = await Schedule.getClassSchedule(classId, startDate, endDate);
    
    res.json(schedules);
});

// @desc    Resolve schedule conflict
// @route   POST /api/schedules/:id/resolve-conflict
// @access  Private (Admin)
export const resolveConflict = asyncHandler(async (req, res) => {
    const { conflictIndex, resolution } = req.body;
    
    const schedule = await Schedule.findById(req.params.id);
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
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
    
    res.json({ message: 'Conflict resolved successfully' });
});

// @desc    Get schedule templates
// @route   GET /api/schedules/templates
// @access  Private (Admin)
export const getScheduleTemplates = asyncHandler(async (req, res) => {
    const { category } = req.query;
    
    const query = {
        school: req.user.school,
        isTemplate: true
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
    
    const template = new Schedule({
        school: req.user.school,
        title,
        description,
        type,
        class: classId,
        subject,
        teacher,
        room,
        startTime: new Date(), // Will be overridden when creating from template
        endTime: new Date(Date.now() + (duration || 60) * 60 * 1000), // Default 1 hour
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
    
    res.status(201).json(template);
});
