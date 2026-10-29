/**
 * One place that turns a model name into a price in US cents per million tokens.
 *
 * OpenAI mini rates are the verified numbers used for Writing feedback. Gemini
 * numbers come from the app's existing reporting registry (USD per 1K) and are
 * only as fresh as that table — override any model with AI_CREDIT_MODEL_RATES.
 */

const USD_PER_K_TO_CENTS_PER_M = 100000;

const fromPerThousand = ({ input, output }) => ({
    inputPerMillionCents: input * USD_PER_K_TO_CENTS_PER_M,
    cachedInputPerMillionCents: input * USD_PER_K_TO_CENTS_PER_M,
    outputPerMillionCents: output * USD_PER_K_TO_CENTS_PER_M
});

export const OPENAI_MINI_RATES = {
    inputPerMillionCents: 75,
    cachedInputPerMillionCents: 7.5,
    outputPerMillionCents: 450
};

const MODEL_RATES = {
    'gpt-5.4-mini': OPENAI_MINI_RATES,
    'gemini-2.5-flash-lite': fromPerThousand({ input: 0.000075, output: 0.0003 }),
    'gemini-2.5-flash': fromPerThousand({ input: 0.000125, output: 0.000375 }),
    'gemini-2.0-flash-exp': fromPerThousand({ input: 0.000125, output: 0.000375 }),
    'gemini-1.5-flash': fromPerThousand({ input: 0.000075, output: 0.0003 }),
    'gemini-1.5-pro': fromPerThousand({ input: 0.00125, output: 0.005 })
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
