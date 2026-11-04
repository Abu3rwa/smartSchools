/** Rough costs shown before a scan or a draft, always rounded up. */
import { applyMarkup, costCents, creditRates } from '../aiCreditService.js';

export const ESTIMATE_TOKENS = Object.freeze({
    callOverheadInput: 400,
    emailInput: 700,
    emailOutput: 220,
    draftInput: 1500,
    draftOutput: 450,
    chunkSize: 8
});

export const inboxModelName = (env = process.env) =>
    env.INBOX_AI_MODEL || env.OPENAI_MODEL || 'gpt-5.4-mini';

export const inboxRates = (env = process.env) => creditRates(env, inboxModelName(env));

const ceilCents = (value) => Math.ceil((Number(value) || 0) * 100) / 100;

const estimate = ({ inputTokens, outputTokens, markupPercent, rates }) => {
    const providerCost = costCents(
        { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        rates
    );
    return ceilCents(applyMarkup(providerCost, markupPercent));
};

export const estimateScanCents = ({ emailCount = 0, markupPercent = 0, rates = inboxRates() } = {}) => {
    const count = Math.max(0, Math.floor(Number(emailCount) || 0));
    if (!count) return 0;
    const calls = Math.ceil(count / ESTIMATE_TOKENS.chunkSize);
    return estimate({
        inputTokens: count * ESTIMATE_TOKENS.emailInput + calls * ESTIMATE_TOKENS.callOverheadInput,
        outputTokens: count * ESTIMATE_TOKENS.emailOutput,
        markupPercent,
        rates
    });
};

export const estimateDraftCents = ({ markupPercent = 0, rates = inboxRates() } = {}) => estimate({
    inputTokens: ESTIMATE_TOKENS.draftInput + ESTIMATE_TOKENS.callOverheadInput,
    outputTokens: ESTIMATE_TOKENS.draftOutput,
    markupPercent,
    rates
});
