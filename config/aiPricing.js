/**
 * One place that turns a model name into a price in US cents per million tokens.
 *
 * OpenAI mini rates are the verified numbers used for Writing feedback. Override
 * any model with AI_CREDIT_MODEL_RATES.
 */

export const OPENAI_MINI_RATES = {
    inputPerMillionCents: 75,
    cachedInputPerMillionCents: 7.5,
    outputPerMillionCents: 450
};

const MODEL_RATES = {
    'gpt-5.4-mini': OPENAI_MINI_RATES
};

const RATE_FIELDS = ['inputPerMillionCents', 'cachedInputPerMillionCents', 'outputPerMillionCents'];

const cleanRates = (rates, model) => {
    const cleaned = { model };
    for (const field of RATE_FIELDS) {
        const value = Number(rates?.[field]);
        if (!Number.isFinite(value) || value < 0) return null;
        cleaned[field] = value;
    }
    return cleaned;
};

/** Optional JSON map: {"model-name":{"inputPerMillionCents":30,...}}. Malformed input is ignored. */
const overridesFromEnv = (env = {}) => {
    const raw = env.AI_CREDIT_MODEL_RATES;
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

/** Exact model, override first, then the table; dated OpenAI names fall back to their family. */
const lookup = (model, overrides) => {
    if (overrides[model]) return overrides[model];
    if (MODEL_RATES[model]) return MODEL_RATES[model];
    const family = Object.keys(MODEL_RATES).find((name) => model.startsWith(`${name}-`));
    return family ? MODEL_RATES[family] : null;
};

/** Rates for one model, or null when nobody has priced it yet. Never guesses. */
export const ratesForModel = (model, env = process.env) => {
    const name = String(model || '').trim();
    if (!name) return null;
    const found = lookup(name, overridesFromEnv(env));
    return found ? cleanRates(found, name) : null;
};

export const isModelPriced = (model, env = process.env) => Boolean(ratesForModel(model, env));

/* ------------------------------------------------------------------ */
/* Speech                                                              */
/* ------------------------------------------------------------------ */

/** Speech is billed by the minute of audio, not by tokens: US cents per minute. */
export const AUDIO_RATES = {
    'gpt-4o-mini-transcribe': 0.3,
    'gpt-4o-mini-tts': 1.5,
    'whisper-1': 0.6
};

/** Optional JSON map: {"gpt-4o-mini-tts":{"centsPerMinute":1.2}}. Malformed input is ignored. */
const audioOverride = (model, env = {}) => {
    const raw = env.AI_CREDIT_AUDIO_RATES;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
        const parsed = JSON.parse(raw);
        const row = parsed?.[model];
        const value = Number(row?.centsPerMinute ?? row);
        return Number.isFinite(value) && value >= 0 ? value : null;
    } catch {
        return null;
    }
};

/** Cents per minute of audio, or null when nobody has priced the speech model. */
export const audioCentsPerMinute = (model, env = process.env) => {
    const name = String(model || '').trim();
    if (!name) return null;
    const override = audioOverride(name, env);
    if (override !== null) return override;
    const rate = Number(AUDIO_RATES[name]);
    return Number.isFinite(rate) && rate >= 0 ? rate : null;
};

export const isAudioModelPriced = (model, env = process.env) => audioCentsPerMinute(model, env) !== null;
