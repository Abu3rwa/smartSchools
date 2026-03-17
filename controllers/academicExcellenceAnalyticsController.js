import mongoose from 'mongoose';
import AcademicExcellenceObjective from '../models/AcademicExcellenceObjective.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    getSchoolAcademicExcellenceSettings,
    updateSchoolAcademicExcellenceSettings,
    getEffectiveAcademicExcellenceThresholds
} from '../services/academicExcellenceSettingsService.js';

/* ─── helpers ────────────────────────────────────────────────────────── */

const parsePagination = (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(query.limit) || 20));
    return { page, limit };
};

/* ─── Analytics (mounted on /schools/:schoolId/academic-excellence) ── */

/**
 * GET /schools/:schoolId/academic-excellence/analytics
 * School-wide analytics: mastery distribution, class comparison, weakest objectives.
 */
export const getSchoolAcademicExcellenceAnalytics = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { classId, subjectId, academicYear, semester } = req.query;

    const match = { school: new mongoose.Types.ObjectId(schoolId) };
    if (classId && mongoose.Types.ObjectId.isValid(classId)) {
        match.class = new mongoose.Types.ObjectId(classId);
    }
    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
        match.subject = new mongoose.Types.ObjectId(subjectId);
    }
    // AcademicExcellenceObjective.academicYear is ObjectId in this codebase.
    // Ignore non-ObjectId values from UI selectors to avoid filtering out all rows.
    if (academicYear && mongoose.Types.ObjectId.isValid(academicYear)) {
        match.academicYear = new mongoose.Types.ObjectId(academicYear);
    }
    // semester is not a persisted field on AcademicExcellenceObjective; do not filter by it.
    void semester;

    const [distribution, classComparison, weakestObjectives, subjectBreakdown, summaryAgg] = await Promise.all([
        // Overall mastery distribution
        AcademicExcellenceObjective.aggregate([
            { $match: match },
            { $group: { _id: '$masteryLevel', count: { $sum: 1 } } }
        ]),
        // Per-class mastery rates
        AcademicExcellenceObjective.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$class',
                    total: { $sum: 1 },
                    mastered: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'mastered'] }, 1, 0] } },
                    progressing: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'progressing'] }, 1, 0] } },
                    notMet: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'not_met'] }, 1, 0] } }
                }
            },
            {
                $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'classDoc' }
            },
            { $unwind: { path: '$classDoc', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    className: { $concat: ['$classDoc.name', ' - ', { $ifNull: ['$classDoc.section', ''] }] },
                    total: 1,
                    mastered: 1,
                    progressing: 1,
                    notMet: 1,
                    masteryRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$mastered', '$total'] }, 100] }] },
                    avgMastery: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$mastered', '$total'] }, 100] }] }
                }
            },
            { $sort: { masteryRate: -1 } }
        ]),
        // Objectives with lowest mastery (top 10 weakest)
        AcademicExcellenceObjective.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$objectiveKey',
                    total: { $sum: 1 },
                    mastered: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'mastered'] }, 1, 0] } },
                    objectiveName: { $first: '$objectiveName' },
                    avgScore: { $avg: '$masteryScore' },
                    classes: { $addToSet: '$class' }
                }
            },
            {
                $project: {
                    objectiveKey: '$_id',
                    total: 1,
                    mastered: 1,
                    objectiveName: { $ifNull: ['$objectiveName', '$_id'] },
                    avgScore: { $round: [{ $ifNull: ['$avgScore', 0] }, 1] },
                    classesAffected: { $size: '$classes' },
                    masteryRate: { $cond: [{ $eq: ['$total', 0] }, 0, { $multiply: [{ $divide: ['$mastered', '$total'] }, 100] }] },
                    belowMasteryPercent: {
                        $cond: [{ $eq: ['$total', 0] }, 0, {
                            $subtract: [100, { $multiply: [{ $divide: ['$mastered', '$total'] }, 100] }]
                        }]
                    }
                }
            },
            { $sort: { masteryRate: 1 } },
            { $limit: 10 }
        ]),
        // Per-subject breakdown
        AcademicExcellenceObjective.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$subject',
                    total: { $sum: 1 },
                    mastered: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'mastered'] }, 1, 0] } }
                }
            },
            {
                $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subjectDoc' }
            },
            { $unwind: { path: '$subjectDoc', preserveNullAndEmptyArrays: true } },
            { $project: { _id: 1, name: '$subjectDoc.name', total: 1, mastered: 1 } }
        ]),
        AcademicExcellenceObjective.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalStudents: { $addToSet: '$student' },
                    atRiskCount: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'at_risk'] }, 1, 0] } },
                    masteredCount: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'mastered'] }, 1, 0] } },
                    totalObjectives: { $sum: 1 },
                    tasksCompleted: { $sum: { $ifNull: ['$practiceTasksCompleted', 0] } }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalStudents: { $size: '$totalStudents' },
                    atRiskCount: 1,
                    masteredCount: 1,
                    totalObjectives: 1,
                    tasksCompleted: 1,
                    avgMastery: {
                        $cond: [{ $eq: ['$totalObjectives', 0] }, 0, {
                            $multiply: [{ $divide: ['$masteredCount', '$totalObjectives'] }, 100]
                        }]
                    },
                    atRiskPercent: {
                        $cond: [{ $eq: ['$totalObjectives', 0] }, 0, {
                            $multiply: [{ $divide: ['$atRiskCount', '$totalObjectives'] }, 100]
                        }]
                    }
                }
            }
        ])
    ]);

    const masteryDistribution = {};
    for (const d of distribution) {
        masteryDistribution[d._id || 'unknown'] = d.count;
    }

    const totalObjectives = Object.values(masteryDistribution).reduce((a, b) => a + b, 0);
    const masteredCount = masteryDistribution.mastered || 0;
    const overallMasteryRate = totalObjectives > 0 ? Math.round((masteredCount / totalObjectives) * 100) : 0;
    const summarySource = summaryAgg?.[0] || {};
    const summary = {
        totalStudents: Number(summarySource.totalStudents || 0),
        atRiskPercent: Math.round(Number(summarySource.atRiskPercent || 0)),
        avgMastery: Math.round(Number(summarySource.avgMastery || 0)),
        tasksCompleted: Number(summarySource.tasksCompleted || 0),
        objectivesMastered: Number(summarySource.masteredCount || 0)
    };

    const progressTrend = [
        {
            label: 'Current',
            avgMastery: summary.avgMastery,
            atRiskPercent: summary.atRiskPercent
        }
    ];

    res.json({
        success: true,
        data: {
            summary,
            totalObjectives,
            overallMasteryRate,
            masteryDistribution,
            progressTrend,
            classComparison,
            weakestObjectives,
            subjects: subjectBreakdown
        }
    });
});

