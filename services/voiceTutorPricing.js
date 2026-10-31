/**
 * Price rules for the voice tutor. One displayed credit is one US cent of charged
 * price; a message has a fixed credit price, while the ledger records the real
 * provider cost (tokens plus seconds of speech) so profit stays auditable.
 */
import { audioCentsPerMinute, ratesForModel } from '../config/aiPricing.js';
import { costCents, roundCents } from './aiCreditService.js';

export const VOICE_CREDIT_CENTS = 1;

/** Defaults chosen from the measured cost of one voice turn; every one is configurable. */
export const VOICE_DEFAULTS = {
    model: 'gpt-5.4-mini',
    sttModel: 'gpt-4o-mini-transcribe',
    ttsModel: 'gpt-4o-mini-tts',
    ttsVoice: 'alloy',
    messageCredits: 3,
    maxContextTokens: 4000,
    maxReplyTokens: 180,
    maxTranscriptSeconds: 30,
    maxSpeechSeconds: 60
};

const fail = (message, code = 'VOICE_TUTOR_PRICING_REQUIRED') =>
    Object.assign(new Error(message), { statusCode: 422, code });

/** One message: the model tokens plus both directions of speech. */
export const voiceCostCents = ({
    tokens = {},
    transcriptSeconds = 0,
    speechSeconds = 0,
    modelRates,
    sttCentsPerMinute = 0,
    ttsCentsPerMinute = 0
} = {}) => {
    const tokenCost = costCents(tokens, modelRates);
    const stt = (Math.max(0, Number(transcriptSeconds) || 0) / 60) * (Number(sttCentsPerMinute) || 0);
    const tts = (Math.max(0, Number(speechSeconds) || 0) / 60) * (Number(ttsCentsPerMinute) || 0);
    return roundCents(tokenCost + stt + tts);
};

export const messagePriceCents = (credits = 0) => roundCents(
    Math.max(0, Number(credits) || 0) * VOICE_CREDIT_CENTS
);

/** What the platform keeps on one message at a given provider cost. */
export const messageEconomics = ({ providerCostCents = 0, messageCredits = 0 } = {}) => {
    const chargedCents = messagePriceCents(messageCredits);
    const cost = roundCents(providerCostCents);
    const profitCents = roundCents(chargedCents - cost);
    const marginPercent = chargedCents > 0 ? Math.round((profitCents / chargedCents) * 1000) / 10 : 0;
    return { chargedCents, providerCostCents: cost, profitCents, marginPercent };
};

/** The floor price that covers an average message at the configured markup. */
export const suggestedMessageCredits = ({ averageProviderCostCents = 0, markupPercent = 0 } = {}) => {
    const price = roundCents(
        (Number(averageProviderCostCents) || 0) * (1 + (Number(markupPercent) || 0) / 100)
    );
    return Math.max(1, Math.ceil(price / VOICE_CREDIT_CENTS));
};

/** Refuses to start a session when any meter it will be billed at has no price. */
export const loadVoicePricing = ({ config = VOICE_DEFAULTS, env = process.env } = {}) => {
    const modelRates = ratesForModel(config.model, env);
    if (!modelRates) {
        throw fail(`The voice tutor model "${config.model}" has no verified price. Add it to aiPricing or set AI_CREDIT_MODEL_RATES.`);
    }
    const sttCentsPerMinute = audioCentsPerMinute(config.sttModel, env);
    if (sttCentsPerMinute === null) {
        throw fail(`The speech-to-text model "${config.sttModel}" has no verified price in aiPricing.`);
    }
    const ttsCentsPerMinute = audioCentsPerMinute(config.ttsModel, env);
    if (ttsCentsPerMinute === null) {
        throw fail(`The text-to-speech model "${config.ttsModel}" has no verified price in aiPricing.`);
    }
    return { modelRates, sttCentsPerMinute, ttsCentsPerMinute };
};

/** The most one message can cost inside the configured caps — the buffer the flat price must cover. */
export const worstCaseMessageCostCents = ({ config = VOICE_DEFAULTS, pricing } = {}) => voiceCostCents({
    tokens: {
        inputTokens: config.maxContextTokens,
        cachedInputTokens: 0,
        outputTokens: config.maxReplyTokens,
        totalTokens: config.maxContextTokens + config.maxReplyTokens
    },
    transcriptSeconds: config.maxTranscriptSeconds,
    speechSeconds: config.maxSpeechSeconds,
    ...pricing
});
