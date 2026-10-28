import mongoose from 'mongoose';
import AiCreditAccount from '../models/AiCreditAccount.js';
import AiCreditEntry from '../models/AiCreditEntry.js';
import AiCreditRequest from '../models/AiCreditRequest.js';
import AiCreditSetting from '../models/AiCreditSetting.js';
import School from '../models/School.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { notifyCreditAlert } from './aiCreditEmailService.js';

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

export const MAX_GRANT_CENTS = 100000;
export const MAX_MARKUP_PERCENT = 1000;
export const DEFAULT_RESERVE_PERCENT = 30;
const POOL_KIND = 'school';
const STAFF_ROLES = ['teacher', 'admin'];
// Standard gpt-5.4-mini rates verified at https://developers.openai.com/api/docs/pricing on 2026-10-28.
const MINI_RATES = { inputPerMillionCents: 75, cachedInputPerMillionCents: 7.5, outputPerMillionCents: 450 };
const HISTORY_PAGE_SIZE = 25;
const MARKUP_KEY = 'default';

const objectId = (value) => (mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null);

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export const roundCents = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const creditRates = (env = process.env, modelName) => {
    const model = modelName || env.WRITING_AI_MODEL || (
        String(env.WRITING_AI_PROVIDER || 'openai').toLowerCase() === 'openai'
            ? env.OPENAI_MODEL || 'gpt-5.4-mini'
            : env.GEMINI_MODEL || 'gemini-2.5-flash'
    );
    const defaults = /^gpt-5\.4-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(model) ? MINI_RATES : {};
    const rates = { model };
    for (const [field, key] of [
        ['inputPerMillionCents', 'AI_CREDIT_INPUT_CENTS_PER_MILLION'],
        ['cachedInputPerMillionCents', 'AI_CREDIT_CACHED_INPUT_CENTS_PER_MILLION'],
        ['outputPerMillionCents', 'AI_CREDIT_OUTPUT_CENTS_PER_MILLION']
    ]) {
        const configured = env[key] !== undefined && String(env[key]).trim() !== '';
        const value = configured ? Number(env[key]) : defaults[field];
        if (!Number.isFinite(value) || value < 0) {
            throw Object.assign(new Error(`Set ${key} to a verified non-negative rate in US cents per million tokens for ${model}.`), {
                statusCode: 422, code: 'AI_CREDIT_PRICING_REQUIRED'
            });
        }
        rates[field] = value;
    }
    return rates;
};

export const tokenCounts = (reply = {}) => {
    const input = Math.max(0, Number(reply.inputtokenCount) || 0);
    const cached = Math.min(input, Math.max(0, Number(reply.cachedInputtokenCount) || 0));
    const output = Math.max(0, Number(reply.outputtokenCount) || 0);
    const total = Math.max(0, Number(reply.totalTokenCount) || 0, input + output);
    return { inputTokens: input, cachedInputTokens: cached, outputTokens: output, totalTokens: total };
};

export const costCents = ({ inputTokens = 0, cachedInputTokens = 0, outputTokens = 0, totalTokens = 0 } = {}, rates = creditRates()) => {
    // Cached input is a subset of input; reasoning tokens are already included in OpenAI output.
    const cached = Math.min(inputTokens, Math.max(0, cachedInputTokens));
    const unlabelled = Math.max(0, totalTokens - inputTokens - outputTokens);
    const cost = ((inputTokens - cached) * rates.inputPerMillionCents
        + cached * rates.cachedInputPerMillionCents
        + (outputTokens + unlabelled) * rates.outputPerMillionCents) / 1_000_000;
    return roundCents(cost);
};

/** Selling price = provider cost plus the configured percentage. 50% doubles the margin, not the price. */
export const applyMarkup = (providerCostCents, markupPercent = 0) => {
    const cost = Number(providerCostCents) || 0;
    const percent = Number(markupPercent) || 0;
    return roundCents(cost * (1 + percent / 100));
};

export const parseMarkupPercent = (value) => {
    const percent = Number(value);
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(percent) || percent < 0 || percent > MAX_MARKUP_PERCENT) {
        throw badRequest(`Enter a markup between 0 and ${MAX_MARKUP_PERCENT} percent.`);
    }
    return Math.round(percent * 100) / 100;
};

/** Which one-time email the new balance calls for, if any. */
export const alertToSend = ({ balanceCents = 0, lowBalanceCents = 0, alerts = {} } = {}) => {
    if (balanceCents <= 0) return alerts.emptySentAt ? null : 'empty';
    if (balanceCents <= lowBalanceCents) return alerts.lowSentAt || alerts.emptySentAt ? null : 'low';
    return null;
};

/** After a top-up, re-arm the alerts the new balance has climbed back above. */
export const alertsAfterTopUp = ({ balanceCents = 0, lowBalanceCents = 0 } = {}) => {
    if (balanceCents > lowBalanceCents) return { 'alerts.lowSentAt': null, 'alerts.emptySentAt': null };
    if (balanceCents > 0) return { 'alerts.emptySentAt': null };
    return {};
};

export const parseAmountCents = (value) => {
    const cents = Number(value);
    if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(cents) || cents < 1) {
        throw badRequest('Enter an amount of at least 1 cent, in whole cents.');
    }
    if (cents > MAX_GRANT_CENTS) throw badRequest(`The most you can enter at once is ${MAX_GRANT_CENTS / 100} dollars.`);
    return cents;
};

