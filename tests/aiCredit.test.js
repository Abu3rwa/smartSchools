import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import AiCreditAccount from '../models/AiCreditAccount.js';
import AiCreditEntry from '../models/AiCreditEntry.js';
import AiCreditRequest from '../models/AiCreditRequest.js';
import AiCreditSetting from '../models/AiCreditSetting.js';
import User from '../models/User.js';
import School from '../models/School.js';
import {
    alertToSend,
    alertsAfterTopUp,
    allocateCredit,
    applyMarkup,
    assertCanSpend,
    chargeUsage,
    costCents,
    createCreditRequest,
    creditRates,
    decideCreditRequest,
    fundSchool,
    getCreditSummary,
    getCreditBadge,
    getMarkupPercent,
    getPlatformCreditOverview,
    grantCredit,
    listCreditAccounts,
    listCreditHistory,
    isCreditError,
    parseAmountCents,
    parseMarkupPercent,
    parseReservePercent,
    reclaimCredit,
    returnCreditOnTeacherDeletion,
    splitTopUp,
    tokenCounts,
    updatePlatformMarkup
} from '../services/aiCreditService.js';
import { buildCreditAlertEmail, formatUsd } from '../services/aiCreditEmailService.js';

const schoolId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const rates = { model: 'gpt-5.4-mini', inputPerMillionCents: 75, cachedInputPerMillionCents: 7.5, outputPerMillionCents: 450 };
const session = { testSession: true };
let markupSetting = null;

test.beforeEach((context) => {
    markupSetting = null;
    context.mock.method(mongoose.connection, 'transaction', async (callback) => callback(session));
    context.mock.method(AiCreditSetting, 'findOne', () => chain(markupSetting));
});

const chain = (value) => {
    const query = {
        select: () => query,
        sort: () => query,
        limit: () => query,
        skip: () => query,
        populate: () => query,
        session: () => query,
        lean: async () => value
    };
    return query;
};

// Real MongoDB rejects one path under two operators; the stub must too.
const assertNoOperatorOverlap = (update) => {
    const seen = new Set();
    for (const [operator, fields] of Object.entries(update)) {
        if (!operator.startsWith('$')) continue;
        for (const path of Object.keys(fields)) {
            assert.equal(seen.has(path), false, `ConflictingUpdateOperators on ${path}`);
            seen.add(path);
        }
    }
};

// Mongoose rejects create([doc, doc], { session }) without ordered: true; the stub must too.
const assertCreateAllowed = (rows, options = {}) => {
    if (rows.length > 1 && options.session && !options.ordered) {
        throw new Error('Cannot call `create()` with a session and multiple documents unless `ordered: true` is set');
    }
};

const stub = (target, key, replacement) => {
    const original = target[key];
    target[key] = replacement;
    return () => { target[key] = original; };
};

test('creditRates uses verified standard mini prices and refuses unknown or invalid prices', () => {
    assert.deepEqual(creditRates({}), rates);
    assert.deepEqual(creditRates({}, 'gpt-5.4-mini-2026-03-17'), { ...rates, model: 'gpt-5.4-mini-2026-03-17' });
    assert.throws(() => creditRates({ AI_CREDIT_OUTPUT_CENTS_PER_MILLION: 'oops' }), { code: 'AI_CREDIT_PRICING_REQUIRED' });
    assert.throws(() => creditRates({ WRITING_AI_MODEL: 'gpt-other' }), { code: 'AI_CREDIT_PRICING_REQUIRED' });
    assert.deepEqual(creditRates({ WRITING_AI_PROVIDER: 'gemini' }), rates);
    assert.deepEqual(creditRates({
        WRITING_AI_MODEL: 'gpt-other',
        AI_CREDIT_INPUT_CENTS_PER_MILLION: '100',
        AI_CREDIT_CACHED_INPUT_CENTS_PER_MILLION: '10',
        AI_CREDIT_OUTPUT_CENTS_PER_MILLION: '500'
    }), { model: 'gpt-other', inputPerMillionCents: 100, cachedInputPerMillionCents: 10, outputPerMillionCents: 500 });
});

test('cached input gets its discounted rate and the reported example costs just over half a cent', () => {
    assert.equal(costCents({ inputTokens: 1171, outputTokens: 1082, totalTokens: 2253 }, rates), 0.5747);
    assert.equal(costCents({ inputTokens: 1171, cachedInputTokens: 1024, outputTokens: 1082, totalTokens: 2253 }, rates), 0.5056);
    assert.equal(costCents({ inputTokens: 1000, cachedInputTokens: 1000, totalTokens: 1000 }, rates), 0.0075);
    assert.equal(costCents({ inputTokens: 1000, cachedInputTokens: 2000, totalTokens: 1000 }, rates), 0.0075);
    assert.equal(tokenCounts({ inputtokenCount: 100, cachedInputtokenCount: 200 }).cachedInputTokens, 100);
});

test('costCents bills input and output tokens at their own rates', () => {
    // 4,000 in × 75 + 1,500 out × 450, per million.
    assert.equal(costCents({ inputTokens: 4000, outputTokens: 1500, totalTokens: 5500 }, rates), 0.975);
    assert.equal(costCents({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }, rates), 0);
});

test('tokens only reported in the total are billed as output', () => {
    const tokens = tokenCounts({ inputtokenCount: 1000, outputtokenCount: 500, totalTokenCount: 2500 });
    assert.deepEqual(tokens, { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500, totalTokens: 2500 });
    // 1000 × 75 + (500 + 1000) × 450, per million.
    assert.equal(costCents(tokens, rates), 0.75);
});

