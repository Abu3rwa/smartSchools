import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import Attendance from '../models/Attendance.js';
import Schedule from '../models/Schedule.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Room from '../models/Room.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import TimetablePeriod from '../models/TimetablePeriod.js';
import { generateNotification } from '../utils/notificationService.js';
import { isWorkingDayForSchool, resolvePeriodForSchedule, hasTeacherAssignmentForSchedule } from '../helpers/attendanceEligibility.js';

// Helper function to get room name from roomId
async function getRoomName(roomId) {
    if (!roomId) return 'N/A';
    
    try {
        const room = await Room.findById(roomId);
        return room?.name || 'Unknown Room';
    } catch (error) {
        logger.error('Error fetching room name:', error);
        return 'Error';
    }
}

// @desc    Get current student's own attendance records
// @route   GET /api/attendance/my-attendance
// @access  Private (Student)
export const getMyAttendance = asyncHandler(async (req, res) => {
    const student = await Student.findOne({ user: req.user._id, status: 'active' });
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const { month, year } = req.query;
    const query = { school: req.schoolId, 'studentAttendance.student': student._id };

    if (month && year) {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10) - 1;
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
        query.date = { $gte: start, $lte: end };
    }

    const records = await Attendance.find(query)
        .populate('subject', 'name code')
        .populate('period', 'name startTime endTime')
        .sort({ date: -1 });

    const myRecords = records.map(r => {
        const entry = r.studentAttendance.find(
            sa => sa.student && sa.student.toString() === student._id.toString()
        );
        const status = entry?.status || 'unknown';
        return {
            date: r.date,
            subject: r.subject,
            period: r.period,
            status,
            remarks: entry?.notes || entry?.remarks
        };
    });

    const total = myRecords.length;
    const present = myRecords.filter(r => r.status === 'present').length;
    const late = myRecords.filter(r => ['tardy', 'tardy_excused'].includes(r.status)).length;
    const absent = myRecords.filter(r => ['absent', 'absent_excused'].includes(r.status)).length;
    const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    res.json({
        success: true,
        data: {
            records: myRecords,
            summary: { total, present, late, absent, percentage }
        }
    });
});

// @desc    Get attendance data for a teacher
// @route   GET /api/attendance/teacher
// @access  Private (Teacher, Admin)
export const getTeacherAttendance = asyncHandler(async (req, res) => {
    const { startDate, endDate, viewMode = 'today' } = req.query;
    const teacherId = req.user.role === 'teacher' ? req.user._id : req.query.teacherId;
    
    if (!teacherId) {
        return res.status(400).json({ message: 'Teacher ID is required' });
    }
    
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
    
    // Get attendance records (include period for period-based rows)
    const attendanceRecords = await Attendance.find({
        school: req.user.school,
        teacher: teacherId,
        date: { $gte: start, $lte: end }
    })
    .populate('schedule class subject')
    .populate('period', 'name')
    .populate('studentAttendance.student', 'firstName lastName email')
    .populate('recordedBy', 'firstName lastName')
    .sort({ date: 1, startTime: 1 });
    
    // Get schedules for the period to identify missed attendance
    const schedules = await Schedule.find({
        school: req.user.school,
        teacher: teacherId,
        startTime: { $gte: start, $lte: end },
        requiresAttendance: true,
        status: { $ne: 'cancelled' }
    })
    .populate('class subject room')
    .sort({ startTime: 1 });
    
    // Identify missed attendance
    const attendedScheduleIds = attendanceRecords.map(r => r.schedule.toString());
    const missedSchedules = schedules.filter(schedule => 
        !attendedScheduleIds.includes(schedule._id.toString()) && 
        new Date(schedule.endTime) < new Date()
    );
    
    res.json({
        attendanceRecords,
        missedSchedules,
        summary: {
            totalClasses: schedules.length,
            recordedClasses: attendanceRecords.length,
            missedClasses: missedSchedules.length,
            attendanceRate: attendanceRecords.length > 0 ? 
                Math.round((attendanceRecords.reduce((sum, r) => sum + r.attendanceRate, 0) / attendanceRecords.length)) : 0
        }
    });
});

