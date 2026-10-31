/**
 * The platform owner's voice-tutor settings. One row, not tenant-scoped: the
 * price and the models are chosen once for every school, like the AI markup.
 */
import AiCreditSetting from '../models/AiCreditSetting.js';
import { getMarkupPercent } from './aiCreditService.js';
import {
    VOICE_CREDIT_CENTS,
    VOICE_DEFAULTS,
    loadVoicePricing,
    messageEconomics,
    suggestedMessageCredits,
    worstCaseMessageCostCents
} from './voiceTutorPricing.js';

const KEY = 'default';
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const MODEL_FIELDS = [
    ['model', 'the tutor model'],
    ['sttModel', 'the speech-to-text model'],
    ['ttsModel', 'the text-to-speech model'],
    ['ttsVoice', 'the voice']
];

const NUMBER_FIELDS = [
    ['messageCredits', 1, 10000, 'credits per message'],
    ['maxContextTokens', 500, 32000, 'context cap'],
    ['maxReplyTokens', 30, 1000, 'reply cap'],
    ['maxTranscriptSeconds', 5, 300, 'listening cap'],
    ['maxSpeechSeconds', 5, 300, 'speaking cap']
];

const mergeVoice = (row) => ({ ...VOICE_DEFAULTS, ...(row?.voice || {}) });

export const readVoiceConfig = async () => {
    const setting = await AiCreditSetting.findOne({ key: KEY }).select('voice').lean();
    return mergeVoice(setting);
};

/** The saved settings plus the numbers that prove the message price covers its worst case. */
export const getVoiceConfig = async () => {
    const config = await readVoiceConfig();
    const markupPercent = await getMarkupPercent();
    const pricing = loadVoicePricing({ config });
    const worstCaseCostCents = worstCaseMessageCostCents({ config, pricing });
    return {
        ...config,
        markupPercent,
        creditCents: VOICE_CREDIT_CENTS,
        meters: pricing,
        worstCaseCostCents,
        worstCase: messageEconomics({ providerCostCents: worstCaseCostCents, messageCredits: config.messageCredits }),
        suggestedCredits: suggestedMessageCredits({ averageProviderCostCents: worstCaseCostCents, markupPercent })
    };
};

/** Refuses to save a model nobody has priced: a session must never start blind. */
export const saveVoiceConfig = async ({ patch = {}, updatedBy } = {}) => {
    const next = { ...await readVoiceConfig() };

    for (const [field, label] of MODEL_FIELDS) {
        if (patch[field] === undefined) continue;
        const value = String(patch[field] ?? '').trim();
        if (!value || value.length > 80) throw badRequest(`Enter ${label} (80 characters or fewer).`);
        next[field] = value;
    }
    for (const [field, min, max, label] of NUMBER_FIELDS) {
        if (patch[field] === undefined) continue;
        const value = Number(patch[field]);
        if (!Number.isInteger(value) || value < min || value > max) {
            throw badRequest(`The ${label} must be a whole number from ${min} to ${max}.`);
        }
        next[field] = value;
    }

    loadVoicePricing({ config: next });
    await AiCreditSetting.findOneAndUpdate(
        { key: KEY },
        { $set: { voice: next, updatedBy } },
        { upsert: true, setDefaultsOnInsert: true }
    );
    return getVoiceConfig();
};
