import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import TeacherAbsence from '../models/TeacherAbsence.js';
import SubstitutionRequest from '../models/SubstitutionRequest.js';
import User from '../models/User.js';
import TimetablePeriod from '../models/TimetablePeriod.js';

/**
 * Get day-of-week (0=Sun .. 6=Sat) for a date, normalized to start-of-day.
 */
function getDayOfWeek(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date.getDay();
}

/**
 * Get target period IDs that the absent teacher teaches on the given date.
 * Uses TeacherPeriodAssignment: teacher + period + daysOfWeek + startDate/endDate.
 * @param {ObjectId} schoolId
 * @param {ObjectId} absentTeacherId - User._id
 * @param {Date|string} date - YYYY-MM-DD or Date
 * @returns {Promise<Array<{periodId, startTime?, endTime?, classId?, roomId?}>>}
 */
export async function getTargetPeriods(schoolId, absentTeacherId, date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = getDayOfWeek(d);
    const endOfDay = new Date(d);
    endOfDay.setHours(23, 59, 59, 999);

    const assignments = await TeacherPeriodAssignment.find({
        school: schoolId,
        teacher: absentTeacherId,
        isActive: true,
        startDate: { $lte: endOfDay },
        endDate: { $gte: d },
        $or: [
            { daysOfWeek: { $exists: false } },
            { daysOfWeek: { $size: 0 } },
            { daysOfWeek: dayOfWeek }
        ]
    })
        .populate('period', 'name startTime endTime order')
        .populate('class', 'name')
        .populate('room', 'name')
        .lean();

    const periodIds = [...new Set(assignments.map(a => a.period?._id).filter(Boolean))];
    const periodMap = {};
    for (const a of assignments) {
        if (!a.period) continue;
        const pid = a.period._id.toString();
        if (!periodMap[pid]) {
            periodMap[pid] = {
                periodId: a.period._id,
                startTime: a.period.startTime,
                endTime: a.period.endTime,
                classId: a.class?._id,
                roomId: a.room?._id
            };
        }
    }

    return Object.values(periodMap);
}

/**
 * Get teachers who are busy (scheduled, absent, or assigned as sub) for a given
 * date and set of period IDs. Returns Set of User._id strings.
 */
async function getBusyTeacherIds(schoolId, date, periodIds) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = getDayOfWeek(d);
    const endOfDay = new Date(d);
    endOfDay.setHours(23, 59, 59, 999);

    const busy = new Set();

    // 1. Teachers with scheduled classes in any of these periods on that date
    const scheduled = await TeacherPeriodAssignment.find({
        school: schoolId,
        period: { $in: periodIds },
        isActive: true,
        startDate: { $lte: endOfDay },
        endDate: { $gte: d },
        $or: [
            { daysOfWeek: { $exists: false } },
            { daysOfWeek: { $size: 0 } },
            { daysOfWeek: dayOfWeek }
        ]
    })
        .select('teacher')
        .lean();

    for (const s of scheduled) {
        if (s.teacher) busy.add(s.teacher.toString());
    }

    // 2. Teachers absent on that date
    const absences = await TeacherAbsence.find({
        school: schoolId,
        date: { $gte: d, $lte: endOfDay }
    })
        .select('teacher')
        .lean();

    for (const a of absences) {
        if (a.teacher) busy.add(a.teacher.toString());
    }

    // 3. Teachers already assigned as substitute (SUBMITTED or CONFIRMED) for date+period
    const activeSubs = await SubstitutionRequest.find({
        school: schoolId,
        date: { $gte: d, $lte: endOfDay },
        status: { $in: ['SUBMITTED', 'CONFIRMED'] },
        'assignments.periodId': { $in: periodIds }
    })
        .select('assignments')
        .lean();

    for (const req of activeSubs) {
        for (const a of req.assignments || []) {
            if (periodIds.some(pid => pid.toString() === (a.periodId || a.period)?.toString()) && a.substituteTeacherId) {
                busy.add(a.substituteTeacherId.toString());
            }
        }
    }

    return busy;
}

/**
 * Get all active teachers in the school (role=teacher, isActive).
 */
async function getSchoolTeachers(schoolId) {
    const users = await User.find({
        school: schoolId,
        role: 'teacher',
        isActive: true
    })
        .select('_id firstName lastName department')
        .setOptions({ skipTenantFilter: true })
        .lean();

    return users;
}

/**
 * Format teacher summary for API response.
 */
function toTeacherSummary(user) {
    return {
        _id: user._id,
        name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}`.trim() : 'Unknown',
        firstName: user.firstName,
        lastName: user.lastName,
        departmentId: user.department || null
    };
}

/**
 * Get substitution candidates for an absent teacher on a date.
 * @param {Object} params
 * @param {ObjectId} params.schoolId
 * @param {ObjectId} params.absentTeacherId - User._id
 * @param {Date|string} params.date - YYYY-MM-DD
 * @returns {Promise<{date, absentTeacherId, targetPeriods, candidatesAllPeriods, candidatesByPeriod}>}
 */
export async function getCandidates({ schoolId, absentTeacherId, date }) {
    const absentIdStr = absentTeacherId.toString();
    const targetPeriods = await getTargetPeriods(schoolId, absentTeacherId, date);

    if (targetPeriods.length === 0) {
        return {
            date: new Date(date).toISOString().split('T')[0],
            absentTeacherId,
            targetPeriods: [],
            candidatesAllPeriods: [],
            candidatesByPeriod: {}
        };
    }

    const periodIds = targetPeriods.map(p => p.periodId);
    const busySet = await getBusyTeacherIds(schoolId, date, periodIds);
    busySet.add(absentIdStr); // Exclude absent teacher

    const allTeachers = await getSchoolTeachers(schoolId);
    const teacherMap = {};
    for (const t of allTeachers) {
        teacherMap[t._id.toString()] = t;
    }

    // Per-period: for each period, which teachers are free
    const candidatesByPeriod = {};
    for (const p of targetPeriods) {
        const pid = p.periodId.toString();
        const busyForPeriod = await getBusyTeacherIds(schoolId, date, [p.periodId]);
        busyForPeriod.add(absentIdStr);
        const free = allTeachers.filter(t => !busyForPeriod.has(t._id.toString()));
        candidatesByPeriod[pid] = free.map(toTeacherSummary);
    }

    // Intersection: teachers free in ALL target periods
    const freeByPeriodSets = {};
    for (const pid of periodIds) {
        const busyForPeriod = await getBusyTeacherIds(schoolId, date, [pid]);
        busyForPeriod.add(absentIdStr);
        freeByPeriodSets[pid.toString()] = new Set(
            allTeachers.filter(t => !busyForPeriod.has(t._id.toString())).map(t => t._id.toString())
        );
    }

    let intersection = freeByPeriodSets[periodIds[0].toString()];
    for (let i = 1; i < periodIds.length; i++) {
        const next = freeByPeriodSets[periodIds[i].toString()];
        intersection = new Set([...intersection].filter(x => next.has(x)));
    }

    const candidatesAllPeriods = [...intersection]
        .map(id => teacherMap[id])
        .filter(Boolean)
        .map(toTeacherSummary);

    return {
        date: new Date(date).toISOString().split('T')[0],
        absentTeacherId,
        targetPeriods: targetPeriods.map(p => ({
            periodId: p.periodId,
            startTime: p.startTime,
            endTime: p.endTime,
            classId: p.classId,
            roomId: p.roomId
        })),
        candidatesAllPeriods,
        candidatesByPeriod: Object.fromEntries(
            Object.entries(candidatesByPeriod).map(([k, v]) => [k, v])
        )
    };
}