export const parseReservePercent = (value) => {
    const percent = Number(value);
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw badRequest('Enter a reserve between 0 and 100 percent.');
    }
    return Math.round(percent * 100) / 100;
};

/**
 * Splits one top-up: the reserve stays in the pool, the rest is divided equally
 * in whole cents. Rounding leftovers stay in the reserve so no cent goes missing.
 */
export const splitTopUp = ({ amountCents = 0, staffCount = 0, reservePercent = DEFAULT_RESERVE_PERCENT } = {}) => {
    const amount = Math.max(0, Math.floor(Number(amountCents) || 0));
    const count = Math.max(0, Math.floor(Number(staffCount) || 0));
    const percent = Math.min(100, Math.max(0, Number(reservePercent) || 0));
    const shareable = Math.floor((amount * (100 - percent)) / 100);
    const perStaffCents = count > 0 ? Math.floor(shareable / count) : 0;
    const distributedCents = perStaffCents * count;
    return { perStaffCents, distributedCents, reserveCents: amount - distributedCents };
};

const CREDIT_ROLES = ['teacher', 'admin', 'super_admin'];
const canHoldCredit = (user) => CREDIT_ROLES.includes(user?.role) || (user?.roles || []).includes('teacher');

/** Read the platform markup. A malformed stored value blocks AI instead of guessing a price. */
export const getMarkupPercent = async () => {
    const setting = await AiCreditSetting.findOne({ key: MARKUP_KEY }).select('markupPercent').lean();
    const percent = Number(setting?.markupPercent ?? 0);
    if (!Number.isFinite(percent) || percent < 0 || percent > MAX_MARKUP_PERCENT) {
        throw Object.assign(new Error('The AI credit markup is not configured. Ask the platform owner to set it.'), {
            statusCode: 422, code: 'AI_CREDIT_PRICING_REQUIRED'
        });
    }
    return percent;
};

/* ------------------------------------------------------------------ */
/* Gate and charge                                                     */
/* ------------------------------------------------------------------ */

export const assertCanSpend = async ({ schoolId, userId, env = process.env }) => {
    const account = await AiCreditAccount.findOne({ school: schoolId, user: userId })
        .select('balanceCents paused')
        .lean();
    if (account?.paused) {
        throw Object.assign(
            new Error('Your AI credit is paused by the school admin. Ask them to turn it back on.'),
            { statusCode: 402, code: 'AI_CREDIT_PAUSED' }
        );
    }
    if (!account || Number(account.balanceCents) <= 0) {
        throw Object.assign(
            new Error('You have no AI credit left. Ask your school admin for more on the AI credit page.'),
            { statusCode: 402, code: 'AI_CREDIT_REQUIRED' }
        );
    }
    creditRates(env);
    if (String(env.WRITING_AI_PROVIDER || 'openai').toLowerCase() === 'openai' && env.OPENAI_FALLBACK_MODEL) {
        creditRates(env, env.OPENAI_FALLBACK_MODEL);
    }
    await getMarkupPercent();
    return { balanceCents: account.balanceCents };
};

export const isCreditError = (error) => ['AI_CREDIT_REQUIRED', 'AI_CREDIT_PAUSED', 'AI_CREDIT_PRICING_REQUIRED'].includes(error?.code);

/**
 * Records one AI request and debits its cost. Never throws: the teacher already
 * has the AI result, and a ledger hiccup must not throw it away.
 */
