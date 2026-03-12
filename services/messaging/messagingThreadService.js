/* eslint-disable complexity, max-lines-per-function */
import { createHttpError } from '../../utils/httpError.js';
import {
    appendMessageToThread,
    applyReadReceiptsForUser,
    emitMessageThreadEvent
} from '../messageRealtimeService.js';
import { messagingAudienceService } from './messagingAudienceService.js';
import { mapThreadDetail, mapThreadSummary } from './messagingMapperService.js';
import { messagingRepository } from './messagingRepository.js';
import {
    buildClassLabel,
    escapeRegex,
    MAX_BROADCAST_RECIPIENTS,
    normalizeEmail,
    normalizeObjectIdArray,
    parseBoolean,
    parsePositiveInt,
    toDisplayName,
    toId
} from './messagingUtils.js';

const ensureCreatePayload = ({ subject, body, recipientUserIds, classIds, includeParents, includeStudents }) => {
    if (!subject) {
        throw createHttpError({ statusCode: 400, message: 'subject is required' });
    }
    if (!body) {
        throw createHttpError({ statusCode: 400, message: 'body is required' });
    }
    if (classIds.length > 0 && !includeParents && !includeStudents) {
        throw createHttpError({
            statusCode: 400,
            message: 'Enable at least one class audience (parents or students)'
        });
    }
    if (recipientUserIds.length === 0 && classIds.length === 0) {
        throw createHttpError({
            statusCode: 400,
            message: 'Select recipients directly or choose at least one class'
        });
    }
};

const parseCreateRequest = (req) => ({
    body: (req.body?.body || '').toString().trim(),
    classIds: normalizeObjectIdArray(req.body?.classIds),
    includeParents: parseBoolean(req.body?.includeParents, true),
    includeStudents: parseBoolean(req.body?.includeStudents, false),
    recipientUserIds: normalizeObjectIdArray(req.body?.recipientUserIds),
    subject: (req.body?.subject || '').toString().trim()
});

const buildRecipientBreakdown = (recipientUsers) => recipientUsers.reduce((acc, user) => {
    if (user.role === 'parent') {
        acc.parents += 1;
    } else if (user.role === 'student') {
        acc.students += 1;
    } else {
        acc.other += 1;
    }
    return acc;
}, { parents: 0, students: 0, other: 0 });

const buildThreadPayload = ({ req, recipientUser, senderDisplayName, subject, body, now }) => ({
    school: req.schoolId,
    subject,
    participants: [
        {
            user: req.user._id,
            role: req.user.role,
            displayName: senderDisplayName,
            unreadCount: 0,
            lastReadAt: now
        },
        {
            user: recipientUser._id,
            role: recipientUser.role,
            displayName: toDisplayName(recipientUser),
            unreadCount: 1,
            lastReadAt: null
        }
    ],
    createdBy: req.user._id,
    lastMessageAt: now,
    messages: [
        {
            sender: req.user._id,
            senderRole: req.user.role,
            body,
            createdAt: now,
            deliveryReceipts: [
                {
                    user: recipientUser._id,
                    deliveredAt: now,
                    readAt: null
                }
            ]
        }
    ]
});

const filterUniqueManualRecipientIds = ({ recipientIds, actorUserId }) => {
    const uniqueIds = new Set(recipientIds);
    return [...uniqueIds].filter((id) => id !== String(actorUserId));
};

const createStudentNameMap = (students) => {
    const studentNameByEmail = new Map();

    for (const student of students) {
        const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
        if (!studentName) {
            continue;
        }

        const parentInfo = student.parentInfo || {};
        const parentEmails = [parentInfo.fatherEmail, parentInfo.motherEmail, parentInfo.guardianEmail]
            .map(normalizeEmail)
            .filter(Boolean);

        for (const email of parentEmails) {
            if (!studentNameByEmail.has(email)) {
                studentNameByEmail.set(email, new Set());
            }
            studentNameByEmail.get(email).add(studentName);
        }
    }

    return studentNameByEmail;
};

