import assert from 'node:assert/strict';
import test from 'node:test';

import School from '../models/School.js';
import { default as landingRouter } from '../routes/landingRoutes.js';
import {
    SCHOOL_SEARCH_FETCH_LIMIT,
    SCHOOL_SEARCH_MAX_LENGTH,
    SCHOOL_SEARCH_RESULT_LIMIT,
    buildSchoolSearchFilter,
    escapeSchoolSearchTerm,
    isPublicSchoolSummaryValid,
    parseSchoolSearchQuery,
    toPublicSchoolSummary,
} from '../utils/landingSchoolSearch.js';

const getSchoolsRoute = () => {
    const layer = landingRouter.stack.find((entry) => entry.route?.path === '/schools' && entry.route.methods.get);
    const stack = layer?.route?.stack || [];
    return stack.length ? stack[0] : null;
};

const runRoute = async (layer, query = {}) => {
    const req = { query };
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };

    await layer.handle(req, res, (error) => {
        throw error;
    });

    return res;
};

const withMockedSchoolFind = async (rows, run) => {
    const originalFind = School.find;
    const calls = [];

    School.find = (filter) => {
        calls.push(filter);
        const chain = {
            select: () => chain,
            sort: () => chain,
            limit: () => chain,
            lean: async () => rows,
        };
        return chain;
    };

    try {
        return await run(calls);
    } finally {
        School.find = originalFind;
    }
};

test('parseSchoolSearchQuery accepts missing and short input without searching', () => {
    assert.deepEqual(parseSchoolSearchQuery(undefined), { ok: true, query: '' });
    assert.deepEqual(parseSchoolSearchQuery(null), { ok: true, query: '' });
    assert.deepEqual(parseSchoolSearchQuery(''), { ok: true, query: '' });
    assert.deepEqual(parseSchoolSearchQuery('   '), { ok: true, query: '' });
    assert.deepEqual(parseSchoolSearchQuery(' a '), { ok: true, query: '' });
});

test('parseSchoolSearchQuery trims a usable term', () => {
    assert.deepEqual(parseSchoolSearchQuery('  Demo School  '), { ok: true, query: 'Demo School' });
    assert.deepEqual(parseSchoolSearchQuery('ab'), { ok: true, query: 'ab' });
    assert.deepEqual(parseSchoolSearchQuery('x'.repeat(SCHOOL_SEARCH_MAX_LENGTH)), { ok: true, query: 'x'.repeat(SCHOOL_SEARCH_MAX_LENGTH) });
});

test('parseSchoolSearchQuery rejects non-string and over-long input', () => {
    assert.deepEqual(parseSchoolSearchQuery(['ab']), { ok: false, errors: ['q'] });
    assert.deepEqual(parseSchoolSearchQuery({ name: 'ab' }), { ok: false, errors: ['q'] });
    assert.deepEqual(parseSchoolSearchQuery(42), { ok: false, errors: ['q'] });
    assert.deepEqual(parseSchoolSearchQuery('x'.repeat(SCHOOL_SEARCH_MAX_LENGTH + 1)), { ok: false, errors: ['q'] });
});

test('escapeSchoolSearchTerm neutralises regex metacharacters', () => {
    assert.equal(escapeSchoolSearchTerm('ab.*'), 'ab\\.\\*');
    assert.equal(escapeSchoolSearchTerm('a+b?'), 'a\\+b\\?');
});

test('buildSchoolSearchFilter keeps the eligibility policy and escapes the term', () => {
    const filter = buildSchoolSearchFilter('ab.*');
    assert.equal(filter.isActive, true);
    assert.deepEqual(filter['subscription.status'], { $in: ['active', 'trial'] });
    assert.equal(filter.$or[0].name.$regex, 'ab\\.\\*');
    assert.equal(filter.$or[0].name.$options, 'i');
    assert.equal(filter.$or[1].slug.$regex, 'ab\\.\\*');
});

test('public school summary requires a usable name and slug', () => {
    assert.equal(isPublicSchoolSummaryValid({ name: 'Demo School', slug: 'demo-school' }), true);
    assert.equal(isPublicSchoolSummaryValid({ name: '', slug: 'demo-school' }), false);
    assert.equal(isPublicSchoolSummaryValid({ name: 'Demo School' }), false);
    assert.equal(isPublicSchoolSummaryValid({ name: 'Demo School', slug: '  ' }), false);
    assert.deepEqual(toPublicSchoolSummary({ name: 'Demo School', slug: 'demo-school' }), {
        name: 'Demo School',
        slug: 'demo-school',
    });
});

test('GET /landing/schools does not query the database for a short search', async () => {
    const route = getSchoolsRoute();
    assert.ok(route);

    await withMockedSchoolFind([], async (calls) => {
        const res = await runRoute(route, { q: 'a' });
        assert.equal(res.statusCode, null);
        assert.equal(res.body.success, true);
        assert.deepEqual(res.body.data.schools, []);
        assert.equal(res.body.data.hasMore, false);
        assert.equal(calls.length, 0);
    });
});

test('GET /landing/schools rejects invalid queries with 400', async () => {
    const route = getSchoolsRoute();

    await withMockedSchoolFind([], async (calls) => {
        const res = await runRoute(route, { q: ['demo'] });
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.deepEqual(res.body.errors, ['q']);
        assert.equal(calls.length, 0);
    });
});

test('GET /landing/schools returns eight results and a hasMore flag', async () => {
    const route = getSchoolsRoute();
    const rows = Array.from({ length: SCHOOL_SEARCH_FETCH_LIMIT }, (_, index) => ({
        name: `Demo School ${String(index + 1).padStart(2, '0')}`,
        slug: `demo-school-${String(index + 1).padStart(2, '0')}`,
        settings: { maxStudents: 50 },
        _id: `school-${index + 1}`,
    }));

    await withMockedSchoolFind(rows, async (calls) => {
        const res = await runRoute(route, { q: 'demo' });
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.schools.length, SCHOOL_SEARCH_RESULT_LIMIT);
        assert.equal(res.body.data.hasMore, true);
        assert.deepEqual(Object.keys(res.body.data.schools[0]).sort(), ['name', 'slug']);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].$or[0].name.$regex, 'demo');
    });
});

test('GET /landing/schools reports no more results when the fetch fits', async () => {
    const route = getSchoolsRoute();
    const rows = [{ name: 'Demo School', slug: 'demo-school' }];

    await withMockedSchoolFind(rows, async () => {
        const res = await runRoute(route, { q: 'demo' });
        assert.equal(res.body.data.hasMore, false);
        assert.equal(res.body.data.schools.length, 1);
    });
});
