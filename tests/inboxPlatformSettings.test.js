import test from 'node:test';
import assert from 'node:assert/strict';

import AiCreditSetting from '../models/AiCreditSetting.js';
import {
    INBOX_DEFAULTS,
    getPlatformInboxSettings,
    saveInboxSettings
} from '../services/inboxSettingsService.js';

const withSettings = async (doc, run) => {
    const originalFindOne = AiCreditSetting.findOne;
    const originalUpdate = AiCreditSetting.findOneAndUpdate;
    let saved = null;
    AiCreditSetting.findOne = () => ({
        select: () => ({ lean: async () => doc })
    });
    AiCreditSetting.findOneAndUpdate = async (filter, update) => {
        saved = { filter, update };
        return update;
    };
    try {
        await run(() => saved);
    } finally {
        AiCreditSetting.findOne = originalFindOne;
        AiCreditSetting.findOneAndUpdate = originalUpdate;
    }
};

test('a platform with no inbox block reads the defaults', async () => {
    await withSettings(null, async () => {
        assert.deepEqual(await getPlatformInboxSettings(), INBOX_DEFAULTS);
    });
});

test('stored inbox fields win and missing ones fall back to the defaults', async () => {
    await withSettings({ inbox: { enabled: false, defaultScanSize: 30 } }, async () => {
        const settings = await getPlatformInboxSettings();
        assert.equal(settings.enabled, false);
        assert.equal(settings.defaultScanSize, 30);
        assert.equal(settings.maxScanSize, INBOX_DEFAULTS.maxScanSize);
        assert.equal(settings.rawTextRetentionDays, INBOX_DEFAULTS.rawTextRetentionDays);
    });
});

test('a saved patch keeps stored values and fills the rest', async () => {
    await withSettings({ inbox: { maxScanSize: 80 } }, async (saved) => {
        const next = await saveInboxSettings({
            patch: { defaultScanSize: 40, enabled: false },
            updatedBy: 'user-1'
        });
        assert.equal(next.defaultScanSize, 40);
        assert.equal(next.maxScanSize, 80);
        assert.equal(next.enabled, false);
        assert.equal(next.maxScansPerDay, INBOX_DEFAULTS.maxScansPerDay);

        const write = saved();
        assert.deepEqual(write.filter, { key: 'default' });
        assert.deepEqual(write.update.$set.inbox, next);
        assert.equal(write.update.$set.updatedBy, 'user-1');
    });
});

test('out-of-range and fractional limits are rejected with a plain message', async () => {
    await withSettings(null, async () => {
        for (const patch of [
            { defaultScanSize: 9 },
            { maxScanSize: 101 },
            { maxScansPerDay: 0 },
            { maxDraftsPerDay: 1001 },
            { freeScansPerDay: 51 },
            { rawTextRetentionDays: 0 },
            { defaultScanSize: 12.5 }
        ]) {
            await assert.rejects(
                () => saveInboxSettings({ patch }),
                (error) => error.statusCode === 400 && /whole number from \d+ to \d+/.test(error.message)
            );
        }
        await assert.rejects(
            () => saveInboxSettings({ patch: { enabled: 'yes' } }),
            (error) => error.statusCode === 400
        );
    });
});

test('the default scan size cannot exceed the largest scan size', async () => {
    await withSettings({ inbox: { maxScanSize: 20 } }, async () => {
        await assert.rejects(
            () => saveInboxSettings({ patch: { defaultScanSize: 30 } }),
            (error) => error.statusCode === 400 && /cannot be larger/.test(error.message)
        );
    });
});
