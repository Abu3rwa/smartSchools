import Attendance from '../models/Attendance.js';
import AiCreditEntry from '../models/AiCreditEntry.js';
import AiCreditRequest from '../models/AiCreditRequest.js';
import DemoRequest from '../models/DemoRequest.js';
import School from '../models/School.js';
import Student from '../models/Student.js';
import Subscription from '../models/Subscription.js';
import UpgradeRequest from '../models/UpgradeRequest.js';
import User from '../models/User.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 12;

export const PLATFORM_RANGE_KEYS = ['30d', '90d', '12m'];
const RANGE_DAYS = { '30d': 30, '90d': 90, '12m': 365 };
const DEFAULT_RANGE = '90d';

const ATTENTION_ITEM_LIMIT = 3;
const PREVIEW_LIMIT = 6;
const RECENT_DEMO_LIMIT = 5;
const STAFF_ROLES = ['teacher', 'admin', 'department_principal'];
const BILLING_ISSUE_STATUSES = ['past_due', 'expired', 'suspended'];
const TRIAL_WARNING_DAYS = 14;
const INACTIVE_DAYS = 14;
const DORMANT_DAYS = 7;
const DEMO_SLA_HOURS = 48;
const SERIES_MONTHS = 12;
const OPEN_DEMO_STATUSES = ['new', 'contacted', 'scheduled'];
const AI_TOP_SCHOOL_LIMIT = 5;
const UNBILLED_INVOICE_STATUSES = ['draft', 'void'];

const summaryCache = new Map();

const readCache = (key) => {
    const entry = summaryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        summaryCache.delete(key);
        return null;
    }
    return entry.value;
};

const writeCache = (key, value) => {
    if (summaryCache.size >= CACHE_MAX_ENTRIES) {
        const oldestKey = summaryCache.keys().next().value;
        if (oldestKey !== undefined) summaryCache.delete(oldestKey);
    }
    summaryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

const toDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const daysUntil = (date, now) => Math.ceil((date.getTime() - now.getTime()) / DAY_MS);

/**
 * UTC month keys ending with the current month. The invoice aggregations use
 * Mongo's default UTC `$dateToString`, so both sides agree on month boundaries.
 */
export const buildMonthKeys = (now = new Date(), months = SERIES_MONTHS) => {
    const keys = [];
    for (let offset = months - 1; offset >= 0; offset -= 1) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
        keys.push(date.toISOString().slice(0, 7));
    }
    return keys;
};

const toValueMap = (rows, field) => new Map(
    (rows || [])
        .filter((row) => row?._id)
        .map((row) => [row._id, Number(row[field]) || 0])
);

export const mergeSeries = (
    months,
    { invoiced = [], collected = [], newSchools = [], newStudents = [] } = {}
) => {
    const invoicedByMonth = toValueMap(invoiced, 'total');
    const collectedByMonth = toValueMap(collected, 'total');
    const schoolsByMonth = toValueMap(newSchools, 'count');
    const studentsByMonth = toValueMap(newStudents, 'count');

    return months.map((month) => ({
        month,
        invoiced: invoicedByMonth.get(month) || 0,
        collected: collectedByMonth.get(month) || 0,
        newSchools: schoolsByMonth.get(month) || 0,
        newStudents: studentsByMonth.get(month) || 0,
    }));
};

/**
 * Open demo requests split by stage and by age. Age buckets are the decision
 * signal: 0–2 days is normal, 3–7 days needs a reply, 8+ days is overdue.
 */
export const buildDemoFunnel = (openDemos = [], now = new Date()) => {
    const byStatus = { new: 0, contacted: 0, scheduled: 0 };
    const byAge = { fresh: 0, aging: 0, overdue: 0 };
    let oldestOpenAt = null;

    for (const demo of openDemos) {
        if (byStatus[demo.status] !== undefined) byStatus[demo.status] += 1;
        const createdAt = toDate(demo.createdAt);
        if (!createdAt) continue;
        const ageDays = Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS);
        if (ageDays > 7) byAge.overdue += 1;
        else if (ageDays >= 3) byAge.aging += 1;
        else byAge.fresh += 1;
        if (!oldestOpenAt || createdAt < oldestOpenAt) oldestOpenAt = createdAt;
    }

    return {
        total: openDemos.length,
        byStatus,
        byAge,
        oldestOpenAt: oldestOpenAt ? oldestOpenAt.toISOString() : null,
    };
};

