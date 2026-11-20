/**
 * Pure presentation helpers for the public landing page.
 *
 * These helpers hold the rules that must not depend on React, the CMS or the
 * network: how a plan record becomes displayable, how a capacity limit is
 * read, which feature flags may be advertised, and how the demo enquiry
 * message is composed and validated.
 */

export const DEMO_FIELD_LIMITS = {
    name: 120,
    schoolName: 160,
    email: 254,
    phone: 40,
    role: 80,
    message: 2000,
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Feature keys that may appear in public pricing. The list is editorial, not an
 * entitlement map: a key must also be enabled on the plan record.
 */
export const PUBLIC_PLAN_FEATURE_KEYS = ['readingAssistant', 'writingAssistant'];

export const WORKFLOW_IDS = ['gradebook', 'attendance', 'assignments'];

export const LEARNING_CARD_IDS = ['reading', 'spelling', 'writing'];

export const CAPACITY_LIMITS = [
    { key: 'maxStudents', labelKey: 'pricing.students' },
    { key: 'maxTeachers', labelKey: 'pricing.teachers' },
    { key: 'maxClasses', labelKey: 'pricing.classes' },
];

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SUPPORTED_INTERVALS = ['month', 'year'];

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Intl formats any well-formed three-letter code, including ones the runtime
 * does not know, by falling back to the code itself in the currency name. An
 * unknown code therefore appears verbatim in the formatted name.
 */
export const isSupportedCurrency = (currency) => {
    if (typeof currency !== 'string') return false;

    const code = currency.trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(code) || code === 'XXX') return false;

    try {
        const formatted = new Intl.NumberFormat('en', {
            style: 'currency',
            currency: code,
            currencyDisplay: 'name',
        }).format(1);
        return !formatted.includes(code);
    } catch {
        return false;
    }
};

/**
 * Returns the displayable price, or null when the commercial tuple is not
 * trustworthy. A missing amount is never treated as a free plan.
 */
export const formatPlanPrice = (pricing, language = 'en') => {
    if (!isPlainObject(pricing)) return null;

    const { amount, currency, interval } = pricing;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
    if (typeof currency !== 'string') return null;

    const normalizedCurrency = currency.trim().toUpperCase();
    if (!isSupportedCurrency(normalizedCurrency)) return null;
    if (!SUPPORTED_INTERVALS.includes(interval)) return null;

    const normalizedAmount = Object.is(amount, -0) ? 0 : amount;

    try {
        const amountText = new Intl.NumberFormat(language, {
            style: 'currency',
            currency: normalizedCurrency,
            currencyDisplay: 'code',
        }).format(normalizedAmount);

        return {
            amountText,
            intervalKey: interval === 'year' ? 'publicPage.pricing.year' : 'publicPage.pricing.month',
        };
    } catch {
        return null;
    }
};

/**
 * Reads a capacity limit. Only a finite integer of zero or more is a cap, and
 * exactly -1 means the plan states no cap. Anything else is unknown.
 */
export const toPlanLimit = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) return null;
    if (value === -1) return { kind: 'unlimited', value: null };
    if (value < 0) return null;
    return { kind: 'capped', value };
};

export const formatPlanLimit = (limit, language = 'en') => {
    if (!isPlainObject(limit)) return null;

    if (limit.kind === 'unlimited') {
        return { valueKey: 'publicPage.pricing.unlimited', value: null };
    }

    if (limit.kind === 'capped' && typeof limit.value === 'number') {
        let value;
        try {
            value = new Intl.NumberFormat(language).format(limit.value);
        } catch {
            value = String(limit.value);
        }
        return { valueKey: 'publicPage.pricing.capped', value };
    }

    return null;
};

export const getPublicFeatureKeys = (features, approvedKeys = PUBLIC_PLAN_FEATURE_KEYS) => {
    if (!isPlainObject(features)) return [];

    return approvedKeys.filter((key) => features[key] === true);
};

const normalizePlanIdentity = (plan) => {
    if (!isPlainObject(plan)) return null;

    const key = typeof plan.key === 'string' ? plan.key.trim() : '';
    const name = typeof plan.name === 'string' ? plan.name.trim() : '';

    if (!key || !name) return null;

    return { key, name };
};

const invalidPlansResponse = () => {
    const error = new Error('The public plans response could not be used.');
    error.code = 'invalidResponse';
    return error;
};

