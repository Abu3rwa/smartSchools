import { asyncHandler } from '../middleware/errorHandler.js';
import TimetablePeriod from '../models/TimetablePeriod.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Room from '../models/Room.js';
import { getClassIdsForAcademicYear, resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import { evaluateRoomOperationalState } from '../helpers/roomAvailability.js';

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

/**
 * Check for teacher/class/room conflicts in the same period with overlapping dates and days.
 * @param {string} schoolId
 * @param {object} candidate - { teacher, class, room, period, daysOfWeek, startDate, endDate }
 * @param {string|null} excludeAssignmentId - assignment id to exclude (e.g. when updating)
 * @returns {Promise<{ hasConflict: boolean, conflicts: array }>}
 */
async function checkAssignmentConflicts(schoolId, candidate, excludeAssignmentId = null) {
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

    const candidateDays = Array.from(new Set((daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : [1, 2, 3, 4, 5])));
    const conflicts = [];

    for (const existing of existingForPeriod) {
        if (excludeAssignmentId && existing._id.toString() === excludeAssignmentId.toString()) continue;

        const dateOverlap = datesOverlap(normalizedStart, normalizedEnd, new Date(existing.startDate), new Date(existing.endDate));
        if (!dateOverlap) continue;

        const dayOverlap = (existing.daysOfWeek || []).some(d => candidateDays.includes(d));
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
                daysOfWeek: existing.daysOfWeek,
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

    const teacherUser = await User.findById(teacher).setOptions({ skipTenantFilter: true });
    if (!teacherUser || teacherUser.school?.toString() !== req.schoolId.toString() || teacherUser.role !== 'teacher') {
        return res.status(400).json({ success: false, message: 'Invalid teacher' });
    }

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
        teacher,
        class: classId,
        grade: classDoc.grade,
        subject,
        room,
        period,
        daysOfWeek,
        startDate: s,
        endDate: e,
        isActive: isActive ?? true,
        createdBy: req.user._id
    };

    const { hasConflict, conflicts } = await checkAssignmentConflicts(req.schoolId, {
        teacher,
        class: classId,
        room,
        period,
        daysOfWeek,
        startDate: s,
        endDate: e
    });

    if (hasConflict) {
        const reasons = [...new Set(conflicts.map(c => c.reason))];
        return res.status(400).json({
            success: false,
            message: `Conflict: ${reasons.map(r => r === 'room' ? 'room already occupied' : r === 'teacher' ? 'teacher already assigned' : 'class already has a lesson').join(', ')} at this period`,
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
    const yearScopedClassIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear: effectiveAcademicYear,
        candidateClassIds: classId ? [classId] : null
    });

    if (yearScopedClassIds.length === 0) {
        return res.json({ success: true, data: { assignments: [], academicYear: effectiveAcademicYear } });
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

    res.json({ success: true, data: { assignments, academicYear: effectiveAcademicYear } });
});

// @desc    Get student's today schedule (by currentClass)
// @route   GET /api/timetable/my-schedule
// @access  Private (Student)
export const getStudentTimetable = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const student = await Student.findOne({ user: req.user._id, status: 'active' })
        .select('currentClass')
        .populate('currentClass', 'name grade section academicYear');
    if (!student || !student.currentClass) {
        return res.json({ success: true, data: { schedule: [] } });
    }
    if ((student.currentClass.academicYear || '').toString() !== effectiveAcademicYear) {
        return res.json({ success: true, data: { schedule: [], academicYear: effectiveAcademicYear } });
    }

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 Sun .. 6 Sat
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const assignments = await TeacherPeriodAssignment.find({
        school: req.schoolId,
        class: student.currentClass._id,
        isActive: true,
        startDate: { $lte: endOfDay },
        endDate: { $gte: startOfDay },
        $or: [
            { daysOfWeek: { $exists: false } },
            { daysOfWeek: { $size: 0 } },
            { daysOfWeek: dayOfWeek }
        ]
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

    res.json({ success: true, data: { schedule, academicYear: effectiveAcademicYear } });
});

// @desc    Get current teacher's timetable (periods + their assignments)
// @route   GET /api/timetable/my-timetable
// @access  Private (Teacher)
export const getMyTimetable = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
    const yearScopedClassIds = await getClassIdsForAcademicYear({
        schoolId: req.schoolId,
        academicYear: effectiveAcademicYear
    });
    const periods = await TimetablePeriod.find({ school: req.schoolId, isActive: true }).sort({ order: 1 });

    if (yearScopedClassIds.length === 0) {
        return res.json({ success: true, data: { periods, assignments: [], academicYear: effectiveAcademicYear } });
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

    res.json({ success: true, data: { periods, assignments, academicYear: effectiveAcademicYear } });
});

// @desc    Update assignment
// @route   PUT /api/timetable/assignments/:id
// @access  Private (Admin)
export const updateAssignment = asyncHandler(async (req, res) => {
    const effectiveAcademicYear = resolveAcademicYearForRequest(req);
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

    if (bodyTeacher !== undefined) assignment.teacher = bodyTeacher;
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
    if (bodyDays !== undefined) assignment.daysOfWeek = bodyDays;
    if (bodyStart !== undefined) assignment.startDate = bodyStart;
    if (bodyEnd !== undefined) assignment.endDate = bodyEnd;
    if (isActive !== undefined) assignment.isActive = isActive;
    assignment.lastModifiedBy = req.user._id;

    const teacherVal = assignment.teacher;
    const classVal = assignment.class;
    const periodVal = assignment.period;
    const daysVal = assignment.daysOfWeek;
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
        }, req.params.id);

        if (hasConflict) {
            const reasons = [...new Set(conflicts.map(c => c.reason))];
            return res.status(400).json({
                success: false,
                message: `Conflict: ${reasons.map(r => r === 'room' ? 'room already occupied' : r === 'teacher' ? 'teacher already assigned' : 'class already has a lesson').join(', ')} at this period`,
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

//
