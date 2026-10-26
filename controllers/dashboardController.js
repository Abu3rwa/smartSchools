import Attendance from '../models/Attendance.js';
import Class from '../models/Class.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getSchoolTimeZone } from '../helpers/attendanceEligibility.js';
import {
    resolveAcademicYearDateRange,
    resolveRequestedAcademicYear
} from '../utils/academicYear.js';
import { getViewRangeInTimeZone } from '../utils/schoolTimezone.js';

const SUMMARY_CACHE_TTL_MS = 60 * 1000;
const SUMMARY_CACHE_MAX_ENTRIES = 200;
const summaryCache = new Map();

const readSummaryCache = (key) => {
    const entry = summaryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        summaryCache.delete(key);
        return null;
    }
    return entry.value;
};

const writeSummaryCache = (key, value) => {
    if (summaryCache.size >= SUMMARY_CACHE_MAX_ENTRIES) {
        const oldestKey = summaryCache.keys().next().value;
        if (oldestKey !== undefined) summaryCache.delete(oldestKey);
    }
    summaryCache.set(key, { value, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS });
};

const buildMonthKeys = (startDate, endDate) => {
    const keys = [];
    const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
    while (cursor <= last) {
        keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return keys;
};

const resolveMonthWindow = (now) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { start, end };
};

// gradebook stamps academicYear/month at save time, so the label is the source of
// truth. Falling back to the months that actually have grades keeps the chart
// populated when a grade's date drifts outside the computed academic-year window.
export const resolveTrendMonthKeys = (windowMonthKeys, gradeMonthKeys) => {
    if (!Array.isArray(gradeMonthKeys) || gradeMonthKeys.length === 0) {
        return windowMonthKeys;
    }
    const hasOverlap = gradeMonthKeys.some((key) => windowMonthKeys.includes(key));
    return hasOverlap ? windowMonthKeys : [...gradeMonthKeys].sort();
};

