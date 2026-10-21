import { differenceInCalendarDays, startOfDay } from 'date-fns';

const OPEN_STATUSES = new Set(['published', 'closed']);
const DAY_MS = 24 * 60 * 60 * 1000;

const asDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const localeFor = (language = 'en') => (String(language).toLowerCase().startsWith('ar') ? 'ar' : 'en');

const formatDateValue = (value, language, options) => {
    const date = asDate(value);
    if (!date) return '';
    try {
        return new Intl.DateTimeFormat(localeFor(language), options).format(date);
    } catch {
        return date.toISOString().slice(0, 10);
    }
};

export const formatAssignmentDate = (value, language, { compact = false } = {}) => (
    formatDateValue(value, language, compact
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' })
);

export const getStatusCounts = (assignments = []) => {
    const counts = { all: 0, draft: 0, published: 0, closed: 0, archived: 0 };
    for (const assignment of assignments) {
        counts.all += 1;
        if (counts[assignment.status] !== undefined) counts[assignment.status] += 1;
    }
    return counts;
};

export const getUngradedCount = (assignment) => Math.max(
    0,
    Number(assignment?.progress?.studentCount || 0) - Number(assignment?.progress?.gradedCount || 0)
);

export const getAssignmentMetrics = (assignments = [], now = new Date()) => {
    const statusCounts = getStatusCounts(assignments);
    const today = startOfDay(now);
    const weekEnd = new Date(today.getTime() + 7 * DAY_MS);
    let dueThisWeek = 0;
    let dueToday = 0;
    let overdue = 0;
    let awaitingGrading = 0;
    let assignmentsAwaitingGrading = 0;
    const classIds = new Set();

    for (const assignment of assignments) {
        if (assignment.class?.id) classIds.add(assignment.class.id);
        const dueDate = asDate(assignment.dueDate);
        if (dueDate && OPEN_STATUSES.has(assignment.status)) {
            const dueDay = startOfDay(dueDate);
            if (dueDay.getTime() === today.getTime()) dueToday += 1;
            if (dueDay >= today && dueDay < weekEnd) dueThisWeek += 1;
            if (dueDay < today && assignment.status === 'published') overdue += 1;
        }
        if (OPEN_STATUSES.has(assignment.status)) {
            const remaining = getUngradedCount(assignment);
            awaitingGrading += remaining;
            if (remaining > 0) assignmentsAwaitingGrading += 1;
        }
    }

    return {
        statusCounts,
        publishedCount: statusCounts.published,
        draftCount: statusCounts.draft,
        dueThisWeek,
        dueToday,
        overdue,
        awaitingGrading,
        assignmentsAwaitingGrading,
        classCount: classIds.size
    };
};

export const filterAndSortAssignments = ({
    assignments = [],
    status = 'all',
    search = '',
    sortKey = 'dueDate',
    language = 'en'
} = {}) => {
    const query = String(search || '').trim().toLowerCase();
    const filtered = assignments.filter((assignment) => {
        if (status !== 'all' && assignment.status !== status) return false;
        if (!query) return true;
        const haystack = [
            assignment.title,
            assignment.instructions,
            assignment.assignmentType?.name,
            assignment.assignmentType?.key,
            assignment.class?.name,
            assignment.subject?.name,
            assignment.subject?.code
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
    });

    return [...filtered].sort((a, b) => {
        if (sortKey === 'title') {
            return String(a.title || '').localeCompare(String(b.title || ''), language, {
                sensitivity: 'base'
            });
        }
        if (sortKey === 'created') {
            const aCreated = asDate(a.createdAt || a.assignedDate)?.getTime() || 0;
            const bCreated = asDate(b.createdAt || b.assignedDate)?.getTime() || 0;
            return bCreated - aCreated;
        }
        if (sortKey === 'needsGrading') {
            const byRemaining = getUngradedCount(b) - getUngradedCount(a);
            if (byRemaining !== 0) return byRemaining;
        }
        const aDue = asDate(a.dueDate)?.getTime() || Number.POSITIVE_INFINITY;
        const bDue = asDate(b.dueDate)?.getTime() || Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
        return String(a.title || '').localeCompare(String(b.title || ''), language, {
            sensitivity: 'base'
        });
    });
};

export const getAssignmentDuePresentation = (assignment, { language, t }) => {
    const dueDate = asDate(assignment?.dueDate);
    if (!dueDate) {
        const savedDate = asDate(assignment.createdAt || assignment.assignedDate);
        return {
            main: t('assignments:due.noDueDate'),
            sub: assignment.status === 'draft' && savedDate
                ? t('assignments:due.savedOn', {
                    date: formatAssignmentDate(savedDate, language, { compact: true })
                })
                : '',
            tone: ''
        };
    }

    const daysUntilDue = differenceInCalendarDays(startOfDay(dueDate), startOfDay(new Date()));
    const shortDate = formatDateValue(dueDate, language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    const fullDate = formatAssignmentDate(dueDate, language);

    if (assignment.status === 'closed') {
        return { main: fullDate, sub: t('assignments:due.closed'), tone: '' };
    }

    if (daysUntilDue < 0) {
        return {
            main: t('assignments:due.overdueByDays', { count: Math.abs(daysUntilDue) }),
            sub: t('assignments:due.wasDue', { date: fullDate }),
            tone: 'overdue'
        };
    }
    if (daysUntilDue === 0) {
        return { main: t('assignments:due.today'), sub: fullDate, tone: 'today' };
    }
    if (daysUntilDue === 1) {
        return { main: t('assignments:due.tomorrow'), sub: shortDate, tone: '' };
    }
    if (daysUntilDue <= 6) {
        return {
            main: shortDate,
            sub: t('assignments:due.inDays', { count: daysUntilDue }),
            tone: ''
        };
    }
    return {
        main: fullDate,
        sub: t('assignments:due.inDays', { count: daysUntilDue }),
        tone: ''
    };
};

export const getAssignmentProgressPresentation = (assignment, { language, t }) => {
    if (assignment.status === 'draft') {
        return {
            label: t('assignments:progress.notPublished'),
            percentLabel: '',
            percent: 0,
            tone: 'empty'
        };
    }

    const total = Number(assignment.progress?.studentCount || 0);
    const graded = Math.min(Number(assignment.progress?.gradedCount || 0), total);
    if (total === 0) {
        return {
            label: t('assignments:progress.noStudents'),
            percentLabel: '',
            percent: 0,
            tone: 'empty'
        };
    }

    const percent = Math.round((graded / total) * 100);
    const dueDate = asDate(assignment.dueDate);
    const isOverdue = assignment.status === 'published'
        && dueDate
        && differenceInCalendarDays(startOfDay(dueDate), startOfDay(new Date())) < 0;
    let tone = 'default';
    if (percent >= 100) tone = 'success';
    else if (isOverdue) tone = 'warning';

    let percentLabel = `${percent}%`;
    try {
        percentLabel = new Intl.NumberFormat(localeFor(language), {
            style: 'percent',
            maximumFractionDigits: 0
        }).format(percent / 100);
    } catch {
        // Keep the plain percentage fallback.
    }

    return {
        label: t('assignments:progress.graded', { graded, total }),
        percentLabel,
        percent,
        tone
    };
};

export const getPageNumbers = (page, pageCount) => {
    if (pageCount <= 7) {
        return Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    const pages = new Set([1, pageCount, page, page - 1, page + 1]);
    if (page <= 3) pages.add(2).add(3).add(4);
    if (page >= pageCount - 2) {
        pages.add(pageCount - 1).add(pageCount - 2).add(pageCount - 3);
    }
    const sorted = [...pages]
        .filter((value) => value >= 1 && value <= pageCount)
        .sort((a, b) => a - b);
    const result = [];
    let previous = 0;
    for (const value of sorted) {
        if (value - previous > 1) result.push(`ellipsis-${value}`);
        result.push(value);
        previous = value;
    }
    return result;
};
