import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import Attendance from '../models/Attendance.js';
import Schedule from '../models/Schedule.js';
import Student from '../models/Student.js';
import Room from '../models/Room.js';
import Class from '../models/Class.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import TimetablePeriod from '../models/TimetablePeriod.js';
import SubstitutionRequest from '../models/SubstitutionRequest.js';
import { generateNotification } from '../utils/notificationService.js';
import {
    getClassIdsForAcademicYear,
    resolveAcademicYearDateRangeForRequest,
    clampDateRangeToAcademicYear,
    isDateInAcademicYear
} from '../helpers/academicYearScope.js';
import { isWorkingDayForSchool, resolvePeriodForSchedule, hasTeacherAssignmentForSchedule, getSchoolTimeZone, hasSubstituteAssignmentForPeriod } from '../helpers/attendanceEligibility.js';
import {
    getViewRangeInTimeZone,
    getSchoolDayRange,
    getDatePartsInTimeZone,
    localYmdToServerMidnightDate,
    zonedDateTimeToUtc
} from '../utils/schoolTimezone.js';

const ADMIN_ATTENDANCE_ROLES = new Set(['admin', 'department_principal']);
const TEACHER_ATTENDANCE_ROLES = new Set(['teacher', 'admin', 'department_principal']);

const hasRoleAccess = (req, allowedRoles) => allowedRoles.has(req.user?.role);

function parseAttendanceRequestDate(input) {
    if (!input) return new Date();
    if (typeof input === 'string') {
        const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0));
        }
    }
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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

async function getYearScopedClassIds(req, candidateClassIds = null) {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const classIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear,
        candidateClassIds
    });
    return { academicYear, classIds, dateFilter };
}

// @desc    Get current student's own attendance records
// @route   GET /api/attendance/my-attendance
// @access  Private (Student)
export const getMyAttendance = asyncHandler(async (req, res) => {
    const { academicYear, classIds: yearClassIds, dateFilter } = await getYearScopedClassIds(req);
    if (yearClassIds.length === 0) {
        return res.json({
            success: true,
            data: {
                records: [],
                summary: { total: 0, present: 0, late: 0, absent: 0, percentage: 0 },
                academicYear
            }
        });
    }

    const student = await Student.findOne({ user: req.user._id, status: 'active' });
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const { month, year } = req.query;
    const query = {
        school: req.schoolId,
        class: { $in: yearClassIds },
        'studentAttendance.student': student._id
    };
    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);

    if (month) {
        const requestedMonth = parseInt(month, 10);
        if (Number.isNaN(requestedMonth) || requestedMonth < 1 || requestedMonth > 12) {
            return res.status(400).json({ success: false, message: 'month must be between 1 and 12' });
        }
        const startYear = dateFilter?.$gte ? new Date(dateFilter.$gte).getUTCFullYear() : new Date().getUTCFullYear();
        const endYear = dateFilter?.$lte ? new Date(dateFilter.$lte).getUTCFullYear() : startYear;
        const startMonth = dateFilter?.$gte ? (new Date(dateFilter.$gte).getUTCMonth() + 1) : 1;
        const y = year
            ? parseInt(year, 10)
            : (requestedMonth >= startMonth ? startYear : endYear);
        const m = requestedMonth - 1;
        const monthEndDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const start = zonedDateTimeToUtc({ year: y, month: m + 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }, schoolTimeZone);
        const end = zonedDateTimeToUtc({ year: y, month: m + 1, day: monthEndDay, hour: 23, minute: 59, second: 59, millisecond: 999 }, schoolTimeZone);
        const scopedRange = clampDateRangeToAcademicYear({ $gte: start, $lte: end }, dateFilter);
        if (!scopedRange) {
            return res.json({
                success: true,
                data: {
                    records: [],
                    summary: { total: 0, present: 0, late: 0, absent: 0, percentage: 0 },
                    academicYear
                }
            });
        }
        query.date = scopedRange;
    } else if (dateFilter) {
        query.date = dateFilter;
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
            summary: { total, present, late, absent, percentage },
            academicYear
        }
    });
});