test('applyMarkup adds the configured percentage on top of provider cost', () => {
    assert.equal(applyMarkup(1, 0), 1);
    assert.equal(applyMarkup(1, 50), 1.5);
    assert.equal(applyMarkup(1, 100), 2);
    assert.equal(applyMarkup(0.975, 100), 1.95);
    assert.equal(applyMarkup(0.5056, 50), 0.7584);
    assert.equal(applyMarkup(0, 100), 0);
});

test('parseMarkupPercent accepts 0-1000 and rejects junk', () => {
    assert.equal(parseMarkupPercent(0), 0);
    assert.equal(parseMarkupPercent('50'), 50);
    assert.equal(parseMarkupPercent('12.345'), 12.35);
    assert.throws(() => parseMarkupPercent(-1), { statusCode: 400 });
    assert.throws(() => parseMarkupPercent(1001), { statusCode: 400 });
    assert.throws(() => parseMarkupPercent('abc'), { statusCode: 400 });
    assert.throws(() => parseMarkupPercent(true), { statusCode: 400 });
});

test('getMarkupPercent defaults to zero and blocks a malformed stored value', async () => {
    assert.equal(await getMarkupPercent(), 0);
    markupSetting = { markupPercent: 50 };
    assert.equal(await getMarkupPercent(), 50);
    markupSetting = { markupPercent: -5 };
    await assert.rejects(getMarkupPercent(), { code: 'AI_CREDIT_PRICING_REQUIRED' });
});

test('alertToSend fires low once, empty once, and nothing above the threshold', () => {
    assert.equal(alertToSend({ balanceCents: 500, lowBalanceCents: 100, alerts: {} }), null);
    assert.equal(alertToSend({ balanceCents: 80, lowBalanceCents: 100, alerts: {} }), 'low');
    assert.equal(alertToSend({ balanceCents: 80, lowBalanceCents: 100, alerts: { lowSentAt: new Date() } }), null);
    assert.equal(alertToSend({ balanceCents: -0.2, lowBalanceCents: 100, alerts: { lowSentAt: new Date() } }), 'empty');
    assert.equal(alertToSend({ balanceCents: 0, lowBalanceCents: 100, alerts: { emptySentAt: new Date() } }), null);
});

test('a top-up re-arms only the alerts the balance climbed above', () => {
    assert.deepEqual(alertsAfterTopUp({ balanceCents: 500, lowBalanceCents: 100 }), {
        'alerts.lowSentAt': null,
        'alerts.emptySentAt': null
    });
    assert.deepEqual(alertsAfterTopUp({ balanceCents: 50, lowBalanceCents: 100 }), { 'alerts.emptySentAt': null });
    assert.deepEqual(alertsAfterTopUp({ balanceCents: 0, lowBalanceCents: 100 }), {});
});

test('parseAmountCents rejects zero, junk and anything over the cap', () => {
    assert.equal(parseAmountCents('500'), 500);
    assert.throws(() => parseAmountCents(0), { statusCode: 400 });
    assert.throws(() => parseAmountCents('abc'), { statusCode: 400 });
    assert.throws(() => parseAmountCents(100001), { statusCode: 400 });
    assert.throws(() => parseAmountCents(1.5), { statusCode: 400 });
    assert.throws(() => parseAmountCents(true), { statusCode: 400 });
});

test('splitTopUp divides the shareable part equally and keeps rounding in the reserve', () => {
    assert.deepEqual(splitTopUp({ amountCents: 10000, staffCount: 10, reservePercent: 30 }), {
        perStaffCents: 700, distributedCents: 7000, reserveCents: 3000
    });
    assert.deepEqual(splitTopUp({ amountCents: 1001, staffCount: 3, reservePercent: 30 }), {
        perStaffCents: 233, distributedCents: 699, reserveCents: 302
    });
    assert.deepEqual(splitTopUp({ amountCents: 1000, staffCount: 0 }), {
        perStaffCents: 0, distributedCents: 0, reserveCents: 1000
    });
    assert.deepEqual(splitTopUp({}), { perStaffCents: 0, distributedCents: 0, reserveCents: 0 });
});

test('parseReservePercent accepts 0-100 and rejects junk', () => {
    assert.equal(parseReservePercent(0), 0);
    assert.equal(parseReservePercent('30'), 30);
    assert.equal(parseReservePercent('12.345'), 12.35);
    assert.throws(() => parseReservePercent(-1), { statusCode: 400 });
    assert.throws(() => parseReservePercent(101), { statusCode: 400 });
    assert.throws(() => parseReservePercent('abc'), { statusCode: 400 });
});

for (const role of ['teacher', 'admin', 'super_admin']) {
    test(`assertCanSpend requires an unpaused positive balance for ${role}`, async (context) => {
        let account = null;
        context.mock.method(AiCreditAccount, 'findOne', (filter) => {
            assert.equal(String(filter.school), String(schoolId));
            assert.equal(String(filter.user), String(userId));
            return chain(account);
        });
        const args = { schoolId, userId, isAdmin: role !== 'teacher', env: {} };
        await assert.rejects(assertCanSpend(args), (error) => {
            assert.equal(error.statusCode, 402);
            assert.equal(error.code, 'AI_CREDIT_REQUIRED');
            assert.ok(isCreditError(error));
            return true;
        });
        account = { balanceCents: 0 };
        await assert.rejects(assertCanSpend(args), { code: 'AI_CREDIT_REQUIRED' });
        account = { balanceCents: 300, paused: true };
        await assert.rejects(assertCanSpend(args), { code: 'AI_CREDIT_PAUSED' });
        account = { balanceCents: 0.4 };
        assert.deepEqual(await assertCanSpend(args), { balanceCents: 0.4 });
    });
}