export const chargeUsage = async ({
    schoolId,
    userId,
    reply = {},
    feature = '',
    outcome = 'done',
    refs = {},
    env = process.env
}) => {
    try {
        const rates = creditRates(env, reply.modelName);
        const tokens = tokenCounts(reply);
        const providerCostCents = costCents(tokens, rates);
        const markupPercent = await getMarkupPercent();
        const chargedCents = applyMarkup(providerCostCents, markupPercent);
        const profitCents = roundCents(chargedCents - providerCostCents);
        const base = {
            school: schoolId,
            user: userId,
            type: 'usage',
            costCents: providerCostCents,
            chargedCents,
            profitCents,
            markupPercent,
            feature,
            outcome,
            model: String(reply.modelName || ''),
            ...tokens,
            rates,
            assignment: refs.assignment,
            project: refs.project,
            draft: refs.draft,
            student: refs.student,
            assignmentTitle: String(refs.assignmentTitle || '').slice(0, 200),
            studentName: String(refs.studentName || '').slice(0, 120),
            draftNumber: refs.draftNumber
        };

        const { account, source } = await mongoose.connection.transaction(async (session) => {
            // School-allocated credit is spent first so a platform grant stays as
            // the teacher's own buffer; each guarded update keeps the split honest
            // even when two requests finish at the same time.
            let updated = await AiCreditAccount.findOneAndUpdate(
                { school: schoolId, user: userId, schoolCents: { $gte: chargedCents }, balanceCents: { $gte: chargedCents } },
                { $inc: { balanceCents: -chargedCents, schoolCents: -chargedCents, spentCents: chargedCents } },
                { new: true, session }
            ).lean();
            let paidFrom = 'school';
            if (!updated) {
                // School share is partly spent: drain what is left of it and take
                // the rest from the teacher's own grant in one atomic step.
                updated = await AiCreditAccount.findOneAndUpdate(
                    {
                        school: schoolId,
                        user: userId,
                        balanceCents: { $gte: chargedCents },
                        schoolCents: { $gt: 0, $lt: chargedCents }
                    },
                    [{
                        $set: {
                            schoolCents: 0,
                            balanceCents: { $subtract: ['$balanceCents', chargedCents] },
                            spentCents: { $add: [{ $ifNull: ['$spentCents', 0] }, chargedCents] }
                        }
                    }],
                    { new: true, session }
                ).lean();
                paidFrom = 'mixed';
            }
            if (!updated) {
                updated = await AiCreditAccount.findOneAndUpdate(
                    {
                        school: schoolId,
                        user: userId,
                        balanceCents: { $gte: chargedCents },
                        $expr: { $gte: [{ $subtract: ['$balanceCents', '$schoolCents'] }, chargedCents] }
                    },
                    { $inc: { balanceCents: -chargedCents, spentCents: chargedCents } },
                    { new: true, session }
                ).lean();
                paidFrom = 'grant';
            }
            if (!updated) throw new Error('AI credit account missing during charge.');
            await AiCreditEntry.create([{
                ...base,
                source: paidFrom,
                amountCents: -chargedCents,
                charged: true,
                balanceAfterCents: roundCents(updated.balanceCents)
            }], { session });
            return { account: updated, source: paidFrom };
        });

        const balanceCents = roundCents(account.balanceCents);

        const level = alertToSend({ ...account, balanceCents });
        if (level) {
            const path = level === 'empty' ? 'alerts.emptySentAt' : 'alerts.lowSentAt';
            // Claim the alert first so two parallel charges cannot send it twice.
            const claim = await AiCreditAccount.updateOne(
                { _id: account._id, school: schoolId, [path]: null },
                { $set: { [path]: new Date() } }
            );
            if (claim.modifiedCount === 1) {
                void notifyCreditAlert({
                    schoolId,
                    userId,
                    level,
                    balanceCents,
                    lowBalanceCents: account.lowBalanceCents
                });
            }
        }
        return {
            charged: true,
            costCents: chargedCents,
            providerCostCents,
            chargedCents,
            markupPercent,
            profitCents,
            balanceCents,
            source
        };
    } catch (error) {
        logger.error('ai_credit_charge_failed', {
            schoolId: String(schoolId),
            userId: String(userId),
            error: error?.message
        });
        return { charged: false, error: true };
    }
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const shapeAccount = (account) => {
    const balanceCents = roundCents(account?.balanceCents || 0);
    const schoolCents = roundCents(account?.schoolCents || 0);
    return {
        balanceCents,
        schoolCents,
        grantCents: roundCents(balanceCents - schoolCents),
        grantedCents: roundCents(account?.grantedCents || 0),
        spentCents: roundCents(account?.spentCents || 0),
        lowBalanceCents: Number(account?.lowBalanceCents ?? 100),
        paused: Boolean(account?.paused),
        lastGrantAt: account?.lastGrantAt || null,
        hasAccount: Boolean(account)
    };
};

const shapeRequest = (row) => ({
    id: String(row._id),
    userId: String(row.user?._id || row.user),
    target: row.target === 'pool' ? 'pool' : 'teacher',
    amountCents: row.amountCents,
    grantedCents: row.grantedCents || 0,
    note: row.note || '',
    status: row.status,
    decisionNote: row.decisionNote || '',
    decidedAt: row.decidedAt || null,
    createdAt: row.createdAt
});

const chargedFor = (row) => {
    if (row.charged === false) return 0;
    if (row.chargedCents != null) return roundCents(row.chargedCents);
    // Rows written before markup existed were billed at provider cost.
    return row.type === 'usage' ? roundCents(row.costCents) : roundCents(row.amountCents);
};

const shapeEntry = (row) => ({
    id: String(row._id),
    type: row.type,
    accountType: row.accountType === 'school' ? 'school' : 'user',
    source: row.source || '',
    amountCents: roundCents(row.amountCents),
    costCents: roundCents(row.costCents),
    chargedCents: chargedFor(row),
    markupPercent: row.markupPercent ?? null,
    profitCents: roundCents(row.profitCents || 0),
    charged: row.charged !== false,
    balanceAfterCents: row.balanceAfterCents == null ? null : roundCents(row.balanceAfterCents),
    feature: row.feature || '',
    outcome: row.outcome || '',
    model: row.model || '',
    inputTokens: row.inputTokens || 0,
    cachedInputTokens: row.cachedInputTokens || 0,
    outputTokens: row.outputTokens || 0,
    totalTokens: row.totalTokens || 0,
    assignmentTitle: row.assignmentTitle || '',
    studentName: row.studentName || '',
    draftNumber: row.draftNumber ?? null,
    note: row.note || '',
    createdAt: row.createdAt
});

const startOfMonth = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), 1);

export const getCreditSummary = async ({ schoolId, userId }) => {
    const user = objectId(userId);
    const [account, requests, month] = await Promise.all([
        AiCreditAccount.findOne({ school: schoolId, user }).lean(),
        AiCreditRequest.find({ school: schoolId, user }).sort({ createdAt: -1 }).limit(10).lean(),
        AiCreditEntry.aggregate([
            { $match: { school: objectId(schoolId), user, type: 'usage', createdAt: { $gte: startOfMonth() } } },
            {
                $group: {
                    _id: null,
                    requests: { $sum: 1 },
                    tokens: { $sum: '$totalTokens' },
                    costCents: { $sum: { $cond: [{ $eq: ['$charged', false] }, 0, { $ifNull: ['$chargedCents', '$costCents'] }] } }
                }
            }
        ])
    ]);
    const shapedRequests = requests.map(shapeRequest);
    return {
        ...shapeAccount(account),
        rates: creditRates(),
        thisMonth: {
            requests: month[0]?.requests || 0,
            tokens: month[0]?.tokens || 0,
            costCents: roundCents(month[0]?.costCents || 0)
        },
        pendingRequest: shapedRequests.find((row) => row.status === 'pending') || null,
        requests: shapedRequests
    };
};