// @desc    Get attendance data for a teacher
// @route   GET /api/attendance/teacher
// @access  Private (Teacher, Admin)
export const getTeacherAttendance = asyncHandler(async (req, res) => {
    if (!hasRoleAccess(req, TEACHER_ATTENDANCE_ROLES)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate, viewMode = 'today' } = req.query;
    const teacherId = req.user.role === 'teacher' ? req.user._id : req.query.teacherId;
    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);
    const { academicYear, classIds: yearClassIds, dateFilter } = await getYearScopedClassIds(req);

    if (!teacherId) {
        return res.status(400).json({ message: 'Teacher ID is required' });
    }
    if (yearClassIds.length === 0) {
        return res.json({
            attendanceRecords: [],
            missedSchedules: [],
            summary: {
                totalClasses: 0,
                recordedClasses: 0,
                missedClasses: 0,
                attendanceRate: 0
            },
            academicYear
        });
    }

    const dateRange = getViewRangeInTimeZone({ viewMode, startDate, endDate, now: new Date(), timeZone: schoolTimeZone });
    const scopedDateRange = clampDateRangeToAcademicYear(
        { $gte: dateRange.start, $lte: dateRange.end },
        dateFilter
    );
    if (!scopedDateRange) {
        return res.json({
            attendanceRecords: [],
            missedSchedules: [],
            summary: {
                totalClasses: 0,
                recordedClasses: 0,
                missedClasses: 0,
                attendanceRate: 0
            },
            academicYear
        });
    }
    const start = scopedDateRange.$gte;
    const end = scopedDateRange.$lte;

    // Get attendance records (include period for period-based rows)
    const attendanceRecords = await Attendance.find({
        school: req.schoolId,
        teacher: teacherId,
        class: { $in: yearClassIds },
        date: { $gte: start, $lte: end }
    })
        .populate('schedule class subject')
        .populate('period', 'name')
        .populate('studentAttendance.student', 'firstName lastName email')
        .populate('recordedBy', 'firstName lastName')
        .sort({ date: 1, startTime: 1 });

    // Get schedules for the period to identify missed attendance
    const schedules = await Schedule.find({
        school: req.schoolId,
        teacher: teacherId,
        class: { $in: yearClassIds },
        startTime: { $gte: start, $lte: end },
        requiresAttendance: true,
        status: { $ne: 'cancelled' }
    })
        .populate('class subject room')
        .sort({ startTime: 1 });

    // Identify missed attendance
    const attendedScheduleIds = attendanceRecords
        .map((record) => record.schedule?.toString())
        .filter(Boolean);
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
        },
        academicYear
    });
});

