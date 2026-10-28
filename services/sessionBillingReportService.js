import mongoose from 'mongoose';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import User from '../models/User.js';
import SessionBillingEntry from '../models/SessionBillingEntry.js';
import SessionBillingIssue from '../models/SessionBillingIssue.js';
import SessionBillingAudit from '../models/SessionBillingAudit.js';
import SessionBillingPackagePurchase from '../models/SessionBillingPackagePurchase.js';
import SessionBillingEmailDelivery from '../models/SessionBillingEmailDelivery.js';
import {
    getBillingSettings,
    getOptedOutEmailSet,
    getStudentContacts,
    issueLabel,
    packageHourlyRate,
    paymentMethodChoices,
    resolveBillingDateRange
} from './sessionBillingService.js';


const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

const isoDay = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const studentName = (student) => `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student';

const nameOfUser = (user) => {
    if (!user) return '';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
};

const daysBetween = (from, to = new Date()) => {
    if (!from) return null;
    const start = new Date(from).getTime();
    const end = new Date(to).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return Math.max(0, Math.floor((end - start) / DAY_MS));
};

const BALANCE_EXPR = {
    $switch: {
        branches: [
            { case: { $eq: ['$kind', 'payment'] }, then: '$amount' },
            { case: { $eq: ['$kind', 'charge'] }, then: { $multiply: ['$amount', -1] } },
            { case: { $eq: ['$kind', 'refund'] }, then: { $multiply: ['$amount', -1] } },
            {
                case: {
                    $and: [
                        { $eq: ['$kind', 'adjustment'] },
                        { $eq: ['$direction', 'debit'] }
                    ]
                },
                then: { $multiply: ['$amount', -1] }
            },
            { case: { $eq: ['$kind', 'adjustment'] }, then: '$amount' }
        ],
        default: 0
    }
};

const previousRange = (range) => {
    const duration = range.end.getTime() - range.start.getTime() + 1;
    const end = new Date(range.start.getTime() - 1);
    return { start: new Date(end.getTime() - duration + 1), end };
};

const changePct = (current, previous) => {
    if (!previous) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
};

const buildBuckets = (range) => {
    const days = Math.max(1, Math.ceil((range.end - range.start) / DAY_MS));
    const buckets = [];
    if (days <= 92) {
        let cursor = new Date(range.start);
        while (cursor <= range.end) {
            const start = new Date(cursor);
            const end = new Date(Math.min(cursor.getTime() + 7 * DAY_MS - 1, range.end.getTime()));
            buckets.push({ start, end, charged: 0, paid: 0, minutes: 0, lessons: 0 });
            cursor = new Date(end.getTime() + 1);
        }
    } else {
        let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
        while (cursor <= range.end) {
            const start = new Date(Math.max(cursor.getTime(), range.start.getTime()));
            const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            const end = new Date(Math.min(nextMonth.getTime() - 1, range.end.getTime()));
            buckets.push({ start, end, charged: 0, paid: 0, minutes: 0, lessons: 0 });
            cursor = nextMonth;
        }
    }
    return buckets;
};

const bucketFor = (buckets, at) => {
    const time = new Date(at).getTime();
    if (!Number.isFinite(time)) return null;
    return buckets.find((bucket) => time >= bucket.start.getTime() && time <= bucket.end.getTime()) || null;
};

const trendView = (buckets) => buckets.map((bucket) => ({
    from: bucket.start,
    to: bucket.end,
    label: bucket.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    charged: round2(bucket.charged),
    paid: round2(bucket.paid),
    minutes: round1(bucket.minutes),
    lessons: bucket.lessons
}));

const loadOverviewStudents = async (schoolId, studentIds) => {
    if (!studentIds.length) return [];
    return Student.find({ school: schoolId, _id: { $in: studentIds } })
        .select('firstName lastName user currentClass enrolledClasses')
        .lean();
};

const loadClassMap = async (schoolId, classIds) => {
    if (!classIds.length) return new Map();
    const docs = await Class.find({ school: schoolId, _id: { $in: classIds } })
        .select('name grade section')
        .lean();
    return new Map(docs.map((klass) => [String(klass._id), klass]));
};

const loadUserMap = async (userIds) => {
    const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const docs = await User.find({ _id: { $in: ids } })
        .select('firstName lastName')
        .lean();
    return new Map(docs.map((doc) => [String(doc._id), nameOfUser(doc)]));
};

const issueAction = (reason) => {
    if (reason === 'missing-rate') return { tab: 'settings', section: 'rates', label: 'Set a rate' };
    if (reason === 'missing-student') return { tab: 'lessons', status: 'unbilled', label: 'Review roster' };
    if (reason === 'duplicate-manual') return { tab: 'lessons', status: 'review', label: 'Review duplicate' };
    if (reason === 'statement-failed') return { tab: 'messages', label: 'Retry delivery' };
    if (reason === 'no-attendance' || reason === 'zero-amount') return { tab: 'lessons', status: 'unbilled', label: 'Review lesson' };
    return { tab: 'lessons', status: 'unbilled', label: 'Open queue' };
};

export const getBillingOverview = async (schoolId, query = {}) => {
    const range = resolveBillingDateRange(query);
    const prev = previousRange(range);
    const schoolObjectId = new mongoose.Types.ObjectId(String(schoolId));
    const settings = await getBillingSettings(schoolId);

    const [balanceRows, rangeRows, classRows, previousRows, openIssues, recentEntries, recentAudit, recentDeliveries, failedDeliveries, activePackages] = await Promise.all([
        SessionBillingEntry.aggregate([
            { $match: { school: schoolObjectId, status: 'active' } },
            {
                $group: {
                    _id: '$student',
                    balance: { $sum: BALANCE_EXPR },
                    charged: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$amount', 0] } },
                    paid: { $sum: { $cond: [{ $eq: ['$kind', 'payment'] }, '$amount', 0] } },
                    refunded: { $sum: { $cond: [{ $eq: ['$kind', 'refund'] }, '$amount', 0] } },
                    minutes: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$minutes', 0] } },
                    lastAt: { $max: '$occurredAt' },
                    lastPaymentAt: {
                        $max: {
                            $cond: [{ $eq: ['$kind', 'payment'] }, '$occurredAt', null]
                        }
                    }
                }
            }
        ]),
        SessionBillingEntry.aggregate([
            {
                $match: {
                    school: schoolObjectId,
                    status: 'active',
                    occurredAt: { $gte: range.start, $lte: range.end }
                }
            },
            {
                $group: {
                    _id: { student: '$student', kind: '$kind', direction: '$direction' },
                    total: { $sum: '$amount' },
                    minutes: { $sum: '$minutes' },
                    entries: { $sum: 1 }
                }
            }
        ]),
        SessionBillingEntry.aggregate([
            {
                $match: {
                    school: schoolObjectId,
                    kind: 'charge',
                    status: 'active',
                    occurredAt: { $gte: range.start, $lte: range.end }
                }
            },
            {
                $group: {
                    _id: '$classId',
                    charged: { $sum: '$amount' },
                    minutes: { $sum: '$minutes' },
                    sessions: { $sum: 1 },
                    students: { $addToSet: '$student' }
                }
            },
            { $sort: { charged: -1 } }
        ]),
        SessionBillingEntry.aggregate([
            {
                $match: {
                    school: schoolObjectId,
                    status: 'active',
                    occurredAt: { $gte: prev.start, $lte: prev.end }
                }
            },
            {
                $group: {
                    _id: null,
                    charged: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$amount', 0] } },
                    paid: { $sum: { $cond: [{ $eq: ['$kind', 'payment'] }, '$amount', 0] } },
                    minutes: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$minutes', 0] } },
                    sessions: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, 1, 0] } }
                }
            }
        ]),
        SessionBillingIssue.find({
            school: schoolId,
            status: 'open',
            occurredAt: { $gte: range.start, $lte: range.end }
        }).sort({ occurredAt: -1 }).limit(50).lean(),
        SessionBillingEntry.find({
            school: schoolId,
            occurredAt: { $gte: range.start, $lte: range.end }
        }).sort({ occurredAt: -1 }).limit(14).lean(),
        SessionBillingAudit.find({
            school: schoolId,
            createdAt: { $gte: range.start, $lte: range.end }
        }).sort({ createdAt: -1 }).limit(10).lean(),
        SessionBillingEmailDelivery.find({
            school: schoolId,
            status: 'sent',
            deliveredAt: { $gte: range.start, $lte: range.end }
        }).sort({ deliveredAt: -1 }).limit(8).lean(),
        SessionBillingEmailDelivery.find({
            school: schoolId,
            status: 'failed',
            purpose: { $in: ['statement', 'reminder'] },
            createdAt: { $gte: range.start, $lte: range.end }
        }).sort({ createdAt: -1 }).limit(5).lean(),
        SessionBillingPackagePurchase.find({
            school: schoolId,
            status: 'active',
            minutesRemaining: { $gt: 0 }
        }).select('student name minutesRemaining expiresAt').lean()
    ]);

    const studentIds = [...new Set([
        ...balanceRows.map((row) => String(row._id)),
        ...rangeRows.map((row) => String(row._id.student))
    ])];
    const students = await loadOverviewStudents(schoolId, studentIds);
    const studentById = new Map(students.map((student) => [String(student._id), student]));
    const classIds = [...new Set([
        ...classRows.map((row) => row._id).filter(Boolean).map(String),
        ...students.flatMap((student) => [
            student.currentClass ? String(student.currentClass) : '',
            ...(student.enrolledClasses || []).map(String)
        ]).filter(Boolean)
    ])];
    const classById = await loadClassMap(schoolId, classIds);

    const activityByStudent = new Map();
    for (const row of rangeRows) {
        const studentId = String(row._id.student);
        const current = activityByStudent.get(studentId) || {
            charged: 0,
            paid: 0,
            refunded: 0,
            credited: 0,
            debited: 0,
            minutes: 0,
            sessions: 0
        };
        if (row._id.kind === 'charge') {
            current.charged += row.total;
            current.minutes += row.minutes || 0;
            current.sessions += row.entries;
        } else if (row._id.kind === 'payment') {
            current.paid += row.total;
        } else if (row._id.kind === 'refund') {
            current.refunded += row.total;
        } else if (row._id.kind === 'adjustment') {
            if (row._id.direction === 'debit') current.debited += row.total;
            else current.credited += row.total;
        }
        activityByStudent.set(studentId, current);
    }

    const issueStudentIds = new Set(openIssues.map((issue) => String(issue.student || '')).filter(Boolean));
    const rows = studentIds.map((studentId) => {
        const balanceRow = balanceRows.find((row) => String(row._id) === studentId);
        const activity = activityByStudent.get(studentId) || {
            charged: 0,
            paid: 0,
            refunded: 0,
            credited: 0,
            debited: 0,
            minutes: 0,
            sessions: 0
        };
        const student = studentById.get(studentId);
        const memberships = student
            ? [
                student.currentClass ? String(student.currentClass) : '',
                ...(student.enrolledClasses || []).map(String)
            ].filter(Boolean)
            : [];
        const balance = round2(balanceRow?.balance || 0);
        return {
            studentId,
            name: studentName(student),
            balance,
            charged: round2(balanceRow?.charged || 0),
            paid: round2(balanceRow?.paid || 0),
            refunded: round2(balanceRow?.refunded || 0),
            minutes: round1(balanceRow?.minutes || 0),
            rangeCharged: round2(activity.charged),
            rangePaid: round2(activity.paid),
            rangeRefunded: round2(activity.refunded),
            rangeCredited: round2(activity.credited),
            rangeDebited: round2(activity.debited),
            rangeMinutes: round1(activity.minutes),
            rangeSessions: activity.sessions,
            lastAt: balanceRow?.lastAt || null,
            lastPaymentAt: balanceRow?.lastPaymentAt || null,
            classIds: [...new Set(memberships)],
            classes: [...new Set(memberships)]
                .map((id) => classById.get(id)?.name || '')
                .filter(Boolean),
            needsReview: issueStudentIds.has(studentId)
        };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const classFilter = query.classId && mongoose.Types.ObjectId.isValid(String(query.classId))
        ? String(query.classId)
        : '';
    const studentFilter = query.studentId && mongoose.Types.ObjectId.isValid(String(query.studentId))
        ? String(query.studentId)
        : '';
    const statusFilter = ['owed', 'credit', 'settled', 'review'].includes(String(query.status))
        ? String(query.status)
        : '';
    const search = String(query.search || '').trim().toLowerCase();

    const filtered = rows.filter((row) => {
        if (studentFilter && row.studentId !== studentFilter) return false;
        if (classFilter && !row.classIds.includes(classFilter)) return false;
        if (search && !row.name.toLowerCase().includes(search)) return false;
        if (statusFilter === 'owed' && row.balance >= 0) return false;
        if (statusFilter === 'credit' && row.balance <= 0) return false;
        if (statusFilter === 'settled' && row.balance !== 0) return false;
        if (statusFilter === 'review' && !row.needsReview) return false;
        return true;
    });

    const rangeTotals = filtered.reduce((totals, row) => ({
        charged: totals.charged + row.rangeCharged,
        paid: totals.paid + row.rangePaid,
        refunded: totals.refunded + row.rangeRefunded,
        minutes: totals.minutes + row.rangeMinutes,
        sessions: totals.sessions + row.rangeSessions
    }), { charged: 0, paid: 0, refunded: 0, minutes: 0, sessions: 0 });

    const owedRows = filtered.filter((row) => row.balance < 0);
    const creditRows = filtered.filter((row) => row.balance > 0);
    const settledCount = filtered.filter((row) => row.balance === 0).length;
    const owedTotal = owedRows.reduce((total, row) => total + -row.balance, 0);
    const creditTotal = creditRows.reduce((total, row) => total + row.balance, 0);

    const previous = previousRows[0] || { charged: 0, paid: 0, minutes: 0, sessions: 0 };

    const relevantIssues = openIssues.filter((issue) => {
        if (classFilter && String(issue.classId || '') !== classFilter) return false;
        if (studentFilter && String(issue.student || '') !== studentFilter) return false;
        return true;
    });

    const unbilledMinutes = relevantIssues.reduce((total, issue) => total + (issue.minutes || 0), 0);

    const buckets = buildBuckets(range);
    const trendEntries = await SessionBillingEntry.find({
        school: schoolId,
        status: 'active',
        occurredAt: { $gte: range.start, $lte: range.end }
    }).select('kind occurredAt amount minutes').lean();
    for (const entry of trendEntries) {
        const bucket = bucketFor(buckets, entry.occurredAt);
        if (!bucket) continue;
        if (entry.kind === 'charge') {
            bucket.charged += Number(entry.amount) || 0;
            bucket.minutes += Number(entry.minutes) || 0;
            bucket.lessons += 1;
        } else if (entry.kind === 'payment') {
            bucket.paid += Number(entry.amount) || 0;
        }
    }

    const totalChargedAll = classRows.reduce((total, row) => total + row.charged, 0);
    const globalPaid = rangeTotals.paid;
    const classes = classRows
        .filter((row) => !classFilter || String(row._id) === classFilter)
        .map((row) => {
            const klass = classById.get(String(row._id));
            const members = filtered.filter((student) => student.classIds.includes(String(row._id)));
            const outstanding = members.reduce((total, student) => total + (student.balance < 0 ? -student.balance : 0), 0);
            const paidShare = totalChargedAll > 0 ? globalPaid * (row.charged / totalChargedAll) : 0;
            return {
                classId: row._id ? String(row._id) : '',
                name: klass?.name || 'Removed class',
                charged: round2(row.charged),
                paid: round2(paidShare),
                outstanding: round2(outstanding),
                minutes: round1(row.minutes || 0),
                sessions: row.sessions,
                students: (row.students || []).length,
                studentsWithBalance: members.filter((student) => student.balance !== 0).length,
                effectiveHourlyRate: row.minutes > 0 ? round2((row.charged / row.minutes) * 60) : 0
            };
        });

    const attention = [];
    for (const issue of relevantIssues.slice(0, 6)) {
        attention.push({
            id: `issue-${issue._id}`,
            type: 'issue',
            severity: issue.reason === 'missing-rate' ? 'danger' : 'warning',
            title: issueLabel(issue.reason),
            detail: issue.detail || issue.sessionTitle || 'A lesson could not be billed.',
            at: issue.occurredAt,
            action: issueAction(issue.reason)
        });
    }
    const overdueCutoff = new Date(Date.now() - settings.reminder.afterDays * DAY_MS);
    for (const row of owedRows
        .filter((student) => !student.lastPaymentAt || new Date(student.lastPaymentAt) < overdueCutoff)
        .slice(0, 4)) {
        attention.push({
            id: `owed-${row.studentId}`,
            type: 'balance',
            severity: 'warning',
            title: `${row.name} owes ${round2(-row.balance)}`,
            detail: row.lastPaymentAt
                ? `No payment recorded since ${isoDay(row.lastPaymentAt)}.`
                : 'No payment has been recorded for this account.',
            at: row.lastPaymentAt || row.lastAt,
            action: { tab: 'students', studentId: row.studentId, label: 'Open account' }
        });
    }
    for (const delivery of failedDeliveries) {
        attention.push({
            id: `email-${delivery._id}`,
            type: 'delivery',
            severity: 'danger',
            title: 'Statement email failed',
            detail: delivery.error || `Delivery to ${delivery.recipientEmail} did not complete.`,
            at: delivery.createdAt,
            action: { tab: 'messages', label: 'Retry delivery' }
        });
    }
    for (const entry of recentEntries
        .filter((item) => item.kind === 'payment' && !item.reference && item.status === 'active')
        .slice(0, 3)) {
        attention.push({
            id: `reference-${entry._id}`,
            type: 'payment',
            severity: 'info',
            title: 'Payment without a reference',
            detail: `${round2(entry.amount)} ${entry.currency || settings.currency} recorded without a receipt or transfer reference.`,
            at: entry.occurredAt,
            action: { tab: 'payments', label: 'Open payments' }
        });
    }
    const expiryCutoff = new Date(Date.now() + settings.reminder.packageExpiryDays * DAY_MS);
    const expiringSoon = activePackages.filter(
        (purchase) => purchase.expiresAt && new Date(purchase.expiresAt) <= expiryCutoff
    );
    if (expiringSoon.length) {
        attention.push({
            id: 'packages-expiring',
            type: 'package',
            severity: 'warning',
            title: `${expiringSoon.length} package${expiringSoon.length === 1 ? '' : 's'} expiring soon`,
            detail: expiringSoon
                .slice(0, 3)
                .map((purchase) => `${purchase.name}: ${purchase.minutesRemaining} min`)
                .join(' · '),
            at: expiringSoon[0].expiresAt,
            action: { tab: 'students', label: 'Review packages' }
        });
    }
    if (!settings.defaultHourlyRate && !(settings.classRates || []).length) {
        attention.push({
            id: 'missing-rates',
            type: 'settings',
            severity: 'danger',
            title: 'No hourly rate is set',
            detail: 'Ended lessons cannot be charged until a school or class rate is added.',
            at: null,
            action: { tab: 'settings', section: 'rates', label: 'Set rates' }
        });
    }

    const recent = [
        ...recentEntries.map((entry) => ({
            id: `entry-${entry._id}`,
            type: entry.status === 'void' ? 'void' : entry.kind,
            title: entry.kind === 'payment'
                ? 'Payment received'
                : entry.kind === 'refund'
                    ? 'Refund issued'
                    : entry.kind === 'adjustment'
                        ? 'Balance adjustment'
                        : (entry.sessionTitle || 'Lesson charge'),
            detail: `${entry.source === 'manual' ? 'Manual · ' : ''}${entry.minutes ? `${Math.round(entry.minutes)} min · ` : ''}${entry.status === 'void' ? 'Voided' : (entry.currency || settings.currency)}`,
            amount: round2(entry.amount),
            direction: entry.kind === 'charge' || entry.kind === 'refund' ? 'out' : 'in',
            at: entry.occurredAt
        })),
        ...recentAudit.map((doc) => ({
            id: `audit-${doc._id}`,
            type: 'audit',
            title: doc.summary || doc.action,
            detail: doc.actorName || 'System',
            amount: null,
            direction: 'none',
            at: doc.createdAt
        })),
        ...recentDeliveries.map((delivery) => ({
            id: `delivery-${delivery._id}`,
            type: 'email',
            title: 'Statement emailed',
            detail: `${delivery.recipientEmail} · ${delivery.language}`,
            amount: null,
            direction: 'none',
            at: delivery.deliveredAt || delivery.createdAt
        }))
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 14);

    return {
        range: { from: range.start, to: range.end },
        previousRange: { from: prev.start, to: prev.end },
        totals: {
            charged: round2(rangeTotals.charged),
            paid: round2(rangeTotals.paid),
            refunded: round2(rangeTotals.refunded),
            minutes: round1(rangeTotals.minutes),
            sessions: rangeTotals.sessions,
            owed: round2(owedTotal),
            credit: round2(creditTotal),
            studentsWithBalance: owedRows.length + creditRows.length,
            unbilledCount: relevantIssues.length,
            unbilledMinutes: round1(unbilledMinutes),
            changes: {
                charged: changePct(rangeTotals.charged, previous.charged || 0),
                paid: changePct(rangeTotals.paid, previous.paid || 0),
                minutes: changePct(rangeTotals.minutes, previous.minutes || 0),
                sessions: changePct(rangeTotals.sessions, previous.sessions || 0)
            }
        },
        balanceStatus: {
            owed: { count: owedRows.length, amount: round2(owedTotal) },
            credit: { count: creditRows.length, amount: round2(creditTotal) },
            settled: { count: settledCount, amount: 0 }
        },
        students: filtered,
        classes,
        trend: trendView(buckets),
        attention: attention.slice(0, 10),
        recent,
        unbilled: relevantIssues.slice(0, 8).map((issue) => ({
            id: String(issue._id),
            reason: issue.reason,
            label: issueLabel(issue.reason),
            detail: issue.detail || '',
            minutes: issue.minutes || 0,
            studentName: issue.studentName || '',
            sessionTitle: issue.sessionTitle || '',
            occurredAt: issue.occurredAt
        })),
        settings: {
            currency: settings.currency,
            defaultHourlyRate: settings.defaultHourlyRate,
            roundingMinutes: settings.roundingMinutes,
            minimumBillableMinutes: settings.minimumBillableMinutes,
            noShowMinutes: settings.noShowMinutes,
            lateCancellationMinutes: settings.lateCancellationMinutes,
            graceMinutes: settings.graceMinutes,
            billingBasis: settings.billingBasis,
            excludePauseTime: settings.excludePauseTime,
            classRates: settings.classRates,
            studentRates: settings.studentRates,
            paymentMethods: paymentMethodChoices(settings),
            packagesEnabled: settings.packagesEnabled !== false,
            statement: settings.statement,
            reminder: settings.reminder
        }
    };
};

export const getStudentAccounts = async (schoolId, query = {}) => {
    const overview = await getBillingOverview(schoolId, query);
    const ids = overview.students.map((student) => student.studentId);
    if (!ids.length) {
        return {
            ...overview,
            currency: overview.settings.currency,
            students: []
        };
    }

    const docs = await Student.find({ school: schoolId, _id: { $in: ids } })
        .select('firstName lastName studentEmail email parentInfo user currentClass enrolledClasses')
        .populate('user', 'email');
    const docById = new Map(docs.map((doc) => [String(doc._id), doc]));

    const allContacts = docs.flatMap((doc) => doc.getAllContactEmailEntries());
    const optedOut = await getOptedOutEmailSet(schoolId, allContacts.map((contact) => contact.email));

    const [issues, deliveries, packages] = await Promise.all([
        SessionBillingIssue.find({
            school: schoolId,
            status: 'open',
            student: { $in: ids }
        }).select('student reason').lean(),
        SessionBillingEmailDelivery.aggregate([
            {
                $match: {
                    school: new mongoose.Types.ObjectId(String(schoolId)),
                    student: { $in: ids.map((id) => new mongoose.Types.ObjectId(String(id))) },
                    status: 'sent',
                    purpose: 'statement'
                }
            },
            {
                $group: {
                    _id: '$student',
                    lastSentAt: { $max: '$deliveredAt' },
                    sentCount: { $sum: 1 }
                }
            }
        ]),
        SessionBillingPackagePurchase.find({
            school: schoolId,
            student: { $in: ids },
            status: 'active',
            minutesRemaining: { $gt: 0 }
        }).select('student name minutesRemaining expiresAt price minutesIncluded').lean()
    ]);

    const issuesByStudent = new Map();
    for (const issue of issues) {
        if (!issue.student) continue;
        const key = String(issue.student);
        issuesByStudent.set(key, (issuesByStudent.get(key) || 0) + 1);
    }
    const deliveryByStudent = new Map(deliveries.map((row) => [String(row._id), row]));
    const packageByStudent = new Map(packages.map((purchase) => [String(purchase.student), purchase]));

    return {
        ...overview,
        currency: overview.settings.currency,
        students: overview.students.map((row) => {
            const doc = docById.get(row.studentId);
            const contacts = doc ? doc.getAllContactEmailEntries() : [];
            const available = contacts.filter((contact) => !optedOut.has(contact.email.toLowerCase()));
            const delivery = deliveryByStudent.get(row.studentId);
            const purchase = packageByStudent.get(row.studentId);
            return {
                ...row,
                contactCount: contacts.length,
                availableContactCount: available.length,
                hasContact: available.length > 0,
                openIssues: issuesByStudent.get(row.studentId) || 0,
                lastStatementAt: delivery?.lastSentAt || null,
                statementsSent: delivery?.sentCount || 0,
                statementStatus: delivery?.lastSentAt
                    ? `Sent ${isoDay(delivery.lastSentAt)}`
                    : 'Not sent',
                package: purchase ? {
                    name: purchase.name,
                    minutesRemaining: purchase.minutesRemaining,
                    minutesIncluded: purchase.minutesIncluded,
                    expiresAt: purchase.expiresAt,
                    effectiveHourlyRate: packageHourlyRate(purchase)
                } : null
            };
        })
    };
};

const lessonSourceFor = (entry) => {
    if (entry.source === 'auto') return 'platform';
    return entry.lessonSource && entry.lessonSource !== 'manual' ? entry.lessonSource : 'manual';
};

export const getLessons = async (schoolId, query = {}) => {
    const range = resolveBillingDateRange(query);
    const settings = await getBillingSettings(schoolId);
    const lessonFilter = {
        school: schoolId,
        kind: 'charge',
        occurredAt: { $gte: range.start, $lte: range.end }
    };
    if (query.classId && mongoose.Types.ObjectId.isValid(String(query.classId))) {
        lessonFilter.classId = query.classId;
    }
    if (query.studentId && mongoose.Types.ObjectId.isValid(String(query.studentId))) {
        lessonFilter.student = query.studentId;
    }
    if (query.teacherId && mongoose.Types.ObjectId.isValid(String(query.teacherId))) {
        lessonFilter.teacherId = query.teacherId;
    }
    if (query.status === 'voided') {
        lessonFilter.status = 'void';
    } else if (query.status !== 'unbilled' && query.status !== 'review') {
        lessonFilter.status = 'active';
    }

    const issueFilter = {
        school: schoolId,
        status: 'open',
        occurredAt: { $gte: range.start, $lte: range.end }
    };
    if (query.classId && mongoose.Types.ObjectId.isValid(String(query.classId))) {
        issueFilter.classId = query.classId;
    }
    if (query.studentId && mongoose.Types.ObjectId.isValid(String(query.studentId))) {
        issueFilter.student = query.studentId;
    }
    if (query.status === 'review') {
        issueFilter.reason = { $in: ['duplicate-manual', 'review-hold'] };
    }

    const [entries, issues] = await Promise.all([
        query.status === 'unbilled' || query.status === 'review'
            ? []
            : SessionBillingEntry.find(lessonFilter).sort({ occurredAt: -1 }).limit(2000).lean(),
        SessionBillingIssue.find(issueFilter).sort({ occurredAt: -1 }).limit(500).lean()
    ]);

    const studentIds = [...new Set(entries.map((entry) => String(entry.student)))];
    const classIds = [...new Set(entries.map((entry) => String(entry.classId || '')).filter(Boolean))];
    const teacherIds = [...new Set(entries.map((entry) => String(entry.teacherId || '')).filter(Boolean))];
    const allClassIds = [...new Set([
        ...classIds,
        ...issues.map((issue) => String(issue.classId || '')).filter(Boolean)
    ])];

    const [students, classes, teachers] = await Promise.all([
        studentIds.length
            ? Student.find({ school: schoolId, _id: { $in: studentIds } }).select('firstName lastName').lean()
            : [],
        allClassIds.length
            ? Class.find({ school: schoolId, _id: { $in: allClassIds } }).select('name').lean()
            : [],
        loadUserMap(teacherIds)
    ]);
    const studentById = new Map(students.map((student) => [String(student._id), student]));
    const classById = new Map(classes.map((klass) => [String(klass._id), klass]));

    const sourceFilter = String(query.source || '');
    const mapped = entries
        .filter((entry) => {
            if (!sourceFilter) return true;
            if (sourceFilter === 'platform') return entry.source === 'auto';
            if (sourceFilter === 'manual') return entry.source === 'manual';
            return entry.lessonSource === sourceFilter;
        })
        .map((entry) => ({
            id: String(entry._id),
            studentId: String(entry.student),
            studentName: studentName(studentById.get(String(entry.student))),
            classId: entry.classId ? String(entry.classId) : '',
            className: classById.get(String(entry.classId))?.name || 'Removed class',
            teacherId: entry.teacherId ? String(entry.teacherId) : '',
            teacherName: teachers.get(String(entry.teacherId)) || '',
            sessionId: entry.session ? String(entry.session) : '',
            sessionTitle: entry.sessionTitle || '',
            occurredAt: entry.occurredAt,
            source: entry.source,
            lessonSource: lessonSourceFor(entry),
            minutes: entry.minutes || 0,
            hourlyRate: entry.hourlyRate || 0,
            rateSource: entry.rateSource || '',
            grossAmount: entry.grossAmount !== undefined ? round2(entry.grossAmount) : round2(entry.amount),
            amount: round2(entry.amount),
            currency: entry.currency || settings.currency,
            packageCoveredMinutes: entry.packageCoveredMinutes || 0,
            status: entry.status,
            voidReason: entry.voidReason || '',
            note: entry.note || '',
            ruleSnapshot: entry.ruleSnapshot || null
        }));

    const totals = mapped.reduce((acc, entry) => {
        if (entry.status !== 'active') return acc;
        acc.charged = round2(acc.charged + entry.amount);
        acc.minutes = round1(acc.minutes + entry.minutes);
        acc.lessons += 1;
        return acc;
    }, { charged: 0, minutes: 0, lessons: 0 });

    return {
        range: { from: range.start, to: range.end },
        currency: settings.currency,
        entries: mapped,
        issues: issues.map((issue) => ({
            id: String(issue._id),
            reason: issue.reason,
            label: issueLabel(issue.reason),
            detail: issue.detail || '',
            status: issue.status,
            occurredAt: issue.occurredAt,
            minutes: issue.minutes || 0,
            studentId: issue.student ? String(issue.student) : '',
            studentName: issue.studentName || '',
            classId: issue.classId ? String(issue.classId) : '',
            className: issue.classId ? (classById.get(String(issue.classId))?.name || 'Removed class') : '',
            sessionId: issue.session ? String(issue.session) : '',
            sessionTitle: issue.sessionTitle || '',
            action: issueAction(issue.reason)
        })),
        totals: {
            ...totals,
            unbilled: issues.length,
            unbilledMinutes: round1(issues.reduce((total, issue) => total + (issue.minutes || 0), 0)),
            voided: mapped.filter((entry) => entry.status === 'void').length
        },
        settings: {
            currency: settings.currency,
            roundingMinutes: settings.roundingMinutes,
            minimumBillableMinutes: settings.minimumBillableMinutes,
            noShowMinutes: settings.noShowMinutes,
            lateCancellationMinutes: settings.lateCancellationMinutes,
            graceMinutes: settings.graceMinutes,
            billingBasis: settings.billingBasis,
            excludePauseTime: settings.excludePauseTime
        }
    };
};

export const getPayments = async (schoolId, query = {}) => {
    const range = resolveBillingDateRange(query);
    const settings = await getBillingSettings(schoolId);
    const filter = {
        school: schoolId,
        kind: { $in: ['payment', 'refund'] },
        occurredAt: { $gte: range.start, $lte: range.end }
    };
    if (query.studentId && mongoose.Types.ObjectId.isValid(String(query.studentId))) {
        filter.student = query.studentId;
    }
    if (query.method && paymentMethodChoices(settings).includes(String(query.method))) {
        filter.method = String(query.method);
    }
    if (query.status === 'voided') filter.status = 'void';
    else filter.status = 'active';

    const [entries, balanceRows, packages] = await Promise.all([
        SessionBillingEntry.find(filter).sort({ occurredAt: -1 }).limit(2000).lean(),
        SessionBillingEntry.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), status: 'active' } },
            { $group: { _id: '$student', balance: { $sum: BALANCE_EXPR } } }
        ]),
        SessionBillingPackagePurchase.find({
            school: schoolId,
            purchasedAt: { $gte: range.start, $lte: range.end },
            status: { $ne: 'cancelled' }
        }).select('price currency name minutesIncluded').lean()
    ]);

    const studentIds = [...new Set(entries.map((entry) => String(entry.student)))];
    const users = await loadUserMap(entries.map((entry) => entry.receivedBy || entry.createdBy));
    const students = studentIds.length
        ? await Student.find({ school: schoolId, _id: { $in: studentIds } }).select('firstName lastName').lean()
        : [];
    const studentById = new Map(students.map((student) => [String(student._id), student]));

    const receiptKeys = entries
        .filter((entry) => entry.kind === 'payment')
        .map((entry) => `receipt:${entry._id}`);
    const receipts = receiptKeys.length
        ? await SessionBillingEmailDelivery.find({
            school: schoolId,
            purpose: 'receipt',
            periodKey: { $in: receiptKeys },
            status: 'sent'
        }).select('periodKey deliveredAt recipientEmail').lean()
        : [];
    const receiptByEntry = new Map(receipts.map((receipt) => [receipt.periodKey, receipt]));

    const totals = {
        received: 0,
        refunded: 0,
        packagesSold: 0,
        unreferenced: 0
    };
    const byMethod = new Map();
    for (const entry of entries) {
        if (entry.status !== 'active') continue;
        const method = entry.method || 'other';
        if (!byMethod.has(method)) byMethod.set(method, { method, received: 0, refunded: 0, count: 0 });
        const bucket = byMethod.get(method);
        if (entry.kind === 'payment') {
            totals.received += entry.amount;
            bucket.received += entry.amount;
            if (!entry.reference) totals.unreferenced += 1;
        } else {
            totals.refunded += entry.amount;
            bucket.refunded += entry.amount;
        }
        bucket.count += 1;
    }
    totals.packagesSold = packages.reduce((total, purchase) => total + (Number(purchase.price) || 0), 0);
    const creditHeld = balanceRows.reduce((total, row) => total + (row.balance > 0 ? row.balance : 0), 0);

    return {
        range: { from: range.start, to: range.end },
        currency: settings.currency,
        totals: {
            received: round2(totals.received),
            refunded: round2(totals.refunded),
            net: round2(totals.received - totals.refunded),
            creditHeld: round2(creditHeld),
            packagesSold: round2(totals.packagesSold),
            unreferenced: totals.unreferenced,
            count: entries.filter((entry) => entry.status === 'active').length
        },
        methods: [...byMethod.values()].map((row) => ({
            ...row,
            received: round2(row.received),
            refunded: round2(row.refunded)
        })),
        payments: entries.map((entry) => {
            const receipt = receiptByEntry.get(`receipt:${entry._id}`);
            return {
                id: String(entry._id),
                kind: entry.kind,
                studentId: String(entry.student),
                studentName: studentName(studentById.get(String(entry.student))),
                amount: round2(entry.amount),
                currency: entry.currency || settings.currency,
                method: entry.method || '',
                reference: entry.reference || '',
                note: entry.note || '',
                occurredAt: entry.occurredAt,
                recordedByName: users.get(String(entry.receivedBy || entry.createdBy)) || '',
                status: entry.status,
                voidReason: entry.voidReason || '',
                receiptStatus: receipt ? 'sent' : '',
                receiptSentAt: receipt?.deliveredAt || null
            };
        }),
        paymentMethods: paymentMethodChoices(settings)
    };
};

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export const BILLING_REPORTS = [
    {
        key: 'summary',
        title: 'Charges and payments summary',
        description: 'Charged, paid, refunded, and balance by student for the selected period.',
        category: 'Money'
    },
    {
        key: 'outstanding',
        title: 'Outstanding balances',
        description: 'Every account that currently owes money, with the age of its last payment.',
        category: 'Money'
    },
    {
        key: 'statements',
        title: 'Student account statements',
        description: 'Statement delivery history and the current balance for each account.',
        category: 'Families'
    },
    {
        key: 'class-revenue',
        title: 'Class revenue',
        description: 'Charged amount, billable minutes, and effective hourly rate by class.',
        category: 'Teaching'
    },
    {
        key: 'teacher-minutes',
        title: 'Teacher-delivered minutes',
        description: 'Lessons and billable minutes delivered by each teacher.',
        category: 'Teaching'
    },
    {
        key: 'manual-vs-platform',
        title: 'Manual versus platform lessons',
        description: 'How much teaching was billed through live lessons compared with manual entries.',
        category: 'Teaching'
    },
    {
        key: 'audit',
        title: 'Voids and adjustments audit',
        description: 'Voids, refunds, adjustments, and settings changes recorded in the period.',
        category: 'Controls'
    },
    {
        key: 'no-show',
        title: 'No-show and late-cancellation charges',
        description: 'Charges created from no-show or late-cancellation rules.',
        category: 'Controls'
    },
    {
        key: 'credit-liability',
        title: 'Prepaid credit liability',
        description: 'Credit held on accounts and unused package minutes the school still owes.',
        category: 'Money'
    },
    {
        key: 'unbilled',
        title: 'Unbilled lessons',
        description: 'Lessons that could not be charged, with the reason and repair action.',
        category: 'Controls'
    },
    {
        key: 'packages',
        title: 'Package sales',
        description: 'Packages sold in the period, their value, and remaining minutes.',
        category: 'Money'
    }
];

const reportColumns = {
    summary: [
        { key: 'student', label: 'Student', type: 'text' },
        { key: 'lessons', label: 'Lessons', type: 'number' },
        { key: 'minutes', label: 'Minutes', type: 'number' },
        { key: 'charged', label: 'Charged', type: 'money' },
        { key: 'paid', label: 'Paid', type: 'money' },
        { key: 'refunded', label: 'Refunded', type: 'money' },
        { key: 'balance', label: 'Balance', type: 'money' }
    ],
    outstanding: [
        { key: 'student', label: 'Student', type: 'text' },
        { key: 'balance', label: 'Owed', type: 'money' },
        { key: 'lastPaymentAt', label: 'Last payment', type: 'date' },
        { key: 'daysSincePayment', label: 'Days since payment', type: 'number' },
        { key: 'lastActivityAt', label: 'Last activity', type: 'date' }
    ],
    statements: [
        { key: 'student', label: 'Student', type: 'text' },
        { key: 'statementsSent', label: 'Statements sent', type: 'number' },
        { key: 'lastSentAt', label: 'Last sent', type: 'date' },
        { key: 'balance', label: 'Current balance', type: 'money' }
    ],
    'class-revenue': [
        { key: 'class', label: 'Class', type: 'text' },
        { key: 'lessons', label: 'Lessons', type: 'number' },
        { key: 'minutes', label: 'Minutes', type: 'number' },
        { key: 'effectiveRate', label: 'Effective hourly rate', type: 'money' },
        { key: 'charged', label: 'Charged', type: 'money' }
    ],
    'teacher-minutes': [
        { key: 'teacher', label: 'Teacher', type: 'text' },
        { key: 'lessons', label: 'Lessons', type: 'number' },
        { key: 'minutes', label: 'Minutes', type: 'number' },
        { key: 'charged', label: 'Charged', type: 'money' }
    ],
    'manual-vs-platform': [
        { key: 'source', label: 'Source', type: 'text' },
        { key: 'lessons', label: 'Lessons', type: 'number' },
        { key: 'minutes', label: 'Minutes', type: 'number' },
        { key: 'charged', label: 'Charged', type: 'money' }
    ],
    audit: [
        { key: 'at', label: 'Date', type: 'date' },
        { key: 'action', label: 'Action', type: 'text' },
        { key: 'student', label: 'Student', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'money' },
        { key: 'actor', label: 'By', type: 'text' },
        { key: 'detail', label: 'Detail', type: 'text' }
    ],
    'no-show': [
        { key: 'at', label: 'Date', type: 'date' },
        { key: 'student', label: 'Student', type: 'text' },
        { key: 'class', label: 'Class', type: 'text' },
        { key: 'basis', label: 'Rule', type: 'text' },
        { key: 'minutes', label: 'Minutes', type: 'number' },
        { key: 'hourlyRate', label: 'Rate', type: 'money' },
        { key: 'charged', label: 'Charged', type: 'money' }
    ],
    'credit-liability': [
        { key: 'student', label: 'Student', type: 'text' },
        { key: 'credit', label: 'Account credit', type: 'money' },
        { key: 'packageMinutes', label: 'Package minutes', type: 'number' },
        { key: 'packageValue', label: 'Package value', type: 'money' },
        { key: 'totalLiability', label: 'Total owed to family', type: 'money' }
    ],
    unbilled: [
        { key: 'at', label: 'Date', type: 'date' },
        { key: 'student', label: 'Student', type: 'text' },
        { key: 'class', label: 'Class', type: 'text' },
        { key: 'reason', label: 'Reason', type: 'text' },
        { key: 'minutes', label: 'Minutes', type: 'number' },
        { key: 'detail', label: 'Detail', type: 'text' }
    ],
    packages: [
        { key: 'purchasedAt', label: 'Purchased', type: 'date' },
        { key: 'student', label: 'Student', type: 'text' },
        { key: 'package', label: 'Package', type: 'text' },
        { key: 'minutesIncluded', label: 'Minutes', type: 'number' },
        { key: 'minutesRemaining', label: 'Remaining', type: 'number' },
        { key: 'price', label: 'Value', type: 'money' },
        { key: 'status', label: 'Status', type: 'text' }
    ]
};

const reportTotals = (reportKey, rows, currency) => {
    const money = (key) => round2(rows.reduce((total, row) => total + (Number(row[key]) || 0), 0));
    if (reportKey === 'summary' || reportKey === 'class-revenue' || reportKey === 'teacher-minutes'
        || reportKey === 'manual-vs-platform' || reportKey === 'no-show' || reportKey === 'packages') {
        return {
            lessons: rows.reduce((total, row) => total + (Number(row.lessons) || 0), 0),
            minutes: round1(rows.reduce((total, row) => total + (Number(row.minutes) || 0), 0)),
            charged: money('charged'),
            currency
        };
    }
    if (reportKey === 'outstanding') return { balance: money('balance'), currency };
    if (reportKey === 'statements') return { statementsSent: money('statementsSent'), balance: money('balance'), currency };
    if (reportKey === 'credit-liability') {
        return {
            credit: money('credit'),
            packageMinutes: money('packageMinutes'),
            packageValue: money('packageValue'),
            totalLiability: money('totalLiability'),
            currency
        };
    }
    if (reportKey === 'unbilled') return { count: rows.length, minutes: money('minutes') };
    if (reportKey === 'audit') return { count: rows.length };
    return { count: rows.length };
};

export const getBillingReport = async (schoolId, query = {}) => {
    const key = BILLING_REPORTS.some((report) => report.key === query.report)
        ? String(query.report)
        : 'summary';
    const catalog = BILLING_REPORTS.find((report) => report.key === key);
    const range = resolveBillingDateRange(query);
    const settings = await getBillingSettings(schoolId);
    const currency = settings.currency;
    const baseEntryFilter = {
        school: schoolId,
        occurredAt: { $gte: range.start, $lte: range.end }
    };
    if (query.classId && mongoose.Types.ObjectId.isValid(String(query.classId))) {
        baseEntryFilter.classId = query.classId;
    }
    if (query.studentId && mongoose.Types.ObjectId.isValid(String(query.studentId))) {
        baseEntryFilter.student = query.studentId;
    }

    let rows = [];
    if (key === 'summary' || key === 'class-revenue' || key === 'teacher-minutes'
        || key === 'manual-vs-platform' || key === 'no-show' || key === 'audit') {
        const entries = await SessionBillingEntry.find({ ...baseEntryFilter, status: 'active' })
            .sort({ occurredAt: 1 })
            .limit(20000)
            .lean();

        const balanceRows = await SessionBillingEntry.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), status: 'active' } },
            { $group: { _id: '$student', balance: { $sum: BALANCE_EXPR } } }
        ]);
        const balanceById = new Map(balanceRows.map((row) => [String(row._id), row.balance]));

        const studentIds = [...new Set(entries.map((entry) => String(entry.student)))];
        const classIds = [...new Set(entries.map((entry) => String(entry.classId || '')).filter(Boolean))];
        const teacherIds = [...new Set(entries.map((entry) => String(entry.teacherId || '')).filter(Boolean))];

        const [students, classes, teachers] = await Promise.all([
            studentIds.length
                ? Student.find({ school: schoolId, _id: { $in: studentIds } }).select('firstName lastName').lean()
                : [],
            classIds.length
                ? Class.find({ school: schoolId, _id: { $in: classIds } }).select('name').lean()
                : [],
            loadUserMap(teacherIds)
        ]);
        const studentById = new Map(students.map((student) => [String(student._id), student]));
        const classById = new Map(classes.map((klass) => [String(klass._id), klass]));

        if (key === 'summary') {
            const byStudent = new Map();
            for (const entry of entries) {
                const id = String(entry.student);
                if (!byStudent.has(id)) {
                    byStudent.set(id, {
                        studentId: id,
                        student: studentName(studentById.get(id)),
                        lessons: 0,
                        minutes: 0,
                        charged: 0,
                        paid: 0,
                        refunded: 0,
                        balance: round2(balanceById.get(id) || 0)
                    });
                }
                const row = byStudent.get(id);
                if (entry.kind === 'charge') {
                    row.lessons += 1;
                    row.minutes += Number(entry.minutes) || 0;
                    row.charged += Number(entry.amount) || 0;
                } else if (entry.kind === 'payment') {
                    row.paid += Number(entry.amount) || 0;
                } else if (entry.kind === 'refund') {
                    row.refunded += Number(entry.amount) || 0;
                }
            }
            rows = [...byStudent.values()].map((row) => ({
                ...row,
                minutes: round1(row.minutes),
                charged: round2(row.charged),
                paid: round2(row.paid),
                refunded: round2(row.refunded)
            })).sort((a, b) => a.student.localeCompare(b.student));
        } else if (key === 'class-revenue') {
            const byClass = new Map();
            for (const entry of entries.filter((item) => item.kind === 'charge')) {
                const id = String(entry.classId || 'none');
                if (!byClass.has(id)) {
                    byClass.set(id, { class: classById.get(id)?.name || 'Unassigned', lessons: 0, minutes: 0, charged: 0 });
                }
                const row = byClass.get(id);
                row.lessons += 1;
                row.minutes += Number(entry.minutes) || 0;
                row.charged += Number(entry.amount) || 0;
            }
            rows = [...byClass.values()].map((row) => ({
                ...row,
                minutes: round1(row.minutes),
                charged: round2(row.charged),
                effectiveRate: row.minutes > 0 ? round2((row.charged / row.minutes) * 60) : 0
            })).sort((a, b) => b.charged - a.charged);
        } else if (key === 'teacher-minutes') {
            const byTeacher = new Map();
            for (const entry of entries.filter((item) => item.kind === 'charge')) {
                const id = String(entry.teacherId || 'none');
                if (!byTeacher.has(id)) {
                    byTeacher.set(id, { teacher: teachers.get(id) || 'Unassigned', lessons: 0, minutes: 0, charged: 0 });
                }
                const row = byTeacher.get(id);
                row.lessons += 1;
                row.minutes += Number(entry.minutes) || 0;
                row.charged += Number(entry.amount) || 0;
            }
            rows = [...byTeacher.values()].map((row) => ({
                ...row,
                minutes: round1(row.minutes),
                charged: round2(row.charged)
            })).sort((a, b) => b.minutes - a.minutes);
        } else if (key === 'manual-vs-platform') {
            const labels = { platform: 'Platform live lesson', manual: 'Manual entry', zoom: 'Zoom', 'in-person': 'In person', other: 'Other' };
            const bySource = new Map();
            for (const entry of entries.filter((item) => item.kind === 'charge')) {
                const source = lessonSourceFor(entry);
                if (!bySource.has(source)) {
                    bySource.set(source, { source: labels[source] || source, lessons: 0, minutes: 0, charged: 0 });
                }
                const row = bySource.get(source);
                row.lessons += 1;
                row.minutes += Number(entry.minutes) || 0;
                row.charged += Number(entry.amount) || 0;
            }
            rows = [...bySource.values()].map((row) => ({
                ...row,
                minutes: round1(row.minutes),
                charged: round2(row.charged)
            })).sort((a, b) => b.charged - a.charged);
        } else if (key === 'no-show') {
            rows = entries
                .filter((entry) => entry.kind === 'charge'
                    && ((entry.ruleSnapshot?.rawMinutes === 0 && entry.minutes > 0)
                        || ['no-show', 'late-cancellation'].includes(entry.ruleSnapshot?.billingBasis)))
                .map((entry) => ({
                    at: entry.occurredAt,
                    student: studentName(studentById.get(String(entry.student))),
                    class: classById.get(String(entry.classId))?.name || 'Unassigned',
                    basis: entry.ruleSnapshot?.billingBasis === 'late-cancellation' ? 'Late cancellation' : 'No-show',
                    minutes: entry.minutes || 0,
                    hourlyRate: round2(entry.hourlyRate),
                    charged: round2(entry.amount)
                })).sort((a, b) => new Date(b.at) - new Date(a.at));
        } else if (key === 'audit') {
            const audits = await SessionBillingAudit.find({
                school: schoolId,
                createdAt: { $gte: range.start, $lte: range.end }
            }).sort({ createdAt: -1 }).limit(500).lean();
            rows = audits.map((doc) => ({
                at: doc.createdAt,
                action: doc.action,
                student: doc.student ? studentName(studentById.get(String(doc.student))) : '',
                amount: null,
                actor: doc.actorName || 'System',
                detail: doc.summary || ''
            }));
        }
    } else if (key === 'outstanding') {
        const balanceRows = await SessionBillingEntry.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), status: 'active' } },
            {
                $group: {
                    _id: '$student',
                    balance: { $sum: BALANCE_EXPR },
                    lastActivityAt: { $max: '$occurredAt' },
                    lastPaymentAt: {
                        $max: { $cond: [{ $eq: ['$kind', 'payment'] }, '$occurredAt', null] }
                    }
                }
            },
            { $match: { balance: { $lt: 0 } } },
            { $sort: { balance: 1 } }
        ]);
        const ids = balanceRows.map((row) => String(row._id));
        const students = ids.length
            ? await Student.find({ school: schoolId, _id: { $in: ids } }).select('firstName lastName').lean()
            : [];
        const studentById = new Map(students.map((student) => [String(student._id), student]));
        rows = balanceRows.map((row) => ({
            studentId: String(row._id),
            student: studentName(studentById.get(String(row._id))),
            balance: round2(-row.balance),
            lastPaymentAt: row.lastPaymentAt || null,
            daysSincePayment: row.lastPaymentAt ? daysBetween(row.lastPaymentAt) : null,
            lastActivityAt: row.lastActivityAt || null
        }));
    } else if (key === 'statements') {
        const deliveries = await SessionBillingEmailDelivery.aggregate([
            {
                $match: {
                    school: new mongoose.Types.ObjectId(String(schoolId)),
                    purpose: 'statement',
                    status: 'sent',
                    deliveredAt: { $gte: range.start, $lte: range.end }
                }
            },
            {
                $group: {
                    _id: '$student',
                    statementsSent: { $sum: 1 },
                    lastSentAt: { $max: '$deliveredAt' }
                }
            }
        ]);
        const balances = await SessionBillingEntry.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), status: 'active' } },
            { $group: { _id: '$student', balance: { $sum: BALANCE_EXPR } } }
        ]);
        const balanceById = new Map(balances.map((row) => [String(row._id), row.balance]));
        const ids = [...new Set(deliveries.map((row) => String(row._id)))];
        const students = ids.length
            ? await Student.find({ school: schoolId, _id: { $in: ids } }).select('firstName lastName').lean()
            : [];
        const studentById = new Map(students.map((student) => [String(student._id), student]));
        rows = deliveries.map((row) => ({
            student: studentName(studentById.get(String(row._id))),
            statementsSent: row.statementsSent,
            lastSentAt: row.lastSentAt,
            balance: round2(balanceById.get(String(row._id)) || 0)
        })).sort((a, b) => new Date(b.lastSentAt) - new Date(a.lastSentAt));
    } else if (key === 'credit-liability') {
        const balances = await SessionBillingEntry.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), status: 'active' } },
            { $group: { _id: '$student', balance: { $sum: BALANCE_EXPR } } },
            { $match: { balance: { $gt: 0 } } }
        ]);
        const packages = await SessionBillingPackagePurchase.find({
            school: schoolId,
            status: 'active',
            minutesRemaining: { $gt: 0 }
        }).lean();
        const packageByStudent = new Map();
        for (const purchase of packages) {
            const key = String(purchase.student);
            const current = packageByStudent.get(key) || { minutes: 0, value: 0 };
            current.minutes += purchase.minutesRemaining || 0;
            current.value += (purchase.price || 0) * ((purchase.minutesRemaining || 0) / Math.max(1, purchase.minutesIncluded));
            packageByStudent.set(key, current);
        }
        const ids = [...new Set([...balances.map((row) => String(row._id)), ...packageByStudent.keys()])];
        const students = ids.length
            ? await Student.find({ school: schoolId, _id: { $in: ids } }).select('firstName lastName').lean()
            : [];
        const studentById = new Map(students.map((student) => [String(student._id), student]));
        const balanceById = new Map(balances.map((row) => [String(row._id), row.balance]));
        rows = ids.map((id) => {
            const credit = round2(balanceById.get(id) || 0);
            const pkg = packageByStudent.get(id) || { minutes: 0, value: 0 };
            return {
                studentId: id,
                student: studentName(studentById.get(id)),
                credit,
                packageMinutes: round1(pkg.minutes),
                packageValue: round2(pkg.value),
                totalLiability: round2(credit + pkg.value)
            };
        }).sort((a, b) => b.totalLiability - a.totalLiability);
    } else if (key === 'unbilled') {
        const issues = await SessionBillingIssue.find({
            school: schoolId,
            status: 'open',
            occurredAt: { $gte: range.start, $lte: range.end }
        }).sort({ occurredAt: -1 }).lean();
        const classIds = [...new Set(issues.map((issue) => String(issue.classId || '')).filter(Boolean))];
        const classes = classIds.length
            ? await Class.find({ school: schoolId, _id: { $in: classIds } }).select('name').lean()
            : [];
        const classById = new Map(classes.map((klass) => [String(klass._id), klass]));
        rows = issues.map((issue) => ({
            at: issue.occurredAt,
            student: issue.studentName || 'Roster student',
            class: classById.get(String(issue.classId))?.name || '',
            reason: issueLabel(issue.reason),
            minutes: issue.minutes || 0,
            detail: issue.detail || ''
        }));
    } else if (key === 'packages') {
        const purchases = await SessionBillingPackagePurchase.find({
            school: schoolId,
            purchasedAt: { $gte: range.start, $lte: range.end }
        }).sort({ purchasedAt: -1 }).lean();
        const ids = [...new Set(purchases.map((purchase) => String(purchase.student)))];
        const students = ids.length
            ? await Student.find({ school: schoolId, _id: { $in: ids } }).select('firstName lastName').lean()
            : [];
        const studentById = new Map(students.map((student) => [String(student._id), student]));
        rows = purchases.map((purchase) => ({
            purchasedAt: purchase.purchasedAt,
            student: studentName(studentById.get(String(purchase.student))),
            package: purchase.name,
            minutesIncluded: purchase.minutesIncluded,
            minutesRemaining: purchase.minutesRemaining,
            price: round2(purchase.price),
            status: purchase.status
        }));
    }

    return {
        key,
        title: catalog.title,
        description: catalog.description,
        range: { from: range.start, to: range.end },
        currency,
        columns: reportColumns[key],
        rows,
        totals: reportTotals(key, rows, currency),
        generatedAt: new Date()
    };
};

/* ------------------------------------------------------------------ */
/* Reminders and forecast                                              */
/* ------------------------------------------------------------------ */

export const getReminderCandidates = async (schoolId, query = {}) => {
    const overview = await getBillingOverview(schoolId, query);
    const settings = await getBillingSettings(schoolId);
    const owed = overview.students.filter((student) => student.balance < 0);
    const ids = owed.map((student) => student.studentId);
    if (!ids.length) {
        return {
            currency: settings.currency,
            settings: settings.reminder,
            candidates: [],
            summary: { eligible: 0, owed: 0, missingContact: 0, recentlyReminded: 0, tooSoon: 0 }
        };
    }

    const [docs, deliveries] = await Promise.all([
        Student.find({ school: schoolId, _id: { $in: ids } })
            .select('firstName lastName studentEmail email parentInfo user')
            .populate('user', 'email'),
        SessionBillingEmailDelivery.aggregate([
            {
                $match: {
                    school: new mongoose.Types.ObjectId(String(schoolId)),
                    purpose: 'reminder',
                    status: 'sent',
                    student: { $in: ids.map((id) => new mongoose.Types.ObjectId(String(id))) }
                }
            },
            { $group: { _id: '$student', lastSentAt: { $max: '$deliveredAt' } } }
        ])
    ]);
    const docById = new Map(docs.map((doc) => [String(doc._id), doc]));
    const lastReminderByStudent = new Map(deliveries.map((row) => [String(row._id), row.lastSentAt]));
    const allContacts = docs.flatMap((doc) => doc.getAllContactEmailEntries());
    const optedOut = await getOptedOutEmailSet(schoolId, allContacts.map((contact) => contact.email));

    const summary = { eligible: 0, owed: 0, missingContact: 0, recentlyReminded: 0, tooSoon: 0 };
    const candidates = owed.map((student) => {
        const doc = docById.get(student.studentId);
        const contacts = doc ? doc.getAllContactEmailEntries() : [];
        const available = contacts.filter((contact) => !optedOut.has(contact.email.toLowerCase()));
        const lastReminderAt = lastReminderByStudent.get(student.studentId) || null;
        const referenceDate = student.lastPaymentAt || student.lastAt;
        const daysSinceActivity = daysBetween(referenceDate);
        const daysSinceReminder = lastReminderAt ? daysBetween(lastReminderAt) : null;
        const owedAmount = round2(-student.balance);
        let eligible = true;
        let reason = '';
        if (owedAmount < settings.reminder.minimumBalance) {
            eligible = false;
            reason = 'Below the minimum balance';
        } else if (!available.length) {
            eligible = false;
            reason = 'No contact can receive school email';
        } else if (daysSinceActivity === null || daysSinceActivity < settings.reminder.afterDays) {
            eligible = false;
            reason = `Balance is newer than ${settings.reminder.afterDays} days`;
        } else if (daysSinceReminder !== null && daysSinceReminder < settings.reminder.quietDays) {
            eligible = false;
            reason = `Reminded ${daysSinceReminder} days ago`;
        }

        if (eligible) summary.eligible += 1;
        else if (!available.length) summary.missingContact += 1;
        else if (daysSinceReminder !== null && daysSinceReminder < settings.reminder.quietDays) summary.recentlyReminded += 1;
        else summary.tooSoon += 1;
        summary.owed += 1;

        return {
            studentId: student.studentId,
            name: student.name,
            balance: student.balance,
            owed: owedAmount,
            recipients: available.map((contact) => ({
                email: contact.email,
                type: contact.type,
                name: contact.name || ''
            })),
            lastPaymentAt: student.lastPaymentAt,
            lastActivityAt: student.lastAt,
            lastReminderAt,
            daysSinceActivity,
            daysSinceReminder,
            eligible,
            reason
        };
    }).sort((a, b) => b.owed - a.owed);

    return {
        currency: settings.currency,
        settings: settings.reminder,
        candidates,
        summary
    };
};

export const getBillingForecast = async (schoolId) => {
    const now = new Date();
    const lookbackStart = new Date(now.getTime() - 90 * DAY_MS);
    const [totals] = await SessionBillingEntry.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(String(schoolId)),
                status: 'active',
                occurredAt: { $gte: lookbackStart, $lte: now }
            }
        },
        {
            $group: {
                _id: null,
                charged: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$amount', 0] } },
                paid: { $sum: { $cond: [{ $eq: ['$kind', 'payment'] }, '$amount', 0] } },
                minutes: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$minutes', 0] } },
                lessons: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, 1, 0] } }
            }
        }
    ]);
    const history = totals || { charged: 0, paid: 0, minutes: 0, lessons: 0 };
    const hasHistory = history.charged > 0 || history.paid > 0;
    const dailyCharged = hasHistory ? history.charged / 90 : 0;
    const dailyPaid = hasHistory ? history.paid / 90 : 0;
    const expectedCharges = round2(dailyCharged * 30);
    const expectedCollections = round2(dailyPaid * 30);
    const confidence = hasHistory ? Math.min(0.35, 0.12 + (history.lessons < 30 ? 0.12 : 0)) : 0.4;

    return {
        currency: (await getBillingSettings(schoolId)).currency,
        isEstimate: true,
        horizonDays: 30,
        history: {
            from: lookbackStart,
            to: now,
            charged: round2(history.charged),
            paid: round2(history.paid),
            minutes: round1(history.minutes),
            lessons: history.lessons
        },
        expectedCharges,
        expectedCollections,
        range: {
            charges: {
                low: round2(expectedCharges * (1 - confidence)),
                high: round2(expectedCharges * (1 + confidence))
            },
            collections: {
                low: round2(expectedCollections * (1 - confidence)),
                high: round2(expectedCollections * (1 + confidence))
            }
        },
        assumptions: hasHistory
            ? [
                'Based on the last 90 days of recorded lessons and payments.',
                'Assumes the same teaching pace and collection pattern for the next 30 days.',
                'Scheduled holidays and price changes are not included.'
            ]
            : [
                'There is not enough lesson history yet to make a useful estimate.',
                'Record lessons and payments for a few weeks, then check again.'
            ]
    };
};

export { isoDay, studentName, nameOfUser };