/** Compact balance for screens that only need the chip. */
export const getCreditBadge = async ({ schoolId, userId }) => {
    const account = await AiCreditAccount.findOne({ school: schoolId, user: userId })
        .select('balanceCents lowBalanceCents paused')
        .lean();
    const shaped = shapeAccount(account);
    return {
        balanceCents: shaped.balanceCents,
        lowBalanceCents: shaped.lowBalanceCents,
        paused: shaped.paused
    };
};

export const listCreditHistory = async ({ schoolId, userId, page = 1, type = '' }) => {
    const filter = { school: schoolId, user: objectId(userId) };
    if (['usage', 'grant', 'adjustment', 'allocation', 'reclaim'].includes(type)) filter.type = type;
    const requestedPage = Number(page);
    const current = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const [rows, total] = await Promise.all([
        AiCreditEntry.find(filter)
            .sort({ createdAt: -1 })
            .skip((current - 1) * HISTORY_PAGE_SIZE)
            .limit(HISTORY_PAGE_SIZE)
            .lean(),
        AiCreditEntry.countDocuments(filter)
    ]);
    return {
        rows: rows.map(shapeEntry),
        total,
        page: current,
        pages: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
        pageSize: HISTORY_PAGE_SIZE
    };
};

/* ------------------------------------------------------------------ */
/* Teacher requests                                                    */
/* ------------------------------------------------------------------ */

export const createCreditRequest = async ({
    schoolId,
    userId,
    amountCents,
    note = '',
    target = 'teacher',
    role = 'teacher'
}) => {
    const amount = parseAmountCents(amountCents);
    const kind = target === 'pool' ? 'pool' : 'teacher';
    if (kind === 'pool' && role !== 'admin') {
        throw badRequest('Only a school admin can ask the platform for school credit.');
    }
    try {
        const request = await AiCreditRequest.create({
            school: schoolId,
            user: userId,
            target: kind,
            amountCents: amount,
            note: String(note || '').trim().slice(0, 500)
        });
        return shapeRequest(request.toObject());
    } catch (error) {
        if (Number(error?.code) === 11000) {
            throw conflict('You already have a request waiting. Cancel it first if you want to change the amount.');
        }
        throw error;
    }
};

export const cancelCreditRequest = async ({ schoolId, userId, requestId }) => {
    const id = objectId(requestId);
    if (!id) throw notFound('Request not found.');
    const request = await AiCreditRequest.findOneAndUpdate(
        { _id: id, school: schoolId, user: userId, status: 'pending' },
        { $set: { status: 'cancelled', decidedAt: new Date() } },
        { new: true }
    ).lean();
    if (!request) throw notFound('There is no waiting request to cancel.');
    return shapeRequest(request);
};

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

const loadCreditUser = async ({ schoolId, userId }) => {
    const id = objectId(userId);
    if (!id) throw notFound('Credit user not found.');
    const user = await User.findOne({ _id: id, school: schoolId })
        .select('firstName lastName email role roles')
        .lean();
    if (!user || !canHoldCredit(user)) throw notFound('Credit user not found.');
    return user;
};

export const listCreditAccounts = async ({ schoolId, adminId }) => {
    const [teachers, accounts, pool, pending, poolRequestRow, month] = await Promise.all([
        User.find({ school: schoolId, $or: [{ role: { $in: STAFF_ROLES } }, { roles: 'teacher' }] })
            .select('firstName lastName email isActive role')
            .sort({ firstName: 1, lastName: 1 })
            .lean(),
        AiCreditAccount.find({ school: schoolId, user: { $ne: null } }).lean(),
        AiCreditAccount.findOne({ school: schoolId, kind: POOL_KIND }).lean(),
        AiCreditRequest.find({ school: schoolId, status: 'pending', target: 'teacher' }).sort({ createdAt: 1 }).lean(),
        adminId
            ? AiCreditRequest.findOne({ school: schoolId, status: 'pending', target: 'pool' })
                .sort({ createdAt: -1 })
                .lean()
            : null,
        AiCreditEntry.aggregate([
            { $match: { school: objectId(schoolId), type: 'usage', createdAt: { $gte: startOfMonth() } } },
            {
                $group: {
                    _id: '$user',
                    requests: { $sum: 1 },
                    tokens: { $sum: '$totalTokens' },
                    costCents: { $sum: { $cond: [{ $eq: ['$charged', false] }, 0, { $ifNull: ['$chargedCents', '$costCents'] }] } }
                }
            }
        ])
    ]);

    const accountBy = new Map(accounts.map((row) => [String(row.user), row]));
    const pendingBy = new Map(pending.map((row) => [String(row.user), row]));
    const monthBy = new Map(month.map((row) => [String(row._id), row]));

    const rows = teachers.map((teacher) => {
        const key = String(teacher._id);
        const usage = monthBy.get(key);
        return {
            userId: key,
            name: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.email || '',
            email: teacher.email || '',
            active: teacher.isActive !== false,
            ...shapeAccount(accountBy.get(key)),
            thisMonth: {
                requests: usage?.requests || 0,
                tokens: usage?.tokens || 0,
                costCents: roundCents(usage?.costCents || 0)
            },
            pendingRequest: pendingBy.has(key) ? shapeRequest(pendingBy.get(key)) : null
        };
    });

    const nameBy = new Map(rows.map((row) => [row.userId, row.name]));
    const allocatedCents = roundCents(rows.reduce((sum, row) => sum + row.schoolCents, 0));
    return {
        rates: creditRates(),
        rows,
        pool: {
            balanceCents: roundCents(pool?.balanceCents || 0),
            reservePercent: Number(pool?.reservePercent ?? DEFAULT_RESERVE_PERCENT),
            allocatedCents
        },
        poolRequest: poolRequestRow ? shapeRequest(poolRequestRow) : null,
        pending: pending.map((row) => ({ ...shapeRequest(row), teacherName: nameBy.get(String(row.user)) || '' })),
        totals: {
            balanceCents: roundCents(rows.reduce((sum, row) => sum + row.balanceCents, 0)),
            schoolCents: allocatedCents,
            spentThisMonthCents: roundCents(rows.reduce((sum, row) => sum + row.thisMonth.costCents, 0)),
            withCredit: rows.filter((row) => row.balanceCents > 0 && !row.paused).length
        }
    };
};

