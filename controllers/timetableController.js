import { asyncHandler } from '../middleware/errorHandler.js';
import TimetablePeriod from '../models/TimetablePeriod.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Room from '../models/Room.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import { getClassIdsForAcademicYear, resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import { evaluateRoomOperationalState } from '../helpers/roomAvailability.js';
import { runImportPipeline } from '../services/import/importPipeline.js';
import { resolveAcademicYearDateRange } from '../utils/academicYear.js';
import {
    DEFAULT_WEEK_WORKING_DAYS,
    getInvalidWeekWorkingDayValues,
    normalizeWeekWorkingDays
} from '../utils/schoolWeekWorkingDays.js';

// @desc    List periods
// @route   GET /api/timetable/periods
// @access  Private (Admin)
export const listPeriods = asyncHandler(async (req, res) => {
    const periods = await TimetablePeriod.find({ school: req.schoolId }).sort({ order: 1, startTime: 1 });
    res.json({ success: true, data: { periods } });
});

// @desc    Create period
// @route   POST /api/timetable/periods
// @access  Private (Admin)
export const createPeriod = asyncHandler(async (req, res) => {
    const { name, startTime, endTime, order, isActive } = req.body;
    const newPeriod = {
        school: req.schoolId,
        name,
        startTime,
        endTime,
        order: order ?? 0,
        isActive: isActive ?? true,
        createdBy: req.user._id
    };
    const period = await TimetablePeriod.create(newPeriod);

    res.status(201).json({ success: true, data: { period }, message: 'Period created successfully' });
});

// @desc    Import timetable periods
// @route   POST /api/timetable/periods/import
// @access  Private (Admin, Department Principal)
export const importPeriods = asyncHandler(async (req, res) => {
    const result = await runImportPipeline({
        entityType: 'timetable_periods',
        mode: 'commit',
        payload: req.body,
        context: {
            schoolId: req.schoolId,
            school: req.school,
            userId: req.user?._id,
            academicYear: req.academicYear
        }
    });

    res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        data: {
            imported: result.summary.importedRows,
            failed: result.summary.failedRows,
            skipped: result.summary.skippedRows,
            total: result.summary.totalRows,
            importRunId: result.importRunId,
            errorReportUrl: result.errorReportUrl,
            errors: result.errors
        },
        summary: result.summary,
        warnings: result.warnings
    });
});