test('unknown primary or fallback prices block before an AI request can start', async (context) => {
    context.mock.method(AiCreditAccount, 'findOne', () => chain({ balanceCents: 500 }));
    for (const env of [{ WRITING_AI_MODEL: 'gpt-unknown' }, { OPENAI_FALLBACK_MODEL: 'gpt-unknown' }]) {
        await assert.rejects(assertCanSpend({ schoolId, userId, env }), { code: 'AI_CREDIT_PRICING_REQUIRED' });
    }
});

const reply = { inputtokenCount: 4000, outputtokenCount: 1500, totalTokenCount: 5500, modelName: 'gpt-5.4-mini' };

const withChargeStubs = async (account, run) => {
    const calls = { inc: null, entries: [], claims: [] };
    const restores = [
        stub(AiCreditAccount, 'findOneAndUpdate', (filter, update) => {
            assertNoOperatorOverlap(update);
            calls.inc = { filter, update };
            const next = account
                ? { ...account, balanceCents: account.balanceCents + update.$inc.balanceCents }
                : null;
            return chain(next);
        }),
        stub(AiCreditAccount, 'updateOne', async (filter, update) => {
            calls.claims.push({ filter, update });
            return { modifiedCount: 1 };
        }),
        stub(AiCreditEntry, 'create', async (input, options) => {
            const doc = Array.isArray(input) ? input[0] : input;
            if (doc.charged) assert.equal(options.session, session);
            calls.entries.push(doc);
            const row = { ...doc, toObject: () => doc };
            return Array.isArray(input) ? [row] : row;
        }),
        stub(User, 'findOne', () => chain(null)),
        stub(School, 'findOne', () => chain(null))
    ];
    try {
        await run(calls);
    } finally {
        restores.forEach((restore) => restore());
    }
};

test('chargeUsage debits the cost and writes a usage row with tokens and labels', async () => {
    const account = { _id: new mongoose.Types.ObjectId(), balanceCents: 500, lowBalanceCents: 100, alerts: {} };
    await withChargeStubs(account, async (calls) => {
        const result = await chargeUsage({
            schoolId,
            userId,
            reply,
            feature: 'writing_feedback',
            refs: { assignmentTitle: 'My summer', studentName: 'Sara Ali', draftNumber: 2 },
            env: {}
        });
        assert.equal(result.charged, true);
        assert.equal(result.costCents, 0.975);
        assert.equal(calls.inc.update.$inc.balanceCents, -0.975);
        assert.equal(calls.inc.update.$inc.spentCents, 0.975);
        assert.equal(String(calls.inc.filter.user), String(userId));

        const [entry] = calls.entries;
        assert.equal(entry.source, 'school');
        assert.equal(entry.type, 'usage');
        assert.equal(entry.amountCents, -0.975);
        assert.equal(entry.inputTokens, 4000);
        assert.equal(entry.outputTokens, 1500);
        assert.equal(entry.totalTokens, 5500);
        assert.equal(entry.model, 'gpt-5.4-mini');
        assert.equal(entry.studentName, 'Sara Ali');
        assert.equal(entry.balanceAfterCents, 499.025);
        assert.equal(calls.claims.length, 0, 'no alert above the threshold');
    });
});

test('chargeUsage falls back to platform credit when the school share cannot cover the cost', async () => {
    const account = { _id: userId, balanceCents: 200, schoolCents: 0, lowBalanceCents: 100, alerts: {} };
    const calls = [];
    let paidEntry = null;
    const restores = [
        stub(AiCreditAccount, 'findOneAndUpdate', (filter, update) => {
            assertNoOperatorOverlap(update);
            calls.push({ filter, update });
            if (calls.length === 1) {
                assert.deepEqual(filter.schoolCents, { $gte: 0.975 });
                return chain(null);
            }
            if (calls.length === 2) {
                assert.deepEqual(filter.schoolCents, { $gt: 0, $lt: 0.975 });
                assert.ok(Array.isArray(update));
                return chain(null);
            }
            assert.equal(filter.schoolCents, undefined);
            assert.ok(filter.$expr);
            return chain({ ...account, balanceCents: 199.025 });
        }),
        stub(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 0 })),
        stub(AiCreditEntry, 'create', async (rows) => {
            paidEntry = rows[0];
            return rows.map((entry) => ({ toObject: () => entry }));
        })
    ];
    try {
        const result = await chargeUsage({ schoolId, userId, reply, feature: 'writing_feedback', env: {} });
        assert.equal(result.charged, true);
        assert.equal(result.source, 'grant');
        assert.equal(paidEntry.source, 'grant');
        assert.equal(calls.length, 3);
        assert.equal(calls[2].update.$inc.balanceCents, -0.975);
        assert.equal(calls[2].update.$inc.schoolCents, undefined);
    } finally {
        restores.forEach((restore) => restore());
    }
});

test('chargeUsage drains the rest of a partial school share before touching the grant', async () => {
    const calls = [];
    const entries = [];
    const restores = [
        stub(AiCreditAccount, 'findOneAndUpdate', (filter, update) => {
            calls.push({ filter, update });
            if (calls.length === 1) return chain(null);
            assert.deepEqual(filter.schoolCents, { $gt: 0, $lt: 0.975 });
            assert.ok(Array.isArray(update));
            return chain({ _id: userId, balanceCents: 199.025, schoolCents: 0, lowBalanceCents: 100, alerts: {} });
        }),
        stub(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 0 })),
        stub(AiCreditEntry, 'create', async (rows) => {
            entries.push(rows[0]);
            return rows.map((entry) => ({ toObject: () => entry }));
        })
    ];
    try {
        const result = await chargeUsage({ schoolId, userId, reply, feature: 'writing_feedback', env: {} });
        assert.equal(result.charged, true);
        assert.equal(result.source, 'mixed');
        assert.equal(entries[0].source, 'mixed');
        assert.equal(entries[0].balanceAfterCents, 199.025);
        assert.equal(calls.length, 2);
    } finally {
        restores.forEach((restore) => restore());
    }
});