const ensureAccount = (schoolId, userId, session) => AiCreditAccount.updateOne(
    { school: schoolId, user: userId },
    { $setOnInsert: { school: schoolId, user: userId } },
    { upsert: true, session }
);

const applyCreditGrant = async ({ schoolId, userId, amount, note = '', adminId, requestId, session }) => {
    const user = objectId(userId);
    await ensureAccount(schoolId, user, session);
    const filter = { school: schoolId, user };
    if (amount < 0) filter.balanceCents = { $gte: -amount };
    const update = { $inc: { balanceCents: amount, grantedCents: amount } };
    if (amount > 0) update.$set = { lastGrantAt: new Date() };

    const account = await AiCreditAccount.findOneAndUpdate(filter, update, { new: true, session }).lean();
    if (!account) throw badRequest('You cannot take back more than the account has left.');

    const balanceCents = roundCents(account.balanceCents);
    const reArm = amount > 0 ? alertsAfterTopUp({ balanceCents, lowBalanceCents: account.lowBalanceCents }) : {};
    if (Object.keys(reArm).length) {
        await AiCreditAccount.updateOne({ _id: account._id, school: schoolId }, { $set: reArm }, { session });
    }

    const [entry] = await AiCreditEntry.create([{
        school: schoolId,
        user,
        type: amount > 0 ? 'grant' : 'adjustment',
        amountCents: amount,
        costCents: 0,
        charged: true,
        balanceAfterCents: balanceCents,
        request: requestId || undefined,
        note: String(note || '').trim().slice(0, 500),
        createdBy: adminId
    }], { session });

    return { account: shapeAccount({ ...account, balanceCents }), entry: shapeEntry(entry.toObject()) };
};

export const grantCredit = async ({ schoolId, userId, amountCents, note = '', adminId }) => {
    await loadCreditUser({ schoolId, userId });
    const raw = Number(amountCents);
    const amount = raw > 0 ? parseAmountCents(raw) : -parseAmountCents(-raw);
    return mongoose.connection.transaction((session) => applyCreditGrant({
        schoolId, userId, amount, note, adminId, session
    }));
};

export const updateCreditSettings = async ({ schoolId, userId, lowBalanceCents, paused }) => {
    await loadCreditUser({ schoolId, userId });
    const user = objectId(userId);
    const set = {};
    if (lowBalanceCents !== undefined) {
        const threshold = Number(lowBalanceCents);
        if (!['number', 'string'].includes(typeof lowBalanceCents) || !Number.isSafeInteger(threshold) || threshold < 0 || threshold > MAX_GRANT_CENTS) {
            throw badRequest('The warning level must be between 0 and 1000 dollars.');
        }
        set.lowBalanceCents = threshold;
    }
    if (paused !== undefined) {
        if (typeof paused !== 'boolean') throw badRequest('Paused must be true or false.');
        set.paused = paused;
    }
    if (!Object.keys(set).length) throw badRequest('Nothing to change.');

    await ensureAccount(schoolId, user);
    const account = await AiCreditAccount.findOneAndUpdate(
        { school: schoolId, user },
        { $set: set },
        { new: true }
    ).lean();
    return shapeAccount(account);
};

/* ------------------------------------------------------------------ */
/* School pool                                                         */
/* ------------------------------------------------------------------ */

const ensurePoolAccount = (schoolId, session) => AiCreditAccount.updateOne(
    { school: schoolId, user: null, kind: POOL_KIND },
    { $setOnInsert: { school: schoolId, user: null, kind: POOL_KIND, balanceCents: 0 } },
    { upsert: true, session }
);

const loadEligibleStaff = (schoolId, session) => {
    const query = User.find({
        school: schoolId,
        isActive: { $ne: false },
        $or: [{ role: { $in: STAFF_ROLES } }, { roles: 'teacher' }]
    }).select('_id');
    if (session) query.session(session);
    return query.lean();
};

const withTransaction = (session, run) => (session ? run(session) : mongoose.connection.transaction(run));

