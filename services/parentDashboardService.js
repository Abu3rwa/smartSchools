import Attendance from '../models/Attendance.js';
import AttendanceRequest from '../models/AttendanceRequest.js';
import Grade from '../models/Grade.js';
import Notification from '../models/Notification.js';
import ParentSetting from '../models/ParentSetting.js';
import Student from '../models/Student.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';

const PARENT_EMAIL_FIELDS = [
    'parentInfo.fatherEmail',
    'parentInfo.motherEmail',
    'parentInfo.guardianEmail'
];

const ATTENDED_STATUSES = ['present', 'tardy', 'tardy_excused'];
const ABSENT_STATUSES = ['absent', 'absent_excused'];
const LATE_STATUSES = ['tardy', 'tardy_excused'];

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const REPORT_TYPE_MAP = {
    daily: ['daily_report', 'daily_classwork_update'],
    monthly: ['monthly_report', 'semester_report'],
    ai: ['ai_report']
};

const DEFAULT_PARENT_SETTINGS = Object.freeze({
    language: 'en',
    notifications: {
        push: true,
        email: true,
        attendance: true,
        grades: true,
        reports: true
    }
});

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

export const getParentLinkedStudentById = async ({
    schoolId,
    parentUser,
    academicYear,
    childId
}) => {
    const emailFilter = buildParentEmailFilter(parentUser?.email);
    if (!emailFilter || !childId) return null;

    return Student.findOne({
        _id: childId,
        school: schoolId,
        academicYear,
        ...emailFilter
    })
        .populate('currentClass', 'name grade section')
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
    const childIds = students.map((student) => student._id.toString());
    const parentNotificationFilter = buildParentNotificationFilter(parentUser);
    const unreadNotificationsPromise = childIds.length === 0
        ? Promise.resolve(0)
        : Notification.countDocuments({
            school: schoolId,
            $and: [
                parentNotificationFilter,
                buildParentUpdateVisibilityClause({ childIds }),
                buildUnreadClause()
            ]
        });

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
        unreadNotificationsPromise
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
    const childName = `${firstName} ${lastName}`.trim() || 'School';
    const classDoc = notification.student?.currentClass;
    return {
        id: notification._id,
        childId: notification.student?._id || '',
        childName,
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

function buildUnreadClause() {
    return {
        $or: [
            { readAt: null },
            { readAt: { $exists: false } }
        ]
    };
}

function buildLegacyAttendanceRequestStatusClause() {
    return {
        $and: [
            { type: 'attendance_request_status' },
            {
                $or: [
                    { student: null },
                    { student: { $exists: false } }
                ]
            }
        ]
    };
}

function buildParentUpdateVisibilityClause({ childIds, childId = null }) {
    if (childId) {
        return { student: childId };
    }

    return {
        $or: [
            { student: { $in: childIds } },
            buildLegacyAttendanceRequestStatusClause()
        ]
    };
}

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
            buildParentUpdateVisibilityClause({ childIds, childId }),
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
            $and: [
                parentNotificationFilter,
                buildParentUpdateVisibilityClause({ childIds }),
                buildUnreadClause()
            ]
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
        $and: [
            parentNotificationFilter,
            buildParentUpdateVisibilityClause({ childIds })
        ]
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

export const markAllParentUpdatesAsRead = async ({
    schoolId,
    parentUser,
    academicYear
}) => {
    const students = await getParentLinkedStudents({ schoolId, parentUser, academicYear });
    const childIds = students.map((student) => student._id.toString());
    if (childIds.length === 0) {
        return { updated: 0 };
    }

    const parentNotificationFilter = buildParentNotificationFilter(parentUser);
    const query = {
        school: schoolId,
        $and: [
            parentNotificationFilter,
            buildParentUpdateVisibilityClause({ childIds }),
            buildUnreadClause()
        ]
    };

    const result = await Notification.updateMany(query, {
        $set: {
            readAt: new Date(),
            status: 'read'
        }
    });

    return {
        updated: result.modifiedCount || 0
    };
};

const parsePositiveIntOrDefault = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeDateRange = (dateRange) => {
    if (!dateRange?.$gte && !dateRange?.$lte) return null;
    const normalized = {};
    if (dateRange.$gte instanceof Date) normalized.$gte = dateRange.$gte;
    if (dateRange.$lte instanceof Date) normalized.$lte = dateRange.$lte;
    return normalized.$gte || normalized.$lte ? normalized : null;
};

const resolveParentChildOrNull = async ({
    schoolId,
    parentUser,
    academicYear,
    childId
}) => getParentLinkedStudentById({
    schoolId,
    parentUser,
    academicYear,
    childId
});

export const getParentChildAttendanceSummary = async ({
    schoolId,
    parentUser,
    academicYear,
    childId,
    dateRange = null
}) => {
    const child = await resolveParentChildOrNull({
        schoolId,
        parentUser,
        academicYear,
        childId
    });
    if (!child) return null;

    const scopedRange = normalizeDateRange(dateRange);
    const matchQuery = {
        school: schoolId,
        'studentAttendance.student': child._id
    };
    if (scopedRange) {
        matchQuery.date = scopedRange;
    }

    const rows = await Attendance.aggregate([
        { $match: matchQuery },
        { $unwind: '$studentAttendance' },
        {
            $match: {
                'studentAttendance.student': child._id
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
                },
                absent: {
                    $sum: {
                        $cond: [
                            { $in: ['$studentAttendance.status', ABSENT_STATUSES] },
                            1,
                            0
                        ]
                    }
                },
                late: {
                    $sum: {
                        $cond: [
                            { $in: ['$studentAttendance.status', LATE_STATUSES] },
                            1,
                            0
                        ]
                    }
                }
            }
        }
    ]);

    const stats = rows[0] || { total: 0, attended: 0, absent: 0, late: 0 };
    const attendanceRate = stats.total > 0
        ? Number(((stats.attended / stats.total) * 100).toFixed(1))
        : 0;

    return {
        childId: child._id,
        present: stats.attended,
        absent: stats.absent,
        late: stats.late,
        attendanceRate
    };
};

const roundOneDecimal = (value) => Number(Number(value || 0).toFixed(1));

const computeAssessmentPercentage = ({ marks, maxMarks }) => {
    const earned = Number(marks || 0);
    const possible = Number(maxMarks || 0);
    if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible <= 0) {
        return null;
    }
    return roundOneDecimal((earned / possible) * 100);
};