// @desc    Update period
// @route   PUT /api/timetable/periods/:id
// @access  Private (Admin)
export const updatePeriod = asyncHandler(async (req, res) => {
    const period = await TimetablePeriod.findById(req.params.id);
    if (!period) {
        return res.status(404).json({ success: false, message: 'Period not found' });
    }

    if (period.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const { name, startTime, endTime, order, isActive } = req.body;

    if (name !== undefined) period.name = name;
    if (startTime !== undefined) period.startTime = startTime;
    if (endTime !== undefined) period.endTime = endTime;
    if (order !== undefined) period.order = order;
    if (isActive !== undefined) period.isActive = isActive;
    period.lastModifiedBy = req.user._id;

    await period.save();

    res.json({ success: true, data: { period }, message: 'Period updated successfully' });
});

// @desc    Delete period
// @route   DELETE /api/timetable/periods/:id
// @access  Private (Admin)
export const deletePeriod = asyncHandler(async (req, res) => {
    const period = await TimetablePeriod.findById(req.params.id);
    if (!period) {
        return res.status(404).json({ success: false, message: 'Period not found' });
    }

    if (period.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await period.deleteOne();

    res.json({ success: true, message: 'Period deleted successfully' });
});

function datesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
}

async function findActiveTeacherProfileForUser(userId) {
    if (!userId) return null;

    return Teacher.findOne({
        user: userId,
        isActive: true
    })
        .select('_id user department')
        .lean();
}

async function resolveSchoolWeekWorkingDays(schoolId) {
    const config = await SchoolCalendarConfig.findOne({
        school: schoolId,
        isActive: true
    })
        .select('weekWorkingDays')
        .lean();

    return normalizeWeekWorkingDays(config?.weekWorkingDays, DEFAULT_WEEK_WORKING_DAYS);
}

const resolveAssignmentDays = (daysOfWeek, schoolWeekWorkingDays) =>
    normalizeWeekWorkingDays(daysOfWeek, schoolWeekWorkingDays);

const hasDayOutsideSchoolWorkingDays = (daysOfWeek, schoolWeekWorkingDays) => {
    if (!Array.isArray(daysOfWeek)) return false;
    const invalidDays = getInvalidWeekWorkingDayValues(daysOfWeek, schoolWeekWorkingDays);
    return invalidDays.length > 0;
};

async function resolveTeacherUserForAssignment(schoolId, rawTeacherId) {
    if (!rawTeacherId) {
        return { error: 'Teacher is required' };
    }

    const candidateId = String(rawTeacherId).trim();
    if (!candidateId) {
        return { error: 'Teacher is required' };
    }

    const teacherUser = await User.findById(candidateId).setOptions({ skipTenantFilter: true });
    if (teacherUser) {
        if (teacherUser.school?.toString() !== schoolId.toString()) {
            return { error: 'Teacher does not belong to this school' };
        }
        if (teacherUser.role !== 'teacher') {
            return { error: 'Selected user is not a teacher' };
        }
        if (teacherUser.isActive === false) {
            return { error: 'Teacher account is inactive' };
        }

        const teacherProfile = await findActiveTeacherProfileForUser(teacherUser._id);
        if (!teacherProfile) {
            return { error: 'Teacher profile is missing or inactive' };
        }

        return { teacherUserId: teacherUser._id, teacherUser, teacherProfile };
    }

    const teacherProfile = await Teacher.findById(candidateId)
        .select('_id user school isActive')
        .lean();
    if (!teacherProfile) {
        return { error: 'Teacher not found' };
    }
    if (teacherProfile.school?.toString() !== schoolId.toString()) {
        return { error: 'Teacher does not belong to this school' };
    }
    if (teacherProfile.isActive === false) {
        return { error: 'Teacher profile is inactive' };
    }

    const userFromProfile = await User.findById(teacherProfile.user).setOptions({ skipTenantFilter: true });
    if (!userFromProfile) {
        return { error: 'Teacher user account is missing' };
    }
    if (userFromProfile.school?.toString() !== schoolId.toString()) {
        return { error: 'Teacher does not belong to this school' };
    }
    if (userFromProfile.role !== 'teacher') {
        return { error: 'Selected user is not a teacher' };
    }
    if (userFromProfile.isActive === false) {
        return { error: 'Teacher account is inactive' };
    }

    return { teacherUserId: userFromProfile._id, teacherUser: userFromProfile, teacherProfile };
}

const normalizeYearClassKey = (classDoc) => {
    const name = String(classDoc?.name || '').trim().toLowerCase();
    const section = String(classDoc?.section || '').trim().toLowerCase();
    const grade = String(classDoc?.grade || '');
    return `${name}|${section}|${grade}`;
};

const normalizeLooseClassKey = (classDoc) => {
    const name = String(classDoc?.name || '').trim().toLowerCase();
    const grade = String(classDoc?.grade || '');
    return `${name}|${grade}`;
};

const toStartOfDay = (value) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
};

const toEndOfDay = (value) => {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
};

const buildMigratedDateWindow = ({ sourceStartDate, sourceEndDate, sourceRange, targetRange, dateMode }) => {
    const sourceStart = toStartOfDay(sourceStartDate);
    const sourceEnd = toEndOfDay(sourceEndDate);

    const startDelta = sourceStart.getTime() - sourceRange.startDate.getTime();
    const endDelta = sourceEnd.getTime() - sourceRange.startDate.getTime();

    let nextStart = new Date(targetRange.startDate.getTime() + startDelta);
    let nextEnd = new Date(targetRange.startDate.getTime() + endDelta);

    if (dateMode === 'clamp_to_target_year') {
        if (nextStart < targetRange.startDate) nextStart = toStartOfDay(targetRange.startDate);
        if (nextEnd > targetRange.endDate) nextEnd = toEndOfDay(targetRange.endDate);
    }

    if (nextEnd <= nextStart) {
        nextEnd = toEndOfDay(nextStart);
    }

    return { startDate: nextStart, endDate: nextEnd };
};

/**
 * Check for teacher/class/room conflicts in the same period with overlapping dates and days.
 * @param {string} schoolId
 * @param {object} candidate - { teacher, class, room, period, daysOfWeek, startDate, endDate }
 * @param {string|null} excludeAssignmentId - assignment id to exclude (e.g. when updating)
 * @returns {Promise<{ hasConflict: boolean, conflicts: array }>}
 */