const fundWithin = async ({ schoolId, amount, note, adminId, reservePercent, session }) => {
    await ensurePoolAccount(schoolId, session);
    const pool = await AiCreditAccount.findOne({ school: schoolId, kind: POOL_KIND })
        .select('balanceCents reservePercent')
        .session(session)
        .lean();
    const percent = reservePercent === undefined
        ? Number(pool?.reservePercent ?? DEFAULT_RESERVE_PERCENT)
        : parseReservePercent(reservePercent);
    const staff = await loadEligibleStaff(schoolId, session);
    const split = splitTopUp({ amountCents: amount, staffCount: staff.length, reservePercent: percent });

    const funded = await AiCreditAccount.findOneAndUpdate(
        { school: schoolId, user: null, kind: POOL_KIND },
        { $inc: { balanceCents: amount }, $set: { reservePercent: percent, lastGrantAt: new Date() } },
        { new: true, session }
    ).lean();
    await AiCreditEntry.create([{
        school: schoolId,
        user: null,
        accountType: 'school',
        type: 'fund',
        amountCents: amount,
        costCents: 0,
        charged: true,
        balanceAfterCents: roundCents(funded.balanceCents),
        note: String(note || '').trim().slice(0, 500),
        createdBy: adminId
    }], { session });

    if (split.distributedCents > 0) {
        await AiCreditAccount.updateOne(
            { _id: funded._id, school: schoolId },
            { $inc: { balanceCents: -split.distributedCents } },
            { session }
        );
        await AiCreditEntry.create([{
            school: schoolId,
            user: null,
            accountType: 'school',
            type: 'allocation',
            amountCents: -split.distributedCents,
            costCents: 0,
            charged: true,
            balanceAfterCents: roundCents(funded.balanceCents - split.distributedCents),
            note: `Equal share for ${staff.length} staff`,
            createdBy: adminId
        }], { session });

        for (const person of staff) {
            await ensureAccount(schoolId, person._id, session);
            const account = await AiCreditAccount.findOneAndUpdate(
                { school: schoolId, user: person._id },
                {
                    $inc: {
                        balanceCents: split.perStaffCents,
                        schoolCents: split.perStaffCents,
                        grantedCents: split.perStaffCents
                    },
                    $set: { lastGrantAt: new Date() }
                },
                { new: true, session }
            ).lean();
            const balanceCents = roundCents(account.balanceCents);
            const reArm = alertsAfterTopUp({ balanceCents, lowBalanceCents: account.lowBalanceCents });
            if (Object.keys(reArm).length) {
                await AiCreditAccount.updateOne({ _id: account._id, school: schoolId }, { $set: reArm }, { session });
            }
            await AiCreditEntry.create([{
                school: schoolId,
                user: person._id,
                accountType: 'user',
                type: 'allocation',
                amountCents: split.perStaffCents,
                costCents: 0,
                charged: true,
                balanceAfterCents: balanceCents,
                createdBy: adminId
            }], { session });
        }
    }

    return {
        amountCents: amount,
        distributedCents: split.distributedCents,
        reserveCents: split.reserveCents,
        perStaffCents: split.perStaffCents,
        staffCount: staff.length,
        poolBalanceCents: roundCents(funded.balanceCents - split.distributedCents)
    };
};

/** Platform funds a school. Every top-up splits into equal shares plus a reserve. */
export const fundSchool = async ({ schoolId, amountCents, note = '', adminId, reservePercent, session = null }) => {
    const amount = parseAmountCents(amountCents);
    if (!objectId(schoolId) || !(await School.exists({ _id: schoolId }))) throw notFound('School not found.');
    return withTransaction(session, (txn) => fundWithin({
        schoolId, amount, note, adminId, reservePercent, session: txn
    }));
};

/** School admin moves reserve credit to a teacher. Never creates credit. */
export const allocateCredit = async ({ schoolId, userId, amountCents, note = '', adminId, session = null }) => {
    const amount = parseAmountCents(amountCents);
    const user = await loadCreditUser({ schoolId, userId });
    return withTransaction(session, async (txn) => {
        await ensurePoolAccount(schoolId, txn);
        const pool = await AiCreditAccount.findOneAndUpdate(
            { school: schoolId, user: null, kind: POOL_KIND, balanceCents: { $gte: amount } },
            { $inc: { balanceCents: -amount } },
            { new: true, session: txn }
        ).lean();
        if (!pool) {
            throw Object.assign(
                new Error('The school reserve does not have that much left. Ask the platform owner to top up the school credit.'),
                { statusCode: 409, code: 'AI_CREDIT_RESERVE_SHORT' }
            );
        }

        await ensureAccount(schoolId, user._id, txn);
        const account = await AiCreditAccount.findOneAndUpdate(
            { school: schoolId, user: user._id },
            {
                $inc: { balanceCents: amount, schoolCents: amount, grantedCents: amount },
                $set: { lastGrantAt: new Date() }
            },
            { new: true, session: txn }
        ).lean();
        const balanceCents = roundCents(account.balanceCents);
        const reArm = alertsAfterTopUp({ balanceCents, lowBalanceCents: account.lowBalanceCents });
        if (Object.keys(reArm).length) {
            await AiCreditAccount.updateOne({ _id: account._id, school: schoolId }, { $set: reArm }, { session: txn });
        }

        const trimmed = String(note || '').trim().slice(0, 500);
        await AiCreditEntry.create([
            {
                school: schoolId,
                user: null,
                accountType: 'school',
                type: 'allocation',
                amountCents: -amount,
                costCents: 0,
                charged: true,
                balanceAfterCents: roundCents(pool.balanceCents),
                note: trimmed,
                createdBy: adminId
            },
            {
                school: schoolId,
                user: user._id,
                accountType: 'user',
                type: 'allocation',
                amountCents: amount,
                costCents: 0,
                charged: true,
                balanceAfterCents: balanceCents,
                note: trimmed,
                createdBy: adminId
            }
        ], { session: txn, ordered: true });

        return {
            account: shapeAccount({ ...account, balanceCents }),
            poolBalanceCents: roundCents(pool.balanceCents)
        };
    });
};

