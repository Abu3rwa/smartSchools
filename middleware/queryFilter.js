import mongoose from 'mongoose';

/**
 * Optional UI filter for list endpoints. Only for admin/whole-school principal.
 * Sets req.queryFilter from req.query.department when authScope is unscoped.
 * Controllers must never use queryFilter for authorization — only as extra filter.
 */
export function parseQueryFilter(req, res, next) {
    req.queryFilter = {};
    if (!req.authScope) return next();
    if (req.authScope.mode !== 'unscoped') return next();
    const dept = req.query.department;
    if (!dept) return next();
    try {
        if (mongoose.Types.ObjectId.isValid(dept)) {
            req.queryFilter.departmentId = new mongoose.Types.ObjectId(dept);
        }
    } catch (_) {
        // ignore invalid id
    }
    next();
}
