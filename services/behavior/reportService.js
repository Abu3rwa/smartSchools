import mongoose from 'mongoose';
import BehaviorIncident from '../../models/BehaviorIncident.js';
import BehaviorTask from '../../models/BehaviorTask.js';
import BehaviorNotification from '../../models/BehaviorNotification.js';
import { assertStaffCanAccessStudent } from './accessService.js';
import { getBehaviorSettings } from './settingsService.js';
import { liveEmailDeliveryEnabled } from './emailDeliveryService.js';
import { BEHAVIOR_NOTIFICATION_STATUSES } from '../../constants/behavior.js';

/**
 * Reports run as aggregations instead of list-and-count loops so a whole term of
 * incidents is read in one pass per section.
 */

const rangeMatch = (query = {}) => {
    const occurredAt = {};
    if (query.from && !Number.isNaN(new Date(query.from).getTime())) occurredAt.$gte = new Date(query.from);
    if (query.to && !Number.isNaN(new Date(query.to).getTime())) occurredAt.$lte = new Date(query.to);
    return Object.keys(occurredAt).length ? { occurredAt } : {};
};

const trendMatch = (query = {}) => {
    const createdAt = {};
    if (query.from && !Number.isNaN(new Date(query.from).getTime())) createdAt.$gte = new Date(query.from);
    if (query.to && !Number.isNaN(new Date(query.to).getTime())) createdAt.$lte = new Date(query.to);
    return Object.keys(createdAt).length ? { createdAt } : {};
};

const INCIDENT_STATUSES = [
    'logged', 'pending_approval', 'approved', 'notified', 'in_progress',
    'closed', 'consequence_rejected', 'voided', 'merged'
];

const TASK_STATUSES = ['assigned', 'submitted', 'needs_revision', 'completed', 'overdue', 'waived'];

const statusFacet = (match) => BehaviorIncident.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } }
]);

const behaviorFacet = (match) => BehaviorIncident.aggregate([
    { $match: match },
    {
        $lookup: {
            from: 'behavior_types',
            localField: 'behaviorType',
            foreignField: '_id',
            as: 'behavior'
        }
    },
    { $unwind: '$behavior' },
    {
        $group: {
            _id: '$behaviorType',
            name: { $first: '$behavior.name' },
            level: { $first: '$behavior.level' },
            incidents: { $sum: 1 },
            students: { $addToSet: '$student' }
        }
    },
    {
        $project: {
            _id: 0,
            behaviorType: '$_id',
            name: 1,
            level: 1,
            incidents: 1,
            students: { $size: '$students' }
        }
    },
    { $sort: { incidents: -1, level: 1 } }
]);

const stepFacet = (match) => BehaviorIncident.aggregate([
    { $match: { ...match, 'appliedStep.order': { $gt: 0 } } },
    {
        $group: {
            _id: '$appliedStep.order',
            incidents: { $sum: 1 },
            overrides: { $sum: { $cond: [{ $ne: ['$overrideReason', ''] }, 1, 0] } }
        }
    },
    { $project: { _id: 0, order: '$_id', incidents: 1, overrides: 1 } },
    { $sort: { order: 1 } }
]);

const studentFacet = (match) => BehaviorIncident.aggregate([
    { $match: match },
    {
        $group: {
            _id: '$student',
            incidents: { $sum: 1 },
            behaviors: { $addToSet: '$behaviorType' },
            serious: { $sum: { $cond: ['$isSerious', 1, 0] } }
        }
    },
    { $sort: { incidents: -1 } },
    { $limit: 20 },
    {
        $lookup: {
            from: 'students',
            localField: '_id',
            foreignField: '_id',
            as: 'student'
        }
    },
    { $unwind: '$student' },
    {
        $project: {
            _id: 0,
            student: '$student._id',
            firstName: '$student.firstName',
            lastName: '$student.lastName',
            studentId: '$student.studentId',
            incidents: 1,
            distinctBehaviors: { $size: '$behaviors' },
            serious: 1
        }
    }
]);

const approvalFacet = (match) => BehaviorIncident.aggregate([
    { $match: { ...match, 'approval.decidedAt': { $ne: null } } },
    {
        $project: {
            decision: '$approval.decision',
            hours: {
                $divide: [{ $subtract: ['$approval.decidedAt', '$approval.requestedAt'] }, 3600000]
            }
        }
    },
    {
        $group: {
            _id: null,
            decided: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$decision', 'approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$decision', 'rejected'] }, 1, 0] } },
            avgHours: { $avg: '$hours' },
            maxHours: { $max: '$hours' }
        }
    },
    {
        $project: {
            _id: 0,
            decided: 1,
            approved: 1,
            rejected: 1,
            avgHours: { $round: ['$avgHours', 1] },
            maxHours: { $round: ['$maxHours', 1] }
        }
    }
]);

const trendFacet = (match) => BehaviorIncident.aggregate([
    { $match: match },
    {
        $group: {
            // $year/$week are available on every supported server, unlike
            // $dateTrunc, and the client renders "2026-W41" from the pair.
            _id: { year: { $year: '$occurredAt' }, week: { $week: '$occurredAt' } },
            incidents: { $sum: 1 },
            serious: { $sum: { $cond: ['$isSerious', 1, 0] } }
        }
    },
    { $project: { _id: 0, year: '$_id.year', week: '$_id.week', incidents: 1, serious: 1 } },
    { $sort: { year: 1, week: 1 } }
]);