// @desc    Get attendance data for admin (school-wide)
// @route   GET /api/attendance/admin
// @access  Private (Admin)
export const getAdminAttendance = asyncHandler(async (req, res) => {
    if (!hasRoleAccess(req, ADMIN_ATTENDANCE_ROLES)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate, viewMode = 'today', teacher, class: classId, subject, status } = req.query;
    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);
    const { academicYear, classIds: yearClassIds, dateFilter } = await getYearScopedClassIds(req, classId ? [classId] : null);

    if (yearClassIds.length === 0) {
        return res.json({
            attendanceRecords: [],
            missedAttendance: [],
            summary: {
                totalClasses: 0,
                recordedClasses: 0,
                missedClasses: 0,
                overallAttendanceRate: 0,
                pendingToday: 0,
                pendingOverall: 0,
                pendingInRange: 0
            },
            academicYear
        });
    }

    const dateRange = getViewRangeInTimeZone({ viewMode, startDate, endDate, now: new Date(), timeZone: schoolTimeZone });
    const scopedDateRange = clampDateRangeToAcademicYear(
        { $gte: dateRange.start, $lte: dateRange.end },
        dateFilter
    );
    if (!scopedDateRange) {
        return res.json({
            attendanceRecords: [],
            missedAttendance: [],
            summary: {
                totalClasses: 0,
                recordedClasses: 0,
                missedClasses: 0,
                overallAttendanceRate: 0,
                pendingToday: 0,
                pendingOverall: 0,
                pendingInRange: 0
            },
            academicYear
        });
    }
    const start = scopedDateRange.$gte;
    const end = scopedDateRange.$lte;
    const now = new Date();

    const baseQuery = {
        school: req.schoolId,
        class: classId ? classId : { $in: yearClassIds }
    };
    if (teacher) baseQuery.teacher = teacher;
    if (subject) baseQuery.subject = subject;

    // Build range query
    const query = {
        ...baseQuery,
        date: { $gte: start, $lte: end }
    };

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
    const missedAttendance = await Attendance.findMissedAttendance(req.schoolId, now, { classIds: yearClassIds });

    const todayRange = getSchoolDayRange(now, schoolTimeZone);
    const pendingTodayDateRange = clampDateRangeToAcademicYear(
        { $gte: todayRange.start, $lte: todayRange.end },
        dateFilter
    );
    const pendingOverallDateRange = clampDateRangeToAcademicYear(
        { $lte: now },
        dateFilter
    );

    const pendingCountBaseQuery = {
        ...baseQuery,
        status: 'draft',
        endTime: { $lte: now }
    };

    const [pendingToday, pendingOverall] = await Promise.all([
        pendingTodayDateRange
            ? Attendance.countDocuments({
                ...pendingCountBaseQuery,
                date: pendingTodayDateRange
            })
            : 0,
        pendingOverallDateRange
            ? Attendance.countDocuments({
                ...pendingCountBaseQuery,
                date: pendingOverallDateRange
            })
            : 0
    ]);

    const pendingInRange = attendanceRecords.filter((record) => record.status === 'draft').length;

    res.json({
        attendanceRecords,
        missedAttendance,
        summary: {
            totalClasses: attendanceRecords.length,
            recordedClasses: attendanceRecords.filter(r => r.status !== 'draft').length,
            missedClasses: missedAttendance.reduce((sum, m) => sum + m.totalMissed, 0),
            overallAttendanceRate: attendanceRecords.length > 0 ?
                Math.round((attendanceRecords.reduce((sum, r) => sum + r.attendanceRate, 0) / attendanceRecords.length)) : 0,
            pendingToday,
            pendingOverall,
            pendingInRange
        },
        academicYear
    });
});

