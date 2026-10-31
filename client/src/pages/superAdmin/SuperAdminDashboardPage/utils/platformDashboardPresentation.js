const DATE_OPTIONS = { month: 'short', day: 'numeric' };

export const formatCount = (value, locale = 'en') =>
    new Intl.NumberFormat(locale).format(Number(value) || 0);

export const formatMoney = (value, locale = 'en', currency = 'USD') =>
    new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: Number(value) % 1 === 0 ? 0 : 2,
    }).format(Number(value) || 0);

export const formatCents = (cents, locale = 'en', currency = 'USD') =>
    formatMoney((Number(cents) || 0) / 100, locale, currency);

export const formatShortDate = (iso, locale = 'en') => {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(locale, DATE_OPTIONS).format(date);
};

export const formatPercent = (ratio, locale = 'en') => {
    const value = Number(ratio);
    if (ratio === null || ratio === undefined || !Number.isFinite(value)) return null;
    return new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 0,
    }).format(value);
};

export const formatMonth = (monthKey, locale = 'en') => {
    if (!monthKey) return '';
    const date = new Date(`${monthKey}-01T00:00:00.000Z`);
    return Number.isNaN(date.getTime())
        ? String(monthKey)
        : new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(date);
};

/**
 * "Updated 2 minutes ago" without interpolating a count into a translated
 * string — Intl.RelativeTimeFormat owns the grammar in both languages.
 */
export const formatUpdatedAgo = (iso, locale = 'en', now = Date.now()) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;

    const diffSeconds = Math.min(0, Math.round((date.getTime() - now) / 1000));
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (Math.abs(diffSeconds) < 60) return formatter.format(diffSeconds, 'second');
    const diffMinutes = Math.round(diffSeconds / 60);
    if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
    return formatter.format(Math.round(diffHours / 24), 'day');
};

const barPercent = (value, max) => {
    if (!value || value <= 0 || max <= 0) return 0;
    return Math.max(3, Math.round((value / max) * 100));
};

export const buildRevenueSeries = (series, locale = 'en') => {
    const rows = Array.isArray(series) ? series : [];
    const max = Math.max(0, ...rows.flatMap((row) => [row.invoiced || 0, row.collected || 0]));
    const invoiced = rows.reduce((sum, row) => sum + (row.invoiced || 0), 0);
    const collected = rows.reduce((sum, row) => sum + (row.collected || 0), 0);

    return {
        hasData: invoiced > 0 || collected > 0,
        totals: { invoiced, collected, rate: invoiced > 0 ? collected / invoiced : null },
        rows: rows.map((row) => ({
            month: row.month,
            label: formatMonth(row.month, locale),
            invoiced: row.invoiced || 0,
            collected: row.collected || 0,
            invoicedPct: barPercent(row.invoiced, max),
            collectedPct: barPercent(row.collected, max),
        })),
    };
};

export const buildGrowthSeries = (series, locale = 'en') => {
    const rows = Array.isArray(series) ? series : [];
    const maxStudents = Math.max(0, ...rows.map((row) => row.newStudents || 0));
    const schools = rows.reduce((sum, row) => sum + (row.newSchools || 0), 0);
    const students = rows.reduce((sum, row) => sum + (row.newStudents || 0), 0);

    return {
        hasData: schools > 0 || students > 0,
        totals: { schools, students },
        rows: rows.map((row) => ({
            month: row.month,
            label: formatMonth(row.month, locale),
            newSchools: row.newSchools || 0,
            newStudents: row.newStudents || 0,
            studentsPct: barPercent(row.newStudents, maxStudents),
        })),
    };
};

const joinParts = (parts) => parts.filter(Boolean).join(' · ');

export const buildPlanRows = (summary) => {
    const rows = summary?.schools?.byPlan || [];
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return rows.map((row) => ({
        plan: row.plan,
        count: row.count,
        percent: total > 0 ? Math.round((row.count / total) * 100) : 0,
    }));
};

/**
 * Ordered inbox rows. Zero-count rows are dropped; meta strings never embed a
 * bare count, so English and Arabic agreement never depends on the number.
 */
export const buildAttentionRows = (summary, t, locale = 'en') => {
    const attention = summary?.attention;
    if (!attention) return [];

    const date = (iso) => formatShortDate(iso, locale) || '';
    const status = (value) => t(`superAdminDashboard:status.${value}`, { defaultValue: value });

    const rows = [
        {
            key: 'trials',
            title: t('superAdminDashboard:attention.trialsEnding'),
            count: attention.trialsEnding?.count || 0,
            meta: joinParts((attention.trialsEnding?.items || []).map((item) => joinParts([item.name, date(item.date)]))),
            to: '/admin/schools',
        },
        {
            key: 'billing',
            title: t('superAdminDashboard:attention.billingIssues'),
            count: attention.billingIssues?.count || 0,
            meta: joinParts((attention.billingIssues?.items || []).map((item) => joinParts([item.name, status(item.status)]))),
            to: '/admin/subscriptions',
        },
        {
            key: 'renewals',
            title: t('superAdminDashboard:attention.renewalsSoon'),
            count: attention.renewalsSoon?.count || 0,
            meta: joinParts((attention.renewalsSoon?.items || []).map((item) => joinParts([item.name, date(item.date)]))),
            to: '/admin/subscriptions',
        },
        {
            key: 'demos',
            title: t('superAdminDashboard:attention.demosOver48h'),
            count: attention.demosOver48h?.count || 0,
            meta: attention.demosOver48h?.oldestAt
                ? t('superAdminDashboard:attention.oldest', { date: date(attention.demosOver48h.oldestAt) })
                : '',
            to: '/admin/demo-requests',
        },
        {
            key: 'credits',
            title: t('superAdminDashboard:attention.creditRequests'),
            count: attention.creditRequests?.count || 0,
            meta: '',
            to: '/admin/ai-credit',
        },
        {
            key: 'upgrades',
            title: t('superAdminDashboard:attention.upgradeRequests'),
            count: attention.upgradeRequests?.count || 0,
            meta: '',
            to: '/admin/schools',
        },
        {
            key: 'inactive',
            title: t('superAdminDashboard:attention.inactiveSchools'),
            count: attention.inactiveSchools?.count || 0,
            meta: joinParts((attention.inactiveSchools?.items || []).map((item) =>
                joinParts([item.name, item.lastLogin ? date(item.lastLogin) : t('superAdminDashboard:common.never')])
            )),
            to: '/admin/schools',
        },
    ];

    return rows.filter((row) => row.count > 0);
};