test('chargeUsage claims the low alert once the balance drops under the threshold', async () => {
    const account = { _id: new mongoose.Types.ObjectId(), balanceCents: 100.5, lowBalanceCents: 100, alerts: {} };
    await withChargeStubs(account, async (calls) => {
        await chargeUsage({ schoolId, userId, reply, feature: 'writing_feedback', env: {} });
        assert.equal(calls.claims.length, 1);
        assert.deepEqual(Object.keys(calls.claims[0].update.$set), ['alerts.lowSentAt']);
        assert.equal(calls.claims[0].filter['alerts.lowSentAt'], null, 'claim only if not sent yet');
    });
});

for (const role of ['admin', 'super_admin']) {
    test(`chargeUsage debits ${role} usage and records the cached discount`, async () => {
        const account = { _id: userId, balanceCents: 500, lowBalanceCents: 100 };
        await withChargeStubs(account, async (calls) => {
            const result = await chargeUsage({
                schoolId, userId, isAdmin: true,
                reply: { ...reply, cachedInputtokenCount: 2000 }, env: {}
            });
            assert.equal(result.charged, true);
            assert.equal(calls.inc.update.$inc.balanceCents, -0.84);
            assert.equal(calls.entries[0].charged, true);
            assert.equal(calls.entries[0].costCents, 0.84);
            assert.equal(calls.entries[0].cachedInputTokens, 2000);
            assert.equal(calls.entries[0].rates.cachedInputPerMillionCents, 7.5);
            assert.equal(calls.entries[0].balanceAfterCents, 499.16);
        });
    });
}

test('chargeUsage bills provider cost plus markup and snapshots the percentage on the row', async () => {
    markupSetting = { markupPercent: 100 };
    const account = { _id: userId, balanceCents: 500, lowBalanceCents: 100 };
    await withChargeStubs(account, async (calls) => {
        const result = await chargeUsage({ schoolId, userId, reply, feature: 'writing_feedback', env: {} });
        assert.equal(result.charged, true);
        assert.equal(result.providerCostCents, 0.975);
        assert.equal(result.chargedCents, 1.95);
        assert.equal(result.profitCents, 0.975);
        assert.equal(result.markupPercent, 100);
        assert.equal(calls.inc.update.$inc.balanceCents, -1.95);
        assert.equal(calls.inc.update.$inc.spentCents, 1.95);

        const [entry] = calls.entries;
        assert.equal(entry.costCents, 0.975);
        assert.equal(entry.chargedCents, 1.95);
        assert.equal(entry.profitCents, 0.975);
        assert.equal(entry.markupPercent, 100);
        assert.equal(entry.amountCents, -1.95);
        assert.equal(entry.balanceAfterCents, 498.05);
    });
});

test('updatePlatformMarkup saves the new selling percentage', async (context) => {
    context.mock.method(AiCreditSetting, 'findOneAndUpdate', (filter, update, options) => {
        assert.deepEqual(filter, { key: 'default' });
        assert.equal(update.$set.markupPercent, 50);
        assert.equal(options.upsert, true);
        return chain({ markupPercent: 50, updatedAt: new Date('2026-10-28T10:00:00Z') });
    });
    const saved = await updatePlatformMarkup({ markupPercent: '50', updatedBy: userId });
    assert.equal(saved.markupPercent, 50);
});

test('chargeUsage never throws when the ledger write fails', async () => {
    const restore = stub(AiCreditAccount, 'findOneAndUpdate', () => { throw new Error('db down'); });
    try {
        const result = await chargeUsage({ schoolId, userId, reply, env: {} });
        assert.equal(result.charged, false);
    } finally {
        restore();
    }
});

test('grantCredit refuses to take back more than the teacher has', async () => {
    const restores = [
        stub(User, 'findOne', () => chain({ _id: userId, role: 'teacher' })),
        stub(AiCreditAccount, 'updateOne', async (_filter, update) => {
            assertNoOperatorOverlap(update);
            return { modifiedCount: 0 };
        }),
        stub(AiCreditAccount, 'findOneAndUpdate', (filter, update) => {
            assertNoOperatorOverlap(update);
            assert.deepEqual(filter.balanceCents, { $gte: 500 });
            return chain(null);
        })
    ];
    try {
        await assert.rejects(
            grantCredit({ schoolId, userId, amountCents: -500, adminId: userId }),
            { statusCode: 400 }
        );
    } finally {
        restores.forEach((restore) => restore());
    }
});

for (const role of ['teacher', 'admin', 'super_admin']) {
    test(`grantCredit creates prepaid credit for a school-scoped ${role}`, async (context) => {
        context.mock.method(User, 'findOne', (filter) => {
            assert.equal(String(filter.school), String(schoolId));
            assert.equal(String(filter._id), String(userId));
            return chain({ _id: userId, role });
        });
        context.mock.method(AiCreditAccount, 'updateOne', async (_filter, update, options) => {
            assertNoOperatorOverlap(update);
            assert.equal(options.session, session);
            return { modifiedCount: 1 };
        });
        context.mock.method(AiCreditAccount, 'findOneAndUpdate', (filter, update, options) => {
            assert.equal(String(filter.school), String(schoolId));
            assert.equal(String(filter.user), String(userId));
            assert.equal(update.$inc.balanceCents, 500);
            assert.equal(options.session, session);
            return chain({ _id: userId, balanceCents: 500, lowBalanceCents: 100 });
        });
        context.mock.method(AiCreditEntry, 'create', async ([entry], options) => {
            assert.equal(options.session, session);
            assert.equal(entry.amountCents, 500);
            return [{ toObject: () => ({ _id: userId, ...entry }) }];
        });
        const result = await grantCredit({ schoolId, userId, amountCents: 500, adminId: userId });
        assert.equal(result.account.balanceCents, 500);
    });
}

