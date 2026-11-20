/**
 * Bounded public school lookup used by the landing page sign-in finder.
 *
 * The finder is a login aid for a visitor who already knows their school, so the
 * query is deliberately small: a literal substring match over name/slug, a fixed
 * result cap, and no count query. Callers cannot supply filters, projections,
 * sort expressions or regex.
 */

export const SCHOOL_SEARCH_MIN_LENGTH = 2;
export const SCHOOL_SEARCH_MAX_LENGTH = 80;
export const SCHOOL_SEARCH_RESULT_LIMIT = 8;
export const SCHOOL_SEARCH_FETCH_LIMIT = SCHOOL_SEARCH_RESULT_LIMIT + 1;

const ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;

export const escapeSchoolSearchTerm = (value = '') =>
    String(value).replace(ESCAPE_PATTERN, '\\$&');

/**
 * Parses the public `q` parameter.
 *
 * Returns `{ ok: true, query: '' }` when the visitor has not typed enough to
 * search (no database access), `{ ok: true, query }` for a usable search term,
 * and `{ ok: false, errors: ['q'] }` for input that must be rejected.
 */
export const parseSchoolSearchQuery = (rawQuery) => {
    if (rawQuery === undefined || rawQuery === null) {
        return { ok: true, query: '' };
    }

    if (typeof rawQuery !== 'string') {
        return { ok: false, errors: ['q'] };
    }

    const query = rawQuery.trim();

    if (query.length > SCHOOL_SEARCH_MAX_LENGTH) {
        return { ok: false, errors: ['q'] };
    }

    if (query.length < SCHOOL_SEARCH_MIN_LENGTH) {
        return { ok: true, query: '' };
    }

    return { ok: true, query };
};

export const buildSchoolSearchFilter = (query) => {
    const escaped = escapeSchoolSearchTerm(query);

    return {
        isActive: true,
        'subscription.status': { $in: ['active', 'trial'] },
        $or: [
            { name: { $regex: escaped, $options: 'i' } },
            { slug: { $regex: escaped, $options: 'i' } },
        ],
    };
};

export const toPublicSchoolSummary = (row) => ({
    name: row?.name,
    slug: row?.slug,
});

export const isPublicSchoolSummaryValid = (row) =>
    typeof row?.name === 'string' &&
    row.name.trim().length > 0 &&
    typeof row?.slug === 'string' &&
    row.slug.trim().length > 0;
