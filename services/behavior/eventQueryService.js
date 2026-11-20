import mongoose from 'mongoose';
import StudentBehavior from '../../models/StudentBehavior.js';
import BehaviorIncident from '../../models/BehaviorIncident.js';
import BehaviorNotification from '../../models/BehaviorNotification.js';
import BehaviorType from '../../models/BehaviorType.js';

const objectId = (value) => new mongoose.Types.ObjectId(String(value));

export const behaviorEventPipeline = ({ schoolId, studentId, classIds, includeConfidential = false, includeInactive = true }) => {
    const scope = { school: objectId(schoolId) };
    if (studentId) scope.student = objectId(studentId);
    if (classIds) scope.class = { $in: classIds.map(objectId) };
    return [
        { $match: { ...scope, ...(includeConfidential ? {} : { isConfidential: { $ne: true } }) } },
        { $lookup: {
            from: BehaviorIncident.collection.name,
            let: { entry: '$_id', school: '$school' },
            pipeline: [{ $match: { $expr: { $and: [
                { $eq: ['$routineEntry', '$$entry'] }, { $eq: ['$school', '$$school'] }
            ] } } }],
            as: '_case'
        } },
        { $set: { source: 'record', formalCase: { $arrayElemAt: ['$_case', 0] } } },
        { $unset: ['_case', 'requestFingerprint', 'originalDescription', 'attachments', 'witnesses', 'notes'] },
        { $unionWith: {
            coll: BehaviorIncident.collection.name,
            pipeline: [
                { $match: { ...scope, routineEntry: null, ...(includeInactive ? {} : { status: { $nin: ['voided', 'merged'] } }) } },
                { $set: {
                    source: 'formal', incidentDate: '$occurredAt', description: '$staffNotes', category: 'other',
                    severity: { $cond: ['$isSerious', 'high', 'medium'] }, formalCase: '$$ROOT',
                    followUpRequired: false
                } }
            ]
        } }
    ];
};

export const queryBehaviorEvents = async ({ schoolId, studentId, classIds, includeConfidential = false, match = {}, offset = 0, limit = 50 }) => {
    const [result] = await StudentBehavior.aggregate([
        ...behaviorEventPipeline({ schoolId, studentId, classIds, includeConfidential }),
        { $lookup: {
            from: BehaviorNotification.collection.name,
            let: { entry: '$_id', school: '$school', source: '$source' },
            pipeline: [{ $match: { channel: 'email', $expr: { $and: [
                { $eq: ['$school', '$$school'] },
                { $or: [
                    { $and: [{ $eq: ['$$source', 'record'] }, { $eq: ['$behaviorEntry', '$$entry'] }] },
                    { $and: [{ $eq: ['$$source', 'formal'] }, { $eq: ['$incident', '$$entry'] }] }
                ] }
            ] } } }, { $sort: { createdAt: -1, _id: -1 } }, { $project: { status: 1, blockedReason: 1, sentAt: 1 } }, { $limit: 1 }], as: '_messages'
        } },
        { $set: { _message: { $arrayElemAt: ['$_messages', 0] } } },
        { $set: { communication: {
            status: { $switch: { branches: [
                { case: { $eq: ['$_message.blockedReason', 'AWAITING_APPROVAL'] }, then: 'awaiting_review' },
                { case: { $eq: ['$_message.status', 'suppressed'] }, then: 'draft' },
                { case: { $in: ['$_message.status', ['draft', 'sending']] }, then: 'queued' }
            ], default: { $ifNull: ['$_message.status', { $cond: ['$parentNotified', 'recorded', 'not_sent'] }] } } },
            sentAt: '$_message.sentAt', method: '$parentNotificationMethod'
        } } },
        { $unset: ['_messages', '_message'] },
        { $match: match },
        { $facet: {
            items: [{ $sort: { incidentDate: -1, _id: -1 } }, { $skip: offset }, { $limit: limit }],
            total: [{ $count: 'value' }]
        } }
    ]);
    const items = await StudentBehavior.populate(result?.items || [], [
        { path: 'student', select: 'firstName lastName studentId currentClass', match: { school: schoolId } },
        { path: 'class', select: 'name grade section', match: { school: schoolId } }
    ]);
    return { items, total: result?.total?.[0]?.value || 0 };
};

export const behaviorEvidenceRows = async ({ schoolId, studentId, startDate, endDate }) => {
    const date = {};
    if (startDate) date.$gte = new Date(startDate);
    if (endDate) date.$lte = new Date(endDate);
    return StudentBehavior.aggregate([
        ...behaviorEventPipeline({ schoolId, studentId, includeInactive: false }),
        ...(Object.keys(date).length ? [{ $match: { incidentDate: date } }] : []),
        { $lookup: {
            from: BehaviorType.collection.name,
            let: { type: '$formalCase.behaviorType', school: '$school' },
            pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$_id', '$$type'] }, { $eq: ['$school', '$$school'] }] } } }, { $project: { name: 1 } }],
            as: '_type'
        } },
        { $set: { typeName: { $arrayElemAt: ['$_type.name', 0] } } },
        { $project: {
            incidentDate: 1, severity: 1, category: 1, incidentType: 1, source: 1, typeName: 1,
            status: 1, followUpRequired: 1, followUpCompletedAt: 1,
            'formalCase.status': 1, 'formalCase.isSerious': 1
        } },
        { $sort: { incidentDate: -1, _id: -1 } }
    ]);
};