const mapGradeForParent = (grade) => ({
    id: grade._id,
    subject: grade.subject ? {
        id: grade.subject._id,
        name: grade.subject.name || '',
        code: grade.subject.code || ''
    } : null,
    gradeType: grade.gradeType,
    category: grade.category || '',
    title: grade.title || grade.examName || '',
    marks: grade.marks,
    maxMarks: grade.maxMarks,
    percentage: computeAssessmentPercentage({
        marks: grade.marks,
        maxMarks: grade.maxMarks
    }),
    semester: grade.semester,
    month: grade.month,
    date: grade.date,
    remarks: grade.remarks || '',
    notes: grade.notes || ''
});

const aggregateGradeSummary = (grades = []) => {
    const bySubject = new Map();
    let overallPercentageTotal = 0;
    let overallPercentageCount = 0;

    grades.forEach((grade) => {
        if (!grade.subject) return;
        const key = String(grade.subject.id);
        if (!bySubject.has(key)) {
            bySubject.set(key, {
                subjectId: grade.subject.id,
                subjectName: grade.subject.name || '',
                subjectCode: grade.subject.code || '',
                totalMarks: 0,
                totalMaxMarks: 0,
                assessments: 0,
                percentageTotal: 0,
                percentageCount: 0
            });
        }
        const item = bySubject.get(key);
        item.totalMarks += Number(grade.marks || 0);
        item.totalMaxMarks += Number(grade.maxMarks || 0);
        item.assessments += 1;

        if (Number.isFinite(grade.percentage)) {
            item.percentageTotal += grade.percentage;
            item.percentageCount += 1;
            overallPercentageTotal += grade.percentage;
            overallPercentageCount += 1;
        }
    });

    const subjects = [...bySubject.values()].map((item) => ({
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        subjectCode: item.subjectCode,
        totalMarks: item.totalMarks,
        totalMaxMarks: item.totalMaxMarks,
        assessments: item.assessments,
        average: item.percentageCount > 0
            ? roundOneDecimal(item.percentageTotal / item.percentageCount)
            : 0
    }));

    return {
        subjects: subjects.sort((left, right) => left.subjectName.localeCompare(right.subjectName)),
        overallAverage: overallPercentageCount > 0
            ? roundOneDecimal(overallPercentageTotal / overallPercentageCount)
            : 0
    };
};