/** School admin takes back school-allocated, unspent credit. */
export const reclaimCredit = async ({ schoolId, userId, amountCents, note = '', adminId, session = null }) => {
    const amount = parseAmountCents(amountCents);
    const user = await loadCreditUser({ schoolId, userId });
    return withTransaction(session, async (txn) => {
        await ensurePoolAccount(schoolId, txn);
        const account = await AiCreditAccount.findOneAndUpdate(
            { school: schoolId, user: user._id, schoolCents: { $gte: amount } },
            { $inc: { balanceCents: -amount, schoolCents: -amount, grantedCents: -amount } },
            { new: true, session: txn }
        ).lean();
        if (!account) {
            throw Object.assign(
                new Error('Only unspent credit the school allocated can go back to the pool.'),
                { statusCode: 409, code: 'AI_CREDIT_RECLAIM_EXCEEDS' }
            );
        }
        const balanceCents = roundCents(account.balanceCents);
        const pool = await AiCreditAccount.findOneAndUpdate(
            { school: schoolId, user: null, kind: POOL_KIND },
            { $inc: { balanceCents: amount } },
            { new: true, session: txn }
        ).lean();

        const trimmed = String(note || '').trim().slice(0, 500);
        await AiCreditEntry.create([
            {
                school: schoolId,
                user: user._id,
                accountType: 'user',
                type: 'reclaim',
                amountCents: -amount,
                costCents: 0,
                charged: true,
                balanceAfterCents: balanceCents,
                note: trimmed,
                createdBy: adminId
            },
            {
                school: schoolId,
                user: null,
                accountType: 'school',
                type: 'reclaim',
                amountCents: amount,
                costCents: 0,
                charged: true,
                balanceAfterCents: roundCents(pool.balanceCents),
                note: trimmed,
                createdBy: adminId
            }
        ], { session: txn, ordered: true });

        return {
            account: shapeAccount({ ...account, balanceCents }),
            poolBalanceCents: roundCents(pool.balanceCents)
        };
    });
};

/* ------------------------------------------------------------------ */
/* Platform (super admin)                                              */
/* ------------------------------------------------------------------ */

const shapePlatformRow = (row) => ({
    ...shapeEntry(row),
    schoolName: row.school?.name || '',
    userName: `${row.user?.firstName || ''} ${row.user?.lastName || ''}`.trim() || row.user?.email || '',
    userEmail: row.user?.email || ''
});

/** Markup plus platform-wide provider cost, charged price and profit for this month. */
export const getPlatformCreditOverview = async ({ page = 1 } = {}) => {
    const requested = Number(page);
    const current = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
    const [markupPercent, month, rows, total] = await Promise.all([
        getMarkupPercent(),
        AiCreditEntry.aggregate([
            { $match: { type: 'usage', charged: { $ne: false }, createdAt: { $gte: startOfMonth() } } },
            {
                $group: {
                    _id: null,
                    requests: { $sum: 1 },
                    tokens: { $sum: '$totalTokens' },
                    providerCostCents: { $sum: '$costCents' },
                    chargedCents: { $sum: { $ifNull: ['$chargedCents', '$costCents'] } },
                    profitCents: { $sum: { $ifNull: ['$profitCents', 0] } }
                }
            }
        ]),
        AiCreditEntry.find({ type: 'usage', charged: { $ne: false } })
            .sort({ createdAt: -1 })
            .skip((current - 1) * HISTORY_PAGE_SIZE)
            .limit(HISTORY_PAGE_SIZE)
            .populate('school', 'name')
            .populate('user', 'firstName lastName email')
            .lean(),
        AiCreditEntry.countDocuments({ type: 'usage', charged: { $ne: false } })
    ]);
    const totals = month[0] || {};
    return {
        markupPercent,
        rates: creditRates(),
        thisMonth: {
            requests: totals.requests || 0,
            tokens: totals.tokens || 0,
            providerCostCents: roundCents(totals.providerCostCents || 0),
            chargedCents: roundCents(totals.chargedCents || 0),
            profitCents: roundCents(totals.profitCents || 0)
        },
        rows: rows.map(shapePlatformRow),
        total,
        page: current,
        pages: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
        pageSize: HISTORY_PAGE_SIZE
    };
};

