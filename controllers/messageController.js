import { asyncHandler } from '../middleware/errorHandler.js';
import User from '../models/User.js';
import ParentMessageThread from '../models/ParentMessageThread.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { getTeacherClassIds, resolveTeacherProfile } from '../helpers/teacherScoping.js';

const parsePositiveInt = (raw, fallback, max = 100) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
};

const toId = (value) => (value == null ? '' : String(value));

const toDisplayName = (user) => {
    const firstName = user?.firstName || '';
    const lastName = user?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || user?.email || 'User';
};

const MAX_BROADCAST_RECIPIENTS = 1500;
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeObjectIdArray = (values) => {
    if (!Array.isArray(values)) return [];
    const deduped = new Set();
    for (const value of values) {
        const normalized = String(value || '').trim();
        if (!OBJECT_ID_PATTERN.test(normalized)) continue;
        deduped.add(normalized);
    }
    return [...deduped];
};

const parseBoolean = (raw, fallback = false) => {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') return BOOLEAN_TRUE_VALUES.has(raw.trim().toLowerCase());
    return fallback;
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildClassLabel = (classDoc) => {
    const gradeLabel = Number.isFinite(Number(classDoc?.grade))
        ? `Grade ${classDoc.grade}`
        : '';
    const sectionLabel = (classDoc?.section || '').toString().trim();
    const name = (classDoc?.name || '').toString().trim();

    const parts = [name, gradeLabel, sectionLabel].filter((item) => item.length > 0);
    if (parts.length === 0) return 'Class';
    return parts.join(' · ');
};

const resolveClassScopeForMessaging = async ({ req, requestedClassIds = [] }) => {
    const normalizedRequestedClassIds = normalizeObjectIdArray(requestedClassIds);
    const requestedSet = new Set(normalizedRequestedClassIds);

    if (req.user.role === 'teacher') {
        const teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) {
            return {
                allowedClassIds: [],
                deniedClassIds: normalizedRequestedClassIds,
                allAccessibleClassIds: []
            };
        }

        const teacherClassIds = await getTeacherClassIds(teacherProfile._id);
        const teacherClassIdStrings = teacherClassIds.map((id) => toId(id));
        const allowedSet = new Set(teacherClassIdStrings);
        const allowedClassIds = normalizedRequestedClassIds.length > 0
            ? normalizedRequestedClassIds.filter((id) => allowedSet.has(id))
            : teacherClassIdStrings;
        const deniedClassIds = normalizedRequestedClassIds.filter((id) => !allowedSet.has(id));

        return {
            allowedClassIds,
            deniedClassIds,
            allAccessibleClassIds: teacherClassIdStrings
        };
    }

    const baseQuery = { school: req.schoolId, isActive: true };
    if (req.departmentId) {
        baseQuery.department = req.departmentId;
    }

    if (normalizedRequestedClassIds.length > 0) {
        const foundClasses = await Class.find({
            ...baseQuery,
            _id: { $in: normalizedRequestedClassIds }
        }).select('_id');
        const foundSet = new Set(foundClasses.map((item) => toId(item._id)));
        return {
            allowedClassIds: [...foundSet],
            deniedClassIds: normalizedRequestedClassIds.filter((id) => !foundSet.has(id)),
            allAccessibleClassIds: [...foundSet]
        };
    }

    const allClasses = await Class.find(baseQuery).select('_id');
    const allClassIds = allClasses.map((item) => toId(item._id));
    return {
        allowedClassIds: allClassIds,
        deniedClassIds: [],
        allAccessibleClassIds: allClassIds
    };
};