test('admin accounts appear in the dashboard and badge; historical uncharged usage is excluded from spend', async (context) => {
    context.mock.method(User, 'find', (filter) => {
        assert.equal(String(filter.school), String(schoolId));
        assert.deepEqual(filter.$or[0].role.$in, ['teacher', 'admin']);
        return chain([{ _id: userId, role: 'admin', firstName: 'School', lastName: 'Admin' }]);
    });
    const account = { user: userId, balanceCents: 400, schoolCents: 150, lowBalanceCents: 100 };
    context.mock.method(AiCreditAccount, 'find', () => chain([account]));
    context.mock.method(AiCreditAccount, 'findOne', (filter) => chain(filter.kind === 'school'
        ? { balanceCents: 900, reservePercent: 30 }
        : account));
    context.mock.method(AiCreditRequest, 'find', () => chain([]));
    context.mock.method(AiCreditRequest, 'findOne', () => chain(null));
    context.mock.method(AiCreditEntry, 'aggregate', async (pipeline) => {
        assert.deepEqual(pipeline[1].$group.costCents, {
            $sum: { $cond: [{ $eq: ['$charged', false] }, 0, { $ifNull: ['$chargedCents', '$costCents'] }] }
        });
        return [{ _id: userId, requests: 2, costCents: 0.84, tokens: 9000 }];
    });
    const dashboard = await listCreditAccounts({ schoolId, adminId: userId });
    assert.equal(dashboard.rows[0].name, 'School Admin');
    assert.equal(dashboard.rows[0].exempt, undefined);
    assert.equal(dashboard.rows[0].schoolCents, 150);
    assert.equal(dashboard.rows[0].grantCents, 250);
    assert.deepEqual(dashboard.pool, { balanceCents: 900, reservePercent: 30, allocatedCents: 150 });
    assert.equal(dashboard.poolRequest, null);
    assert.equal(dashboard.totals.withCredit, 1);
    assert.equal(dashboard.totals.schoolCents, 150);
    assert.equal(dashboard.totals.spentThisMonthCents, 0.84);
    const summary = await getCreditSummary({ schoolId, userId, isAdmin: true });
    assert.equal(summary.balanceCents, 400);
    assert.equal(summary.exempt, undefined);
    const badge = await getCreditBadge({ schoolId, userId, isAdmin: true });
    assert.deepEqual(badge, { balanceCents: 400, lowBalanceCents: 100, paused: false });
});

test('credit history preserves old uncharged entries and exposes model, cached tokens and markup', async (context) => {
    const query = chain([
        { _id: 'old', type: 'usage', charged: false, costCents: 0.5747 },
        { _id: 'legacy', type: 'usage', charged: true, costCents: 0.5747, amountCents: -0.5747 },
        {
            _id: 'new', type: 'usage', charged: true, model: 'gpt-5.4-mini', cachedInputTokens: 1024,
            costCents: 0.5056, chargedCents: 0.7584, profitCents: 0.2528, markupPercent: 50, amountCents: -0.7584
        }
    ]);
    context.mock.method(AiCreditEntry, 'find', () => query);
    context.mock.method(AiCreditEntry, 'countDocuments', async () => 3);
    const history = await listCreditHistory({ schoolId, userId });
    assert.equal(history.rows[0].charged, false);
    assert.equal(history.rows[0].balanceAfterCents, null);
    assert.equal(history.rows[0].cachedInputTokens, 0);
    assert.equal(history.rows[0].chargedCents, 0);
    assert.equal(history.rows[1].chargedCents, 0.5747, 'pre-markup rows were billed at provider cost');
    assert.equal(history.rows[1].markupPercent, null);
    assert.equal(history.rows[1].profitCents, 0);
    assert.equal(history.rows[2].cachedInputTokens, 1024);
    assert.equal(history.rows[2].model, 'gpt-5.4-mini');
    assert.equal(history.rows[2].amountCents, -0.7584);
    assert.equal(history.rows[2].costCents, 0.5056);
    assert.equal(history.rows[2].chargedCents, 0.7584);
    assert.equal(history.rows[2].profitCents, 0.2528);
    assert.equal(history.rows[2].markupPercent, 50);
});

test('credit history clamps pageSize and pages against it', async (context) => {
    const calls = [];
    const recordingQuery = {
        sort: () => recordingQuery,
        skip: (value) => { calls.push(['skip', value]); return recordingQuery; },
        limit: (value) => { calls.push(['limit', value]); return recordingQuery; },
        lean: async () => []
    };
    context.mock.method(AiCreditEntry, 'find', () => recordingQuery);
    context.mock.method(AiCreditEntry, 'countDocuments', async () => 120);

    const big = await listCreditHistory({ schoolId, userId, page: 3, pageSize: 10000 });
    assert.deepEqual(calls, [['skip', 50], ['limit', 25]], 'invalid pageSize falls back to 25');
    assert.equal(big.pageSize, 25);
    assert.equal(big.pages, 5);

    calls.length = 0;
    const sized = await listCreditHistory({ schoolId, userId, page: 2, pageSize: 50 });
    assert.deepEqual(calls, [['skip', 50], ['limit', 50]]);
    assert.equal(sized.pageSize, 50);
    assert.equal(sized.pages, 3);
    assert.equal(sized.total, 120);
});

