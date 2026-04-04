/**
 * BE-021: Global pagination middleware.
 * Ensures all list endpoints have sensible defaults and caps to prevent
 * unbounded result sets that exhaust memory.
 *
 * Attaches `req.pagination` with { page, limit, skip } to be used by controllers.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const paginationMiddleware = (req, _res, next) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || DEFAULT_PAGE);
    let limit = parseInt(req.query.limit, 10);

    if (!Number.isFinite(limit) || limit <= 0) {
        limit = DEFAULT_LIMIT;
    }
    if (limit > MAX_LIMIT) {
        limit = MAX_LIMIT;
    }

    req.pagination = {
        page,
        limit,
        skip: (page - 1) * limit,
    };

    next();
};

export default paginationMiddleware;
