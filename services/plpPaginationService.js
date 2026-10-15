const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const parsePositiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const getPlpPagination = (query = {}) => {
    const page = parsePositiveInteger(query.page, 1);
    const limit = Math.min(parsePositiveInteger(query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    return { page, limit, skip: (page - 1) * limit };
};

export const buildPlpPaginationMetadata = ({ page, limit, total }) => ({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
});
