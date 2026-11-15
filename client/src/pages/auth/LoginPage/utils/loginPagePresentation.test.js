import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOGIN_ROLE_STORAGE_KEY,
  normalizeLoginErrorCode,
  normalizeLoginRole,
  readStoredLoginRole,
  storeLoginRole,
} from './loginPagePresentation.js';

const withStorage = (run) => {
  const store = new Map();
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  try {
    return run(store);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

test('only the two doors count as a login role', () => {
  assert.equal(normalizeLoginRole('teacher'), 'teacher');
  assert.equal(normalizeLoginRole('student'), 'student');
  assert.equal(normalizeLoginRole('admin'), null);
  assert.equal(normalizeLoginRole('Teacher'), null);
  assert.equal(normalizeLoginRole(null), null);
});

test('the chosen door is remembered and switching clears it', () => {
  withStorage((store) => {
    storeLoginRole('teacher');
    assert.equal(store.get(LOGIN_ROLE_STORAGE_KEY), 'teacher');
    assert.equal(readStoredLoginRole(), 'teacher');
    storeLoginRole('parent');
    assert.equal(readStoredLoginRole(), 'teacher');
    storeLoginRole(null);
    assert.equal(store.has(LOGIN_ROLE_STORAGE_KEY), false);
    assert.equal(readStoredLoginRole(), null);
  });
});

test('storage that cannot be read or written does not break the page', () => {
  const previous = globalThis.window;
  globalThis.window = {
    get localStorage() {
      throw new Error('blocked');
    },
  };
  try {
    assert.equal(readStoredLoginRole(), null);
    assert.doesNotThrow(() => storeLoginRole('student'));
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
  assert.equal(readStoredLoginRole(), null);
});

test('every callback code becomes a sentence key, unknown codes fall back', () => {
  for (const code of ['account_inactive', 'not_teacher', 'school_mismatch', 'no_account', 'access_denied', 'missing_code', 'google_not_configured']) {
    assert.equal(normalizeLoginErrorCode(code), code);
  }
  assert.equal(normalizeLoginErrorCode(' something-else '), 'generic');
  assert.equal(normalizeLoginErrorCode(''), null);
  assert.equal(normalizeLoginErrorCode(null), null);
});
