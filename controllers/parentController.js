import { asyncHandler } from '../middleware/errorHandler.js';
import {
    clampDateRangeToAcademicYear,
    resolveAcademicYearDateRangeForRequest
} from '../helpers/academicYearScope.js';
export { getParentChildLearningSummaryController } from './academicIntelligenceController.js';
import {
    getParentChildAcademicStats,
    getParentChildAttendanceSummary,
    getParentChildGrades,
    getParentChildReports,
    getParentChildSbrReportById,
    getParentChildSbrReports,
    getParentChildSubjectAcademicStats,
    getParentChildTimetable,
    getParentChildren,
    getParentDashboard,
    getParentLinkedStudents,
    getParentSettings,
    updateParentSettings,
    markAllParentUpdatesAsRead,
    getParentUpdates,
    getParentUpdateById
} from '../services/parentDashboardService.js';
import ParentMessageThread from '../models/ParentMessageThread.js';
import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';
import {
    appendMessageToThread,
    applyReadReceiptsForUser,
    emitMessageThreadEvent
} from '../services/messageRealtimeService.js';

const parseDateValue = (raw, endOfDay = false) => {
    if (!raw) return null;
    const value = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return Number.NaN;
    if (endOfDay) {
        parsed.setHours(23, 59, 59, 999);
    } else {
        parsed.setHours(0, 0, 0, 0);
    }
    return parsed;
};

const isValidDateObject = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const parseDateRangeFromQuery = ({ from, to }, academicYearDateFilter) => {
    const requestedRange = {};
    if (from) {
        const parsedFrom = parseDateValue(from, false);
        if (!isValidDateObject(parsedFrom)) {
            return { error: 'Invalid from date. Expected YYYY-MM-DD.' };
        }
        requestedRange.$gte = parsedFrom;
    }
    if (to) {
        const parsedTo = parseDateValue(to, true);
        if (!isValidDateObject(parsedTo)) {
            return { error: 'Invalid to date. Expected YYYY-MM-DD.' };
        }
        requestedRange.$lte = parsedTo;
    }
    if (requestedRange.$gte && requestedRange.$lte && requestedRange.$gte > requestedRange.$lte) {
        return { error: 'from must be before or equal to to.' };
    }
    const scopedRange = clampDateRangeToAcademicYear(requestedRange, academicYearDateFilter);
    if (Object.keys(requestedRange).length > 0 && !scopedRange) {
        return { error: 'Requested date range is outside the current academic year.' };
    }
    return { range: scopedRange || academicYearDateFilter || null };
};

const parseSemester = (termValue) => {
    if (termValue == null || termValue === '') return { semester: null };
    const normalized = String(termValue).trim().toLowerCase();
    const oneValues = new Set(['1', 'term1', 'semester1', 's1', 'first']);
    const twoValues = new Set(['2', 'term2', 'semester2', 's2', 'second']);
    if (oneValues.has(normalized)) return { semester: 1 };
    if (twoValues.has(normalized)) return { semester: 2 };
    return { error: 'Invalid term value. Use 1 or 2.' };
};

/**
 * @desc    Get children linked to authenticated parent
 * @route   GET /api/parent/children
 * @access  Private (parent)
 */