const resolveRecipientUsersForClasses = async ({
    schoolId,
    classIds = [],
    includeParents = true,
    includeStudents = false
}) => {
    const normalizedClassIds = normalizeObjectIdArray(classIds);
    const classStats = new Map(
        normalizedClassIds.map((classId) => [classId, {
            studentCount: 0,
            parentCount: 0,
            studentRecipientCount: 0
        }])
    );

    if (normalizedClassIds.length === 0 || (!includeParents && !includeStudents)) {
        return { recipientUsers: [], classStats };
    }

    const students = await Student.find({
        school: schoolId,
        currentClass: { $in: normalizedClassIds },
        status: 'active'
    }).select('currentClass user email studentEmail parentInfo');

    const classParentEmails = new Map(normalizedClassIds.map((id) => [id, new Set()]));
    const classStudentUserIds = new Map(normalizedClassIds.map((id) => [id, new Set()]));
    const classStudentEmails = new Map(normalizedClassIds.map((id) => [id, new Set()]));
    const allParentEmails = new Set();
    const allStudentUserIds = new Set();
    const allStudentEmails = new Set();

    for (const student of students) {
        const classId = toId(student.currentClass);
        if (!classStats.has(classId)) continue;

        const nextStats = classStats.get(classId);
        nextStats.studentCount += 1;

        if (includeParents) {
            const parentInfo = student.parentInfo || {};
            const emails = [
                normalizeEmail(parentInfo.fatherEmail),
                normalizeEmail(parentInfo.motherEmail),
                normalizeEmail(parentInfo.guardianEmail)
            ].filter(Boolean);
            for (const email of emails) {
                classParentEmails.get(classId).add(email);
                allParentEmails.add(email);
            }
        }

        if (includeStudents) {
            const userId = toId(student.user);
            if (OBJECT_ID_PATTERN.test(userId)) {
                classStudentUserIds.get(classId).add(userId);
                allStudentUserIds.add(userId);
            }

            const studentEmails = [normalizeEmail(student.email), normalizeEmail(student.studentEmail)]
                .filter(Boolean);
            for (const email of studentEmails) {
                classStudentEmails.get(classId).add(email);
                allStudentEmails.add(email);
            }
        }
    }

    const recipientUserMap = new Map();

    if (includeStudents) {
        const studentUsersById = allStudentUserIds.size > 0
            ? await User.find({
                school: schoolId,
                role: 'student',
                _id: { $in: [...allStudentUserIds] }
            }).select('_id role firstName lastName email')
            : [];
        const validStudentUserIdSet = new Set(studentUsersById.map((user) => toId(user._id)));

        for (const user of studentUsersById) {
            recipientUserMap.set(toId(user._id), user);
        }

        const studentUsersByEmail = allStudentEmails.size > 0
            ? await User.find({
                school: schoolId,
                role: 'student',
                email: { $in: [...allStudentEmails] }
            }).select('_id role firstName lastName email')
            : [];
        const studentUserIdsByEmail = new Map();
        for (const user of studentUsersByEmail) {
            const email = normalizeEmail(user.email);
            if (!email) continue;
            if (!studentUserIdsByEmail.has(email)) {
                studentUserIdsByEmail.set(email, new Set());
            }
            studentUserIdsByEmail.get(email).add(toId(user._id));
            recipientUserMap.set(toId(user._id), user);
        }

        for (const classId of normalizedClassIds) {
            const recipientIds = new Set();
            for (const userId of classStudentUserIds.get(classId)) {
                if (validStudentUserIdSet.has(userId)) {
                    recipientIds.add(userId);
                }
            }
            for (const email of classStudentEmails.get(classId)) {
                const matchedUserIds = studentUserIdsByEmail.get(email);
                if (!matchedUserIds) continue;
                for (const userId of matchedUserIds) {
                    recipientIds.add(userId);
                }
            }
            classStats.get(classId).studentRecipientCount = recipientIds.size;
        }
    }

    if (includeParents && allParentEmails.size > 0) {
        const parentUsers = await User.find({
            school: schoolId,
            role: 'parent',
            email: { $in: [...allParentEmails] }
        }).select('_id role firstName lastName email');

        const parentUserIdsByEmail = new Map();
        for (const user of parentUsers) {
            recipientUserMap.set(toId(user._id), user);

            const email = normalizeEmail(user.email);
            if (!email) continue;
            if (!parentUserIdsByEmail.has(email)) {
                parentUserIdsByEmail.set(email, new Set());
            }
            parentUserIdsByEmail.get(email).add(toId(user._id));
        }

        for (const classId of normalizedClassIds) {
            const recipientIds = new Set();
            for (const email of classParentEmails.get(classId)) {
                const matchedUserIds = parentUserIdsByEmail.get(email);
                if (!matchedUserIds) continue;
                for (const userId of matchedUserIds) {
                    recipientIds.add(userId);
                }
            }
            classStats.get(classId).parentCount = recipientIds.size;
        }
    }

    return {
        recipientUsers: [...recipientUserMap.values()],
        classStats
    };
};