export const createMessagingThreadService = ({
    audienceService = messagingAudienceService,
    realtimeService = {
        appendMessageToThread,
        applyReadReceiptsForUser,
        emitMessageThreadEvent
    },
    repository = messagingRepository
} = {}) => {
    const resolveManualRecipients = async ({ req, recipientUserIds }) => {
        const uniqueManualRecipientIds = filterUniqueManualRecipientIds({
            recipientIds: recipientUserIds,
            actorUserId: req.user._id
        });

        if (uniqueManualRecipientIds.length === 0) {
            return [];
        }

        const manualRecipientUsers = await repository.findManualRecipientUsers({
            schoolId: req.schoolId,
            recipientIds: uniqueManualRecipientIds
        });

        const manualRecipientUserIdSet = new Set(manualRecipientUsers.map((user) => toId(user._id)));
        const hasInvalidManualRecipients = uniqueManualRecipientIds.some((id) => !manualRecipientUserIdSet.has(id));
        if (hasInvalidManualRecipients) {
            throw createHttpError({
                statusCode: 400,
                message: 'One or more selected recipients are invalid'
            });
        }

        if (req.user.role !== 'teacher') {
            return manualRecipientUsers;
        }

        const teacherScope = await audienceService.resolveClassScopeForMessaging({ req });
        if (teacherScope.allAccessibleClassIds.length === 0) {
            throw createHttpError({
                statusCode: 403,
                message: 'Teacher has no assigned classes for messaging'
            });
        }

        const teacherRecipients = await audienceService.resolveRecipientUsersForClasses({
            schoolId: req.schoolId,
            classIds: teacherScope.allAccessibleClassIds,
            includeParents: true,
            includeStudents: true
        });
        const allowedRecipientIds = new Set(teacherRecipients.recipientUsers.map((user) => toId(user._id)));

        const hasUnauthorizedRecipients = manualRecipientUsers.some((user) => !allowedRecipientIds.has(toId(user._id)));
        if (hasUnauthorizedRecipients) {
            throw createHttpError({
                statusCode: 403,
                message: 'You can only message parents and students from your assigned classes'
            });
        }

        return manualRecipientUsers;
    };

    const resolveClassRecipients = async ({ req, classIds, includeParents, includeStudents }) => {
        if (classIds.length === 0) {
            return [];
        }

        const classScope = await audienceService.resolveClassScopeForMessaging({
            req,
            requestedClassIds: classIds
        });

        if (classScope.deniedClassIds.length > 0) {
            throw createHttpError({
                statusCode: 403,
                message: 'Not authorized to message one or more selected classes',
                data: { deniedClassIds: classScope.deniedClassIds }
            });
        }

        if (classScope.allowedClassIds.length === 0) {
            throw createHttpError({
                statusCode: 400,
                message: 'No valid classes selected for messaging'
            });
        }

        return audienceService.resolveRecipientUsersForClasses({
            schoolId: req.schoolId,
            classIds: classScope.allowedClassIds,
            includeParents,
            includeStudents
        });
    };

    const createMessageThread = async ({ req }) => {
        const payload = parseCreateRequest(req);
        ensureCreatePayload(payload);

        const recipientUsersMap = new Map();

        const manualRecipients = await resolveManualRecipients({
            req,
            recipientUserIds: payload.recipientUserIds
        });
        for (const user of manualRecipients) {
            recipientUsersMap.set(toId(user._id), user);
        }

        const classRecipients = await resolveClassRecipients({
            req,
            classIds: payload.classIds,
            includeParents: payload.includeParents,
            includeStudents: payload.includeStudents
        });
        for (const user of classRecipients.recipientUsers || []) {
            recipientUsersMap.set(toId(user._id), user);
        }

        recipientUsersMap.delete(toId(req.user._id));
        const recipientUsers = [...recipientUsersMap.values()];

        if (recipientUsers.length === 0) {
            throw createHttpError({
                statusCode: 400,
                message: 'No valid recipients were found for this message'
            });
        }
        if (recipientUsers.length > MAX_BROADCAST_RECIPIENTS) {
            throw createHttpError({
                statusCode: 400,
                message: `Too many recipients selected. Maximum allowed is ${MAX_BROADCAST_RECIPIENTS}.`
            });
        }

        const now = new Date();
        const senderDisplayName = toDisplayName(req.user);
        const threadPayloads = recipientUsers.map((recipientUser) => buildThreadPayload({
            req,
            recipientUser,
            senderDisplayName,
            subject: payload.subject,
            body: payload.body,
            now
        }));

        const createdThreads = await repository.insertThreads(threadPayloads);
        const threadSummaries = createdThreads.map((thread, index) => ({
            threadId: thread._id,
            messageId: thread.messages?.[0]?._id || null,
            recipientUserId: recipientUsers[index]?._id || null
        }));

        await Promise.allSettled(createdThreads.map((thread) => realtimeService.emitMessageThreadEvent({
            thread,
            actorUser: req.user,
            event: 'message',
            message: thread.messages?.[0] || null,
            includePush: true
        })));

        const firstThread = createdThreads[0] || null;
        const firstMessage = firstThread?.messages?.[0] || null;

        return {
            messageId: firstMessage?._id || null,
            recipientBreakdown: buildRecipientBreakdown(recipientUsers),
            recipientCount: recipientUsers.length,
            threadId: firstThread?._id || null,
            threads: threadSummaries
        };
    };

    const getMessageThreads = async ({ req }) => {
        const page = parsePositiveInt(req.query.page, 1, 5000);
        const limit = parsePositiveInt(req.query.limit, 20, 100);
        const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';

        const [threads, total] = await repository.findThreadsForUser({
            schoolId: req.schoolId,
            userId: req.user._id,
            page,
            limit,
            unreadOnly
        });

        const currentUserId = toId(req.user._id);
        const items = threads.map((thread) => mapThreadSummary({ thread, currentUserId }));
        const unreadCount = items.reduce((sum, item) => sum + (item.unreadCount || 0), 0);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            },
            unreadCount
        };
    };

    const getMessageThreadById = async ({ req }) => {
        const thread = await repository.findThreadForUser({
            threadId: req.params.threadId,
            schoolId: req.schoolId,
            userId: req.user._id
        });

        if (!thread) {
            throw createHttpError({ statusCode: 404, message: 'Thread not found' });
        }

        return mapThreadDetail({ thread, currentUser: req.user });
    };

    const replyToMessageThread = async ({ req }) => {
        const body = (req.body?.body || '').toString().trim();
        if (!body) {
            throw createHttpError({ statusCode: 400, message: 'Reply body is required' });
        }

        const thread = await repository.findThreadForUser({
            threadId: req.params.threadId,
            schoolId: req.schoolId,
            userId: req.user._id
        });
        if (!thread) {
            throw createHttpError({ statusCode: 404, message: 'Thread not found' });
        }
        if (thread.isClosed === true) {
            throw createHttpError({ statusCode: 400, message: 'This conversation is closed' });
        }

        const now = new Date();
        const message = realtimeService.appendMessageToThread({
            thread,
            senderUser: req.user,
            body,
            createdAt: now
        });
        await thread.save();

        await realtimeService.emitMessageThreadEvent({
            thread,
            actorUser: req.user,
            event: 'message',
            message,
            includePush: true
        });

        return {
            threadId: thread._id,
            message: {
                id: message._id,
                body: message.body,
                senderRole: message.senderRole || req.user.role,
                senderName: toDisplayName(req.user),
                isMine: true,
                createdAt: message.createdAt || now
            }
        };
    };

    const markMessageThreadRead = async ({ req }) => {
        const thread = await repository.findThreadForUser({
            threadId: req.params.threadId,
            schoolId: req.schoolId,
            userId: req.user._id
        });

        if (!thread) {
            throw createHttpError({ statusCode: 404, message: 'Thread not found' });
        }

        const participant = thread.participants.find((item) => toId(item.user) === toId(req.user._id));
        if (participant) {
            const readAt = new Date();
            participant.unreadCount = 0;
            participant.lastReadAt = readAt;
            realtimeService.applyReadReceiptsForUser({
                thread,
                readerUserId: req.user._id,
                readAt
            });
        }

        await thread.save();
        await realtimeService.emitMessageThreadEvent({
            thread,
            actorUser: req.user,
            event: 'read',
            includePush: false
        });

        return { threadId: thread._id, unreadCount: 0 };
    };

    const getMessageClassesForMessaging = async ({ req }) => {
        const limit = parsePositiveInt(req.query.limit, 100, 500);
        const search = (req.query.search || '').toString().trim();

        const classScope = await audienceService.resolveClassScopeForMessaging({ req });
        const allAccessibleClassIds = classScope.allAccessibleClassIds || [];
        if (allAccessibleClassIds.length === 0) {
            return { classes: [] };
        }

        const searchRegex = search ? new RegExp(escapeRegex(search), 'i') : null;
        const numericGrade = search ? Number.parseInt(search, 10) : Number.NaN;
        const classDocs = await repository.findMessagingClasses({
            schoolId: req.schoolId,
            departmentId: req.departmentId,
            classIds: allAccessibleClassIds,
            searchRegex,
            numericGrade,
            limit
        });

        const selectedClassIds = classDocs.map((classDoc) => toId(classDoc._id));
        const recipientStats = await audienceService.resolveRecipientUsersForClasses({
            schoolId: req.schoolId,
            classIds: selectedClassIds,
            includeParents: true,
            includeStudents: true
        });

        const classes = classDocs.map((classDoc) => {
            const classId = toId(classDoc._id);
            const stats = recipientStats.classStats.get(classId) || {
                studentCount: 0,
                parentCount: 0,
                studentRecipientCount: 0
            };

            return {
                id: classId,
                name: classDoc.name || '',
                grade: Number.isFinite(Number(classDoc.grade)) ? Number(classDoc.grade) : null,
                section: classDoc.section || '',
                academicYear: classDoc.academicYear || '',
                label: buildClassLabel(classDoc),
                studentCount: stats.studentCount,
                parentCount: stats.parentCount,
                studentRecipientCount: stats.studentRecipientCount
            };
        });

        return { classes };
    };

    const getParentUsersForMessaging = async ({ req }) => {
        const page = parsePositiveInt(req.query.page, 1, 5000);
        const limit = parsePositiveInt(req.query.limit, 20, 100);
        const search = (req.query.search || '').toString().trim();

        const filter = { school: req.schoolId, role: 'parent' };
        let scopedParentEmailSet = null;
        let scopedClassIds = [];

        if (req.user.role === 'teacher') {
            const classScope = await audienceService.resolveClassScopeForMessaging({ req });
            scopedClassIds = classScope.allAccessibleClassIds || [];
            if (scopedClassIds.length === 0) {
                return { parents: [], pagination: { page, limit, total: 0, totalPages: 1 } };
            }

            const scopedStudents = await repository.findParentScopeStudents({
                schoolId: req.schoolId,
                classIds: scopedClassIds
            });
            scopedParentEmailSet = new Set();
            for (const student of scopedStudents) {
                const parentInfo = student.parentInfo || {};
                [parentInfo.fatherEmail, parentInfo.motherEmail, parentInfo.guardianEmail]
                    .map(normalizeEmail)
                    .filter(Boolean)
                    .forEach((email) => scopedParentEmailSet.add(email));
            }

            if (scopedParentEmailSet.size === 0) {
                return { parents: [], pagination: { page, limit, total: 0, totalPages: 1 } };
            }
            filter.email = { $in: [...scopedParentEmailSet] };
        }

        const searchRegex = search ? new RegExp(escapeRegex(search), 'i') : null;
        if (searchRegex) {
            filter.$or = [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { email: searchRegex }
            ];
        }

        const studentParentEmails = new Set();
        if (searchRegex) {
            const students = await repository.findStudentsForParentSearch({
                schoolId: req.schoolId,
                classIds: scopedClassIds,
                searchRegex
            });
            for (const student of students) {
                const parentInfo = student.parentInfo || {};
                [parentInfo.fatherEmail, parentInfo.motherEmail, parentInfo.guardianEmail]
                    .map(normalizeEmail)
                    .filter(Boolean)
                    .forEach((email) => studentParentEmails.add(email));
            }
        }

        const [parentsBySearch, total] = await repository.findParents({ filter, page, limit });
        const parentsByStudent = await repository.findParentsByEmails({
            schoolId: req.schoolId,
            emails: [...studentParentEmails].filter((email) => (
                scopedParentEmailSet ? scopedParentEmailSet.has(email) : true
            ))
        });

        const mergedParents = new Map();
        for (const parent of [...parentsBySearch, ...parentsByStudent]) {
            mergedParents.set(toId(parent._id), parent);
        }

        const mergedParentsList = [...mergedParents.values()];
        const parentEmails = mergedParentsList.map((parent) => normalizeEmail(parent.email)).filter(Boolean);
        const studentsByParentEmail = await repository.findStudentsByParentEmails({
            schoolId: req.schoolId,
            parentEmails
        });
        const studentNameByEmail = createStudentNameMap(studentsByParentEmail);

        const parents = mergedParentsList.map((parent) => {
            const email = parent.email || '';
            const studentNames = studentNameByEmail.get(normalizeEmail(email));
            return {
                id: parent._id,
                displayName: toDisplayName(parent),
                email,
                studentNames: studentNames ? [...studentNames] : []
            };
        });

        return {
            parents,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            }
        };
    };

    return {
        createMessageThread,
        getMessageClassesForMessaging,
        getMessageThreadById,
        getMessageThreads,
        getParentUsersForMessaging,
        markMessageThreadRead,
        replyToMessageThread
    };
};

export const messagingThreadService = createMessagingThreadService();