test('platform overview reports markup, provider cost, charged price and profit', async (context) => {
    markupSetting = { markupPercent: 100 };
    const query = chain([{
        _id: 'row-1',
        type: 'usage',
        costCents: 0.975,
        chargedCents: 1.95,
        profitCents: 0.975,
        markupPercent: 100,
        amountCents: -1.95,
        totalTokens: 5500,
        school: { name: 'Cedar School' },
        user: { firstName: 'Sara', lastName: 'Ali', email: 'sara@example.com' }
    }]);
    context.mock.method(AiCreditEntry, 'find', () => query);
    context.mock.method(AiCreditEntry, 'countDocuments', async () => 1);
    context.mock.method(AiCreditEntry, 'aggregate', async () => ([{
        requests: 1, tokens: 5500, providerCostCents: 0.975, chargedCents: 1.95, profitCents: 0.975
    }]));

    const overview = await getPlatformCreditOverview({ page: 1 });
    assert.equal(overview.markupPercent, 100);
    assert.deepEqual(overview.thisMonth, {
        requests: 1, tokens: 5500, providerCostCents: 0.975, chargedCents: 1.95, profitCents: 0.975
    });
    assert.equal(overview.rows[0].schoolName, 'Cedar School');
    assert.equal(overview.rows[0].userName, 'Sara Ali');
    assert.equal(overview.rows[0].chargedCents, 1.95);
    assert.equal(overview.rows[0].profitCents, 0.975);
    assert.equal(overview.total, 1);
    assert.equal(overview.page, 1);
});

test('grantCredit rejects students', async () => {
    const restore = stub(User, 'findOne', () => chain({ _id: userId, role: 'student', roles: ['student'] }));
    try {
        await assert.rejects(grantCredit({ schoolId, userId, amountCents: 500, adminId: userId }), { statusCode: 404 });
    } finally {
        restore();
    }
});

test('approval pays the teacher from the reserve in the same transaction; handled requests cannot repeat', async (context) => {
    const requestId = new mongoose.Types.ObjectId();
    let request = { _id: requestId, user: userId, amountCents: 500, status: 'pending', target: 'teacher' };
    const entries = [];
    context.mock.method(AiCreditRequest, 'findOne', (filter) => {
        assert.equal(String(filter.school), String(schoolId));
        return chain(request.status === 'pending' ? request : null);
    });
    context.mock.method(AiCreditRequest, 'findOneAndUpdate', (filter, update, options) => {
        assert.equal(filter.status, 'pending');
        assert.equal(options.session, session);
        request = { ...request, ...update.$set };
        return chain(request);
    });
    context.mock.method(User, 'findOne', () => chain({ _id: userId, role: 'teacher' }));
    context.mock.method(AiCreditAccount, 'updateOne', async (_filter, update, options) => {
        assert.equal(options.session, session);
        assertNoOperatorOverlap(update);
        return { modifiedCount: 1 };
    });
    let call = 0;
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', (filter, update, options) => {
        assert.equal(options.session, session);
        call += 1;
        if (call === 1) {
            assert.equal(filter.kind, 'school');
            assert.deepEqual(filter.balanceCents, { $gte: 300 });
            assert.equal(update.$inc.balanceCents, -300);
            return chain({ _id: 'pool', balanceCents: 700, reservePercent: 30 });
        }
        assert.equal(update.$inc.balanceCents, 300);
        assert.equal(update.$inc.schoolCents, 300);
        return chain({ _id: userId, balanceCents: 300, schoolCents: 300, lowBalanceCents: 100 });
    });
    context.mock.method(AiCreditEntry, 'create', async (rows, options) => {
        assert.equal(options.session, session);
        assertCreateAllowed(rows, options);
        assert.equal(rows.length, 2);
        rows.forEach((entry) => entries.push(entry));
        return rows.map((entry) => ({ toObject: () => ({ _id: requestId, ...entry }) }));
    });
    const result = await decideCreditRequest({ schoolId, requestId, adminId: userId, approve: true, amountCents: 300 });
    assert.equal(result.request.status, 'approved');
    assert.equal(result.request.grantedCents, 300);
    assert.equal(result.account.balanceCents, 300);
    assert.equal(result.poolBalanceCents, 700);
    assert.deepEqual(entries.map((entry) => [entry.accountType, entry.type, entry.amountCents]), [
        ['school', 'allocation', -300],
        ['user', 'allocation', 300]
    ]);
    await assert.rejects(decideCreditRequest({ schoolId, requestId, adminId: userId, approve: true }), { statusCode: 404 });
    assert.equal(entries.length, 2, 'a repeated approval must not move more credit');
});

test('a school admin cannot decide a request for platform funding', async (context) => {
    context.mock.method(AiCreditRequest, 'findOne', () => chain({
        _id: new mongoose.Types.ObjectId(), user: userId, amountCents: 500, status: 'pending', target: 'pool'
    }));
    await assert.rejects(
        decideCreditRequest({ schoolId, requestId: new mongoose.Types.ObjectId(), adminId: userId, approve: true }),
        { statusCode: 400 }
    );
});

test('a teacher cannot ask for school funding; a school admin can', async (context) => {
    context.mock.method(AiCreditRequest, 'create', async (doc) => ({ toObject: () => ({ _id: 'req', ...doc }) }));
    await assert.rejects(
        createCreditRequest({ schoolId, userId, amountCents: 500, target: 'pool', role: 'teacher' }),
        { statusCode: 400 }
    );
    const request = await createCreditRequest({ schoolId, userId, amountCents: 500, target: 'pool', role: 'admin' });
    assert.equal(request.target, 'pool');
});