async function checkAssignmentConflicts(schoolId, candidate, excludeAssignmentId = null, defaultWorkingDays = DEFAULT_WEEK_WORKING_DAYS) {
    const { teacher, class: classId, room, period, daysOfWeek, startDate, endDate } = candidate;
    const existingForPeriod = await TeacherPeriodAssignment.find({
        school: schoolId,
        isActive: true,
        period
    });

    const s = new Date(startDate);
    const e = new Date(endDate);
    const normalizedStart = new Date(s.setHours(0, 0, 0, 0));
    const normalizedEnd = new Date(e.setHours(23, 59, 59, 999));

    const candidateDays = resolveAssignmentDays(daysOfWeek, defaultWorkingDays);
    const conflicts = [];

    // Global room-to-class uniqueness rule:
    // A room can only be assigned to ONE class across the entire school.
    if (room) {
        const existingRoomAssignments = await TeacherPeriodAssignment.find({
            school: schoolId,
            isActive: true,
            room: room
        });

        for (const existing of existingRoomAssignments) {
            if (excludeAssignmentId && existing._id.toString() === excludeAssignmentId.toString()) continue;

            // Check if there is a date overlap globally for this room
            const dateOverlap = datesOverlap(normalizedStart, normalizedEnd, new Date(existing.startDate), new Date(existing.endDate));
            if (!dateOverlap) continue;

            if (existing.class.toString() !== classId?.toString()) {
                conflicts.push({
                    id: existing._id,
                    teacher: existing.teacher,
                    class: existing.class,
                    room: existing.room,
                    period: existing.period,
                    daysOfWeek: existing.daysOfWeek,
                    startDate: existing.startDate,
                    endDate: existing.endDate,
                    reason: 'room-exclusivity'
                });
                break; // One conflict is enough to flag the room
            }
        }
    }

    for (const existing of existingForPeriod) {
        if (excludeAssignmentId && existing._id.toString() === excludeAssignmentId.toString()) continue;

        const dateOverlap = datesOverlap(normalizedStart, normalizedEnd, new Date(existing.startDate), new Date(existing.endDate));
        if (!dateOverlap) continue;

        const existingDays = resolveAssignmentDays(existing.daysOfWeek, defaultWorkingDays);
        const dayOverlap = existingDays.some((day) => candidateDays.includes(day));
        if (!dayOverlap) continue;

        const isTeacherConflict = existing.teacher.toString() === teacher?.toString();
        const isClassConflict = existing.class.toString() === classId?.toString();
        const isRoomConflict = room && existing.room && existing.room.toString() === room.toString();

        if (isTeacherConflict || isClassConflict || isRoomConflict) {
            conflicts.push({
                id: existing._id,
                teacher: existing.teacher,
                class: existing.class,
                room: existing.room,
                period: existing.period,
                daysOfWeek: existingDays,
                startDate: existing.startDate,
                endDate: existing.endDate,
                reason: isTeacherConflict ? 'teacher' : isClassConflict ? 'class' : 'room'
            });
        }
    }

    return { hasConflict: conflicts.length > 0, conflicts };
}