/**
 * GET /schools/:schoolId/academic-excellence/at-risk
 * Students with most "not_met" objectives.
 */
export const getSchoolAcademicExcellenceAtRisk = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { classId, subjectId, academicYear, semester } = req.query;
    const { page, limit } = parsePagination(req.query);

    const match = { school: new mongoose.Types.ObjectId(schoolId), masteryLevel: 'at_risk' };
    if (classId && mongoose.Types.ObjectId.isValid(classId)) {
        match.class = new mongoose.Types.ObjectId(classId);
    }
    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
        match.subject = new mongoose.Types.ObjectId(subjectId);
    }
    if (academicYear && mongoose.Types.ObjectId.isValid(academicYear)) {
        match.academicYear = new mongoose.Types.ObjectId(academicYear);
    }
    // semester is not persisted on AcademicExcellenceObjective; ignore it.
    void semester;

    const pipeline = [
        { $match: match },
        {
            $group: {
                _id: '$student',
                atRiskCount: { $sum: 1 },
                masteryScore: { $avg: '$masteryScore' },
                trend: { $first: '$trend' },
                classId: { $first: '$class' },
                subjectId: { $first: '$subject' }
            }
        },
        { $sort: { atRiskCount: -1 } },
        {
            $facet: {
                metadata: [{ $count: 'total' }],
                data: [
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                    {
                        $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'studentDoc' }
                    },
                    { $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: { from: 'classes', localField: 'classId', foreignField: '_id', as: 'classDoc' }
                    },
                    { $unwind: { path: '$classDoc', preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: { from: 'subjects', localField: 'subjectId', foreignField: '_id', as: 'subjectDoc' }
                    },
                    { $unwind: { path: '$subjectDoc', preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            _id: 1,
                            studentName: {
                                $trim: {
                                    input: {
                                        $concat: [
                                            { $ifNull: ['$studentDoc.firstName', ''] },
                                            ' ',
                                            { $ifNull: ['$studentDoc.lastName', ''] }
                                        ]
                                    }
                                }
                            },
                            firstName: '$studentDoc.firstName',
                            lastName: '$studentDoc.lastName',
                            studentId: '$studentDoc.studentId',
                            className: {
                                $trim: {
                                    input: {
                                        $concat: [
                                            { $ifNull: ['$classDoc.name', ''] },
                                            ' ',
                                            { $ifNull: ['$classDoc.section', ''] }
                                        ]
                                    }
                                }
                            },
                            subjectName: '$subjectDoc.name',
                            masteryScore: { $round: [{ $ifNull: ['$masteryScore', 0] }, 1] },
                            trend: { $ifNull: ['$trend', 'stable'] },
                            pendingTasksCount: { $literal: 0 },
                            atRiskCount: 1
                        }
                    }
                ]
            }
        }
    ];

    const [result] = await AcademicExcellenceObjective.aggregate(pipeline);
    const total = result.metadata[0]?.total || 0;

    res.json({
        success: true,
        data: {
            students: result.data,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        }
    });
});

