import test from 'node:test';
import assert from 'node:assert/strict';
import { runInboxAutoScanJob } from '../jobs/inboxAutoScanJob.js';
import InboxAssistantSettings from '../models/InboxAssistantSettings.js';
import User from '../models/User.js';
import inboxScanService from '../services/inbox/inboxScanService.js';

const makeUser = (overrides = {}) => ({
    _id: 'user-1',
    school: 'school-1',
    email: 'teacher@example.com',
    ...overrides,
});

const makeSettings = (overrides = {}) => ({
    school: 'school-1',
    user: 'user-1',
    optedIn: true,
    autoScanEnabled: true,
    autoScanIntervalMinutes: 60,
    lastScanAt: null,
    ...overrides,
});

test('auto-scan skips when no teachers have it enabled', async (t) => {
    t.mock.method(InboxAssistantSettings, 'find', () => ({
        select: () => ({ lean: async () => [] }),
    }));

    const result = await runInboxAutoScanJob({ now: new Date() });
    assert.equal(result.scanned, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.failed, 0);
});

test('auto-scan skips teachers whose interval has not elapsed', async (t) => {
    const now = new Date('2026-11-07T12:00:00Z');
    const recentScan = new Date('2026-11-07T11:30:00Z'); // 30 min ago, interval is 60

    t.mock.method(InboxAssistantSettings, 'find', () => ({
        select: () => ({ lean: async () => [makeSettings({ lastScanAt: recentScan })] }),
    }));
    t.mock.method(User, 'find', () => ({
        select: () => ({ lean: async () => [makeUser()] }),
    }));

    const result = await runInboxAutoScanJob({ now });
    assert.equal(result.scanned, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed, 0);
});

test('auto-scan runs for teachers whose interval has elapsed', async (t) => {
    const now = new Date('2026-11-07T12:00:00Z');
    const oldScan = new Date('2026-11-07T10:00:00Z'); // 2 hours ago, interval is 60

    t.mock.method(InboxAssistantSettings, 'find', () => ({
        select: () => ({ lean: async () => [makeSettings({ lastScanAt: oldScan })] }),
    }));
    t.mock.method(User, 'find', () => ({
        select: () => ({ lean: async () => [makeUser()] }),
    }));

    let scanCalled = false;
    t.mock.method(inboxScanService, 'estimateScan', async () => ({
        newCount: 5,
        estimateCents: 12,
    }));
    t.mock.method(inboxScanService, 'runScan', async () => {
        scanCalled = true;
        return { scanned: 5 };
    });

    const result = await runInboxAutoScanJob({ now });
    assert.equal(result.scanned, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.failed, 0);
    assert.equal(scanCalled, true);
});

test('auto-scan runs for teachers who have never scanned', async (t) => {
    const now = new Date('2026-11-07T12:00:00Z');

    t.mock.method(InboxAssistantSettings, 'find', () => ({
        select: () => ({ lean: async () => [makeSettings({ lastScanAt: null })] }),
    }));
    t.mock.method(User, 'find', () => ({
        select: () => ({ lean: async () => [makeUser()] }),
    }));

    let scanCalled = false;
    t.mock.method(inboxScanService, 'estimateScan', async () => ({
        newCount: 5,
        estimateCents: 12,
    }));
    t.mock.method(inboxScanService, 'runScan', async () => {
        scanCalled = true;
        return { scanned: 5 };
    });

    const result = await runInboxAutoScanJob({ now });
    assert.equal(result.scanned, 1);
    assert.equal(scanCalled, true);
});

test('auto-scan quotes the scan it starts', async (t) => {
    const now = new Date('2026-11-07T12:00:00Z');
    const oldScan = new Date('2026-11-07T10:00:00Z');

    t.mock.method(InboxAssistantSettings, 'find', () => ({
        select: () => ({ lean: async () => [makeSettings({ lastScanAt: oldScan })] }),
    }));
    t.mock.method(User, 'find', () => ({
        select: () => ({ lean: async () => [makeUser()] }),
    }));
    t.mock.method(inboxScanService, 'estimateScan', async () => ({
        newCount: 3,
        estimateCents: 42,
    }));

    let options;
    t.mock.method(inboxScanService, 'runScan', async (_user, scanOptions) => {
        options = scanOptions;
        return { scanned: 3 };
    });

    await runInboxAutoScanJob({ now });

    // runScan rejects anything that is not a real quote with ESTIMATE_REQUIRED.
    assert.equal(options.acceptedEstimateCents, 42);
});

test('auto-scan leaves an unchanged inbox alone', async (t) => {
    const now = new Date('2026-11-07T12:00:00Z');
    const oldScan = new Date('2026-11-07T10:00:00Z');

    t.mock.method(InboxAssistantSettings, 'find', () => ({
        select: () => ({ lean: async () => [makeSettings({ lastScanAt: oldScan })] }),
    }));
    t.mock.method(User, 'find', () => ({
        select: () => ({ lean: async () => [makeUser()] }),
    }));
    t.mock.method(inboxScanService, 'estimateScan', async () => ({
        newCount: 0,
        estimateCents: 0,
    }));

    let scanCalled = false;
    t.mock.method(inboxScanService, 'runScan', async () => {
        scanCalled = true;
        return { scanned: 0 };
    });

    const result = await runInboxAutoScanJob({ now });
    assert.equal(scanCalled, false);
    assert.equal(result.scanned, 0);
    assert.equal(result.noNewMail, 1);
    assert.equal(result.failed, 0);
});

test('auto-scan counts failures but continues', async (t) => {
    const now = new Date('2026-11-07T12:00:00Z');
    const oldScan = new Date('2026-11-07T10:00:00Z');

    t.mock.method(InboxAssistantSettings, 'find', () => ({
        select: () => ({
            lean: async () => [
                makeSettings({ user: 'user-1', lastScanAt: oldScan }),
                makeSettings({ user: 'user-2', lastScanAt: oldScan }),
            ],
        }),
    }));
    t.mock.method(User, 'find', () => ({
        select: () => ({
            lean: async () => [
                makeUser({ _id: 'user-1' }),
                makeUser({ _id: 'user-2' }),
            ],
        }),
    }));

    t.mock.method(inboxScanService, 'estimateScan', async () => ({
        newCount: 5,
        estimateCents: 12,
    }));

    let callCount = 0;
    t.mock.method(inboxScanService, 'runScan', async (user) => {
        callCount += 1;
        if (user._id === 'user-1') throw new Error('Scan failed');
        return { scanned: 5 };
    });

    const result = await runInboxAutoScanJob({ now });
    assert.equal(result.scanned, 1);
    assert.equal(result.failed, 1);
    assert.equal(callCount, 2);
});

test('auto-scan skips users not found in database', async (t) => {
    const now = new Date('2026-11-07T12:00:00Z');

    t.mock.method(InboxAssistantSettings, 'find', () => ({
        select: () => ({ lean: async () => [makeSettings({ user: 'user-missing' })] }),
    }));
    t.mock.method(User, 'find', () => ({
        select: () => ({ lean: async () => [] }),
    }));

    const result = await runInboxAutoScanJob({ now });
    assert.equal(result.scanned, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed, 0);
});