export const getParentChildrenController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const data = await getParentChildren({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get parent dashboard summary in one payload
 * @route   GET /api/parent/dashboard
 * @access  Private (parent)
 */
export const getParentDashboardController = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const data = await getParentDashboard({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        dateFilter
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get parent updates feed (paginated)
 * @route   GET /api/parent/updates
 * @access  Private (parent)
 */
export const getParentUpdatesController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const data = await getParentUpdates({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        page: req.query.page,
        limit: req.query.limit,
        childId: req.query.childId,
        type: req.query.type,
        unreadOnly: req.query.unreadOnly
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get one parent update with full content
 * @route   GET /api/parent/updates/:id
 * @access  Private (parent)
 */
export const getParentUpdateByIdController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const update = await getParentUpdateById({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        updateId: req.params.id
    });

    if (!update) {
        return res.status(404).json({
            success: false,
            message: 'Update not found'
        });
    }

    res.status(200).json({
        success: true,
        data: { update }
    });
});

/**
 * @desc    Mark all parent updates as read
 * @route   PATCH /api/parent/updates/read-all
 * @access  Private (parent)
 */
export const markAllParentUpdatesAsReadController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const data = await markAllParentUpdatesAsRead({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get child attendance summary for parent
 * @route   GET /api/parent/children/:childId/attendance-summary
 * @access  Private (parent)
 */
export const getParentChildAttendanceSummaryController = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const { range, error } = parseDateRangeFromQuery({
        from: req.query.from,
        to: req.query.to
    }, dateFilter);
    if (error) {
        return res.status(400).json({ success: false, message: error });
    }

    const data = await getParentChildAttendanceSummary({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        dateRange: range
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get child grades for parent view
 * @route   GET /api/parent/children/:childId/grades
 * @access  Private (parent)
 */
export const getParentChildGradesController = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const { semester, error: semesterError } = parseSemester(req.query.term);
    if (semesterError) {
        return res.status(400).json({ success: false, message: semesterError });
    }

    const { range, error: rangeError } = parseDateRangeFromQuery({
        from: req.query.from,
        to: req.query.to
    }, dateFilter);
    if (rangeError) {
        return res.status(400).json({ success: false, message: rangeError });
    }

    const data = await getParentChildGrades({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        subjectId: req.query.subject || null,
        semester,
        dateRange: range,
        page: req.query.page,
        limit: req.query.limit
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get child academic subject stats for parent view
 * @route   GET /api/parent/children/:childId/academic-stats
 * @access  Private (parent)
 */
export const getParentChildAcademicStatsController = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const { range, error } = parseDateRangeFromQuery({
        from: req.query.from,
        to: req.query.to
    }, dateFilter);
    if (error) {
        return res.status(400).json({ success: false, message: error });
    }

    const data = await getParentChildAcademicStats({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        dateRange: range
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get one subject's academic stats for parent view
 * @route   GET /api/parent/children/:childId/academic-stats/:subjectId
 * @access  Private (parent)
 */
export const getParentChildSubjectAcademicStatsController = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const { range, error } = parseDateRangeFromQuery({
        from: req.query.from,
        to: req.query.to
    }, dateFilter);
    if (error) {
        return res.status(400).json({ success: false, message: error });
    }

    const data = await getParentChildSubjectAcademicStats({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        subjectId: req.params.subjectId,
        dateRange: range
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get weekly child timetable for parent view
 * @route   GET /api/parent/children/:childId/timetable
 * @access  Private (parent)
 */
export const getParentChildTimetableController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const referenceDate = req.query.date ? parseDateValue(req.query.date, false) : new Date();
    if (!isValidDateObject(referenceDate)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid date. Expected YYYY-MM-DD.'
        });
    }

    const data = await getParentChildTimetable({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        referenceDate
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get child report history for parent view
 * @route   GET /api/parent/children/:childId/reports
 * @access  Private (parent)
 */
export const getParentChildReportsController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const normalizedType = req.query.type ? String(req.query.type).trim().toLowerCase() : null;
    if (normalizedType && !['daily', 'monthly', 'ai'].includes(normalizedType)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid type. Use daily, monthly, or ai.'
        });
    }

    const data = await getParentChildReports({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        type: normalizedType,
        period: req.query.period || null,
        page: req.query.page,
        limit: req.query.limit
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get child SBR report cards for parent view
 * @route   GET /api/parent/children/:childId/sbr-report-cards
 * @access  Private (parent)
 */
export const getParentChildSbrReportsController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);

    const data = await getParentChildSbrReports({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        period: req.query.period || null,
        page: req.query.page,
        limit: req.query.limit
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get single child SBR report card for parent view
 * @route   GET /api/parent/children/:childId/sbr-report-cards/:reportId
 * @access  Private (parent)
 */
export const getParentChildSbrReportByIdController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);

    const data = await getParentChildSbrReportById({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        reportId: req.params.reportId
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Report card not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get parent app settings
 * @route   GET /api/parent/settings
 * @access  Private (parent)
 */
export const getParentSettingsController = asyncHandler(async (req, res) => {
    const data = await getParentSettings({
        schoolId: req.schoolId,
        parentUser: req.user
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Update parent app settings
 * @route   PATCH /api/parent/settings
 * @access  Private (parent)
 */
export const updateParentSettingsController = asyncHandler(async (req, res) => {
    const payload = req.body || {};
    if (payload.notifications != null && typeof payload.notifications !== 'object') {
        return res.status(400).json({
            success: false,
            message: 'notifications must be an object'
        });
    }

    const data = await updateParentSettings({
        schoolId: req.schoolId,
        parentUser: req.user,
        payload
    });

    res.status(200).json({
        success: true,
        data
    });
});

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
    return fullName || user?.email || 'Parent';
};

const formatClassLabel = (classDoc) => {
    if (!classDoc) return 'Class';
    const name = (classDoc.name || '').toString().trim();
    if (name) return name;
    const grade = Number.isFinite(Number(classDoc.grade)) ? `Grade ${classDoc.grade}` : '';
    const section = (classDoc.section || '').toString().trim();
    const gradeLabel = grade && section ? `${grade}-${section}` : (grade || section);
    const parts = [gradeLabel].filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(' · ') : 'Class';
};

const resolveParentTeacherAudience = async ({
    schoolId,
    parentUser,
    academicYear,
    search = '',
    limit = 50
}) => {
    const linkedStudents = await getParentLinkedStudents({
        schoolId,
        parentUser,
        academicYear
    });

    if (linkedStudents.length === 0) {
        return {
            teachers: [],
            teacherUserMap: new Map()
        };
    }

    const classIdToChildNames = new Map();
    const classIds = new Set();
    for (const student of linkedStudents) {
        const classId = toId(student.currentClass?._id || student.currentClass);
        if (!classId) continue;
        classIds.add(classId);
        if (!classIdToChildNames.has(classId)) {
            classIdToChildNames.set(classId, new Set());
        }
        const childName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
        if (childName) {
            classIdToChildNames.get(classId).add(childName);
        }
    }

    if (classIds.size === 0) {
        return {
            teachers: [],
            teacherUserMap: new Map()
        };
    }

    const classDocs = await Class.find({
        school: schoolId,
        _id: { $in: [...classIds] }
    })
        .select('_id name grade section classTeacher subjects.teacher subjects.subject')
        .populate('subjects.subject', 'name code')
        .lean();

    const teacherClassLabels = new Map();
    const teacherSubjectLabels = new Map();
    const teacherChildNames = new Map();
    const teacherProfileIds = new Set();

    for (const classDoc of classDocs) {
        const classId = toId(classDoc._id);
        const classLabel = formatClassLabel(classDoc);
        const childNames = classIdToChildNames.get(classId) || new Set();
        const classTeacherId = toId(classDoc.classTeacher);
        const subjectTeacherIds = Array.isArray(classDoc.subjects)
            ? classDoc.subjects.map((item) => toId(item?.teacher)).filter(Boolean)
            : [];
        const allTeacherIds = new Set([classTeacherId, ...subjectTeacherIds].filter(Boolean));

        for (const teacherId of allTeacherIds) {
            teacherProfileIds.add(teacherId);
            if (!teacherClassLabels.has(teacherId)) {
                teacherClassLabels.set(teacherId, new Set());
            }
            teacherClassLabels.get(teacherId).add(classLabel);

            if (!teacherChildNames.has(teacherId)) {
                teacherChildNames.set(teacherId, new Set());
            }
            for (const childName of childNames) {
                teacherChildNames.get(teacherId).add(childName);
            }
        }

        const subjectAssignments = Array.isArray(classDoc.subjects) ? classDoc.subjects : [];
        for (const assignment of subjectAssignments) {
            const subjectTeacherId = toId(assignment?.teacher);
            if (!subjectTeacherId) continue;
            const subjectName = (assignment?.subject?.name || '').toString().trim();
            if (!subjectName) continue;
            if (!teacherSubjectLabels.has(subjectTeacherId)) {
                teacherSubjectLabels.set(subjectTeacherId, new Set());
            }
            teacherSubjectLabels.get(subjectTeacherId).add(subjectName);
        }
    }

    if (teacherProfileIds.size === 0) {
        return {
            teachers: [],
            teacherUserMap: new Map()
        };
    }

    const teacherProfiles = await Teacher.find({
        school: schoolId,
        _id: { $in: [...teacherProfileIds] },
        isActive: true
    })
        .select('_id user subjects assignedClasses.subject')
        .populate('user', 'firstName lastName email role isActive')
        .populate('subjects', 'name code')
        .populate('assignedClasses.subject', 'name code')
        .lean();

    const normalizedSearch = String(search || '').trim().toLowerCase();
    const teacherUserMap = new Map();
    const teachers = [];

    for (const profile of teacherProfiles) {
        const teacherUser = profile.user;
        const teacherUserId = toId(teacherUser?._id);
        if (!teacherUserId) continue;
        if (teacherUser?.isActive === false) continue;
        if (String(teacherUser?.role || '') !== 'teacher') continue;

        const displayName = toDisplayName(teacherUser);
        const email = (teacherUser?.email || '').toString().trim();
        const classOnlyLabels = [...(teacherClassLabels.get(toId(profile._id)) || new Set())]
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));
        const classSubjectLabels = [...(teacherSubjectLabels.get(toId(profile._id)) || new Set())]
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));
        const profileSubjectLabels = (Array.isArray(profile.subjects) ? profile.subjects : [])
            .map((subject) => (subject?.name || '').toString().trim())
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));
        const assignedClassSubjectLabels = (Array.isArray(profile.assignedClasses) ? profile.assignedClasses : [])
            .map((assignment) => (assignment?.subject?.name || '').toString().trim())
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));
        const mergedSubjectLabels = [...new Set([...classSubjectLabels, ...profileSubjectLabels])]
            .concat(assignedClassSubjectLabels)
            .filter(Boolean);
        const dedupedMergedSubjectLabels = [...new Set(mergedSubjectLabels)]
            .sort((left, right) => left.localeCompare(right));
        const classLabels = dedupedMergedSubjectLabels.length > 0 ? dedupedMergedSubjectLabels : classOnlyLabels;
        const studentNames = [...(teacherChildNames.get(toId(profile._id)) || new Set())]
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right));

        if (normalizedSearch) {
            const haystack = [
                displayName.toLowerCase(),
                email.toLowerCase(),
                dedupedMergedSubjectLabels.join(' ').toLowerCase(),
                classOnlyLabels.join(' ').toLowerCase(),
                classLabels.join(' ').toLowerCase(),
                studentNames.join(' ').toLowerCase()
            ].join(' ');
            if (!haystack.includes(normalizedSearch)) {
                continue;
            }
        }

        const item = {
            id: teacherUserId,
            displayName,
            email,
            classLabels,
            studentNames
        };
        teachers.push(item);
        teacherUserMap.set(teacherUserId, {
            ...item,
            role: teacherUser.role
        });
    }

    teachers.sort((left, right) => left.displayName.localeCompare(right.displayName));
    const effectiveLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
        ? Math.min(Number(limit), 100)
        : 0;

    return {
        teachers: effectiveLimit > 0 ? teachers.slice(0, effectiveLimit) : teachers,
        teacherUserMap
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
        isRead: unreadCount <= 0
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

    const mapDeliveryReceipts = (message) => {
        const receipts = Array.isArray(message?.deliveryReceipts) ? message.deliveryReceipts : [];
        return receipts.map((receipt) => {
            const receiptUserId = toId(receipt?.user);
            const participant = participants.find((item) => toId(item.user) === receiptUserId);
            return {
                userId: receiptUserId,
                displayName: participant?.displayName || '',
                deliveredAt: receipt?.deliveredAt || null,
                readAt: receipt?.readAt || null
            };
        });
    };

    const messages = messageItems.map((message) => {
        const senderId = toId(message.sender);
        const senderParticipant = participants.find((item) => toId(item.user) === senderId);
        return {
            id: message._id,
            body: message.body || '',
            senderRole: message.senderRole || senderParticipant?.role || '',
            senderName: senderParticipant?.displayName || (senderId === currentUserId ? toDisplayName(currentUser) : 'School'),
            isMine: senderId === currentUserId,
            createdAt: message.createdAt || null,
            deliveryReceipts: mapDeliveryReceipts(message)
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

/**
 * @desc    Get parent message threads (paginated)
 * @route   GET /api/parent/messages/threads
 * @access  Private (parent)
 */
export const getParentMessageThreadsController = asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, 5000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const filter = { 'participants.user': req.user._id };

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
 * @desc    Get teacher options for parent messaging
 * @route   GET /api/parent/messages/teachers
 * @access  Private (parent)
 */
export const getParentMessageTeachersController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const limit = parsePositiveInt(req.query.limit, 50, 100);
    const search = (req.query.search || '').toString().trim();

    const { teachers } = await resolveParentTeacherAudience({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        search,
        limit
    });

    res.status(200).json({
        success: true,
        data: { teachers }
    });
});

/**
 * @desc    Start or continue a parent-to-teacher conversation
 * @route   POST /api/parent/messages/threads
 * @access  Private (parent)
 */
export const createParentMessageThreadController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const teacherUserId = (req.body?.teacherUserId || '').toString().trim();
    const body = (req.body?.body || '').toString().trim();
    const requestedSubject = (req.body?.subject || '').toString().trim();

    if (!teacherUserId) {
        return res.status(400).json({
            success: false,
            message: 'teacherUserId is required'
        });
    }
    if (!body) {
        return res.status(400).json({
            success: false,
            message: 'body is required'
        });
    }

    const { teacherUserMap } = await resolveParentTeacherAudience({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        limit: 0
    });

    const selectedTeacher = teacherUserMap.get(teacherUserId);
    if (!selectedTeacher) {
        return res.status(403).json({
            success: false,
            message: 'You can only message teachers linked to your children'
        });
    }

    const subject = requestedSubject || 'Parent Message';
    const now = new Date();
    let thread = await ParentMessageThread.findOne({
        school: req.schoolId,
        isClosed: { $ne: true },
        participants: { $size: 2 },
        'participants.user': { $all: [req.user._id, teacherUserId] }
    }).sort({ lastMessageAt: -1 });
    const isNewThread = !thread;

    if (!thread) {
        thread = await ParentMessageThread.create({
            school: req.schoolId,
            subject,
            participants: [
                {
                    user: req.user._id,
                    role: req.user.role,
                    displayName: toDisplayName(req.user),
                    unreadCount: 0,
                    lastReadAt: now
                },
                {
                    user: teacherUserId,
                    role: selectedTeacher.role || 'teacher',
                    displayName: selectedTeacher.displayName || 'Teacher',
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
                            user: teacherUserId,
                            deliveredAt: now,
                            readAt: null
                        }
                    ]
                }
            ]
        });

        await emitMessageThreadEvent({
            thread,
            actorUser: req.user,
            event: 'message',
            message: thread.messages?.[0] || null,
            includePush: true
        });
    } else {
        const latestMessage = appendMessageToThread({
            thread,
            senderUser: req.user,
            body,
            createdAt: now
        });
        if (!thread.subject || !thread.subject.trim()) {
            thread.subject = subject;
        }
        const hasTeacherParticipant = thread.participants.some((participant) => toId(participant.user) === teacherUserId);
        if (!hasTeacherParticipant) {
            thread.participants.push({
                user: teacherUserId,
                role: selectedTeacher.role || 'teacher',
                displayName: selectedTeacher.displayName || 'Teacher',
                unreadCount: 1,
                lastReadAt: null
            });
            if (latestMessage && Array.isArray(latestMessage.deliveryReceipts)) {
                latestMessage.deliveryReceipts.push({
                    user: teacherUserId,
                    deliveredAt: now,
                    readAt: null
                });
            }
        }

        await thread.save();
        await emitMessageThreadEvent({
            thread,
            actorUser: req.user,
            event: 'message',
            message: latestMessage || thread.messages?.[thread.messages.length - 1] || null,
            includePush: true
        });
    }

    const latestMessage = thread.messages[thread.messages.length - 1];

    res.status(isNewThread ? 201 : 200).json({
        success: true,
        data: {
            threadId: thread._id,
            messageId: latestMessage?._id || null,
            isNewThread
        }
    });
});

/**
 * @desc    Get one parent message thread detail
 * @route   GET /api/parent/messages/threads/:threadId
 * @access  Private (parent)
 */
export const getParentMessageThreadByIdController = asyncHandler(async (req, res) => {
    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
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
 * @desc    Reply to parent message thread
 * @route   POST /api/parent/messages/threads/:threadId/replies
 * @access  Private (parent)
 */
export const replyToParentMessageThreadController = asyncHandler(async (req, res) => {
    const body = (req.body?.body || '').toString().trim();
    if (!body) {
        return res.status(400).json({
            success: false,
            message: 'Reply body is required'
        });
    }

    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
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

    const now = new Date();
    const lastMessage = appendMessageToThread({
        thread,
        senderUser: req.user,
        body,
        createdAt: now
    });

    await thread.save();
    await emitMessageThreadEvent({
        thread,
        actorUser: req.user,
        event: 'message',
        message: lastMessage,
        includePush: true
    });

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
 * @desc    Mark parent message thread as read
 * @route   PATCH /api/parent/messages/threads/:threadId/read
 * @access  Private (parent)
 */
export const markParentMessageThreadReadController = asyncHandler(async (req, res) => {
    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
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
        const readAt = new Date();
        participant.unreadCount = 0;
        participant.lastReadAt = readAt;
        applyReadReceiptsForUser({
            thread,
            readerUserId: req.user._id,
            readAt
        });
    }

    await thread.save();
    await emitMessageThreadEvent({
        thread,
        actorUser: req.user,
        event: 'read',
        includePush: false
    });

    res.status(200).json({
        success: true,
        data: {
            threadId: thread._id,
            unreadCount: 0
        }
    });
});