// @desc    Get attendance data for admin (school-wide)
// @route   GET /api/attendance/admin
// @access  Private (Admin)
export const getAdminAttendance = asyncHandler(async (req, res) => {
    const { startDate, endDate, viewMode = 'today', teacher, class: classId, subject, status } = req.query;
    
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
    } else if (viewMode === 'range' && startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
    } else {
        start = new Date(startDate);
        end = new Date(endDate);
    }
    
    // Build query
    const query = {
        school: req.user.school,
        date: { $gte: start, $lte: end }
    };
    
    if (teacher) query.teacher = teacher;
    if (classId) query.class = classId;
    if (subject) query.subject = subject;
    if (status === 'recorded') {
        query.status = { $in: ['submitted', 'locked'] };
    } else if (status === 'pending') {
        query.status = 'draft';
    }
    
    // Get attendance records (include period for period-based rows)
    const attendanceRecords = await Attendance.find(query)
    .populate('schedule class subject teacher')
    .populate('period', 'name')
    .populate('recordedBy', 'firstName lastName')
    .sort({ date: 1, startTime: 1 });
    
    // Get missed attendance
    const missedAttendance = await Attendance.findMissedAttendance(req.user.school, today);
    
    res.json({
        attendanceRecords,
        missedAttendance,
        summary: {
            totalClasses: attendanceRecords.length,
            recordedClasses: attendanceRecords.filter(r => r.status !== 'draft').length,
            missedClasses: missedAttendance.reduce((sum, m) => sum + m.totalMissed, 0),
            overallAttendanceRate: attendanceRecords.length > 0 ? 
                Math.round((attendanceRecords.reduce((sum, r) => sum + r.attendanceRate, 0) / attendanceRecords.length)) : 0
        }
    });
});

// @desc    Create or update attendance record
// @route   POST /api/attendance
// @access  Private (Teacher, Admin)
export const createOrUpdateAttendance = asyncHandler(async (req, res) => {
    const { scheduleId, studentAttendance, notes } = req.body;
    
    // Get schedule information
    const schedule = await Schedule.findById(scheduleId)
        .populate('class subject teacher room');
    
    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }
    
    if (schedule.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check permissions
    if (req.user.role === 'teacher' && schedule.teacher._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You can only record attendance for your own classes' });
    }

    // Attendance eligibility enforcement (teacher only; admin can override)
    if (req.user.role === 'teacher') {
        const isWorkingDay = await isWorkingDayForSchool(req.user.school, schedule.startTime);
        if (!isWorkingDay) {
            return res.status(400).json({ message: 'Attendance is disabled for non-working days' });
        }

        const period = await resolvePeriodForSchedule(req.user.school, schedule);
        if (period) {
            const hasAssignment = await hasTeacherAssignmentForSchedule(
                req.user.school,
                schedule,
                req.user._id,
                period._id
            );
            if (!hasAssignment) {
                return res.status(403).json({ message: 'Attendance is disabled for periods you are not assigned to' });
            }
        }
    }
    
    const attendanceDate = new Date(schedule.startTime);
    attendanceDate.setHours(0, 0, 0, 0);

    // Check if attendance already exists
    let attendance = await Attendance.findOne({
        schedule: scheduleId,
        date: attendanceDate
    });
    
    if (attendance) {
        // Update existing attendance
        const previousAttendance = attendance.studentAttendance.map(s => ({
            student: s.student,
            status: s.status
        }));
        
        attendance.studentAttendance = studentAttendance.map(student => ({
            ...student,
            recordedBy: req.user._id,
            recordedAt: new Date(),
            lastModifiedBy: req.user._id,
            lastModifiedAt: new Date()
        }));
        
        attendance.lastModifiedBy = req.user._id;
        attendance.lastModifiedAt = new Date();
        
        // Add to audit trail
        attendance.auditTrail.push({
            action: 'student_updated',
            performedBy: req.user._id,
            details: 'Attendance updated',
            previousValues: { studentAttendance: previousAttendance },
            newValues: { studentAttendance: studentAttendance }
        });
        
    } else {
        // Create new attendance record
        attendance = new Attendance({
            school: req.user.school,
            schedule: scheduleId,
            teacher: schedule.teacher._id,
            class: schedule.class._id,
            subject: schedule.subject._id,
            date: attendanceDate,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            room: schedule.room.name,
            totalStudents: studentAttendance.length,
            studentAttendance: studentAttendance.map(student => ({
                ...student,
                recordedBy: req.user._id,
                recordedAt: new Date()
            })),
            recordedBy: req.user._id,
            status: 'submitted',
            auditTrail: [{
                action: 'created',
                performedBy: req.user._id,
                details: 'Attendance created'
            }]
        });
    }
    
    await attendance.save();
    
    // Send parent notifications for absent students
    const absentStudents = attendance.studentAttendance.filter(s => s.status === 'absent');
    for (const absentStudent of absentStudents) {
        await generateNotification({
            type: 'parent_notification',
            recipient: absentStudent.student,
            message: `Your child was marked absent from ${schedule.subject.name} class today. Please check on them and ensure they're doing well.`,
            metadata: {
                attendanceId: attendance._id,
                scheduleId: scheduleId,
                subject: schedule.subject.name,
                date: attendance.date
            }
        });
    }
    
    res.json(attendance);
});