// @desc    Create teacher period assignment
// @route   POST /api/timetable/assignments
// @access  Private (Admin)
export const createAssignment = asyncHandler(async (req, res) => {
    const {
        teacher,
        class: classId,
        subject: rawSubject,
        room: rawRoom,
        period,
        daysOfWeek,
        startDate,
        endDate,
        isActive
    } = req.body;

    const subject = rawSubject || undefined;
    const room = rawRoom || undefined;
    const schoolWeekWorkingDays = await resolveSchoolWeekWorkingDays(req.schoolId);
    const assignmentDays = resolveAssignmentDays(daysOfWeek, schoolWeekWorkingDays);

    if (hasDayOutsideSchoolWorkingDays(daysOfWeek, schoolWeekWorkingDays)) {
        return res.status(400).json({
            success: false,
            message: 'Selected days must be within school teaching days'
        });
    }

    const teacherResolution = await resolveTeacherUserForAssignment(req.schoolId, teacher);
    if (teacherResolution.error) {
        return res.status(400).json({ success: false, message: teacherResolution.error });
    }
    const teacherUserId = teacherResolution.teacherUserId;

    const classDoc = await Class.findById(classId);
    if (!classDoc || classDoc.school.toString() !== req.schoolId.toString()) {
        return res.status(400).json({ success: false, message: 'Invalid class' });
    }
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    if ((classDoc.academicYear || '').toString() !== effectiveAcademicYear) {
        return res.status(400).json({
            success: false,
            message: `Class must belong to academic year ${effectiveAcademicYear}`
        });
    }

    if (subject) {
        const subjectDoc = await Subject.findById(subject);
        if (!subjectDoc || subjectDoc.school.toString() !== req.schoolId.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid subject' });
        }
    }

    const periodDoc = await TimetablePeriod.findById(period);
    if (!periodDoc || periodDoc.school.toString() !== req.schoolId.toString()) {
        return res.status(400).json({ success: false, message: 'Invalid period' });
    }

    if (room) {
        const roomDoc = await Room.findById(room);
        if (!roomDoc || roomDoc.school.toString() !== req.schoolId.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid room' });
        }
        const roomReadiness = evaluateRoomOperationalState(roomDoc, {
            startTime: startDate,
            endTime: endDate,
            checkAvailabilitySchedule: false
        });
        if (!roomReadiness.available) {
            return res.status(400).json({
                success: false,
                message: roomReadiness.message || 'Selected room is unavailable for this assignment.',
                code: roomReadiness.code
            });
        }
    }

    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid startDate/endDate' });
    }

    const candidate = {
        school: req.schoolId,
        teacher: teacherUserId,
        class: classId,
        grade: classDoc.grade,
        subject,
        room,
        period,
        daysOfWeek: assignmentDays,
        startDate: s,
        endDate: e,
        isActive: isActive ?? true,
        createdBy: req.user._id
    };

    const { hasConflict, conflicts } = await checkAssignmentConflicts(req.schoolId, {
        teacher: teacherUserId,
        class: classId,
        room,
        period,
        daysOfWeek: assignmentDays,
        startDate: s,
        endDate: e
    }, null, schoolWeekWorkingDays);

    if (hasConflict) {
        const reasons = [...new Set(conflicts.map(c => c.reason))];
        return res.status(400).json({
            success: false,
            message: `Conflict: ${reasons.map(r => r === 'room-exclusivity' ? 'room is already exclusively assigned to another class' : r === 'room' ? 'room already occupied' : r === 'teacher' ? 'teacher already assigned' : 'class already has a lesson').join(', ')}`,
            conflicts
        });
    }

    const assignment = await TeacherPeriodAssignment.create(candidate);

    res.status(201).json({ success: true, data: { assignment } });
});

// @desc    List assignments
// @route   GET /api/timetable/assignments
// @access  Private (Admin)
export const listAssignments = asyncHandler(async (req, res) => {
    const { teacher, class: classId, period, activeOnly = 'true' } = req.query;
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const schoolWeekWorkingDays = await resolveSchoolWeekWorkingDays(req.schoolId);
    const yearScopedClassIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear: effectiveAcademicYear,
        candidateClassIds: classId ? [classId] : null
    });

    if (yearScopedClassIds.length === 0) {
        return res.json({
            success: true,
            data: {
                assignments: [],
                academicYear: effectiveAcademicYear,
                workingDays: schoolWeekWorkingDays
            }
        });
    }

    const query = { school: req.schoolId };
    if (activeOnly === 'true') query.isActive = true;
    if (teacher) query.teacher = teacher;
    query.class = classId ? classId : { $in: yearScopedClassIds };
    if (period) query.period = period;

    const assignments = await TeacherPeriodAssignment.find(query)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .populate('period', 'name startTime endTime order')
        .sort({ startDate: 1 });

    const normalizedAssignments = assignments.map((assignment) => {
        const serialized = assignment.toObject();
        if (!Array.isArray(serialized.daysOfWeek) || serialized.daysOfWeek.length === 0) {
            serialized.daysOfWeek = [...schoolWeekWorkingDays];
        }
        return serialized;
    });

    res.json({
        success: true,
        data: {
            assignments: normalizedAssignments,
            academicYear: effectiveAcademicYear,
            workingDays: schoolWeekWorkingDays
        }
    });
});