test('fundSchool splits each top-up: equal shares to active staff, rounding to the reserve', async (context) => {
    const first = new mongoose.Types.ObjectId();
    const second = new mongoose.Types.ObjectId();
    const entries = [];
    context.mock.method(School, 'exists', async (filter) => {
        assert.equal(String(filter._id), String(schoolId));
        return { _id: schoolId };
    });
    context.mock.method(AiCreditAccount, 'updateOne', async (_filter, update) => {
        assertNoOperatorOverlap(update);
        return { modifiedCount: 1 };
    });
    context.mock.method(AiCreditAccount, 'findOne', () => chain({ balanceCents: 0, reservePercent: 30 }));
    context.mock.method(User, 'find', (filter) => {
        assert.equal(String(filter.school), String(schoolId));
        return chain([{ _id: first }, { _id: second }]);
    });
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', (filter, update, options) => {
        assert.equal(options.session, session);
        assertNoOperatorOverlap(update);
        if (filter.user === null) {
            assert.equal(update.$inc.balanceCents, 10000);
            assert.equal(update.$set.reservePercent, 30);
            return chain({ _id: 'pool', balanceCents: 10000 });
        }
        assert.equal(update.$inc.schoolCents, 3500);
        return chain({ _id: filter.user, balanceCents: 3500, schoolCents: 3500, lowBalanceCents: 100 });
    });
    context.mock.method(AiCreditEntry, 'create', async (rows, options) => {
        assert.equal(options.session, session);
        assertCreateAllowed(rows, options);
        rows.forEach((entry) => entries.push(entry));
        return rows.map((entry) => ({ toObject: () => entry }));
    });
    const result = await fundSchool({ schoolId, amountCents: 10000, adminId: userId });
    assert.deepEqual(result, {
        amountCents: 10000,
        distributedCents: 7000,
        reserveCents: 3000,
        perStaffCents: 3500,
        staffCount: 2,
        poolBalanceCents: 3000
    });
    assert.deepEqual(entries.map((entry) => [entry.accountType, entry.type, entry.amountCents]), [
        ['school', 'fund', 10000],
        ['school', 'allocation', -7000],
        ['user', 'allocation', 3500],
        ['user', 'allocation', 3500]
    ]);
});

test('funding refuses a school that does not exist', async (context) => {
    context.mock.method(School, 'exists', async () => null);
    await assert.rejects(
        fundSchool({ schoolId, amountCents: 10000, adminId: userId }),
        { statusCode: 404 }
    );
});

test('allocation is refused when the reserve cannot cover it', async (context) => {
    context.mock.method(User, 'findOne', () => chain({ _id: userId, role: 'teacher' }));
    context.mock.method(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 1 }));
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', (filter) => {
        assert.equal(filter.kind, 'school');
        return chain(null);
    });
    await assert.rejects(
        allocateCredit({ schoolId, userId, amountCents: 500, adminId: userId }),
        { code: 'AI_CREDIT_RESERVE_SHORT', statusCode: 409 }
    );
});

test('allocation reaches a student, while an ordinary grant still does not', async (context) => {
    context.mock.method(User, 'findOne', () => chain({ _id: userId, role: 'student', roles: ['student'] }));
    context.mock.method(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 1 }));
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', (filter) => {
        assert.equal(filter.kind, 'school');
        return chain(null);
    });
    // The student passes the role gate and only the empty reserve stops the move.
    await assert.rejects(
        allocateCredit({ schoolId, userId, amountCents: 500, adminId: userId }),
        { code: 'AI_CREDIT_RESERVE_SHORT' }
    );
});

test('reclaim only returns unspent school-allocated credit', async (context) => {
    context.mock.method(User, 'findOne', () => chain({ _id: userId, role: 'teacher' }));
    context.mock.method(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 1 }));
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', (filter) => {
        assert.deepEqual(filter.schoolCents, { $gte: 500 });
        return chain(null);
    });
    await assert.rejects(
        reclaimCredit({ schoolId, userId, amountCents: 500, adminId: userId }),
        { code: 'AI_CREDIT_RECLAIM_EXCEEDS', statusCode: 409 }
    );
});

test('reclaim moves credit from the teacher back to the pool', async (context) => {
    const entries = [];
    context.mock.method(User, 'findOne', () => chain({ _id: userId, role: 'teacher' }));
    context.mock.method(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 1 }));
    let call = 0;
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', (filter, update, options) => {
        assert.equal(options.session, session);
        call += 1;
        if (call === 1) {
            assert.equal(update.$inc.schoolCents, -200);
            return chain({ _id: userId, balanceCents: 100, schoolCents: 0, lowBalanceCents: 100 });
        }
        assert.equal(filter.user, null);
        assert.equal(update.$inc.balanceCents, 200);
        return chain({ _id: 'pool', balanceCents: 1200 });
    });
    context.mock.method(AiCreditEntry, 'create', async (rows, options) => {
        assertCreateAllowed(rows, options);
        rows.forEach((entry) => entries.push(entry));
        return rows.map((entry) => ({ toObject: () => entry }));
    });
    const result = await reclaimCredit({ schoolId, userId, amountCents: 200, adminId: userId });
    assert.equal(result.account.balanceCents, 100);
    assert.equal(result.poolBalanceCents, 1200);
    assert.deepEqual(entries.map((entry) => [entry.accountType, entry.type, entry.amountCents]), [
        ['user', 'reclaim', -200],
        ['school', 'reclaim', 200]
    ]);
});