// @desc    Get teacher's periods for today with attendance status
// @route   GET /api/attendance/my-today
// @access  Private (Teacher)
export const getMyTodayPeriods = asyncHandler(async (req, res) => {

    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today); endOfDay.setHours(23, 59, 59, 999);

    // Get all active assignments for today's day of week
    const assignments = await TeacherPeriodAssignment.find({
        school: req.schoolId,
        teacher: req.user._id,
        isActive: true,
        daysOfWeek: dayOfWeek,
        startDate: { $lte: endOfDay },
        endDate: { $gte: startOfDay }
    })
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .populate('period', 'name startTime endTime order');

    // Get all periods for this school (to show full day structure)
    const allPeriods = await TimetablePeriod.find({ school: req.schoolId, isActive: true }).sort({ order: 1 });

    // Check which periods already have attendance recorded today
    const existingAttendance = await Attendance.find({
        school: req.schoolId,
        teacher: req.user._id,
        date: startOfDay,
        period: { $in: allPeriods.map(p => p._id) }
    }).select('period status studentAttendance');

    const attendanceByPeriod = {};
    for (const att of existingAttendance) {
        attendanceByPeriod[att.period.toString()] = {
            id: att._id,
            status: att.status,
            studentAttendance: att.studentAttendance
        };
    }

    // Build response: each period with its assignment (if any) and attendance status
    const periodsWithStatus = allPeriods.map(period => {
        const assignment = assignments.find(a =>
            (a.period?._id || a.period)?.toString() === period._id.toString()
        );
        return {
            period,
            assignment: assignment || null,
            hasClass: !!assignment,
            attendanceStatus: attendanceByPeriod[period._id.toString()] || null
        };
    });

    res.json({ success: true, data: { periods: periodsWithStatus, date: startOfDay } });
});

// @desc    Take attendance for a timetable period
// @route   POST /api/attendance/take
// @access  Private (Teacher)
export const takePeriodAttendance = asyncHandler(async (req, res) => {
    const { periodId, classId, subjectId, studentAttendance } = req.body;

    if (!periodId || !classId || !Array.isArray(studentAttendance) || studentAttendance.length === 0) {
        return res.status(400).json({ success: false, message: 'periodId, classId, and studentAttendance are required' });
    }

    // Validate period
    const period = await TimetablePeriod.findById(periodId);
    if (!period || period.school.toString() !== req.schoolId.toString()) {
        return res.status(400).json({ success: false, message: 'Invalid period' });
    }

    // Verify teacher has an assignment for this period + class today
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today); endOfDay.setHours(23, 59, 59, 999);

    const assignment = await TeacherPeriodAssignment.findOne({
        school: req.schoolId,
        teacher: req.user._id,
        period: periodId,
        class: classId,
        isActive: true,
        daysOfWeek: dayOfWeek,
        startDate: { $lte: endOfDay },
        endDate: { $gte: startOfDay }
    });

    if (!assignment) {
        return res.status(403).json({ success: false, message: 'You are not assigned to this class for this period today' });
    }

    // Check for existing attendance record
    let attendance = await Attendance.findOne({
        school: req.schoolId,
        teacher: req.user._id,
        period: periodId,
        date: startOfDay
    });

    const mappedStudents = studentAttendance.map(s => ({
        student: s.student,
        status: s.status,
        notes: s.notes || '',
        recordedBy: req.user._id,
        recordedAt: new Date()
    }));

    if (attendance) {
        attendance.studentAttendance = mappedStudents;
        attendance.totalStudents = mappedStudents.length;
        attendance.lastModifiedBy = req.user._id;
        attendance.status = 'submitted';
        attendance.auditTrail.push({
            action: 'updated',
            performedBy: req.user._id,
            details: 'Attendance updated'
        });
    } else {
        attendance = new Attendance({
            school: req.schoolId,
            period: periodId,
            teacher: req.user._id,
            class: classId,
            subject: subjectId || assignment.subject,
            date: startOfDay,
            startTime: new Date(`${today.toISOString().slice(0, 10)}T${period.startTime}:00`),
            endTime: new Date(`${today.toISOString().slice(0, 10)}T${period.endTime}:00`),
            room: await getRoomName(assignment.room),
            totalStudents: mappedStudents.length,
            studentAttendance: mappedStudents,
            recordedBy: req.user._id,
            status: 'submitted',
            auditTrail: [{
                action: 'created',
                performedBy: req.user._id,
                details: 'Period attendance created'
            }]
        });
    }

    await attendance.save();

    res.json({ success: true, data: { attendance }, message: 'Attendance saved successfully' });
});