// @desc    Aggregated school admin dashboard summary
// @route   GET /api/dashboard/school-admin
// @access  Private (Admin, Department Principal)
export const getSchoolAdminSummary = asyncHandler(async (req, res) => {
    const academicYear = resolveRequestedAcademicYear(req.query.academicYear, req.school);
    const cacheKey = `${req.schoolId}:${academicYear}`;
    const bypassCache = ['1', 'true'].includes(String(req.query.refresh || '').toLowerCase());

    if (!bypassCache) {
        const cached = readSummaryCache(cacheKey);
        if (cached) {
            res.set('Cache-Control', 'private, max-age=30');
            return res.json({ success: true, data: cached });
        }
    }

    const now = new Date();
    const monthWindow = resolveMonthWindow(now);
    const schoolTimeZone = await getSchoolTimeZone(req.schoolId);
    const todayRange = getViewRangeInTimeZone({ viewMode: 'today', now, timeZone: schoolTimeZone });
    const yearRange = resolveAcademicYearDateRange(academicYear, req.school);
    const trendStart = yearRange?.startDate || new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const trendEnd = yearRange?.endDate || new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999));

    const activeStudentMatch = { school: req.schoolId, status: 'active' };
    const activeClassMatch = { school: req.schoolId, isActive: true };

    const [
        totalStudents,
        totalClasses,
        totalTeachers,
        activeTeachers,
        newStudentsThisMonth,
        newClassesThisMonth,
        attendanceSummary,
        classDistribution,
        monthTrendRaw,
        recentStudents
    ] = await Promise.all([
        Student.countDocuments(activeStudentMatch),
        Class.countDocuments(activeClassMatch),
        Teacher.countDocuments({ school: req.schoolId }),
        Teacher.countDocuments({ school: req.schoolId, isActive: true }),
        Student.countDocuments({
            ...activeStudentMatch,
            createdAt: { $gte: monthWindow.start, $lte: monthWindow.end }
        }),
        Class.countDocuments({
            ...activeClassMatch,
            createdAt: { $gte: monthWindow.start, $lte: monthWindow.end }
        }),
        Attendance.aggregate([
            {
                $match: {
                    school: req.schoolId,
                    date: { $gte: todayRange.start, $lte: todayRange.end }
                }
            },
            {
                $group: {
                    _id: null,
                    totalStudents: { $sum: '$totalStudents' },
                    present: { $sum: '$present' },
                    absent: { $sum: '$absent' },
                    late: { $sum: '$late' },
                    classIds: { $addToSet: '$class' }
                }
            }
        ]),
        Student.aggregate([
            { $match: { ...activeStudentMatch, currentClass: { $ne: null } } },
            { $group: { _id: '$currentClass', students: { $sum: 1 } } },
            { $sort: { students: -1 } },
            { $limit: 8 },
            { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'classInfo' } },
            { $unwind: '$classInfo' },
            { $project: { _id: 0, id: '$_id', name: '$classInfo.name', students: 1 } }
        ]),
        Grade.aggregate([
            {
                $match: {
                    school: req.schoolId,
                    academicYear
                }
            },
            {
                $project: {
                    monthKey: {
                        $dateToString: {
                            format: '%Y-%m',
                            date: '$date',
                            timezone: schoolTimeZone
                        }
                    },
                    percentage: {
                        $cond: [
                            { $gt: ['$maxMarks', 0] },
                            { $multiply: [{ $divide: ['$marks', '$maxMarks'] }, 100] },
                            null
                        ]
                    }
                }
            },
            { $match: { percentage: { $ne: null } } },
            { $group: { _id: '$monthKey', average: { $avg: '$percentage' } } }
        ]),
        Student.find(activeStudentMatch)
            .select('firstName lastName studentId currentClass')
            .populate('currentClass', 'name')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean()
    ]);

    const attendanceTotals = attendanceSummary[0] || {};
    const attendanceTotalStudents = Number(attendanceTotals.totalStudents) || 0;
    const presentCount = Number(attendanceTotals.present) || 0;
    const lateCount = Number(attendanceTotals.late) || 0;
    const classesRecorded = Array.isArray(attendanceTotals.classIds)
        ? attendanceTotals.classIds.filter(Boolean).length
        : 0;
    const attendanceRate = attendanceTotalStudents > 0
        ? Number((((presentCount + lateCount) / attendanceTotalStudents) * 100).toFixed(1))
        : null;

    const averagesByMonth = monthTrendRaw.reduce((acc, item) => {
        acc[item._id] = Number(Number(item.average).toFixed(1));
        return acc;
    }, {});

    const performanceTrend = resolveTrendMonthKeys(
        buildMonthKeys(trendStart, trendEnd),
        Object.keys(averagesByMonth)
    ).map((monthKey) => ({
        monthKey,
        average: Object.prototype.hasOwnProperty.call(averagesByMonth, monthKey)
            ? averagesByMonth[monthKey]
            : null
    }));

    const data = {
        academicYear,
        generatedAt: now.toISOString(),
        students: {
            total: totalStudents,
            newThisMonth: newStudentsThisMonth
        },
        classes: {
            total: totalClasses,
            newThisMonth: newClassesThisMonth
        },
        teachers: {
            total: totalTeachers,
            active: activeTeachers
        },
        attendance: {
            totalStudents: attendanceTotalStudents,
            present: presentCount,
            late: lateCount,
            absent: Number(attendanceTotals.absent) || 0,
            rate: attendanceRate,
            classesRecorded,
            classesWithoutRecords: Math.max(0, totalClasses - classesRecorded)
        },
        classDistribution,
        performanceTrend,
        recentStudents: recentStudents.map((student) => ({
            _id: student._id,
            name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            studentId: student.studentId,
            className: student.currentClass?.name || null
        }))
    };

    writeSummaryCache(cacheKey, data);
    res.set('Cache-Control', 'private, max-age=30');
    res.json({ success: true, data });
});