test('deleting a teacher returns unspent credit to the reserve and closes their pending request', async (context) => {
    const entries = [];
    let deletions = 0;
    context.mock.method(AiCreditRequest, 'updateMany', async (filter, update, options) => {
        assert.equal(options.session, session);
        assert.equal(String(filter.school), String(schoolId));
        assert.equal(String(filter.user), String(userId));
        assert.equal(filter.status, 'pending');
        assert.equal(update.$set.status, 'cancelled');
        return { modifiedCount: 1 };
    });
    context.mock.method(AiCreditAccount, 'updateOne', async (filter) => {
        assert.equal(filter.user, null);
        assert.equal(filter.kind, 'school');
        return { modifiedCount: 1 };
    });
    context.mock.method(AiCreditAccount, 'findOne', (filter) => {
        assert.equal(String(filter.school), String(schoolId));
        assert.equal(String(filter.user), String(userId));
        return chain({ _id: 'account', balanceCents: 450 });
    });
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', (filter, update, options) => {
        assert.equal(options.session, session);
        assert.equal(filter.user, null);
        assert.equal(update.$inc.balanceCents, 450);
        return chain({ _id: 'pool', balanceCents: 1450 });
    });
    context.mock.method(AiCreditAccount, 'deleteOne', async (filter, options) => {
        assert.equal(options.session, session);
        assert.equal(String(filter.school), String(schoolId));
        assert.equal(filter._id, 'account');
        deletions += 1;
        return { deletedCount: 1 };
    });
    context.mock.method(AiCreditEntry, 'create', async (rows, options) => {
        assertCreateAllowed(rows, options);
        rows.forEach((entry) => entries.push(entry));
        return rows.map((entry) => ({ toObject: () => entry }));
    });
    const result = await returnCreditOnTeacherDeletion({ schoolId, userId, adminId: userId });
    assert.deepEqual(result, { returnedCents: 450 });
    assert.equal(deletions, 1);
    assert.deepEqual(entries.map((entry) => [entry.accountType, entry.type, entry.amountCents]), [
        ['user', 'reclaim', -450],
        ['school', 'reclaim', 450]
    ]);
    assert.match(entries[0].note, /teacher deleted/i);
    assert.equal(entries[1].balanceAfterCents, 1450);
});

test('deleting a teacher with nothing left writes no ledger row but still closes requests', async (context) => {
    let created = 0;
    context.mock.method(AiCreditRequest, 'updateMany', async () => ({ modifiedCount: 0 }));
    context.mock.method(AiCreditAccount, 'findOne', () => chain({ _id: 'account', balanceCents: 0 }));
    context.mock.method(AiCreditAccount, 'deleteOne', async () => ({ deletedCount: 1 }));
    context.mock.method(AiCreditEntry, 'create', async (rows) => {
        created += rows.length;
        return rows;
    });
    const result = await returnCreditOnTeacherDeletion({ schoolId, userId, adminId: userId });
    assert.deepEqual(result, { returnedCents: 0 });
    assert.equal(created, 0);
});

test('deleting a teacher without an account returns nothing and deletes nothing', async (context) => {
    let deletions = 0;
    context.mock.method(AiCreditRequest, 'updateMany', async () => ({ modifiedCount: 0 }));
    context.mock.method(AiCreditAccount, 'findOne', () => chain(null));
    context.mock.method(AiCreditAccount, 'deleteOne', async () => {
        deletions += 1;
        return { deletedCount: 0 };
    });
    const result = await returnCreditOnTeacherDeletion({ schoolId, userId, adminId: userId });
    assert.deepEqual(result, { returnedCents: 0 });
    assert.equal(deletions, 0);
});

test('failed ledger write rejects approval inside the transaction', async (context) => {
    const requestId = new mongoose.Types.ObjectId();
    let committed = false;
    let rejected = false;
    context.mock.method(mongoose.connection, 'transaction', async (callback) => {
        try {
            const result = await callback(session);
            committed = true;
            return result;
        } catch (error) {
            rejected = true;
            throw error;
        }
    });
    context.mock.method(AiCreditRequest, 'findOne', () => chain({ _id: requestId, user: userId, amountCents: 500 }));
    context.mock.method(AiCreditRequest, 'findOneAndUpdate', () => chain({ _id: requestId, user: userId, status: 'approved' }));
    context.mock.method(User, 'findOne', () => chain({ role: 'teacher' }));
    context.mock.method(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 1 }));
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', (_filter, _update, options) => {
        assert.equal(options.session, session);
        return chain({ _id: userId, balanceCents: 500, lowBalanceCents: 100 });
    });
    context.mock.method(AiCreditEntry, 'create', async (_entries, options) => {
        assert.equal(options.session, session);
        throw new Error('ledger unavailable');
    });
    await assert.rejects(decideCreditRequest({ schoolId, requestId, adminId: userId, approve: true }), /ledger unavailable/);
    assert.equal(rejected, true);
    assert.equal(committed, false);
});

test('declining a credit request never changes the balance', async (context) => {
    const requestId = new mongoose.Types.ObjectId();
    context.mock.method(AiCreditRequest, 'findOne', () => chain({ _id: requestId, user: userId }));
    context.mock.method(AiCreditRequest, 'findOneAndUpdate', (_filter, update, options) => {
        assert.equal(options.session, session);
        assert.equal(update.$set.status, 'declined');
        return chain({ _id: requestId, user: userId, ...update.$set });
    });
    context.mock.method(AiCreditAccount, 'findOneAndUpdate', () => { assert.fail('must not change balance'); });
    const result = await decideCreditRequest({ schoolId, requestId, adminId: userId, approve: false });
    assert.equal(result.request.status, 'declined');
    assert.equal(result.account, null);
});

test('the alert email shows the balance and fills every placeholder in both languages', () => {
    for (const language of ['en', 'ar']) {
        for (const level of ['low', 'empty']) {
            const message = buildCreditAlertEmail({
                level,
                language,
                firstName: 'Mona',
                schoolName: 'AMLY',
                balanceCents: level === 'empty' ? -0.3 : 85,
                lowBalanceCents: 100,
                url: 'https://example.test/portal/writing/credit'
            });
            assert.ok(message.subject);
            assert.equal(message.html.includes('{{'), false, `${language}/${level} left a placeholder`);
            assert.ok(message.html.includes(level === 'empty' ? '$0.00' : '$0.85'));
            assert.ok(message.text.includes('$1.00'));
            assert.ok(message.html.includes('/portal/writing/credit'));
            if (language === 'ar') assert.ok(message.html.includes('dir="rtl"'));
        }
    }
    assert.equal(formatUsd(1234.5), '$12.35');
});