// @desc    Get student's today schedule (by currentClass)
// @route   GET /api/timetable/my-schedule
// @access  Private (Student)
export const getStudentTimetable = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const schoolWeekWorkingDays = await resolveSchoolWeekWorkingDays(req.schoolId);
    const student = await Student.findOne({ user: req.user._id, status: 'active' })
        .select('currentClass')
        .populate('currentClass', 'name grade section academicYear');
    if (!student || !student.currentClass) {
        return res.json({
            success: true,
            data: { schedule: [], workingDays: schoolWeekWorkingDays }
        });
    }
    if ((student.currentClass.academicYear || '').toString() !== effectiveAcademicYear) {
        return res.json({
            success: true,
            data: {
                schedule: [],
                academicYear: effectiveAcademicYear,
                workingDays: schoolWeekWorkingDays
            }
        });
    }

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 Sun .. 6 Sat
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const dayFilter = [{ daysOfWeek: dayOfWeek }];
    if (schoolWeekWorkingDays.includes(dayOfWeek)) {
        dayFilter.push(
            { daysOfWeek: { $exists: false } },
            { daysOfWeek: { $size: 0 } }
        );
    }

    const assignments = await TeacherPeriodAssignment.find({
        school: req.schoolId,
        class: student.currentClass._id,
        isActive: true,
        startDate: { $lte: endOfDay },
        endDate: { $gte: startOfDay },
        $or: dayFilter
    })
        .populate('period', 'name startTime endTime order')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .populate('teacher', 'firstName lastName')
        .sort({ 'period.order': 1, 'period.startTime': 1 });

    const schedule = assignments.map(a => ({
        period: a.period,
        subject: a.subject,
        room: a.room,
        teacher: a.teacher
    }));

    res.json({
        success: true,
        data: {
            schedule,
            academicYear: effectiveAcademicYear,
            workingDays: schoolWeekWorkingDays
        }
    });
});

// @desc    Get current teacher's timetable (periods + their assignments)
// @route   GET /api/timetable/my-timetable
// @access  Private (Teacher)
export const getMyTimetable = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const schoolWeekWorkingDays = await resolveSchoolWeekWorkingDays(req.schoolId);
    const yearScopedClassIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear: effectiveAcademicYear
    });
    const periods = await TimetablePeriod.find({ school: req.schoolId, isActive: true }).sort({ order: 1 });

    if (yearScopedClassIds.length === 0) {
        return res.json({
            success: true,
            data: {
                periods,
                assignments: [],
                academicYear: effectiveAcademicYear,
                workingDays: schoolWeekWorkingDays
            }
        });
    }

    const assignments = await TeacherPeriodAssignment.find({
        school: req.schoolId,
        teacher: req.user._id,
        class: { $in: yearScopedClassIds },
        isActive: true
    })
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .populate('period', 'name startTime endTime order')
        .sort({ 'period.order': 1 });

    const normalizedAssignments = assignments.map((assignment) => {
        const serialized = assignment.toObject();
        if (!Array.isArray(serialized.daysOfWeek) || serialized.daysOfWeek.length === 0) {
            serialized.daysOfWeek = [...schoolWeekWorkingDays];
        }
        return serialized;
    });

    res.json({
        success: true,
        data: {
            periods,
            assignments: normalizedAssignments,
            academicYear: effectiveAcademicYear,
            workingDays: schoolWeekWorkingDays
        }
    });
});

