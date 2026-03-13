export const toObjectIdString = (value) => (value == null ? '' : String(value));

export const ensurePagination = (query = {}) => {
    const page = Number.isFinite(Number(query.page)) ? Math.max(1, Number(query.page)) : 1;
    const limit = Number.isFinite(Number(query.limit))
        ? Math.min(100, Math.max(1, Number(query.limit)))
        : 20;
    return { page, limit, skip: (page - 1) * limit };
};

export const buildPaginationResult = ({ page, limit, total }) => ({
    page,
    limit,
    total,
    totalPages: total <= 0 ? 0 : Math.ceil(total / limit)
});

export const normalizeAcademicYear = (value, fallback = '') => {
    const normalized = String(value ?? fallback).trim();
    return /^\d{4}-\d{4}$/.test(normalized) ? normalized : fallback;
};

export const sortByWeek = (entries = []) => [...entries].sort((a, b) => {
    const left = Number(a.weekNumber || 0);
    const right = Number(b.weekNumber || 0);
    return left - right;
});

export const buildAuditEntry = ({ action, actor, message = '', meta = null }) => ({
    action,
    actor,
    message,
    meta,
    at: new Date()
});

export const isDepartmentAllowed = (reqDepartmentId, entityDepartmentId) => {
    if (!reqDepartmentId) return true;
    return toObjectIdString(reqDepartmentId) === toObjectIdString(entityDepartmentId);
};
