import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTrendMonthKeys } from '../controllers/dashboardController.js';

const WINDOW = ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01'];

test('keeps the academic-year window when grades overlap it', () => {
    assert.deepEqual(
        resolveTrendMonthKeys(WINDOW, ['2025-09', '2025-10']),
        WINDOW
    );
});

test('falls back to grade months when no grade falls inside the window', () => {
    assert.deepEqual(
        resolveTrendMonthKeys(WINDOW, ['2026-09', '2026-10']),
        ['2026-09', '2026-10']
    );
});

test('falls back to grade months sorted when dates drift outside the window', () => {
    assert.deepEqual(
        resolveTrendMonthKeys(WINDOW, ['2026-10', '2026-08']),
        ['2026-08', '2026-10']
    );
});

test('returns the empty window when there are no grades', () => {
    assert.deepEqual(resolveTrendMonthKeys(WINDOW, []), WINDOW);
});