// @desc    Update assignment
// @route   PUT /api/timetable/assignments/:id
// @access  Private (Admin)
export const updateAssignment = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const schoolWeekWorkingDays = await resolveSchoolWeekWorkingDays(req.schoolId);
    const assignment = await TeacherPeriodAssignment.findById(req.params.id);
    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const existingClassDoc = await Class.findById(assignment.class).select('academicYear');
    if (!existingClassDoc || (existingClassDoc.academicYear || '').toString() !== effectiveAcademicYear) {
        return res.status(404).json({
            success: false,
            message: `Assignment not found for academic year ${effectiveAcademicYear}`
        });
    }

    const {
        teacher: bodyTeacher,
        class: classId,
        subject: rawSubject,
        room: rawRoom,
        period: bodyPeriod,
        daysOfWeek: bodyDays,
        startDate: bodyStart,
        endDate: bodyEnd,
        isActive
    } = req.body;

    const subject = rawSubject !== undefined ? rawSubject || undefined : assignment.subject;
    const room = rawRoom !== undefined ? rawRoom || undefined : assignment.room;

    if (hasDayOutsideSchoolWorkingDays(bodyDays, schoolWeekWorkingDays)) {
        return res.status(400).json({
            success: false,
            message: 'Selected days must be within school teaching days'
        });
    }

    if (bodyTeacher !== undefined) {
        const teacherResolution = await resolveTeacherUserForAssignment(req.schoolId, bodyTeacher);
        if (teacherResolution.error) {
            return res.status(400).json({ success: false, message: teacherResolution.error });
        }
        assignment.teacher = teacherResolution.teacherUserId;
    }
    if (classId !== undefined) {
        const classDoc = await Class.findById(classId);
        if (!classDoc || classDoc.school.toString() !== req.schoolId.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid class' });
        }
        if ((classDoc.academicYear || '').toString() !== effectiveAcademicYear) {
            return res.status(400).json({
                success: false,
                message: `Class must belong to academic year ${effectiveAcademicYear}`
            });
        }
        assignment.class = classId;
        assignment.grade = classDoc.grade;
    }
    if (rawSubject !== undefined) assignment.subject = subject;
    if (rawRoom !== undefined) assignment.room = room;
    if (bodyPeriod !== undefined) assignment.period = bodyPeriod;
    if (bodyDays !== undefined) assignment.daysOfWeek = resolveAssignmentDays(bodyDays, schoolWeekWorkingDays);
    if (bodyStart !== undefined) assignment.startDate = bodyStart;
    if (bodyEnd !== undefined) assignment.endDate = bodyEnd;
    if (isActive !== undefined) assignment.isActive = isActive;
    assignment.lastModifiedBy = req.user._id;

    const teacherVal = assignment.teacher;
    const classVal = assignment.class;
    const periodVal = assignment.period;
    const daysVal = resolveAssignmentDays(assignment.daysOfWeek, schoolWeekWorkingDays);
    assignment.daysOfWeek = daysVal;
    const startVal = assignment.startDate ? new Date(assignment.startDate) : null;
    const endVal = assignment.endDate ? new Date(assignment.endDate) : null;

    if (assignment.room && startVal && endVal) {
        const roomDoc = await Room.findById(assignment.room);
        if (!roomDoc || roomDoc.school.toString() !== req.schoolId.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid room' });
        }
        const roomReadiness = evaluateRoomOperationalState(roomDoc, {
            startTime: startVal,
            endTime: endVal,
            checkAvailabilitySchedule: false
        });
        if (!roomReadiness.available) {
            return res.status(400).json({
                success: false,
                message: roomReadiness.message || 'Selected room is unavailable for this assignment.',
                code: roomReadiness.code
            });
        }
    }

    if (periodVal && startVal && endVal) {
        const { hasConflict, conflicts } = await checkAssignmentConflicts(req.schoolId, {
            teacher: teacherVal,
            class: classVal,
            room: assignment.room,
            period: periodVal,
            daysOfWeek: daysVal,
            startDate: startVal,
            endDate: endVal
        }, req.params.id, schoolWeekWorkingDays);

        if (hasConflict) {
            const reasons = [...new Set(conflicts.map(c => c.reason))];
            return res.status(400).json({
                success: false,
                message: `Conflict: ${reasons.map(r => r === 'room-exclusivity' ? 'room is already exclusively assigned to another class' : r === 'room' ? 'room already occupied' : r === 'teacher' ? 'teacher already assigned' : 'class already has a lesson').join(', ')}`,
                conflicts
            });
        }
    }

    await assignment.save();

    res.json({ success: true, data: { assignment } });
});

// @desc    Delete assignment
// @route   DELETE /api/timetable/assignments/:id
// @access  Private (Admin)
export const deleteAssignment = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const assignment = await TeacherPeriodAssignment.findById(req.params.id);
    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const classDoc = await Class.findById(assignment.class).select('academicYear');
    if (!classDoc || (classDoc.academicYear || '').toString() !== effectiveAcademicYear) {
        return res.status(404).json({
            success: false,
            message: `Assignment not found for academic year ${effectiveAcademicYear}`
        });
    }

    await assignment.deleteOne();

    res.json({ success: true, message: 'Assignment deleted' });
});

// @desc    Bulk-update startDate / endDate for all assignments in the current academic year
// @route   PUT /api/timetable/assignments/bulk-dates
// @access  Private (Admin, Department Principal)
export const bulkUpdateAssignmentDates = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    const normalizedStart = new Date(startDate);
    const normalizedEnd = new Date(endDate);
    if (Number.isNaN(normalizedStart.getTime()) || Number.isNaN(normalizedEnd.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
    }
    if (normalizedEnd <= normalizedStart) {
        return res.status(400).json({ success: false, message: 'endDate must be after startDate' });
    }

    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const classIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear: effectiveAcademicYear
    });

    const result = await TeacherPeriodAssignment.updateMany(
        { school: req.schoolId, class: { $in: classIds } },
        { $set: { startDate: normalizedStart, endDate: normalizedEnd } }
    );

    res.json({
        success: true,
        message: `Updated ${result.modifiedCount} assignment${result.modifiedCount !== 1 ? 's' : ''}`,
        data: { modifiedCount: result.modifiedCount, academicYear: effectiveAcademicYear }
    });
});