/* ─── Settings ───────────────────────────────────────────────────── */

/**
 * GET /schools/:schoolId/academic-excellence/settings
 */
export const getAcademicExcellenceSettings = asyncHandler(async (req, res) => {
    const settings = await getSchoolAcademicExcellenceSettings(req.schoolId);
    res.json({ success: true, data: settings });
});

/**
 * PATCH /schools/:schoolId/academic-excellence/settings
 */
export const updateAcademicExcellenceSettings = asyncHandler(async (req, res) => {
    const updated = await updateSchoolAcademicExcellenceSettings(req.schoolId, req.body);
    res.json({ success: true, data: updated });
});

/* ─── CSV Export ─────────────────────────────────────────────────── */

/**
 * GET /schools/:schoolId/academic-excellence/export
 * Download objectives data as CSV.
 */
export const exportAcademicExcellenceReport = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { classId, subjectId, academicYear, semester, format } = req.query;

    const match = { school: new mongoose.Types.ObjectId(schoolId) };
    if (classId) match.class = new mongoose.Types.ObjectId(classId);
    if (subjectId) match.subject = new mongoose.Types.ObjectId(subjectId);
    if (academicYear) match.academicYear = academicYear;
    if (semester) match.semester = semester;

    const objectives = await AcademicExcellenceObjective.find(match)
        .populate('student', 'firstName lastName studentId')
        .populate('subject', 'name')
        .populate('class', 'name section')
        .sort({ objectiveKey: 1 })
        .lean();

    // Build CSV
    const header = 'Student ID,Student Name,Class,Subject,Objective Key,Description,Mastery Level,Score,Trend';
    const rows = objectives.map((o) => {
        const studentName = o.student ? `${o.student.firstName || ''} ${o.student.lastName || ''}`.trim() : '';
        const className = o.class ? `${o.class.name || ''} ${o.class.section || ''}`.trim() : '';
        const subjectName = o.subject?.name || '';
        const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        return [
            escape(o.student?.studentId),
            escape(studentName),
            escape(className),
            escape(subjectName),
            escape(o.objectiveKey),
            escape(o.objectiveDescription),
            escape(o.masteryLevel),
            o.currentScore ?? '',
            escape(o.trend)
        ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="academic-excellence-report.csv"');
    res.send(csv);
});
