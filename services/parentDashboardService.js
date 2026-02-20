import Attendance from '../models/Attendance.js';
import AttendanceRequest from '../models/AttendanceRequest.js';
import Notification from '../models/Notification.js';
import Student from '../models/Student.js';

const PARENT_EMAIL_FIELDS = [
    'parentInfo.fatherEmail',
    'parentInfo.motherEmail',
    'parentInfo.guardianEmail'
];

const ATTENDED_STATUSES = ['present', 'tardy', 'tardy_excused'];

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildParentEmailFilter = (email) => {
    const escaped = escapeRegex(String(email || '').trim().toLowerCase());
    if (!escaped) return null;
    return {
        $or: PARENT_EMAIL_FIELDS.map((field) => ({
            [field]: new RegExp(`^${escaped}$`, 'i')
        }))
    };
};

const buildRecipientEmailExactMatcher = (email) => {
    const escapedEmail = escapeRegex(String(email || '').trim());
    if (!escapedEmail) return null;
    return new RegExp(`(^|\\s*,\\s*)${escapedEmail}(\\s*,\\s*|$)`, 'i');
};

export const buildParentNotificationFilter = (parentUser) => {
    const emailMatcher = buildRecipientEmailExactMatcher(parentUser?.email);
    const conditions = [{ recipient: parentUser._id }];
    if (emailMatcher) {
        conditions.push({ recipientEmail: emailMatcher });
    }
    return { $or: conditions };
};

const trimMessagePreview = (message) => {
    const normalized = String(message || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
};

const toGradeLabel = (gradeValue) => {
    const numeric = Number(gradeValue);
    if (!Number.isFinite(numeric)) return '';
    return `Grade ${numeric}`;
};

const mapRecentAlert = (notification) => ({
    id: notification._id,
    type: notification.type,
    title: notification.subject,
    message: trimMessagePreview(notification.message),
    createdAt: notification.createdAt,
    readAt: notification.readAt || null
});

const buildAttendanceMatch = ({ schoolId, studentId, dateFilter }) => {
    const query = { school: schoolId };
    if (dateFilter?.$gte || dateFilter?.$lte) {
        query.date = dateFilter;
    }
    query['studentAttendance.student'] = studentId;
    return query;
};

const computeAttendanceRateForStudent = async ({ schoolId, studentId, dateFilter }) => {
    const rows = await Attendance.aggregate([
        {
            $match: buildAttendanceMatch({ schoolId, studentId, dateFilter })
        },
        {
            $unwind: '$studentAttendance'
        },
        {
            $match: {
                'studentAttendance.student': studentId
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                attended: {
                    $sum: {
                        $cond: [
                            { $in: ['$studentAttendance.status', ATTENDED_STATUSES] },
                            1,
                            0
                        ]
                    }
                }
            }
        }
    ]);

    const stats = rows[0];
    if (!stats || !stats.total) return null;
    return Number(((stats.attended / stats.total) * 100).toFixed(1));
};

const countPendingRequestsForStudent = async ({ schoolId, parentUserId, studentId, dateFilter }) => {
    const query = {
        school: schoolId,
        requester: parentUserId,
        student: studentId,
        status: 'pending'
    };
    if (dateFilter?.$gte || dateFilter?.$lte) {
        query.requestDate = dateFilter;
    }
    return AttendanceRequest.countDocuments(query);
};

const loadRecentAlertsForStudent = async ({ schoolId, parentUser, studentId }) => {
    const notifications = await Notification.find({
        school: schoolId,
        student: studentId,
        ...buildParentNotificationFilter(parentUser)
    })
        .select('_id type subject message createdAt readAt')
        .sort({ createdAt: -1 })
        .limit(3)
        .lean();

    return notifications.map(mapRecentAlert);
};

export const getParentLinkedStudents = async ({ schoolId, parentUser, academicYear }) => {
    const emailFilter = buildParentEmailFilter(parentUser?.email);
    if (!emailFilter) return [];

    return Student.find({
        school: schoolId,
        academicYear,
        ...emailFilter
    })
        .populate('currentClass', 'name grade section')
        .sort({ firstName: 1, lastName: 1 })
        .lean();
};

const mapStudentCore = (student) => ({
    id: student._id,
    name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
    studentId: student.studentId,
    class: student.currentClass?.name || '',
    grade: toGradeLabel(student.currentClass?.grade),
    section: student.currentClass?.section || ''
});

export const getParentChildren = async ({ schoolId, parentUser, academicYear }) => {
    const students = await getParentLinkedStudents({ schoolId, parentUser, academicYear });
    return students.map((student) => ({
        ...mapStudentCore(student),
        academicYear
    }));
};

const buildChildSummary = async ({ schoolId, parentUser, student, dateFilter }) => {
    const [attendanceRate, pendingRequestsCount, recentAlerts] = await Promise.all([
        computeAttendanceRateForStudent({ schoolId, studentId: student._id, dateFilter }),
        countPendingRequestsForStudent({
            schoolId,
            parentUserId: parentUser._id,
            studentId: student._id,
            dateFilter
        }),
        loadRecentAlertsForStudent({
            schoolId,
            parentUser,
            studentId: student._id
        })
    ]);

    return {
        ...mapStudentCore(student),
        attendanceRate,
        pendingRequestsCount,
        recentAlerts
    };
};

export const getParentDashboard = async ({ schoolId, parentUser, academicYear, dateFilter }) => {
    const students = await getParentLinkedStudents({ schoolId, parentUser, academicYear });
    const parentNotificationFilter = buildParentNotificationFilter(parentUser);

    const [children, pendingRequestsCount, unreadNotificationsCount] = await Promise.all([
        Promise.all(
            students.map((student) => buildChildSummary({
                schoolId,
                parentUser,
                student,
                dateFilter
            }))
        ),
        AttendanceRequest.countDocuments({
            school: schoolId,
            requester: parentUser._id,
            status: 'pending',
            ...(dateFilter?.$gte || dateFilter?.$lte ? { requestDate: dateFilter } : {})
        }),
        Notification.countDocuments({
            school: schoolId,
            $and: [
                parentNotificationFilter,
                {
                    $or: [
                        { readAt: null },
                        { readAt: { $exists: false } }
                    ]
                }
            ]
        })
    ]);

    return {
        academicYear,
        children,
        unreadNotificationsCount,
        pendingRequestsCount
    };
};

const mapNotificationToUpdateListItem = (notification) => {
    const firstName = notification.student?.firstName || '';
    const lastName = notification.student?.lastName || '';
    const classDoc = notification.student?.currentClass;
    return {
        id: notification._id,
        childId: notification.student?._id || '',
        childName: `${firstName} ${lastName}`.trim(),
        childGrade: toGradeLabel(classDoc?.grade),
        childSection: classDoc?.section || '',
        type: notification.type,
        subject: notification.subject || '',
        preview: trimMessagePreview(notification.message),
        hasHtmlContent: Boolean(String(notification.htmlContent || '').trim()),
        isRead: Boolean(notification.readAt),
        createdAt: notification.createdAt,
        sentVia: Array.isArray(notification.channels) ? notification.channels : [],
        deliveryStatus: notification.status || ''
    };
};

const mapNotificationToUpdateDetail = (notification) => ({
    ...mapNotificationToUpdateListItem(notification),
    message: notification.message || '',
    htmlContent: notification.htmlContent || ''
});

const normalizePage = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const normalizeLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.min(parsed, 100);
};

const normalizeBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const buildUnreadClause = () => ({
    $or: [
        { readAt: null },
        { readAt: { $exists: false } }
    ]
});

export const getParentUpdates = async ({
    schoolId,
    parentUser,
    academicYear,
    page = 1,
    limit = 20,
    childId = null,
    type = null,
    unreadOnly = false
}) => {
    const students = await getParentLinkedStudents({ schoolId, parentUser, academicYear });
    const childIds = students.map((student) => student._id.toString());
    if (childIds.length === 0) {
        return {
            updates: [],
            pagination: {
                page: normalizePage(page),
                limit: normalizeLimit(limit),
                total: 0,
                totalPages: 0
            },
            unreadCount: 0
        };
    }

    if (childId && !childIds.includes(String(childId))) {
        return {
            updates: [],
            pagination: {
                page: normalizePage(page),
                limit: normalizeLimit(limit),
                total: 0,
                totalPages: 0
            },
            unreadCount: 0
        };
    }

    const pageNumber = normalizePage(page);
    const pageSize = normalizeLimit(limit);
    const parentNotificationFilter = buildParentNotificationFilter(parentUser);

    const listQuery = {
        school: schoolId,
        $and: [
            parentNotificationFilter,
            { student: { $in: childIds } },
            ...(childId ? [{ student: childId }] : []),
            ...(type ? [{ type }] : []),
            ...(normalizeBoolean(unreadOnly) ? [buildUnreadClause()] : [])
        ]
    };

    const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(listQuery)
            .select('_id student type subject message htmlContent channels status readAt createdAt')
            .populate({
                path: 'student',
                select: 'firstName lastName currentClass',
                populate: {
                    path: 'currentClass',
                    select: 'grade section'
                }
            })
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize)
            .lean(),
        Notification.countDocuments(listQuery),
        Notification.countDocuments({
            school: schoolId,
            $and: [parentNotificationFilter, buildUnreadClause()]
        })
    ]);

    return {
        updates: notifications.map(mapNotificationToUpdateListItem),
        pagination: {
            page: pageNumber,
            limit: pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        },
        unreadCount
    };
};

export const getParentUpdateById = async ({
    schoolId,
    parentUser,
    academicYear,
    updateId
}) => {
    const students = await getParentLinkedStudents({ schoolId, parentUser, academicYear });
    const childIds = students.map((student) => student._id.toString());
    if (childIds.length === 0) return null;

    const parentNotificationFilter = buildParentNotificationFilter(parentUser);

    const notification = await Notification.findOne({
        _id: updateId,
        school: schoolId,
        student: { $in: childIds },
        ...parentNotificationFilter
    })
        .select('_id student type subject message htmlContent channels status readAt createdAt')
        .populate({
            path: 'student',
            select: 'firstName lastName currentClass',
            populate: {
                path: 'currentClass',
                select: 'grade section'
            }
        })
        .lean();

    if (!notification) return null;
    return mapNotificationToUpdateDetail(notification);
};