// @desc    Migrate timetable assignments from one academic year to another
// @route   POST /api/timetable/assignments/migrate-year
// @access  Private (Admin, Department Principal)
export const migrateAssignmentsYear = asyncHandler(async (req, res) => {
    const {
        sourceAcademicYear,
        targetAcademicYear,
        overwriteMode = 'skip_conflicts',
        dateMode = 'clamp_to_target_year'
    } = req.body || {};

    if (!sourceAcademicYear || !targetAcademicYear) {
        return res.status(400).json({ success: false, message: 'sourceAcademicYear and targetAcademicYear are required' });
    }
    if (sourceAcademicYear === targetAcademicYear) {
        return res.status(400).json({ success: false, message: 'Source and target academic year must be different' });
    }
    if (!['skip_conflicts', 'replace_conflicts'].includes(overwriteMode)) {
        return res.status(400).json({ success: false, message: 'Invalid overwriteMode' });
    }
    if (!['keep_relative', 'clamp_to_target_year'].includes(dateMode)) {
        return res.status(400).json({ success: false, message: 'Invalid dateMode' });
    }

    const sourceRange = resolveAcademicYearDateRange(sourceAcademicYear, req.school);
    const targetRange = resolveAcademicYearDateRange(targetAcademicYear, req.school);
    if (!sourceRange || !targetRange) {
        return res.status(400).json({ success: false, message: 'Invalid academic year range' });
    }

    const schoolWeekWorkingDays = await resolveSchoolWeekWorkingDays(req.schoolId);

    const [sourceClasses, targetClasses] = await Promise.all([
        Class.find({ school: req.schoolId, academicYear: sourceAcademicYear })
            .select('_id name section grade academicYear')
            .lean(),
        Class.find({ school: req.schoolId, academicYear: targetAcademicYear })
            .select('_id name section grade academicYear')
            .lean()
    ]);

    if (sourceClasses.length === 0) {
        return res.json({
            success: true,
            message: `No source classes found for ${sourceAcademicYear}`,
            data: {
                createdCount: 0,
                updatedCount: 0,
                skippedCount: 0,
                conflictCount: 0,
                errors: []
            }
        });
    }
    if (targetClasses.length === 0) {
        return res.status(400).json({
            success: false,
            message: `No classes found for target academic year ${targetAcademicYear}`
        });
    }

    const exactTargetClassMap = new Map();
    const looseTargetClassMap = new Map();
    const gradeTargetClassMap = new Map();
    for (const targetClass of targetClasses) {
        exactTargetClassMap.set(normalizeYearClassKey(targetClass), targetClass);
        looseTargetClassMap.set(normalizeLooseClassKey(targetClass), targetClass);
        const gradeKey = String(targetClass.grade || '');
        if (!gradeTargetClassMap.has(gradeKey)) gradeTargetClassMap.set(gradeKey, []);
        gradeTargetClassMap.get(gradeKey).push(targetClass);
    }

    const sourceClassIds = sourceClasses.map((row) => row._id);
    const sourceAssignments = await TeacherPeriodAssignment.find({
        school: req.schoolId,
        class: { $in: sourceClassIds }
    }).lean();

    const result = {
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        conflictCount: 0,
        errors: []
    };

    for (const sourceAssignment of sourceAssignments) {
        try {
            const sourceClass = sourceClasses.find((row) => row._id.toString() === sourceAssignment.class.toString());
            if (!sourceClass) {
                result.skippedCount += 1;
                result.errors.push({ assignmentId: sourceAssignment._id, reason: 'source_class_missing' });
                continue;
            }

            let targetClass = exactTargetClassMap.get(normalizeYearClassKey(sourceClass));
            if (!targetClass) targetClass = looseTargetClassMap.get(normalizeLooseClassKey(sourceClass));
            if (!targetClass) {
                const candidates = gradeTargetClassMap.get(String(sourceClass.grade || '')) || [];
                targetClass = candidates[0] || null;
            }

            if (!targetClass) {
                result.skippedCount += 1;
                result.errors.push({
                    assignmentId: sourceAssignment._id,
                    reason: 'target_class_not_found',
                    sourceClass: sourceClass.name
                });
                continue;
            }

            const teacherResolution = await resolveTeacherUserForAssignment(req.schoolId, sourceAssignment.teacher);
            if (teacherResolution.error) {
                result.skippedCount += 1;
                result.errors.push({
                    assignmentId: sourceAssignment._id,
                    reason: 'teacher_invalid',
                    detail: teacherResolution.error
                });
                continue;
            }

            const periodDoc = await TimetablePeriod.findById(sourceAssignment.period).select('_id school').lean();
            if (!periodDoc || periodDoc.school.toString() !== req.schoolId.toString()) {
                result.skippedCount += 1;
                result.errors.push({ assignmentId: sourceAssignment._id, reason: 'period_invalid' });
                continue;
            }

            let subjectId = sourceAssignment.subject || undefined;
            if (subjectId) {
                const subjectDoc = await Subject.findById(subjectId).select('_id school').lean();
                if (!subjectDoc || subjectDoc.school.toString() !== req.schoolId.toString()) {
                    subjectId = undefined;
                }
            }

            let roomId = sourceAssignment.room || undefined;
            if (roomId) {
                const roomDoc = await Room.findById(roomId).select('_id school status isAvailable').lean();
                if (!roomDoc || roomDoc.school.toString() !== req.schoolId.toString()) {
                    roomId = undefined;
                }
            }

            const migratedDates = buildMigratedDateWindow({
                sourceStartDate: sourceAssignment.startDate,
                sourceEndDate: sourceAssignment.endDate,
                sourceRange,
                targetRange,
                dateMode
            });

            const candidateDays = resolveAssignmentDays(sourceAssignment.daysOfWeek, schoolWeekWorkingDays);
            const daysSignature = candidateDays.join(',');
            const teacherUserId = teacherResolution.teacherUserId;

            const sameWindowAssignments = await TeacherPeriodAssignment.find({
                school: req.schoolId,
                teacher: teacherUserId,
                class: targetClass._id,
                period: sourceAssignment.period,
                startDate: migratedDates.startDate,
                endDate: migratedDates.endDate
            });

            const exactExisting = sameWindowAssignments.find((item) => {
                const itemDaysSignature = resolveAssignmentDays(item.daysOfWeek, schoolWeekWorkingDays).join(',');
                const sameSubject = String(item.subject || '') === String(subjectId || '');
                const sameRoom = String(item.room || '') === String(roomId || '');
                return itemDaysSignature === daysSignature && sameSubject && sameRoom;
            });

            if (exactExisting) {
                result.skippedCount += 1;
                continue;
            }

            const candidatePayload = {
                teacher: teacherUserId,
                class: targetClass._id,
                room: roomId,
                period: sourceAssignment.period,
                daysOfWeek: candidateDays,
                startDate: migratedDates.startDate,
                endDate: migratedDates.endDate
            };

            const { hasConflict, conflicts } = await checkAssignmentConflicts(
                req.schoolId,
                candidatePayload,
                null,
                schoolWeekWorkingDays
            );

            if (hasConflict) {
                if (overwriteMode === 'replace_conflicts') {
                    const conflictIds = conflicts.map((row) => row.id);
                    if (conflictIds.length > 0) {
                        await TeacherPeriodAssignment.deleteMany({
                            _id: { $in: conflictIds },
                            school: req.schoolId
                        });
                        result.updatedCount += conflictIds.length;
                    }
                } else {
                    result.conflictCount += 1;
                    result.errors.push({
                        assignmentId: sourceAssignment._id,
                        reason: 'conflict',
                        details: conflicts.map((row) => row.reason)
                    });
                    continue;
                }
            }

            await TeacherPeriodAssignment.create({
                school: req.schoolId,
                teacher: teacherUserId,
                class: targetClass._id,
                grade: targetClass.grade,
                subject: subjectId,
                room: roomId,
                period: sourceAssignment.period,
                daysOfWeek: candidateDays,
                startDate: migratedDates.startDate,
                endDate: migratedDates.endDate,
                isActive: sourceAssignment.isActive !== false,
                createdBy: req.user._id,
                lastModifiedBy: req.user._id
            });

            result.createdCount += 1;
        } catch (error) {
            result.skippedCount += 1;
            result.errors.push({
                assignmentId: sourceAssignment._id,
                reason: 'unexpected_error',
                detail: error.message
            });
        }
    }

    res.json({
        success: true,
        message: `Migration completed from ${sourceAcademicYear} to ${targetAcademicYear}`,
        data: result
    });
});

//
