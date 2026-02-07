import asyncHandler from 'express-async-handler';
import TimetablePeriod from '../models/TimetablePeriod.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';

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

    const normalizedCandidate = {
        startDate: new Date(s.setHours(0, 0, 0, 0)),
        endDate: new Date(e.setHours(23, 59, 59, 999))
    };

    // Conflict checks: same period, overlapping dates, shared day-of-week
    const existingForPeriod = await TeacherPeriodAssignment.find({
        school: req.schoolId,
        isActive: true,
        period: period
    });

    const candidateDays = Array.from(new Set((daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : [1, 2, 3, 4, 5])));

    const conflicts = [];

    for (const existing of existingForPeriod) {
        const dateOverlap = datesOverlap(normalizedCandidate.startDate, normalizedCandidate.endDate, new Date(existing.startDate), new Date(existing.endDate));
        if (!dateOverlap) continue;

        const dayOverlap = (existing.daysOfWeek || []).some(d => candidateDays.includes(d));
        if (!dayOverlap) continue;

        const isTeacherConflict = existing.teacher.toString() === teacher;
        const isClassConflict = existing.class.toString() === classId;
        const isRoomConflict = room && existing.room && existing.room.toString() === room;

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

    if (conflicts.length > 0) {
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

    const query = { school: req.schoolId };
    if (activeOnly === 'true') query.isActive = true;
    if (teacher) query.teacher = teacher;
    if (classId) query.class = classId;
    if (period) query.period = period;

    const assignments = await TeacherPeriodAssignment.find(query)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .populate('period', 'name startTime endTime order')
        .sort({ startDate: 1 });

    res.json({ success: true, data: { assignments } });
});

// @desc    Get current teacher's timetable (periods + their assignments)
// @route   GET /api/timetable/my-timetable
// @access  Private (Teacher)
export const getMyTimetable = asyncHandler(async (req, res) => {
    const periods = await TimetablePeriod.find({ school: req.schoolId, isActive: true }).sort({ order: 1 });

    const assignments = await TeacherPeriodAssignment.find({
        school: req.schoolId,
        teacher: req.user._id,
        isActive: true
    })
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .populate('period', 'name startTime endTime order')
        .sort({ 'period.order': 1 });

    res.json({ success: true, data: { periods, assignments } });
});

// @desc    Update assignment
// @route   PUT /api/timetable/assignments/:id
// @access  Private (Admin)
export const updateAssignment = asyncHandler(async (req, res) => {
    const assignment = await TeacherPeriodAssignment.findById(req.params.id);
    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

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

    if (teacher !== undefined) assignment.teacher = teacher;
    if (classId !== undefined) {
        const classDoc = await Class.findById(classId);
        if (!classDoc || classDoc.school.toString() !== req.schoolId.toString()) {
            return res.status(400).json({ success: false, message: 'Invalid class' });
        }
        assignment.class = classId;
        assignment.grade = classDoc.grade;
    }
    if (subject !== undefined) assignment.subject = subject;
    if (room !== undefined) assignment.room = room;
    if (period !== undefined) assignment.period = period;
    if (daysOfWeek !== undefined) assignment.daysOfWeek = daysOfWeek;
    if (startDate !== undefined) assignment.startDate = startDate;
    if (endDate !== undefined) assignment.endDate = endDate;
    if (isActive !== undefined) assignment.isActive = isActive;
    assignment.lastModifiedBy = req.user._id;

    await assignment.save();

    res.json({ success: true, data: { assignment } });
});

// @desc    Delete assignment
// @route   DELETE /api/timetable/assignments/:id
// @access  Private (Admin)
export const deleteAssignment = asyncHandler(async (req, res) => {
    const assignment = await TeacherPeriodAssignment.findById(req.params.id);
    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await assignment.deleteOne();

    res.json({ success: true, message: 'Assignment deleted' });
});
