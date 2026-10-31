import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import AiCreditAccount from '../models/AiCreditAccount.js';
import AiCreditEntry from '../models/AiCreditEntry.js';
import { ratesForModel, isModelPriced } from '../config/aiPricing.js';
import { featureFromPath, runInAiUsageContext } from '../utils/aiUsageContext.js';
import { assertAiCredit, meterAiCall } from '../services/aiUsageMeter.js';
import { recordUnbilledUsage, recordUsage } from '../services/aiCreditService.js';

const schoolId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

const reply = {
    modelName: 'gpt-5.4-mini',
    inputtokenCount: 4000,
    cachedInputtokenCount: 0,
    outputtokenCount: 1500,
    totalTokenCount: 5500
};

const captureEntries = (context) => {
    const entries = [];
    context.mock.method(AiCreditEntry, 'create', async (input) => {
        const doc = Array.isArray(input) ? input[0] : input;
        entries.push(doc);
        return [{ _id: new mongoose.Types.ObjectId(), ...doc }];
    });
    return entries;
};

test('feature labels come from the real API surface', () => {
    assert.equal(featureFromPath('/api/writing/drafts/1/assess'), 'writing_assistant');
    assert.equal(featureFromPath('/api/reading/texts?page=2'), 'reading_assistant');
    assert.equal(featureFromPath('/api/map-test-prep/sessions'), 'map_test_prep');
    assert.equal(featureFromPath('/api/student-grouping/class-1/standard-1'), 'student_grouping');
    assert.equal(featureFromPath('/api/standards/assignments'), 'standards_practice');
    assert.equal(featureFromPath('/api/standard-assessment/x'), 'standards_practice');
    assert.equal(featureFromPath('/api/new-tool/x'), 'new_tool');
    assert.equal(featureFromPath('/nothing'), 'general');
});

test('pricing knows the models this app sends and refuses to guess the rest', () => {
    const openai = ratesForModel('gpt-5.4-mini', {});
    assert.deepEqual(
        [openai.inputPerMillionCents, openai.cachedInputPerMillionCents, openai.outputPerMillionCents],
        [75, 7.5, 450]
    );
    assert.equal(ratesForModel('gpt-5.4-mini-2026-01-01', {}).inputPerMillionCents, 75);
    assert.equal(ratesForModel('gemini-2.5-flash', {}), null);
    assert.equal(isModelPriced('some-new-model', {}), false);
    assert.equal(ratesForModel('', {}), null);
});

test('AI_CREDIT_MODEL_RATES overrides a price without a redeploy', () => {
    const env = { AI_CREDIT_MODEL_RATES: '{"custom-model":{"inputPerMillionCents":10,"cachedInputPerMillionCents":1,"outputPerMillionCents":20}}' };
    assert.equal(ratesForModel('custom-model', env).inputPerMillionCents, 10);
    assert.equal(ratesForModel('custom-model', { AI_CREDIT_MODEL_RATES: 'not json' }), null);
});

test('a student AI call is metered with its cost but charged nothing', async (context) => {
    const entries = captureEntries(context);
    const result = await runInAiUsageContext(
        { schoolId, userId, role: 'student', roles: ['student'], feature: 'reading_assistant' },
        () => meterAiCall({ options: {}, reply })
    );

    assert.equal(result.charged, false);
    assert.equal(entries.length, 1);
    const [entry] = entries;
    assert.equal(entry.feature, 'reading_assistant');
    assert.equal(entry.charged, false);
    assert.equal(entry.unpriced, false);
    assert.equal(entry.amountCents, 0);
    assert.equal(String(entry.school), String(schoolId));
    assert.equal(String(entry.user), String(userId));
    assert.ok(entry.costCents > 0, 'provider cost is still recorded');
    assert.equal(entry.chargedCents, 0);
});

test('an unpriced model is recorded and flagged instead of blocking the reply', async (context) => {
    const entries = captureEntries(context);
    const result = await recordUsage({
        schoolId,
        userId,
        reply: { ...reply, modelName: 'brand-new-model' },
        feature: 'lesson_plans',
        billable: true,
        env: {}
    });

    assert.equal(result.charged, false);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].unpriced, true);
    assert.equal(entries[0].charged, false);
});

test('explicit usage options bill a teacher even without a request context', async (context) => {
    const entries = [];
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', () =>
        ({ lean: async () => ({ _id: userId, balanceCents: 500, schoolCents: 0, spentCents: 0 }) })
    );
    context.mock.method(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 0 }));
    context.mock.method(AiCreditEntry, 'create', (input) => {
        entries.push(input[0]);
        return [{ _id: new mongoose.Types.ObjectId() }];
    });
    context.mock.method(mongoose.connection, 'transaction', async (callback) => callback({}));
    const setting = await import('../models/AiCreditSetting.js');
    context.mock.method(setting.default, 'findOne', () => ({
        select: () => ({ lean: async () => ({ markupPercent: 0 }) })
    }));

    const result = await meterAiCall({
        options: {
            usage: {
                schoolId,
                userId,
                feature: 'writing_feedback',
                refs: { assignmentTitle: 'My summer' }
            }
        },
        reply
    });

    assert.equal(result.charged, true);
    assert.equal(entries[0].feature, 'writing_feedback');
    assert.equal(entries[0].assignmentTitle, 'My summer');
});

test('the gate blocks a teacher with no credit and ignores roles that cannot hold it', async (context) => {
    let reads = 0;
    context.mock.method(AiCreditAccount, 'findOne', () => {
        reads += 1;
        return { select: () => ({ lean: async () => ({ balanceCents: 0, paused: false }) }) };
    });

    await assert.rejects(
        runInAiUsageContext(
            { schoolId, userId, role: 'teacher', roles: ['teacher'], feature: 'writing_assistant' },
            () => assertAiCredit({})
        ),
        { code: 'AI_CREDIT_REQUIRED', statusCode: 402 }
    );

    await runInAiUsageContext(
        { schoolId, userId, role: 'student', roles: ['student'], feature: 'reading_assistant' },
        () => assertAiCredit({})
    );
    assert.equal(reads, 1, 'students never touch a credit account');
});