/**
 * Monthly-equivalent of a billing amount. Yearly contracts are divided by 12 so
 * MRR never mixes monthly and yearly prices.
 */
export const normalizeMonthlyAmount = (amount, interval) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return String(interval || 'month').toLowerCase() === 'year' ? value / 12 : value;
};

export const resolveRangeWindow = (range, now = new Date()) => {
    const key = PLATFORM_RANGE_KEYS.includes(range) ? range : DEFAULT_RANGE;
    return { key, start: new Date(now.getTime() - RANGE_DAYS[key] * DAY_MS) };
};

export const buildSchoolBuckets = (schools = []) => {
    const buckets = {
        active: 0,
        trial: 0,
        pastDue: 0,
        expired: 0,
        suspended: 0,
        cancelled: 0,
        inactive: 0,
        other: 0,
    };
    const plans = new Map();
    let disabled = 0;

    for (const school of schools) {
        const status = String(school?.subscription?.status || 'trial').toLowerCase();
        if (status === 'past_due') buckets.pastDue += 1;
        else if (status in buckets) buckets[status] += 1;
        else buckets.other += 1;

        const plan = String(school?.subscription?.plan || 'starter').toLowerCase();
        plans.set(plan, (plans.get(plan) || 0) + 1);

        if (school?.isActive === false) disabled += 1;
    }

    const byPlan = [...plans.entries()]
        .map(([plan, count]) => ({ plan, count }))
        .sort((a, b) => b.count - a.count || a.plan.localeCompare(b.plan));

    return { total: schools.length, ...buckets, disabled, byPlan };
};

const resolveRenewalDate = (school, subscription, now) => {
    const candidates = [
        school?.subscription?.currentPeriodEnd,
        subscription?.currentPeriodEnd,
        subscription?.billing?.nextBillingAt,
    ]
        .map(toDate)
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());
    if (candidates.length === 0) return null;
    return candidates.find((date) => date >= now) || candidates[candidates.length - 1];
};