const mapThreadSummary = (thread, currentUserId) => {
    const participants = Array.isArray(thread.participants) ? thread.participants : [];
    const currentParticipant = participants.find((item) => toId(item.user) === currentUserId);
    const unreadCount = currentParticipant?.unreadCount || 0;
    const lastMessage = Array.isArray(thread.messages) && thread.messages.length > 0
        ? thread.messages[thread.messages.length - 1]
        : null;
    const participantNames = participants
        .filter((item) => toId(item.user) !== currentUserId)
        .map((item) => (item.displayName || '').trim())
        .filter((value) => value.length > 0);

    return {
        id: thread._id,
        subject: (thread.subject || '').trim() || 'Conversation',
        preview: (lastMessage?.body || '').trim(),
        participantsLabel: participantNames.join(', '),
        lastMessageAt: thread.lastMessageAt || lastMessage?.createdAt || thread.updatedAt || thread.createdAt,
        unreadCount,
        isRead: unreadCount <= 0,
        isClosed: thread.isClosed === true
    };
};

const mapThreadDetail = (thread, currentUser) => {
    const participants = Array.isArray(thread.participants) ? thread.participants : [];
    const currentUserId = toId(currentUser?._id);
    const currentParticipant = participants.find((item) => toId(item.user) === currentUserId);
    const participantNames = participants
        .filter((item) => toId(item.user) !== currentUserId)
        .map((item) => (item.displayName || '').trim())
        .filter((value) => value.length > 0);

    const messageItems = Array.isArray(thread.messages) ? [...thread.messages] : [];
    messageItems.sort((left, right) => {
        const leftTime = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
        return leftTime - rightTime;
    });

    const messages = messageItems.map((message) => {
        const senderId = toId(message.sender);
        const senderParticipant = participants.find((item) => toId(item.user) === senderId);
        return {
            id: message._id,
            body: message.body || '',
            senderRole: message.senderRole || senderParticipant?.role || '',
            senderName: senderParticipant?.displayName || (senderId === currentUserId ? toDisplayName(currentUser) : 'School'),
            isMine: senderId === currentUserId,
            createdAt: message.createdAt || null
        };
    });

    return {
        thread: {
            id: thread._id,
            subject: (thread.subject || '').trim() || 'Conversation',
            participantsLabel: participantNames.join(', '),
            unreadCount: currentParticipant?.unreadCount || 0,
            isClosed: thread.isClosed === true
        },
        messages
    };
};

const addReplyToThread = ({ thread, senderUser, body }) => {
    const now = new Date();
    thread.messages.push({
        sender: senderUser._id,
        senderRole: senderUser.role,
        body,
        createdAt: now
    });
    thread.lastMessageAt = now;

    const currentUserId = toId(senderUser._id);
    let hasCurrentParticipant = false;
    for (const participant of thread.participants) {
        if (toId(participant.user) === currentUserId) {
            participant.unreadCount = 0;
            participant.lastReadAt = now;
            if (!participant.displayName) {
                participant.displayName = toDisplayName(senderUser);
            }
            hasCurrentParticipant = true;
        } else {
            participant.unreadCount = (participant.unreadCount || 0) + 1;
        }
    }

    if (!hasCurrentParticipant) {
        thread.participants.push({
            user: senderUser._id,
            role: senderUser.role,
            displayName: toDisplayName(senderUser),
            unreadCount: 0,
            lastReadAt: now
        });
    }

    return now;
};

/**
 * @desc    Create one-to-one message threads from staff to recipients (parents/students),
 *          including class-based broadcasts.
 * @route   POST /api/messages/threads
 * @access  Private (teacher/admin/staff)
 */