const normalizeCategory = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'other';
};

const createCategoryAccumulator = () => ({
    percentageTotal: 0,
    count: 0
});

const mapCategoryAccumulatorToResponse = (category, item) => ({
    category,
    averagePercentage: item.count > 0 ? roundOneDecimal(item.percentageTotal / item.count) : 0,
    assessments: item.count
});

const buildCategoryBreakdown = (grades = []) => {
    const categories = new Map();

    grades.forEach((grade) => {
        if (!Number.isFinite(grade.percentage)) return;
        const category = normalizeCategory(grade.category);
        if (!categories.has(category)) {
            categories.set(category, createCategoryAccumulator());
        }
        const entry = categories.get(category);
        entry.percentageTotal += grade.percentage;
        entry.count += 1;
    });

    return [...categories.entries()]
        .map(([category, item]) => mapCategoryAccumulatorToResponse(category, item))
        .sort((left, right) => left.category.localeCompare(right.category));
};

const buildMonthKey = (dateInput) => {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return null;
    const year = String(date.getFullYear());
    const monthNumber = date.getMonth() + 1;
    const month = String(monthNumber).padStart(2, '0');
    const monthLabel = `${MONTH_LABELS[monthNumber - 1]} ${year}`;
    return {
        key: `${year}-${month}`,
        label: monthLabel
    };
};

const buildMonthlyBreakdown = (grades = []) => {
    const byMonth = new Map();

    grades.forEach((grade) => {
        if (!Number.isFinite(grade.percentage)) return;
        const month = buildMonthKey(grade.date);
        if (!month) return;
        if (!byMonth.has(month.key)) {
            byMonth.set(month.key, {
                month: month.key,
                monthLabel: month.label,
                percentageTotal: 0,
                count: 0,
                categories: new Map()
            });
        }

        const monthRow = byMonth.get(month.key);
        monthRow.percentageTotal += grade.percentage;
        monthRow.count += 1;

        const category = normalizeCategory(grade.category);
        if (!monthRow.categories.has(category)) {
            monthRow.categories.set(category, createCategoryAccumulator());
        }
        const categoryRow = monthRow.categories.get(category);
        categoryRow.percentageTotal += grade.percentage;
        categoryRow.count += 1;
    });

    return [...byMonth.values()]
        .sort((left, right) => right.month.localeCompare(left.month))
        .map((item) => ({
            month: item.month,
            monthLabel: item.monthLabel,
            averagePercentage: item.count > 0 ? roundOneDecimal(item.percentageTotal / item.count) : 0,
            assessments: item.count,
            categories: [...item.categories.entries()]
                .map(([category, row]) => mapCategoryAccumulatorToResponse(category, row))
                .sort((left, right) => left.category.localeCompare(right.category))
        }));
};

