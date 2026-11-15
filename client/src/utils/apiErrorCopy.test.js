import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { RATE_LIMIT_COPY_KEYS, rateLimitCopyKey } from './apiErrorCopy.js';

const common = (lang) => JSON.parse(readFileSync(
  new URL(`../i18n/locales/${lang}/common.json`, import.meta.url),
  'utf8',
));

test('a rate-limit code maps to its own sentence, anything else to the generic one', () => {
  assert.equal(rateLimitCopyKey('AI_RATE_LIMITED'), 'ai');
  assert.equal(rateLimitCopyKey('EMAIL_RATE_LIMITED'), 'email');
  assert.equal(rateLimitCopyKey('SOMETHING_NEW_RATE_LIMITED'), 'generic');
  assert.equal(rateLimitCopyKey(undefined), 'generic');
});

test('every mapped sentence exists in English and Arabic', () => {
  const keys = [...Object.values(RATE_LIMIT_COPY_KEYS), 'generic'];
  for (const lang of ['en', 'ar']) {
    const copy = common(lang).rateLimit;
    for (const key of keys) {
      assert.equal(typeof copy[key], 'string', `${lang} is missing rateLimit.${key}`);
      assert.ok(copy[key].trim(), `${lang} rateLimit.${key} is empty`);
    }
  }
});
