import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeLandingLanguage,
  resolveLandingDynamicBlocks,
} from '../utils/landingLocalization.js';

test('normalizeLandingLanguage supports language tags and fallback', () => {
  assert.equal(normalizeLandingLanguage('ar-SA'), 'ar');
  assert.equal(normalizeLandingLanguage('en-US,en;q=0.9'), 'en');
  assert.equal(normalizeLandingLanguage('fr'), 'en');
});

test('resolveLandingDynamicBlocks returns Arabic blocks when available', () => {
  const result = resolveLandingDynamicBlocks('ar');

  assert.equal(result.resolvedLanguage, 'ar');
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.blocks.announcement.ctaLabel, 'اعرف المزيد');
  assert.equal(result.blocks.promotions[0].badge, 'عرض محدود');
});

test('resolveLandingDynamicBlocks falls back to English on unsupported language', () => {
  const result = resolveLandingDynamicBlocks('fr');

  assert.equal(result.resolvedLanguage, 'en');
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.blocks.announcement.ctaLabel, 'Learn more');
});