/** Changes the selling price for requests started after the save; earlier rows keep their snapshot. */
export const updatePlatformMarkup = async ({ markupPercent, updatedBy }) => {
    const percent = parseMarkupPercent(markupPercent);
    const setting = await AiCreditSetting.findOneAndUpdate(
        { key: MARKUP_KEY },
        { $set: { markupPercent: percent, updatedBy } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return { markupPercent: setting.markupPercent, updatedAt: setting.updatedAt || null };
};

/** School admin decides a teacher's request, paying from the reserve — never minting. */
export const decideCreditRequest = async ({ schoolId, requestId, adminId, approve, amountCents, note = '' }) => {
    const id = objectId(requestId);
    if (!id) throw notFound('Request not found.');
    return mongoose.connection.transaction(async (session) => {
        const existing = await AiCreditRequest.findOne({ _id: id, school: schoolId, status: 'pending' })
            .session(session).lean();
        if (!existing) throw notFound('This request was already handled.');
        if (existing.target === 'pool') {
            throw badRequest('A request for school credit is decided by the platform owner.');
        }
        if (approve) await loadCreditUser({ schoolId, userId: existing.user });

        const granted = approve ? parseAmountCents(amountCents ?? existing.amountCents) : 0;
        const allocation = approve ? await allocateCredit({
            schoolId,
            userId: existing.user,
            amountCents: granted,
            note: note || existing.note,
            adminId,
            session
        }) : null;

        const decided = await AiCreditRequest.findOneAndUpdate(
            { _id: id, school: schoolId, status: 'pending' },
            {
                $set: {
                    status: approve ? 'approved' : 'declined',
                    grantedCents: granted,
                    decidedBy: adminId,
                    decidedAt: new Date(),
                    decisionNote: String(note || '').trim().slice(0, 500)
                }
            },
            { new: true, session }
        ).lean();
        if (!decided) throw notFound('This request was already handled.');

        return {
            request: shapeRequest(decided),
            account: allocation?.account || null,
            poolBalanceCents: allocation?.poolBalanceCents ?? null
        };
    });
};

/** Platform owner decides a school's request to top up its pool. */
export const decidePlatformCreditRequest = async ({ requestId, adminId, approve, amountCents, note = '' }) => {
    const id = objectId(requestId);
    if (!id) throw notFound('Request not found.');
    return mongoose.connection.transaction(async (session) => {
        const existing = await AiCreditRequest.findOne({ _id: id, status: 'pending', target: 'pool' })
            .session(session).lean();
        if (!existing) throw notFound('This request was already handled.');

        const granted = approve ? parseAmountCents(amountCents ?? existing.amountCents) : 0;
        const funded = approve ? await fundSchool({
            schoolId: existing.school,
            amountCents: granted,
            note: note || existing.note,
            adminId,
            session
        }) : null;

        const decided = await AiCreditRequest.findOneAndUpdate(
            { _id: id, status: 'pending' },
            {
                $set: {
                    status: approve ? 'approved' : 'declined',
                    grantedCents: granted,
                    decidedBy: adminId,
                    decidedAt: new Date(),
                    decisionNote: String(note || '').trim().slice(0, 500)
                }
            },
            { new: true, session }
        ).lean();
        if (!decided) throw notFound('This request was already handled.');

        return {
            request: shapeRequest(decided),
            pool: funded ? {
                balanceCents: funded.poolBalanceCents,
                distributedCents: funded.distributedCents,
                reserveCents: funded.reserveCents
            } : null
        };
    });
};

/** Platform view: every school's pool, staff balances and board requests. */
export const listPlatformSchools = async () => {
    const [schools, pools, accounts, staff, requests, month] = await Promise.all([
        School.find({ isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean(),
        AiCreditAccount.find({ kind: POOL_KIND }).lean(),
        AiCreditAccount.find({ user: { $ne: null } }).lean(),
        User.find({ $or: [{ role: { $in: STAFF_ROLES } }, { roles: 'teacher' }] })
            .select('firstName lastName email role isActive school')
            .sort({ firstName: 1, lastName: 1 })
            .lean(),
        AiCreditRequest.find({ status: 'pending', target: 'pool' })
            .populate('user', 'firstName lastName email')
            .sort({ createdAt: 1 })
            .lean(),
        AiCreditEntry.aggregate([
            { $match: { type: 'usage', charged: { $ne: false }, createdAt: { $gte: startOfMonth() } } },
            {
                $group: {
                    _id: { school: '$school', user: '$user' },
                    requests: { $sum: 1 },
                    costCents: { $sum: { $ifNull: ['$chargedCents', '$costCents'] } }
                }
            }
        ])
    ]);

    const poolBy = new Map(pools.map((row) => [String(row.school), row]));
    const accountBy = new Map(accounts.map((row) => [String(row.user), row]));
    const monthBy = new Map(month.map((row) => [`${String(row._id.school)}:${String(row._id.user)}`, row]));
    const staffBy = new Map();
    for (const person of staff) {
        const key = String(person.school);
        if (!staffBy.has(key)) staffBy.set(key, []);
        staffBy.get(key).push(person);
    }
    const schoolNameBy = new Map(schools.map((row) => [String(row._id), row.name]));

    const rows = schools.map((school) => {
        const key = String(school._id);
        const people = (staffBy.get(key) || []).map((person) => {
            const account = accountBy.get(String(person._id));
            const usage = monthBy.get(`${key}:${person._id}`);
            return {
                userId: String(person._id),
                name: `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.email || '',
                email: person.email || '',
                active: person.isActive !== false,
                ...shapeAccount(account),
                thisMonth: {
                    requests: usage?.requests || 0,
                    costCents: roundCents(usage?.costCents || 0)
                }
            };
        });
        const pool = poolBy.get(key);
        return {
            id: key,
            name: school.name || '',
            pool: {
                balanceCents: roundCents(pool?.balanceCents || 0),
                reservePercent: Number(pool?.reservePercent ?? DEFAULT_RESERVE_PERCENT),
                allocatedCents: roundCents(people.reduce((sum, row) => sum + row.schoolCents, 0))
            },
            staffCount: people.length,
            spentThisMonthCents: roundCents(people.reduce((sum, row) => sum + row.thisMonth.costCents, 0)),
            staff: people
        };
    });

    return {
        schools: rows,
        requests: requests.map((row) => ({
            ...shapeRequest(row),
            schoolName: schoolNameBy.get(String(row.school)) || '',
            requesterName: `${row.user?.firstName || ''} ${row.user?.lastName || ''}`.trim() || row.user?.email || ''
        }))
    };
};
