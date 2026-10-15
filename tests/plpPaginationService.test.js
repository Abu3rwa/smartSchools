import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlpPaginationMetadata, getPlpPagination } from '../services/plpPaginationService.js';

test('pagination defaults to the first page and a bounded page size', () => {
    assert.deepEqual(getPlpPagination(), { page: 1, limit: 50, skip: 0 });
    assert.deepEqual(getPlpPagination({ page: '3', limit: '25' }), { page: 3, limit: 25, skip: 50 });
});

test('pagination rejects invalid values and caps requested limits', () => {
    assert.deepEqual(getPlpPagination({ page: '-2', limit: '0' }), { page: 1, limit: 50, skip: 0 });
    assert.deepEqual(getPlpPagination({ page: '2', limit: '1000' }), { page: 2, limit: 100, skip: 100 });
});

test('pagination metadata returns stable page counts', () => {
    assert.deepEqual(
        buildPlpPaginationMetadata({ page: 2, limit: 25, total: 51 }),
        { page: 2, limit: 25, total: 51, pages: 3 }
    );
});