export const getParentChildGrades = async ({
    schoolId,
    parentUser,
    academicYear,
    childId,
    subjectId = null,
    semester = null,
    dateRange = null,
    page = 1,
    limit = 50
}) => {
    const child = await resolveParentChildOrNull({
        schoolId,
        parentUser,
        academicYear,
        childId
    });
    if (!child) return null;

    const pageNumber = parsePositiveIntOrDefault(page, 1);
    const pageSize = Math.min(parsePositiveIntOrDefault(limit, 50), 100);

    const query = {
        school: schoolId,
        student: child._id,
        academicYear
    };
    if (subjectId) query.subject = subjectId;
    if (Number.isFinite(semester) && (semester === 1 || semester === 2)) {
        query.semester = semester;
    }
    const scopedRange = normalizeDateRange(dateRange);
    if (scopedRange) {
        query.date = scopedRange;
    }

    const [rows, total] = await Promise.all([
        Grade.find(query)
            .populate('subject', 'name code')
            .sort({ date: -1, createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize)
            .lean(),
        Grade.countDocuments(query)
    ]);

    const grades = rows.map(mapGradeForParent);

    return {
        childId: child._id,
        grades,
        summary: aggregateGradeSummary(grades),
        pagination: {
            page: pageNumber,
            limit: pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        }
    };
};

export const getParentChildAcademicStats = async ({
    schoolId,
    parentUser,
    academicYear,
    childId,
    dateRange = null
}) => {
    const child = await resolveParentChildOrNull({
        schoolId,
        parentUser,
        academicYear,
        childId
    });
    if (!child) return null;

    const query = {
        school: schoolId,
        student: child._id,
        academicYear
    };
    const scopedRange = normalizeDateRange(dateRange);
    if (scopedRange) {
        query.date = scopedRange;
    }

    const rows = await Grade.find(query)
        .populate('subject', 'name code')
        .sort({ date: -1, createdAt: -1 })
        .lean();
    const grades = rows.map(mapGradeForParent);
    const summary = aggregateGradeSummary(grades);

    return {
        childId: child._id,
        scoreMethod: 'average_percentage',
        period: 'month',
        overallAverage: summary.overallAverage,
        subjects: summary.subjects.map((item) => ({
            subjectId: item.subjectId,
            subjectName: item.subjectName,
            subjectCode: item.subjectCode,
            overallAverage: item.average,
            assessments: item.assessments
        }))
    };
};

export const getParentChildSubjectAcademicStats = async ({
    schoolId,
    parentUser,
    academicYear,
    childId,
    subjectId,
    dateRange = null
}) => {
    const child = await resolveParentChildOrNull({
        schoolId,
        parentUser,
        academicYear,
        childId
    });
    if (!child) return null;

    const query = {
        school: schoolId,
        student: child._id,
        academicYear,
        subject: subjectId
    };
    const scopedRange = normalizeDateRange(dateRange);
    if (scopedRange) {
        query.date = scopedRange;
    }

    const rows = await Grade.find(query)
        .populate('subject', 'name code')
        .sort({ date: -1, createdAt: -1 })
        .lean();
    const grades = rows.map(mapGradeForParent).filter((item) => item.subject);

    if (grades.length === 0) {
        return {
            childId: child._id,
            subject: null,
            scoreMethod: 'average_percentage',
            period: 'month',
            overallAverage: 0,
            assessments: 0,
            categories: [],
            monthlyBreakdown: []
        };
    }

    const subject = grades[0].subject;
    const validPercentages = grades
        .map((grade) => grade.percentage)
        .filter((value) => Number.isFinite(value));
    const overallAverage = validPercentages.length > 0
        ? roundOneDecimal(validPercentages.reduce((sum, value) => sum + value, 0) / validPercentages.length)
        : 0;

    return {
        childId: child._id,
        subject,
        scoreMethod: 'average_percentage',
        period: 'month',
        overallAverage,
        assessments: grades.length,
        categories: buildCategoryBreakdown(grades),
        monthlyBreakdown: buildMonthlyBreakdown(grades)
    };
};

const startOfDay = (date) => {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
};

const endOfDay = (date) => {
    const value = new Date(date);
    value.setHours(23, 59, 59, 999);
    return value;
};

const getWeekWindow = (dateValue) => {
    const date = new Date(dateValue);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const day = safeDate.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = startOfDay(new Date(safeDate.getFullYear(), safeDate.getMonth(), safeDate.getDate() + mondayOffset));
    const weekEnd = endOfDay(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6));
    return { weekStart, weekEnd };
};