const toStatusList = (rows, universe) => {
    const byStatus = new Map(rows.map((row) => [row._id, row.count]));
    return universe.map((status) => ({ status, count: byStatus.get(status) || 0 }));
};

/**
 * One call backs the reports tab. Sections run in parallel and each is a single
 * aggregation, so the page never downloads incident rows to count them.
 */
export const getBehaviorReports = async ({ req, query = {} }) => {
    const match = { school: req.schoolId, ...rangeMatch(query) };
    const taskMatch = { school: req.schoolId, ...trendMatch(query) };

    const [
        incidentStatusRows,
        behaviorRows,
        stepRows,
        studentRows,
        approvalRows,
        trendRows,
        taskStatusRows,
        openTasks,
        overdueTasks,
        pendingApprovals,
        flagged,
        emailStatusRows,
        settings
    ] = await Promise.all([
        statusFacet(match),
        behaviorFacet(match),
        stepFacet(match),
        studentFacet(match),
        approvalFacet(match),
        trendFacet(match),
        BehaviorTask.aggregate([
            { $match: taskMatch },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        BehaviorTask.countDocuments({
            school: req.schoolId,
            status: { $in: ['assigned', 'submitted', 'needs_revision', 'overdue'] }
        }),
        BehaviorTask.countDocuments({ school: req.schoolId, status: 'overdue' }),
        BehaviorIncident.countDocuments({ school: req.schoolId, status: 'pending_approval' }),
        BehaviorIncident.countDocuments({ school: req.schoolId, flagForAdmin: true }),
        BehaviorNotification.aggregate([
            { $match: { school: req.schoolId, channel: 'email' } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        getBehaviorSettings(req.schoolId)
    ]);

    const counted = incidentStatusRows
        .filter((row) => !['voided', 'merged'].includes(row._id))
        .reduce((sum, row) => sum + row.count, 0);

    const emailCounts = toStatusList(emailStatusRows, BEHAVIOR_NOTIFICATION_STATUSES)
        .reduce((sum, row) => ({ ...sum, [row.status]: row.count }), {});

    return {
        range: { from: query.from || null, to: query.to || null },
        totals: {
            incidents: incidentStatusRows.reduce((sum, row) => sum + row.count, 0),
            counted,
            openTasks,
            overdueTasks,
            pendingApprovals,
            flagged
        },
        byStatus: toStatusList(incidentStatusRows, INCIDENT_STATUSES),
        byBehavior: behaviorRows,
        byStep: stepRows,
        byTaskStatus: toStatusList(taskStatusRows, TASK_STATUSES),
        byWeek: trendRows,
        topStudents: studentRows,
        approval: approvalRows[0] || { decided: 0, approved: 0, rejected: 0, avgHours: null, maxHours: null },
        // Two switches decide whether a draft can leave: the school's own flag
        // and the deployment-wide gate. The report says which one is holding.
        emailDelivery: {
            transportEnabled: settings?.emailDelivery?.enabled === true && liveEmailDeliveryEnabled(),
            schoolSwitchOn: settings?.emailDelivery?.enabled === true,
            counts: emailCounts,
            draftedOrSuppressed: (emailCounts.draft || 0) + (emailCounts.suppressed || 0)
        }
    };
};

/**
 * Per-student escalation history for the student drawer: occurrence numbers,
 * applied steps and the window each was counted in.
 */
export const getStudentBehaviorTrend = async ({ req, studentId, limit = 50 }) => {
    if (!mongoose.isValidObjectId(studentId)) throw Object.assign(new Error('Invalid student id'), { statusCode: 400 });
    const access = await assertStaffCanAccessStudent(req, studentId);
    if (access.error) {
        throw Object.assign(new Error(access.error.message), { statusCode: access.error.status });
    }

    const filter = { school: req.schoolId, student: studentId };
    const [items, byBehavior, openTasks] = await Promise.all([
        BehaviorIncident.find(filter)
            .sort({ occurredAt: -1 })
            .limit(Math.min(Number(limit) || 50, 200))
            .select('occurredAt status behaviorType appliedStep suggestedStep countSnapshot overrideReason isSerious')
            .populate('behaviorType', 'name level')
            .lean(),
        BehaviorIncident.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: { behaviorType: '$behaviorType', windowKey: '$countSnapshot.windowKey' },
                    occurrences: { $max: '$countSnapshot.occurrence' },
                    mode: { $first: '$countSnapshot.mode' }
                }
            },
            {
                $lookup: {
                    from: 'behavior_types',
                    localField: '._id.behaviorType',
                    foreignField: '_id',
                    as: 'behavior'
                }
            },
            { $unwind: '$behavior' },
            {
                $project: {
                    _id: 0,
                    behaviorType: '$_id.behaviorType',
                    name: '$behavior.name',
                    level: '$behavior.level',
                    windowKey: '$_id.windowKey',
                    mode: 1,
                    occurrences: 1
                }
            },
            { $sort: { occurrences: -1 } }
        ]),
        BehaviorTask.countDocuments({
            school: req.schoolId,
            student: studentId,
            status: { $in: ['assigned', 'submitted', 'needs_revision', 'overdue'] }
        })
    ]);

    return { incidents: items, windows: byBehavior, openTasks };
};