// @desc    Create or update attendance record
// @route   POST /api/attendance
// @access  Private (Teacher, Admin)
export const createOrUpdateAttendance = asyncHandler(async (req, res) => {
    if (!hasRoleAccess(req, TEACHER_ATTENDANCE_ROLES)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { scheduleId, studentAttendance } = req.body;
    const { academicYear: effectiveAcademicYear } = resolveAcademicYearDateRangeForRequest(req);

    // Get schedule information
    const schedule = await Schedule.findById(scheduleId)
        .populate('class subject teacher room');

    if (!schedule) {
        return res.status(404).json({ message: 'Schedule not found' });
    }

    if (schedule.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    const scheduleClassYear = schedule.class?.academicYear;
    if (!schedule.class || (scheduleClassYear || '').toString() !== effectiveAcademicYear) {
        return res.status(400).json({
            message: `Attendance can only be recorded for classes in academic year ${effectiveAcademicYear} `
        });
    }

    // Check permissions
    if (req.user.role === 'teacher' && schedule.teacher._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You can only record attendance for your own classes' });
    }

    // Attendance eligibility enforcement (teacher only; admin can override)
    if (req.user.role === 'teacher') {
        const isWorkingDay = await isWorkingDayForSchool(req.schoolId, schedule.startTime);
        if (!isWorkingDay) {
            return res.status(400).json({ message: 'Attendance is disabled for non-working days' });
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
                return res.status(403).json({ message: 'Attendance is disabled for periods you are not assigned to' });
            }
        }
    }

    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);
    const scheduleDayRange = getSchoolDayRange(schedule.startTime, schoolTimeZone);
    const todayRange = getSchoolDayRange(new Date(), schoolTimeZone);

    if (req.user.role === 'teacher' && scheduleDayRange.localYmd > todayRange.localYmd) {
        return res.status(400).json({ message: 'Teachers cannot record attendance for future days' });
    }

    const attendanceDate = localYmdToServerMidnightDate(scheduleDayRange.localYmd);

    // Check if attendance already exists
    let attendance = await Attendance.findOne({
        schedule: scheduleId,
        date: { $gte: scheduleDayRange.start, $lte: scheduleDayRange.end }
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
            school: req.schoolId,
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

    try {
        await attendance.save();
    } catch (error) {
        const isDuplicateSchedule =
            error?.code === 11000 && (error?.keyPattern?.schedule || error?.keyValue?.schedule);
        if (!isDuplicateSchedule) {
            throw error;
        }

        const existingAttendance = await Attendance.findOne({
            schedule: scheduleId,
            date: { $gte: scheduleDayRange.start, $lte: scheduleDayRange.end }
        });

        if (!existingAttendance) {
            throw error;
        }

        const previousAttendance = existingAttendance.studentAttendance.map(s => ({
            student: s.student,
            status: s.status
        }));

        existingAttendance.studentAttendance = studentAttendance.map(student => ({
            ...student,
            recordedBy: req.user._id,
            recordedAt: new Date(),
            lastModifiedBy: req.user._id,
            lastModifiedAt: new Date()
        }));

        existingAttendance.lastModifiedBy = req.user._id;
        existingAttendance.lastModifiedAt = new Date();
        existingAttendance.status = 'submitted';

        existingAttendance.auditTrail.push({
            action: 'student_updated',
            performedBy: req.user._id,
            details: 'Attendance updated after duplicate schedule save',
            previousValues: { studentAttendance: previousAttendance },
            newValues: { studentAttendance: studentAttendance }
        });

        await existingAttendance.save();
        attendance = existingAttendance;
    }

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
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { academicYear, classIds: yearClassIds } = await getYearScopedClassIds(req);
    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);
    const requestedDate = parseAttendanceRequestDate(req.query?.date);
    if (!requestedDate) {
        return res.status(400).json({ success: false, message: 'Invalid date' });
    }

    const targetRange = getSchoolDayRange(requestedDate, schoolTimeZone);
    const dayOfWeek = targetRange.weekday;
    const startOfDay = targetRange.start;
    const endOfDay = targetRange.end;

    if (yearClassIds.length === 0) {
        const allPeriodsEmpty = await TimetablePeriod.find({ school: req.schoolId, isActive: true }).sort({ order: 1 });
        const periodsWithStatus = allPeriodsEmpty.map(period => ({
            period,
            assignment: null,
            hasClass: false,
            attendanceStatus: null
        }));
        return res.json({ success: true, data: { periods: periodsWithStatus, date: startOfDay, academicYear } });
    }

    // Get all active assignments for today's day of week
    const assignments = await TeacherPeriodAssignment.find({
        school: req.schoolId,
        teacher: req.user._id,
        class: { $in: yearClassIds },
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
        class: { $in: yearClassIds },
        date: { $gte: startOfDay, $lte: endOfDay },
        period: { $in: allPeriods.map(p => p._id) }
    }).select('period status studentAttendance recordedBy').populate('recordedBy', 'firstName lastName');

    const attendanceByPeriod = {};
    for (const att of existingAttendance) {
        attendanceByPeriod[att.period.toString()] = {
            id: att._id,
            status: att.status,
            studentAttendance: att.studentAttendance,
            takenBy: att.recordedBy
                ? `${att.recordedBy.firstName} ${att.recordedBy.lastName}`
                : null
        };
    }

    // -------------------------------------------------------------------
    // Merge in confirmed substitute coverages for today
    // -------------------------------------------------------------------
    const subRequests = await SubstitutionRequest.find({
        school: req.schoolId,
        date: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['SUBMITTED', 'CONFIRMED'] },
        'assignments.substituteTeacherId': req.user._id,
        'assignments.status': 'CONFIRMED'
    })
        .populate('periods.periodId', 'name startTime endTime order')
        .populate('periods.classId', 'name grade section')
        .populate('periods.subjectId', 'name code')
        .populate('periods.roomId', 'name')
        .lean();

    // Build synthetic assignment-like objects from sub requests
    const subAssignments = [];
    for (const subReq of subRequests) {
        const mySubAssignments = subReq.assignments.filter(
            (a) =>
                a.substituteTeacherId?.toString() === req.user._id.toString() &&
                a.status === 'CONFIRMED'
        );
        for (const subAsg of mySubAssignments) {
            // Find the matching period detail in the sub request periods array
            const periodInfo = subReq.periods.find(
                (p) => p.periodId?._id?.toString() === subAsg.periodId?.toString()
                    || p.periodId?.toString() === subAsg.periodId?.toString()
            );
            if (periodInfo && periodInfo.periodId) {
                subAssignments.push({
                    _isSyntheticSub: true,
                    period: periodInfo.periodId,      // populated TimetablePeriod
                    class: periodInfo.classId,        // populated Class
                    subject: periodInfo.subjectId,    // populated Subject
                    room: periodInfo.roomId,          // populated Room
                    isSubstitute: true,
                    subRequestId: subReq._id
                });
            }
        }
    }

    // Combine: regular assignments + substitute assignments
    // Use a Map keyed by periodId to avoid duplicates (TPA wins if both exist)
    const assignmentByPeriod = new Map();
    for (const a of assignments) {
        const pid = (a.period?._id || a.period)?.toString();
        if (pid) assignmentByPeriod.set(pid, a);
    }
    for (const a of subAssignments) {
        const pid = (a.period?._id || a.period)?.toString();
        if (pid && !assignmentByPeriod.has(pid)) assignmentByPeriod.set(pid, a);
    }

    // Build response: each period with its assignment (if any) and attendance status
    const periodsWithStatus = allPeriods.map(period => {
        const assignment = assignmentByPeriod.get(period._id.toString()) || null;
        return {
            period,
            assignment: assignment || null,
            hasClass: !!assignment,
            isSubstitute: assignment?.isSubstitute || false,
            attendanceStatus: attendanceByPeriod[period._id.toString()] || null
        };
    });

    res.json({ success: true, data: { periods: periodsWithStatus, date: startOfDay, academicYear } });
});