/**
 * Turns raw plan records into the display model used by the pricing section.
 * A malformed identity makes the whole response invalid: a partially rendered
 * offer list would misrepresent what the school can actually buy.
 */
export const normalizePublicPlans = (rawPlans, approvedFeatureKeys = PUBLIC_PLAN_FEATURE_KEYS) => {
    if (!Array.isArray(rawPlans)) throw invalidPlansResponse();

    const seenKeys = new Set();

    return rawPlans.map((rawPlan) => {
        const identity = normalizePlanIdentity(rawPlan);
        if (!identity) throw invalidPlansResponse();
        if (seenKeys.has(identity.key)) throw invalidPlansResponse();

        seenKeys.add(identity.key);

        const limits = isPlainObject(rawPlan.limits) ? rawPlan.limits : {};
        const billing = isPlainObject(rawPlan.billing) ? rawPlan.billing : {};

        const normalizedLimits = {};
        for (const { key: limitKey } of CAPACITY_LIMITS) {
            const limit = toPlanLimit(limits[limitKey]);
            if (limit) normalizedLimits[limitKey] = limit;
        }

        const pricing = formatPlanPrice(billing)
            ? {
                status: 'valid',
                amount: billing.amount,
                currency: billing.currency.trim().toUpperCase(),
                interval: billing.interval,
            }
            : { status: 'unavailable', amount: null, currency: null, interval: null };

        return {
            key: identity.key,
            name: identity.name,
            pricing,
            limits: normalizedLimits,
            publicFeatureKeys: getPublicFeatureKeys(rawPlan.features, approvedFeatureKeys),
        };
    });
};

const collapseWhitespace = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/**
 * Composes the submitted message. A selected plan is described in one
 * translated line; the visitor's own text is never overwritten or truncated.
 */
export const composeDemoMessage = (message = '', selectedPlan = null, language = 'en', t = null) => {
    const userMessage = String(message ?? '').trim();
    const max = DEMO_FIELD_LIMITS.message;

    if (!selectedPlan || !selectedPlan.key) {
        return { message: userMessage, used: userMessage.length, max };
    }

    const name = collapseWhitespace(selectedPlan.name);
    const key = collapseWhitespace(selectedPlan.key);
    const summary = t
        ? t('publicPage.demo.planSummary', { name, key })
        : `Plan interest: ${name} (${key})`;

    const composed = userMessage ? `${summary}\n\n${userMessage}` : summary;

    return { message: composed, used: composed.length, max };
};

const tooLong = (max) => ({ key: 'publicPage.validation.tooLong', params: { max } });

/**
 * Returns the field errors of the enquiry form, keyed by field name. An empty
 * object means the form is valid.
 */
export const validateDemoForm = (values = {}, composedMessage = null) => {
    const errors = {};
    const text = (field) => (typeof values[field] === 'string' ? values[field] : '');

    const name = text('name').trim();
    if (!name) errors.name = { key: 'publicPage.validation.required' };
    else if (name.length > DEMO_FIELD_LIMITS.name) errors.name = tooLong(DEMO_FIELD_LIMITS.name);

    const schoolName = text('schoolName').trim();
    if (!schoolName) errors.schoolName = { key: 'publicPage.validation.required' };
    else if (schoolName.length > DEMO_FIELD_LIMITS.schoolName) errors.schoolName = tooLong(DEMO_FIELD_LIMITS.schoolName);

    const email = text('email').trim();
    if (!email) errors.email = { key: 'publicPage.validation.required' };
    else if (email.length > DEMO_FIELD_LIMITS.email) errors.email = tooLong(DEMO_FIELD_LIMITS.email);
    else if (!EMAIL_PATTERN.test(email)) errors.email = { key: 'publicPage.validation.email' };

    const phone = text('phone').trim();
    if (phone.length > DEMO_FIELD_LIMITS.phone) errors.phone = tooLong(DEMO_FIELD_LIMITS.phone);

    const role = text('role').trim();
    if (role.length > DEMO_FIELD_LIMITS.role) errors.role = tooLong(DEMO_FIELD_LIMITS.role);

    const message = text('message');
    if (message.length > DEMO_FIELD_LIMITS.message) {
        errors.message = { key: 'publicPage.validation.tooLong', params: { max: DEMO_FIELD_LIMITS.message } };
    } else if (typeof composedMessage === 'string' && composedMessage.length > DEMO_FIELD_LIMITS.message) {
        errors.message = { key: 'publicPage.validation.messageTooLong' };
    }

    return errors;
};