export const createMessageThreadController = asyncHandler(async (req, res) => {
    const subject = (req.body?.subject || '').toString().trim();
    const body = (req.body?.body || '').toString().trim();
    const recipientUserIdsRaw = normalizeObjectIdArray(req.body?.recipientUserIds);
    const classIdsRaw = normalizeObjectIdArray(req.body?.classIds);
    const includeParents = parseBoolean(req.body?.includeParents, true);
    const includeStudents = parseBoolean(req.body?.includeStudents, false);

    if (!subject) {
        return res.status(400).json({
            success: false,
            message: 'subject is required'
        });
    }
    if (!body) {
        return res.status(400).json({
            success: false,
            message: 'body is required'
        });
    }

    if (classIdsRaw.length > 0 && !includeParents && !includeStudents) {
        return res.status(400).json({
            success: false,
            message: 'Enable at least one class audience (parents or students)'
        });
    }

    if (recipientUserIdsRaw.length === 0 && classIdsRaw.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Select recipients directly or choose at least one class'
        });
    }

    const uniqueManualRecipientIds = [...new Set(recipientUserIdsRaw)]
        .filter((id) => id !== String(req.user._id));

    const recipientUsersMap = new Map();

    if (uniqueManualRecipientIds.length > 0) {
        const manualRecipientUsers = await User.find({
            _id: { $in: uniqueManualRecipientIds },
            role: { $in: ['parent', 'student'] }
        })
            .select('_id role firstName lastName email')
            .setOptions({ schoolId: req.schoolId });

        const manualRecipientUserIdSet = new Set(manualRecipientUsers.map((user) => toId(user._id)));
        const missingManualRecipientIds = uniqueManualRecipientIds
            .filter((id) => !manualRecipientUserIdSet.has(id));
        if (missingManualRecipientIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'One or more selected recipients are invalid'
            });
        }

        if (req.user.role === 'teacher') {
            const teacherScope = await resolveClassScopeForMessaging({ req });
            if (teacherScope.allAccessibleClassIds.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Teacher has no assigned classes for messaging'
                });
            }

            const teacherRecipients = await resolveRecipientUsersForClasses({
                schoolId: req.schoolId,
                classIds: teacherScope.allAccessibleClassIds,
                includeParents: true,
                includeStudents: true
            });
            const allowedRecipientIdSet = new Set(
                teacherRecipients.recipientUsers.map((user) => toId(user._id))
            );
            const unauthorizedRecipients = manualRecipientUsers.filter(
                (user) => !allowedRecipientIdSet.has(toId(user._id))
            );
            if (unauthorizedRecipients.length > 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only message parents and students from your assigned classes'
                });
            }
        }

        for (const user of manualRecipientUsers) {
            recipientUsersMap.set(toId(user._id), user);
        }
    }

    if (classIdsRaw.length > 0) {
        const classScope = await resolveClassScopeForMessaging({
            req,
            requestedClassIds: classIdsRaw
        });
        if (classScope.deniedClassIds.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to message one or more selected classes',
                data: { deniedClassIds: classScope.deniedClassIds }
            });
        }
        if (classScope.allowedClassIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid classes selected for messaging'
            });
        }

        const classRecipients = await resolveRecipientUsersForClasses({
            schoolId: req.schoolId,
            classIds: classScope.allowedClassIds,
            includeParents,
            includeStudents
        });

        for (const user of classRecipients.recipientUsers) {
            recipientUsersMap.set(toId(user._id), user);
        }
    }

    recipientUsersMap.delete(toId(req.user._id));
    const recipientUsers = [...recipientUsersMap.values()];
    if (recipientUsers.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No valid recipients were found for this message'
        });
    }

    if (recipientUsers.length > MAX_BROADCAST_RECIPIENTS) {
        return res.status(400).json({
            success: false,
            message: `Too many recipients selected. Maximum allowed is ${MAX_BROADCAST_RECIPIENTS}.`
        });
    }

    const now = new Date();
    const senderDisplayName = toDisplayName(req.user);
    const threadPayloads = recipientUsers.map((recipientUser) => ({
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
                createdAt: now
            }
        ]
    }));

    const createdThreads = await ParentMessageThread.insertMany(threadPayloads);
    const threadSummaries = createdThreads.map((thread, index) => ({
        threadId: thread._id,
        messageId: thread.messages?.[0]?._id || null,
        recipientUserId: recipientUsers[index]?._id || null
    }));

    const firstThread = createdThreads[0] || null;
    const firstMessage = firstThread?.messages?.[0] || null;
    const recipientBreakdown = recipientUsers.reduce((acc, user) => {
        if (user.role === 'parent') acc.parents += 1;
        else if (user.role === 'student') acc.students += 1;
        else acc.other += 1;
        return acc;
    }, { parents: 0, students: 0, other: 0 });

    res.status(201).json({
        success: true,
        data: {
            threadId: firstThread?._id || null,
            messageId: firstMessage?._id || null,
            recipientCount: recipientUsers.length,
            recipientBreakdown,
            threads: threadSummaries
        }
    });
});

/**
 * @desc    Get message threads for staff (paginated)
 * @route   GET /api/messages/threads
 * @access  Private (teacher/admin/staff)
 */
export const getMessageThreadsController = asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, 5000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';

    const baseFilter = { school: req.schoolId };
    const participantFilter = unreadOnly
        ? { participants: { $elemMatch: { user: req.user._id, unreadCount: { $gt: 0 } } } }
        : { 'participants.user': req.user._id };
    const filter = { ...baseFilter, ...participantFilter };

    const [threads, total] = await Promise.all([
        ParentMessageThread.find(filter)
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        ParentMessageThread.countDocuments(filter)
    ]);

    const currentUserId = toId(req.user._id);
    const items = threads.map((thread) => mapThreadSummary(thread, currentUserId));
    const unreadCount = items.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.status(200).json({
        success: true,
        data: {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages
            },
            unreadCount
        }
    });
});