// @desc    Aggregated platform-owner dashboard summary
// @route   GET /api/platform/dashboard
// @access  Private (Super Admin)
export const getPlatformDashboard = asyncHandler(async (req, res) => {
    const rangeParam = String(req.query.range || '');
    const { key: range, start } = resolveRangeWindow(rangeParam);
    const bypassCache = ['1', 'true'].includes(String(req.query.refresh || '').toLowerCase());

    if (!bypassCache) {
        const cached = readCache(range);
        if (cached) {
            res.set('Cache-Control', 'private, max-age=30');
            return res.json({ success: true, data: cached });
        }
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const trialCutoff = new Date(now.getTime() + TRIAL_WARNING_DAYS * DAY_MS);
    const inactiveCutoff = new Date(now.getTime() - INACTIVE_DAYS * DAY_MS);
    const dormantCutoff = new Date(now.getTime() - DORMANT_DAYS * DAY_MS);
    const activeCutoff = new Date(now.getTime() - 30 * DAY_MS);
    const demoCutoff = new Date(now.getTime() - DEMO_SLA_HOURS * HOUR_MS);
    const seriesMonths = buildMonthKeys(now, SERIES_MONTHS);
    const seriesStart = new Date(`${seriesMonths[0]}-01T00:00:00.000Z`);

    const staffMatch = { $or: [{ role: { $in: STAFF_ROLES } }, { roles: 'teacher' }] };

    const [
        schools,
        subscriptions,
        studentRows,
        newStudents,
        staffRows,
        demoGroups,
        demoOverdue,
        recentDemos,
        pendingUpgrades,
        aiMonth,
        pendingCreditRequests,
        attendanceSchools,
        collected,
        outstanding,
        invoicedByMonth,
        collectedByMonth,
        newSchoolsByMonth,
        newStudentsByMonth,
        openDemos,
        aiBySchoolRows,
    ] = await Promise.all([
        School.find({})
            .select('name isActive createdAt subscription.status subscription.plan subscription.trialEndsAt subscription.currentPeriodEnd')
            .lean(),
        Subscription.find({})
            .select('school status plan billing.amount billing.interval billing.nextBillingAt currentPeriodEnd')
            .lean(),
        Student.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: '$school', count: { $sum: 1 } } },
        ]),
        Student.countDocuments({ status: 'active', createdAt: { $gte: start } }),
        User.aggregate([
            { $match: staffMatch },
            { $group: { _id: '$school', count: { $sum: 1 }, lastLogin: { $max: '$lastLogin' } } },
        ]),
        DemoRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        DemoRequest.aggregate([
            { $match: { status: 'new', createdAt: { $lte: demoCutoff } } },
            { $group: { _id: null, count: { $sum: 1 }, oldest: { $min: '$createdAt' } } },
        ]),
        DemoRequest.find({})
            .sort({ createdAt: -1 })
            .limit(RECENT_DEMO_LIMIT)
            .select('schoolName name email createdAt status')
            .lean(),
        UpgradeRequest.countDocuments({ status: 'pending' }),
        AiCreditEntry.aggregate([
            { $match: { type: 'usage', createdAt: { $gte: monthStart } } },
            {
                $group: {
                    _id: null,
                    requests: { $sum: 1 },
                    tokens: { $sum: '$totalTokens' },
                    providerCostCents: { $sum: '$costCents' },
                    chargedCents: { $sum: { $ifNull: ['$chargedCents', '$costCents'] } },
                    profitCents: { $sum: { $ifNull: ['$profitCents', 0] } },
                },
            },
        ]),
        AiCreditRequest.countDocuments({ status: 'pending', target: 'pool' }),
        Attendance.aggregate([
            { $match: { date: { $gte: dormantCutoff } } },
            { $group: { _id: '$school' } },
        ]),
        Subscription.aggregate([
            { $unwind: '$invoices' },
            { $match: { 'invoices.status': 'paid', 'invoices.paidAt': { $gte: start } } },
            { $group: { _id: null, total: { $sum: '$invoices.amount' } } },
        ]),
        Subscription.aggregate([
            { $unwind: '$invoices' },
            { $match: { 'invoices.status': 'open' } },
            { $group: { _id: null, total: { $sum: '$invoices.amount' } } },
        ]),
        Subscription.aggregate([
            { $unwind: '$invoices' },
            {
                $match: {
                    'invoices.createdAt': { $gte: seriesStart },
                    'invoices.status': { $nin: UNBILLED_INVOICE_STATUSES },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$invoices.createdAt' } },
                    total: { $sum: '$invoices.amount' },
                },
            },
        ]),
        Subscription.aggregate([
            { $unwind: '$invoices' },
            { $match: { 'invoices.status': 'paid', 'invoices.paidAt': { $gte: seriesStart } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$invoices.paidAt' } },
                    total: { $sum: '$invoices.amount' },
                },
            },
        ]),
        School.aggregate([
            { $match: { createdAt: { $gte: seriesStart } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    count: { $sum: 1 },
                },
            },
        ]),
        Student.aggregate([
            { $match: { status: 'active', createdAt: { $gte: seriesStart } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    count: { $sum: 1 },
                },
            },
        ]),
        DemoRequest.find({ status: { $in: OPEN_DEMO_STATUSES } })
            .select('status createdAt')
            .lean(),
        AiCreditEntry.aggregate([
            { $match: { type: 'usage', createdAt: { $gte: monthStart } } },
            {
                $group: {
                    _id: '$school',
                    requests: { $sum: 1 },
                    providerCostCents: { $sum: '$costCents' },
                    chargedCents: { $sum: { $ifNull: ['$chargedCents', '$costCents'] } },
                    profitCents: { $sum: { $ifNull: ['$profitCents', 0] } },
                },
            },
            { $sort: { chargedCents: -1 } },
            { $limit: AI_TOP_SCHOOL_LIMIT },
        ]),
    ]);

    const buckets = buildSchoolBuckets(schools);
    const schoolsById = new Map(schools.map((school) => [String(school._id), school]));
    const subscriptionBySchool = new Map(
        subscriptions.map((subscription) => [String(subscription.school), subscription])
    );
    const studentsBySchool = new Map(
        studentRows.map((row) => [String(row._id), row.count])
    );
    const staffBySchool = new Map(
        staffRows
            .filter((row) => row._id)
            .map((row) => [String(row._id), { count: row.count, lastLogin: toDate(row.lastLogin) }])
    );
    const attendanceBySchool = new Set(attendanceSchools.map((row) => String(row._id)));

    const studentsTotal = studentRows.reduce((sum, row) => sum + row.count, 0);
    const staffTotal = staffRows.reduce((sum, row) => sum + (row.count || 0), 0);
    const activeSchools30d = staffRows.filter(
        (row) =>
            row._id
            && row.lastLogin
            && new Date(row.lastLogin).getTime() >= activeCutoff.getTime()
    ).length;

    const mrr = subscriptions.reduce((sum, subscription) => {
        if (String(subscription.status || '').toLowerCase() !== 'active') return sum;
        return sum + normalizeMonthlyAmount(subscription.billing?.amount, subscription.billing?.interval);
    }, 0);

    const activeWithoutContract = schools.filter(
        (school) =>
            String(school?.subscription?.status || '').toLowerCase() === 'active'
            && !subscriptionBySchool.has(String(school._id))
    ).length;

    const renewals = { next7: 0, next30: 0, next90: 0 };
    const renewalsSoon = [];
    for (const school of schools) {
        if (String(school?.subscription?.status || '').toLowerCase() !== 'active') continue;
        const renewalDate = resolveRenewalDate(school, subscriptionBySchool.get(String(school._id)), now);
        if (!renewalDate) continue;
        const days = daysUntil(renewalDate, now);
        if (days < 0 || days > 90) continue;
        if (days <= 7) renewals.next7 += 1;
        if (days <= 30) renewals.next30 += 1;
        renewals.next90 += 1;
        if (days <= 7) {
            renewalsSoon.push({ id: String(school._id), name: school.name || '', date: renewalDate.toISOString(), daysLeft: days });
        }
    }
    renewalsSoon.sort((a, b) => a.date.localeCompare(b.date));

    const trialsEnding = schools
        .filter((school) => {
            if (String(school?.subscription?.status || '').toLowerCase() !== 'trial') return false;
            const trialDate = toDate(school?.subscription?.trialEndsAt);
            return Boolean(trialDate && trialDate <= trialCutoff);
        })
        .map((school) => {
            const trialDate = toDate(school?.subscription?.trialEndsAt);
            return {
                id: String(school._id),
                name: school.name || '',
                date: trialDate.toISOString(),
                daysLeft: daysUntil(trialDate, now),
            };
        })
        .sort((a, b) => a.date.localeCompare(b.date));

    const billingIssues = schools
        .filter((school) => BILLING_ISSUE_STATUSES.includes(String(school?.subscription?.status || '').toLowerCase()))
        .map((school) => ({
            id: String(school._id),
            name: school.name || '',
            status: String(school.subscription.status).toLowerCase(),
        }));

    const inactiveSchools = schools
        .filter((school) => {
            const createdAt = toDate(school.createdAt);
            if (createdAt && createdAt > inactiveCutoff) return false;
            const activity = staffBySchool.get(String(school._id));
            return !activity?.lastLogin || activity.lastLogin < inactiveCutoff;
        })
        .map((school) => {
            const activity = staffBySchool.get(String(school._id));
            return {
                id: String(school._id),
                name: school.name || '',
                lastLogin: activity?.lastLogin ? activity.lastLogin.toISOString() : null,
            };
        })
        .sort((a, b) => {
            if (!a.lastLogin && !b.lastLogin) return 0;
            if (!a.lastLogin) return -1;
            if (!b.lastLogin) return 1;
            return a.lastLogin.localeCompare(b.lastLogin);
        });

    const dormantSchools = schools.filter((school) => {
        const createdAt = toDate(school.createdAt);
        if (createdAt && createdAt > dormantCutoff) return false;
        return !attendanceBySchool.has(String(school._id));
    });

    const demoByStatus = { new: 0, contacted: 0, scheduled: 0, closed: 0 };
    for (const group of demoGroups) {
        if (demoByStatus[group._id] !== undefined) demoByStatus[group._id] = group.count;
    }
    const demoTotal = demoGroups.reduce((sum, group) => sum + group.count, 0);

    const aiTotals = aiMonth[0] || {};
    const demoOverdueTotals = demoOverdue[0] || { count: 0, oldest: null };

    const series = mergeSeries(seriesMonths, {
        invoiced: invoicedByMonth,
        collected: collectedByMonth,
        newSchools: newSchoolsByMonth,
        newStudents: newStudentsByMonth,
    });

    const demoFunnel = buildDemoFunnel(openDemos, now);

    const aiBySchool = aiBySchoolRows.map((row) => ({
        id: String(row._id),
        name: schoolsById.get(String(row._id))?.name || '',
        requests: row.requests || 0,
        providerCostCents: row.providerCostCents || 0,
        chargedCents: row.chargedCents || 0,
        profitCents: row.profitCents || 0,
    }));

    const schoolsPreview = [...schools]
        .sort((a, b) => {
            const diff = (studentsBySchool.get(String(b._id)) || 0) - (studentsBySchool.get(String(a._id)) || 0);
            return diff !== 0 ? diff : String(a.name || '').localeCompare(String(b.name || ''));
        })
        .slice(0, PREVIEW_LIMIT)
        .map((school) => {
            const id = String(school._id);
            const staff = staffBySchool.get(id);
            const renewalDate = resolveRenewalDate(school, subscriptionBySchool.get(id), now);
            return {
                id,
                name: school.name || '',
                plan: String(school?.subscription?.plan || 'starter').toLowerCase(),
                status: String(school?.subscription?.status || 'trial').toLowerCase(),
                students: studentsBySchool.get(id) || 0,
                staff: staff?.count || 0,
                lastLogin: staff?.lastLogin ? staff.lastLogin.toISOString() : null,
                renewalAt: renewalDate ? renewalDate.toISOString() : null,
            };
        });

    const data = {
        generatedAt: now.toISOString(),
        range: { key: range, start: start.toISOString() },
        series,
        schools: {
            ...buckets,
            newInRange: schools.filter((school) => {
                const createdAt = toDate(school.createdAt);
                return Boolean(createdAt && createdAt >= start);
            }).length,
        },
        people: {
            students: studentsTotal,
            staff: staffTotal,
            newStudentsInRange: newStudents,
            activeSchools30d,
        },
        money: {
            currency: 'USD',
            mrr,
            arr: mrr * 12,
            collectedInRange: collected[0]?.total || 0,
            outstanding: outstanding[0]?.total || 0,
            renewals,
            activeWithoutContract,
        },
        attention: {
            trialsEnding: { count: trialsEnding.length, items: trialsEnding.slice(0, ATTENTION_ITEM_LIMIT) },
            billingIssues: { count: billingIssues.length, items: billingIssues.slice(0, ATTENTION_ITEM_LIMIT) },
            renewalsSoon: { count: renewals.next7, items: renewalsSoon.slice(0, ATTENTION_ITEM_LIMIT) },
            inactiveSchools: { count: inactiveSchools.length, items: inactiveSchools.slice(0, ATTENTION_ITEM_LIMIT) },
            dormantSchools: {
                count: dormantSchools.length,
                items: dormantSchools.slice(0, ATTENTION_ITEM_LIMIT).map((school) => ({
                    id: String(school._id),
                    name: school.name || '',
                })),
            },
            demosOver48h: {
                count: demoOverdueTotals.count || 0,
                oldestAt: demoOverdueTotals.oldest ? new Date(demoOverdueTotals.oldest).toISOString() : null,
            },
            upgradeRequests: { count: pendingUpgrades },
            creditRequests: { count: pendingCreditRequests },
        },
        demo: {
            total: demoTotal,
            byStatus: demoByStatus,
            funnel: demoFunnel,
            over48h: demoOverdueTotals.count || 0,
            oldestOpenAt: demoOverdueTotals.oldest ? new Date(demoOverdueTotals.oldest).toISOString() : null,
            recent: recentDemos.map((demo) => ({
                id: String(demo._id),
                schoolName: demo.schoolName || '',
                name: demo.name || '',
                email: demo.email || '',
                createdAt: demo.createdAt ? new Date(demo.createdAt).toISOString() : null,
                status: demo.status || 'new',
            })),
        },
        ai: {
            requests: aiTotals.requests || 0,
            tokens: aiTotals.tokens || 0,
            providerCostCents: aiTotals.providerCostCents || 0,
            chargedCents: aiTotals.chargedCents || 0,
            profitCents: aiTotals.profitCents || 0,
            pendingRequests: pendingCreditRequests,
            bySchool: aiBySchool,
        },
        schoolsPreview,
    };

    writeCache(range, data);

    res.set('Cache-Control', 'private, max-age=30');
    res.json({ success: true, data });
});
