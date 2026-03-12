/* global process */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetPushServiceCredentialCacheForTests,
  resolveFcmV1ConfigForTests,
  shouldAllowLocalServiceAccount
} from '../services/pushNotificationService.js';

const ENV_KEYS = [
  'NODE_ENV',
  'ALLOW_LOCAL_SERVICE_ACCOUNT',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

const snapshotEnv = () => Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const restoreEnv = (snapshot) => {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

test('shouldAllowLocalServiceAccount defaults to false in production', () => {
  assert.equal(shouldAllowLocalServiceAccount({ NODE_ENV: 'production' }), false);
  assert.equal(shouldAllowLocalServiceAccount({ NODE_ENV: 'production', ALLOW_LOCAL_SERVICE_ACCOUNT: 'false' }), false);
  assert.equal(shouldAllowLocalServiceAccount({ NODE_ENV: 'production', ALLOW_LOCAL_SERVICE_ACCOUNT: 'true' }), true);
});

test('resolveFcmV1ConfigForTests ignores local file fallback in production by default', () => {
  const before = snapshotEnv();
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_LOCAL_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    __resetPushServiceCredentialCacheForTests();

    const config = resolveFcmV1ConfigForTests();
    assert.equal(config.configured, false);
    assert.equal(config.projectId, '');
    assert.equal(config.clientEmail, '');
    assert.equal(config.privateKey, '');
  } finally {
    restoreEnv(before);
    __resetPushServiceCredentialCacheForTests();
  }
});

test('resolveFcmV1ConfigForTests uses env values in production', () => {
  const before = snapshotEnv();
  try {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_LOCAL_SERVICE_ACCOUNT = 'false';
    process.env.FIREBASE_PROJECT_ID = 'project-x';
    process.env.FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk@example.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n';
    __resetPushServiceCredentialCacheForTests();

    const config = resolveFcmV1ConfigForTests();
    assert.equal(config.configured, true);
    assert.equal(config.projectId, 'project-x');
    assert.equal(config.clientEmail, 'firebase-adminsdk@example.iam.gserviceaccount.com');
    assert.ok(config.privateKey.includes('BEGIN PRIVATE KEY'));
    assert.ok(config.privateKey.includes('\n'));
  } finally {
    restoreEnv(before);
    __resetPushServiceCredentialCacheForTests();
  }
});