/**
 * @desc    Get one message thread detail for staff
 * @route   GET /api/messages/threads/:threadId
 * @access  Private (teacher/admin/staff)
 */
export const getMessageThreadByIdController = asyncHandler(async (req, res) => {
    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
        school: req.schoolId,
        'participants.user': req.user._id
    });

    if (!thread) {
        return res.status(404).json({
            success: false,
            message: 'Thread not found'
        });
    }

    res.status(200).json({
        success: true,
        data: mapThreadDetail(thread, req.user)
    });
});

/**
 * @desc    Reply to a message thread as staff
 * @route   POST /api/messages/threads/:threadId/replies
 * @access  Private (teacher/admin/staff)
 */
export const replyToMessageThreadController = asyncHandler(async (req, res) => {
    const body = (req.body?.body || '').toString().trim();
    if (!body) {
        return res.status(400).json({
            success: false,
            message: 'Reply body is required'
        });
    }

    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
        school: req.schoolId,
        'participants.user': req.user._id
    });

    if (!thread) {
        return res.status(404).json({
            success: false,
            message: 'Thread not found'
        });
    }

    if (thread.isClosed === true) {
        return res.status(400).json({
            success: false,
            message: 'This conversation is closed'
        });
    }

    const now = addReplyToThread({ thread, senderUser: req.user, body });
    await thread.save();

    const lastMessage = thread.messages[thread.messages.length - 1];
    res.status(200).json({
        success: true,
        data: {
            threadId: thread._id,
            message: {
                id: lastMessage._id,
                body: lastMessage.body,
                senderRole: lastMessage.senderRole || req.user.role,
                senderName: toDisplayName(req.user),
                isMine: true,
                createdAt: lastMessage.createdAt || now
            }
        }
    });
});

/**
 * @desc    Mark a message thread as read for staff
 * @route   PATCH /api/messages/threads/:threadId/read
 * @access  Private (teacher/admin/staff)
 */
export const markMessageThreadReadController = asyncHandler(async (req, res) => {
    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
        school: req.schoolId,
        'participants.user': req.user._id
    });

    if (!thread) {
        return res.status(404).json({
            success: false,
            message: 'Thread not found'
        });
    }

    const currentUserId = toId(req.user._id);
    const participant = thread.participants.find((item) => toId(item.user) === currentUserId);
    if (participant) {
        participant.unreadCount = 0;
        participant.lastReadAt = new Date();
    }

    await thread.save();

    res.status(200).json({
        success: true,
        data: {
            threadId: thread._id,
            unreadCount: 0
        }
    });
});

/**
 * @desc    Get class options with recipient counts for composing class messages
 * @route   GET /api/messages/classes
 * @access  Private (teacher/admin/staff)
 */