// @desc    Take attendance for a timetable period
// @route   POST /api/attendance/take
// @access  Private (Teacher)
export const takePeriodAttendance = asyncHandler(async (req, res) => {
    if (req.user.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { periodId, classId, subjectId, studentAttendance, attendanceDate } = req.body;
    const { academicYear, classIds: yearClassIds } = await getYearScopedClassIds(req, classId ? [classId] : null);

    if (!periodId || !classId || !Array.isArray(studentAttendance) || studentAttendance.length === 0) {
        return res.status(400).json({ success: false, message: 'periodId, classId, and studentAttendance are required' });
    }
    if (yearClassIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: `Class must belong to academic year ${academicYear}`
        });
    }

    // Validate period
    const period = await TimetablePeriod.findById(periodId);
    if (!period || period.school.toString() !== req.schoolId.toString()) {
        return res.status(400).json({ success: false, message: 'Invalid period' });
    }

    // Verify teacher has an assignment for this period + class today
    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);
    const targetDate = parseAttendanceRequestDate(attendanceDate);
    if (!targetDate) {
        return res.status(400).json({ success: false, message: 'Invalid attendanceDate' });
    }

    const targetRange = getSchoolDayRange(targetDate, schoolTimeZone);
    const todayRange = getSchoolDayRange(new Date(), schoolTimeZone);
    if (targetRange.localYmd > todayRange.localYmd) {
        return res.status(400).json({ success: false, message: 'Teachers cannot record attendance for future days' });
    }

    const dayOfWeek = targetRange.weekday;
    const startOfDay = targetRange.start;
    const endOfDay = targetRange.end;

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

    // If no regular TPA exists, check if this teacher is a confirmed substitute
    let subPeriodInfo = null;
    if (!assignment) {
        subPeriodInfo = await hasSubstituteAssignmentForPeriod(
            req.schoolId, req.user._id, periodId, classId, targetDate
        );
        if (!subPeriodInfo) {
            return res.status(403).json({ success: false, message: 'You are not assigned to this class for this period on the selected day' });
        }
    }

    // Check for existing attendance record
    let attendance = await Attendance.findOne({
        school: req.schoolId,
        teacher: req.user._id,
        period: periodId,
        date: { $gte: startOfDay, $lte: endOfDay }
    });

    const mappedStudents = studentAttendance.map(s => ({
        student: s.student,
        status: s.status,
        notes: s.notes || '',
        recordedBy: req.user._id,
        recordedAt: new Date()
    }));

    const targetLocal = getDatePartsInTimeZone(targetDate, schoolTimeZone);
    const periodStart = zonedDateTimeToUtc({
        year: targetLocal.year,
        month: targetLocal.month,
        day: targetLocal.day,
        hour: Number((period.startTime || '00:00').split(':')[0] || 0),
        minute: Number((period.startTime || '00:00').split(':')[1] || 0),
        second: 0,
        millisecond: 0
    }, schoolTimeZone);
    const periodEnd = zonedDateTimeToUtc({
        year: targetLocal.year,
        month: targetLocal.month,
        day: targetLocal.day,
        hour: Number((period.endTime || '00:00').split(':')[0] || 0),
        minute: Number((period.endTime || '00:00').split(':')[1] || 0),
        second: 0,
        millisecond: 0
    }, schoolTimeZone);

    if (attendance) {
        attendance.studentAttendance = mappedStudents;
        attendance.totalStudents = mappedStudents.length;
        attendance.lastModifiedBy = req.user._id;
        attendance.status = 'submitted';
        attendance.auditTrail.push({
            action: 'updated',
            performedBy: req.user._id,
            details: subPeriodInfo
                ? `Attendance updated by substitute teacher (subRequestId: ${subPeriodInfo.subRequestId})`
                : 'Attendance updated'
        });
    } else {
        // Resolve room: prefer TPA assignment room, fall back to sub period room object/id
        const roomSource = assignment?.room || subPeriodInfo?.roomId;
        const resolvedRoomName = typeof roomSource === 'object' && roomSource?.name
            ? roomSource.name
            : await getRoomName(roomSource);

        attendance = new Attendance({
            school: req.schoolId,
            period: periodId,
            teacher: req.user._id,
            class: classId,
            subject: subjectId || assignment?.subject || subPeriodInfo?.subjectId,
            // Use period start timestamp so multiple periods on same day don't collide on legacy indexes
            date: periodStart,
            startTime: periodStart,
            endTime: periodEnd,
            room: resolvedRoomName,
            totalStudents: mappedStudents.length,
            studentAttendance: mappedStudents,
            recordedBy: req.user._id,
            status: 'submitted',
            auditTrail: [{
                action: 'created',
                performedBy: req.user._id,
                details: subPeriodInfo
                    ? `Taken by substitute teacher (subRequestId: ${subPeriodInfo.subRequestId})`
                    : 'Period attendance created'
            }]
        });
    }

    await attendance.save();

    res.json({ success: true, data: { attendance, academicYear }, message: 'Attendance saved successfully' });
});

