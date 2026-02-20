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

const buildParentNotificationFilter = (parentUser) => {
    const escapedEmail = escapeRegex(String(parentUser?.email || '').trim());
    const emailMatcher = escapedEmail ? new RegExp(escapedEmail, 'i') : null;
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