// @desc    Get attendance details
// @route   GET /api/attendance/:id
// @access  Private (Teacher, Admin)
export const getAttendanceDetails = asyncHandler(async (req, res) => {
    const attendance = await Attendance.findById(req.params.id)
        .populate('schedule class subject teacher')
        .populate('studentAttendance.student', 'firstName lastName email parentContact')
        .populate('recordedBy', 'firstName lastName')
        .populate('lastModifiedBy', 'firstName lastName');
    
    if (!attendance) {
        return res.status(404).json({ message: 'Attendance record not found' });
    }
    
    if (attendance.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check permissions
    if (req.user.role === 'teacher' && attendance.teacher._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(attendance);
});

// @desc    Get attendance analytics
// @route   GET /api/attendance/analytics
// @access  Private (Admin)
export const getAttendanceAnalytics = asyncHandler(async (req, res) => {
    const { startDate, endDate, teacher, class: classId, subject } = req.query;
    
    const analytics = await Attendance.getAttendanceAnalytics(
        req.user.school,
        startDate,
        endDate,
        { teacher, class: classId, subject }
    );
    
    res.json(analytics);
});

// @desc    Get missed attendance notifications
// @route   GET /api/attendance/missed
// @access  Private (Admin)
export const getMissedAttendance = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    
    const missedAttendance = await Attendance.findMissedAttendance(req.user.school, targetDate);
    
    // Generate notifications for teachers who missed attendance
    for (const missed of missedAttendance) {
        const teacher = await User.findById(missed._id);
        
        for (const missedClass of missed.missedClasses) {
            await generateNotification({
                type: 'missed_attendance_reminder',
                recipient: missed._id,
                message: `You missed taking attendance for ${missedClass.subjectName} - ${missedClass.className} at ${new Date(missedClass.startTime).toLocaleTimeString()}. Please record it as soon as possible.`,
                metadata: {
                    scheduleId: missedClass.scheduleId,
                    className: missedClass.className,
                    subjectName: missedClass.subjectName,
                    startTime: missedClass.startTime,
                    room: missedClass.room
                }
            });
        }
    }
    
    res.json(missedAttendance);
});

// @desc    Export attendance data
// @route   GET /api/attendance/export
// @access  Private (Admin)
export const exportAttendanceData = asyncHandler(async (req, res) => {
    const { startDate, endDate, format = 'csv', teacher, class: classId, subject } = req.query;
    
    // Build query
    const query = {
        school: req.user.school,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
    };
    
    if (teacher) query.teacher = teacher;
    if (classId) query.class = classId;
    if (subject) query.subject = subject;
    
    const attendanceRecords = await Attendance.find(query)
        .populate('schedule class subject teacher')
        .populate('studentAttendance.student', 'firstName lastName')
        .populate('recordedBy', 'firstName lastName')
        .sort({ date: 1, startTime: 1 });
    
    if (format === 'csv') {
        // Generate CSV
        const csv = [
            ['Date', 'Teacher', 'Class', 'Subject', 'Room', 'Total Students', 'Present', 'Absent', 'Late', 'Attendance Rate', 'Recorded By', 'Recorded At'].join(','),
            ...attendanceRecords.map(record => [
                record.date.toISOString().split('T')[0],
                `${record.teacher.firstName} ${record.teacher.lastName}`,
                record.class.name,
                record.subject.name,
                record.room,
                record.totalStudents,
                record.present,
                record.absent,
                record.late,
                `${record.attendanceRate}%`,
                `${record.recordedBy.firstName} ${record.recordedBy.lastName}`,
                record.recordedAt.toISOString()
            ].join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${startDate}_to_${endDate}.csv`);
        res.send(csv);
    } else {
        // Generate Excel (would need a library like xlsx)
        res.json(attendanceRecords);
    }
});

// @desc    Lock attendance (prevent further edits)
// @route   POST /api/attendance/:id/lock
// @access  Private (Admin)
export const lockAttendance = asyncHandler(async (req, res) => {
    const attendance = await Attendance.findById(req.params.id);
    
    if (!attendance) {
        return res.status(404).json({ message: 'Attendance record not found' });
    }
    
    if (attendance.school.toString() !== req.user.school.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    
    attendance.status = 'locked';
    attendance.lastModifiedBy = req.user._id;
    attendance.lastModifiedAt = new Date();
    
    attendance.auditTrail.push({
        action: 'status_changed',
        performedBy: req.user._id,
        details: 'Attendance locked',
        newValues: { status: 'locked' }
    });
    
    await attendance.save();
    
    res.json({ message: 'Attendance locked successfully' });
});