const mapTimetableEntry = (assignment, dayOfWeek) => ({
    id: `${assignment._id}:${dayOfWeek}`,
    assignmentId: assignment._id,
    dayOfWeek,
    dayLabel: DAY_LABELS[dayOfWeek] || '',
    period: assignment.period ? {
        id: assignment.period._id,
        name: assignment.period.name,
        startTime: assignment.period.startTime,
        endTime: assignment.period.endTime,
        order: assignment.period.order
    } : null,
    subject: assignment.subject ? {
        id: assignment.subject._id,
        name: assignment.subject.name || '',
        code: assignment.subject.code || ''
    } : null,
    room: assignment.room ? {
        id: assignment.room._id,
        name: assignment.room.name || ''
    } : null,
    teacher: assignment.teacher ? {
        id: assignment.teacher._id,
        name: `${assignment.teacher.firstName || ''} ${assignment.teacher.lastName || ''}`.trim()
    } : null
});

export const getParentChildTimetable = async ({
    schoolId,
    parentUser,
    academicYear,
    childId,
    referenceDate = new Date()
}) => {
    const child = await resolveParentChildOrNull({
        schoolId,
        parentUser,
        academicYear,
        childId
    });
    if (!child) return null;

    const { weekStart, weekEnd } = getWeekWindow(referenceDate);

    if (!child.currentClass?._id) {
        return {
            childId: child._id,
            class: null,
            weekStart,
            weekEnd,
            entries: []
        };
    }

    const assignments = await TeacherPeriodAssignment.find({
        school: schoolId,
        class: child.currentClass._id,
        isActive: true,
        startDate: { $lte: weekEnd },
        endDate: { $gte: weekStart }
    })
        .populate('period', 'name startTime endTime order')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .populate('teacher', 'firstName lastName')
        .sort({ 'period.order': 1, 'period.startTime': 1 })
        .lean();

    const entries = assignments.flatMap((assignment) => {
        const days = Array.isArray(assignment.daysOfWeek) && assignment.daysOfWeek.length > 0
            ? assignment.daysOfWeek
            : [1, 2, 3, 4, 5];
        return days
            .filter((day) => day >= 0 && day <= 6)
            .map((day) => mapTimetableEntry(assignment, day));
    });

    return {
        childId: child._id,
        class: child.currentClass ? {
            id: child.currentClass._id,
            name: child.currentClass.name || '',
            grade: toGradeLabel(child.currentClass.grade),
            section: child.currentClass.section || ''
        } : null,
        weekStart,
        weekEnd,
        entries: entries.sort((a, b) => {
            if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
            const aOrder = a.period?.order ?? 999;
            const bOrder = b.period?.order ?? 999;
            return aOrder - bOrder;
        })
    };
};

const resolveReportNotificationTypes = (type) => {
    if (!type) {
        return [...new Set(Object.values(REPORT_TYPE_MAP).flat())];
    }
    return REPORT_TYPE_MAP[type] || [];
};

const mapNotificationTypeToReportType = (type) => {
    if (REPORT_TYPE_MAP.daily.includes(type)) return 'daily';
    if (REPORT_TYPE_MAP.monthly.includes(type)) return 'monthly';
    if (REPORT_TYPE_MAP.ai.includes(type)) return 'ai';
    return 'other';
};