export const getMessageClassesForMessagingController = asyncHandler(async (req, res) => {
    const limit = parsePositiveInt(req.query.limit, 100, 500);
    const search = (req.query.search || '').toString().trim();

    const classScope = await resolveClassScopeForMessaging({ req });
    const allAccessibleClassIds = classScope.allAccessibleClassIds || [];
    if (allAccessibleClassIds.length === 0) {
        return res.status(200).json({
            success: true,
            data: {
                classes: []
            }
        });
    }

    const query = {
        school: req.schoolId,
        isActive: true,
        _id: { $in: allAccessibleClassIds }
    };
    if (req.departmentId) {
        query.department = req.departmentId;
    }
    if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        const numericGrade = Number.parseInt(search, 10);
        query.$or = [
            { name: regex },
            { section: regex },
            ...(Number.isFinite(numericGrade) ? [{ grade: numericGrade }] : [])
        ];
    }

    const classDocs = await Class.find(query)
        .select('_id name grade section academicYear')
        .sort({ grade: 1, section: 1, name: 1 })
        .limit(limit)
        .lean();
    const selectedClassIds = classDocs.map((classDoc) => toId(classDoc._id));
    const recipientStats = await resolveRecipientUsersForClasses({
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

    res.status(200).json({
        success: true,
        data: { classes }
    });
});

/**
 * @desc    Get parent users to start new message threads
 * @route   GET /api/messages/parents
 * @access  Private (teacher/admin/staff)
 */
export const getParentUsersForMessagingController = asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, 5000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const search = (req.query.search || '').toString().trim();

    const filter = {
        school: req.schoolId,
        role: 'parent'
    };
    let scopedParentEmailSet = null;
    let scopedClassIds = [];

    if (req.user.role === 'teacher') {
        const classScope = await resolveClassScopeForMessaging({ req });
        scopedClassIds = classScope.allAccessibleClassIds || [];
        if (scopedClassIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    parents: [],
                    pagination: {
                        page,
                        limit,
                        total: 0,
                        totalPages: 1
                    }
                }
            });
        }

        const scopedStudents = await Student.find({
            school: req.schoolId,
            currentClass: { $in: scopedClassIds },
            status: 'active'
        }).select('parentInfo');
        scopedParentEmailSet = new Set();
        for (const student of scopedStudents) {
            const parentInfo = student.parentInfo || {};
            [parentInfo.fatherEmail, parentInfo.motherEmail, parentInfo.guardianEmail]
                .map((email) => normalizeEmail(email))
                .filter(Boolean)
                .forEach((email) => scopedParentEmailSet.add(email));
        }

        if (scopedParentEmailSet.size === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    parents: [],
                    pagination: {
                        page,
                        limit,
                        total: 0,
                        totalPages: 1
                    }
                }
            });
        }
        filter.email = { $in: [...scopedParentEmailSet] };
    }

    let searchRegex = null;
    if (search) {
        searchRegex = new RegExp(escapeRegex(search), 'i');
        filter.$or = [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex }
        ];
    }

    const studentParentEmails = new Set();
    if (searchRegex) {
        const students = await Student.find({
            school: req.schoolId,
            ...(scopedClassIds.length > 0 ? { currentClass: { $in: scopedClassIds } } : {}),
            $or: [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { studentId: searchRegex }
            ]
        }).select('parentInfo');

        for (const student of students) {
            const parentInfo = student.parentInfo || {};
            [parentInfo.fatherEmail, parentInfo.motherEmail, parentInfo.guardianEmail]
                .filter(Boolean)
                .forEach((email) => studentParentEmails.add(String(email).trim().toLowerCase()));
        }
    }

    const [parentsBySearch, total, parentsByStudent] = await Promise.all([
        User.find(filter)
            .sort({ firstName: 1, lastName: 1, email: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        User.countDocuments(filter),
        studentParentEmails.size > 0
            ? User.find({
                school: req.schoolId,
                role: 'parent',
                email: {
                    $in: [...studentParentEmails].filter((email) => (
                        scopedParentEmailSet ? scopedParentEmailSet.has(email) : true
                    ))
                }
            })
            : []
    ]);

    const mergedParents = new Map();
    for (const parent of parentsBySearch) {
        mergedParents.set(toId(parent._id), parent);
    }
    for (const parent of parentsByStudent) {
        mergedParents.set(toId(parent._id), parent);
    }

    const mergedParentsList = [...mergedParents.values()];
    const parentEmails = mergedParentsList
        .map((parent) => String(parent.email || '').trim().toLowerCase())
        .filter(Boolean);

    const studentNameByEmail = new Map();
    if (parentEmails.length > 0) {
        const studentMatches = await Student.find({
            school: req.schoolId,
            $or: [
                { 'parentInfo.fatherEmail': { $in: parentEmails } },
                { 'parentInfo.motherEmail': { $in: parentEmails } },
                { 'parentInfo.guardianEmail': { $in: parentEmails } }
            ]
        }).select('firstName lastName parentInfo');

        for (const student of studentMatches) {
            const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
            if (!studentName) continue;

            const parentInfo = student.parentInfo || {};
            [parentInfo.fatherEmail, parentInfo.motherEmail, parentInfo.guardianEmail]
                .filter(Boolean)
                .map((email) => String(email).trim().toLowerCase())
                .forEach((email) => {
                    if (!studentNameByEmail.has(email)) {
                        studentNameByEmail.set(email, new Set());
                    }
                    studentNameByEmail.get(email).add(studentName);
                });
        }
    }

    const items = mergedParentsList.map((parent) => {
        const email = parent.email || '';
        const studentNames = studentNameByEmail.get(String(email).trim().toLowerCase());
        return {
            id: parent._id,
            displayName: toDisplayName(parent),
            email,
            studentNames: studentNames ? [...studentNames] : []
        };
    });
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.status(200).json({
        success: true,
        data: {
            parents: items,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        }
    });
});