// @desc    Get attendance details
// @route   GET /api/attendance/:id
// @access  Private (Teacher, Admin)
export const getAttendanceDetails = asyncHandler(async (req, res) => {
    if (!hasRoleAccess(req, TEACHER_ATTENDANCE_ROLES)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { academicYear: effectiveAcademicYear } = resolveAcademicYearDateRangeForRequest(req);
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
    if ((attendance.class?.academicYear || '').toString() !== effectiveAcademicYear) {
        return res.status(404).json({ message: `Attendance record not found for academic year ${effectiveAcademicYear}` });
    }

    // Check permissions
    if (req.user.role === 'teacher' && attendance.teacher._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ ...attendance.toObject(), academicYear: effectiveAcademicYear });
});

// @desc    Get attendance analytics
// @route   GET /api/attendance/analytics
// @access  Private (Admin)
export const getAttendanceAnalytics = asyncHandler(async (req, res) => {
    if (!hasRoleAccess(req, ADMIN_ATTENDANCE_ROLES)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate, teacher, class: classId, subject } = req.query;
    const { classIds: yearClassIds, dateFilter } = await getYearScopedClassIds(req, classId ? [classId] : null);

    if (yearClassIds.length === 0) {
        return res.json([]);
    }
    const scopedDateRange = clampDateRangeToAcademicYear(
        {
            $gte: startDate ? new Date(startDate) : undefined,
            $lte: endDate ? new Date(endDate) : undefined
        },
        dateFilter
    );
    if (!scopedDateRange) {
        return res.json([]);
    }

    const analytics = await Attendance.getAttendanceAnalytics(
        req.schoolId,
        scopedDateRange.$gte,
        scopedDateRange.$lte,
        { teacher, class: classId, subject, classIds: yearClassIds }
    );

    res.json(analytics);
});