export const getParentChildReports = async ({
    schoolId,
    parentUser,
    academicYear,
    childId,
    type = null,
    period = null,
    page = 1,
    limit = 20
}) => {
    const child = await resolveParentChildOrNull({
        schoolId,
        parentUser,
        academicYear,
        childId
    });
    if (!child) return null;

    const allowedTypes = resolveReportNotificationTypes(type);
    if (type && allowedTypes.length === 0) {
        return {
            childId: child._id,
            reports: [],
            pagination: {
                page: parsePositiveIntOrDefault(page, 1),
                limit: Math.min(parsePositiveIntOrDefault(limit, 20), 100),
                total: 0,
                totalPages: 0
            }
        };
    }

    const pageNumber = parsePositiveIntOrDefault(page, 1);
    const pageSize = Math.min(parsePositiveIntOrDefault(limit, 20), 100);
    const parentNotificationFilter = buildParentNotificationFilter(parentUser);

    const listQuery = {
        school: schoolId,
        student: child._id,
        type: { $in: allowedTypes },
        ...parentNotificationFilter
    };
    if (period) {
        const escaped = escapeRegex(String(period).trim());
        if (escaped) {
            listQuery.subject = new RegExp(escaped, 'i');
        }
    }

    const [notifications, total] = await Promise.all([
        Notification.find(listQuery)
            .select('_id type subject message htmlContent channels status createdAt readAt')
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize)
            .lean(),
        Notification.countDocuments(listQuery)
    ]);

    return {
        childId: child._id,
        reports: notifications.map((row) => ({
            id: row._id,
            type: mapNotificationTypeToReportType(row.type),
            sourceType: row.type,
            title: row.subject || '',
            preview: trimMessagePreview(row.message),
            hasHtmlContent: Boolean(String(row.htmlContent || '').trim()),
            isRead: Boolean(row.readAt),
            createdAt: row.createdAt
        })),
        pagination: {
            page: pageNumber,
            limit: pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        }
    };
};

const buildParentSettingsResponse = (input = DEFAULT_PARENT_SETTINGS) => ({
    language: String(input.language || DEFAULT_PARENT_SETTINGS.language).toLowerCase(),
    notifications: {
        push: Boolean(input.notifications?.push ?? DEFAULT_PARENT_SETTINGS.notifications.push),
        email: Boolean(input.notifications?.email ?? DEFAULT_PARENT_SETTINGS.notifications.email),
        attendance: Boolean(input.notifications?.attendance ?? DEFAULT_PARENT_SETTINGS.notifications.attendance),
        grades: Boolean(input.notifications?.grades ?? DEFAULT_PARENT_SETTINGS.notifications.grades),
        reports: Boolean(input.notifications?.reports ?? DEFAULT_PARENT_SETTINGS.notifications.reports)
    }
});

const normalizeLanguage = (value, fallback = DEFAULT_PARENT_SETTINGS.language) => {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    return normalized || fallback;
};

export const getParentSettings = async ({ schoolId, parentUser }) => {
    const settings = await ParentSetting.findOne({
        school: schoolId,
        user: parentUser._id
    })
        .select('language notifications')
        .lean();

    if (!settings) return buildParentSettingsResponse();
    return buildParentSettingsResponse(settings);
};

export const updateParentSettings = async ({ schoolId, parentUser, payload = {} }) => {
    const existing = await ParentSetting.findOne({
        school: schoolId,
        user: parentUser._id
    })
        .select('language notifications')
        .lean();

    const base = buildParentSettingsResponse(existing || DEFAULT_PARENT_SETTINGS);
    const nextSettings = {
        language: normalizeLanguage(payload.language, base.language),
        notifications: {
            push: typeof payload.notifications?.push === 'boolean' ? payload.notifications.push : base.notifications.push,
            email: typeof payload.notifications?.email === 'boolean' ? payload.notifications.email : base.notifications.email,
            attendance: typeof payload.notifications?.attendance === 'boolean' ? payload.notifications.attendance : base.notifications.attendance,
            grades: typeof payload.notifications?.grades === 'boolean' ? payload.notifications.grades : base.notifications.grades,
            reports: typeof payload.notifications?.reports === 'boolean' ? payload.notifications.reports : base.notifications.reports
        }
    };

    const updated = await ParentSetting.findOneAndUpdate(
        { school: schoolId, user: parentUser._id },
        {
            $set: {
                language: nextSettings.language,
                notifications: nextSettings.notifications
            }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true
        }
    )
        .select('language notifications')
        .lean();

    return buildParentSettingsResponse(updated || nextSettings);
};
