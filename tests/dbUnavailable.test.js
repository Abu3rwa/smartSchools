import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isDbUnavailable,
    shouldLogDbOutage,
    resetDbOutageLogState,
    dbUnavailableError,
    DB_RETRY_AFTER_SECONDS
} from '../utils/dbHealth.js';
import { reportJobError } from '../utils/jobError.js';
import logger from '../utils/logger.js';

const serverSelectionError = () => Object.assign(
    new Error('getaddrinfo ENOTFOUND ac-wovlb2h-shard-00-00.glgpmmp.mongodb.net'),
    { name: 'MongoServerSelectionError' }
);

test('server selection and DNS failures count as a database outage', () => {
    assert.equal(isDbUnavailable(serverSelectionError()), true);
    assert.equal(isDbUnavailable(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), true);
    assert.equal(isDbUnavailable(Object.assign(new Error('socket closed'), { cause: { code: 'ETIMEDOUT' } })), true);
});

test('ordinary application errors are not mistaken for an outage', () => {
    assert.equal(isDbUnavailable(new Error('boom')), false);
    assert.equal(isDbUnavailable(Object.assign(new Error('Invalid status'), { statusCode: 400 })), false);
    assert.equal(isDbUnavailable(Object.assign(new Error('duplicate'), { code: 11000 })), false);
    assert.equal(isDbUnavailable(null), false);
});

test('the outage error carries 503 and a retry hint', () => {
    const error = dbUnavailableError();
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, 'DB_UNAVAILABLE');
    assert.equal(error.expose, true);
    assert.equal(error.retryAfter, DB_RETRY_AFTER_SECONDS);
});

test('one outage is logged once per window, not per failure', (t) => {
    resetDbOutageLogState();
    const start = 1_000_000;
    assert.equal(shouldLogDbOutage(start), true);
    assert.equal(shouldLogDbOutage(start + 60_000), false);
    assert.equal(shouldLogDbOutage(start + 4 * 60_000), false);
    assert.equal(shouldLogDbOutage(start + 5 * 60_000), true);

    const errorEvents = [];
    t.mock.method(logger, 'error', (message) => errorEvents.push(message));
    t.mock.method(logger, 'warn', () => {});
    resetDbOutageLogState();
    reportJobError('spelling_email_scheduler', serverSelectionError());
    reportJobError('spelling_email_scheduler', serverSelectionError());
    assert.deepEqual(errorEvents, []);
});

test('a genuine job failure still logs at error level', (t) => {
    const errorEvents = [];
    t.mock.method(logger, 'error', (message) => errorEvents.push(message));
    reportJobError('spelling_email_scheduler', new Error('template missing'));
    assert.equal(errorEvents.length, 1);
});
