import assert from 'node:assert/strict';
import test from 'node:test';
import { extractMapFields } from '../services/mapPdfExtractionService.js';

test('extracts common MAP score fields from report text', () => {
    const result = extractMapFields(`Student Report\nRIT Score: 214\nPercentile: 63\nGrowth Percentile: 71`);
    assert.deepEqual(result, { ritScore: 214, percentile: 63, growthPercentile: 71 });
});

test('returns null for unavailable MAP fields', () => {
    assert.deepEqual(extractMapFields('Student Report\nGoal Area: Algebra'), {
        ritScore: null,
        percentile: null,
        growthPercentile: null
    });
});