// @desc    Get missed attendance notifications
// @route   GET /api/attendance/missed
// @access  Private (Admin)
export const getMissedAttendance = asyncHandler(async (req, res) => {
    if (!hasRoleAccess(req, ADMIN_ATTENDANCE_ROLES)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);
    const { classIds: yearClassIds, dateFilter } = await getYearScopedClassIds(req);

    if (yearClassIds.length === 0) {
        return res.json([]);
    }
    if (!isDateInAcademicYear(targetDate, dateFilter)) {
        return res.json([]);
    }

    const missedAttendance = await Attendance.findMissedAttendance(req.schoolId, targetDate, { classIds: yearClassIds });

    // Generate notifications for teachers who missed attendance
    for (const missed of missedAttendance) {
        for (const missedClass of missed.missedClasses) {
            await generateNotification({
                type: 'missed_attendance_reminder',
                recipient: missed._id,
                message: `You missed taking attendance for ${missedClass.subjectName} - ${missedClass.className} at ${new Date(missedClass.startTime).toLocaleTimeString('en-US', { timeZone: schoolTimeZone })}. Please record it as soon as possible.`,
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
    if (!hasRoleAccess(req, ADMIN_ATTENDANCE_ROLES)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { startDate, endDate, format = 'csv', teacher, class: classId, subject } = req.query;
    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);
    const { classIds: yearClassIds, dateFilter } = await getYearScopedClassIds(req, classId ? [classId] : null);
    if (yearClassIds.length === 0) {
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_${startDate}_to_${endDate}.csv`);
            return res.send('Date,Teacher,Class,Subject,Room,Total Students,Present,Absent,Late,Attendance Rate,Recorded By,Recorded At\n');
        }
        return res.json([]);
    }
    const dateRange = getViewRangeInTimeZone({ viewMode: 'range', startDate, endDate, now: new Date(), timeZone: schoolTimeZone });
    const scopedDateRange = clampDateRangeToAcademicYear(
        { $gte: dateRange.start, $lte: dateRange.end },
        dateFilter
    );
    if (!scopedDateRange) {
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_${startDate}_to_${endDate}.csv`);
            return res.send('Date,Teacher,Class,Subject,Room,Total Students,Present,Absent,Late,Attendance Rate,Recorded By,Recorded At\n');
        }
        return res.json([]);
    }

    // Build query
    const query = {
        school: req.schoolId,
        class: classId ? classId : { $in: yearClassIds },
        date: { $gte: scopedDateRange.$gte, $lte: scopedDateRange.$lte }
    };

    if (teacher) query.teacher = teacher;
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
    if (!hasRoleAccess(req, ADMIN_ATTENDANCE_ROLES)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { academicYear: effectiveAcademicYear } = resolveAcademicYearDateRangeForRequest(req);
    const attendance = await Attendance.findById(req.params.id);

    if (!attendance) {
        return res.status(404).json({ message: 'Attendance record not found' });
    }

    if (attendance.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const classDoc = await Class.findById(attendance.class).select('academicYear');
    if (!classDoc || (classDoc.academicYear || '').toString() !== effectiveAcademicYear) {
        return res.status(404).json({ message: `Attendance record not found for academic year ${effectiveAcademicYear}` });
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

