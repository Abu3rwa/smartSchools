import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEMO_FIELD_LIMITS,
    composeDemoMessage,
    formatPlanLimit,
    formatPlanPrice,
    getPublicFeatureKeys,
    isSupportedCurrency,
    normalizePublicPlans,
    toPlanLimit,
    validateDemoForm,
} from './landingPagePresentation.js';

const validPlan = {
    key: 'fixture-plan-a',
    name: 'Demonstration Plan A',
    billing: { amount: 12.5, currency: 'USD', interval: 'month' },
    limits: { maxStudents: 120, maxTeachers: 12, maxClasses: -1 },
    features: { readingAssistant: true, writingAssistant: false, parentPortal: true, spellingAnalysis: true },
    featured: true,
    featureHighlights: ['Unverified English text'],
};

test('normalizePublicPlans returns display records in server order', () => {
    const plans = normalizePublicPlans([validPlan, { ...validPlan, key: 'fixture-plan-b', name: 'Plan B' }]);
    assert.deepEqual(plans.map((plan) => plan.key), ['fixture-plan-a', 'fixture-plan-b']);
    assert.equal(plans[0].name, 'Demonstration Plan A');
    assert.equal(plans[0].pricing.status, 'valid');
    assert.deepEqual(plans[0].limits.maxStudents, { kind: 'capped', value: 120 });
    assert.deepEqual(plans[0].limits.maxTeachers, { kind: 'capped', value: 12 });
    assert.deepEqual(plans[0].limits.maxClasses, { kind: 'unlimited', value: null });
});

test('normalizePublicPlans rejects a malformed identity instead of dropping offers', () => {
    const cases = [null, { plans: [] }, [{ name: 'No key' }], [{ key: 'a' }], [validPlan, validPlan]];
    for (const input of cases) {
        assert.throws(() => normalizePublicPlans(input), (error) => error.code === 'invalidResponse');
    }
});

test('normalizePublicPlans omits unknown capacities and keeps invalid pricing on that record only', () => {
    const plans = normalizePublicPlans([
        {
            key: 'plan-b',
            name: 'Plan B',
            billing: { amount: 10, currency: 'ZZZ', interval: 'month' },
            limits: { maxStudents: -2, maxTeachers: 1.5, maxClasses: '50' },
        },
    ]);
    assert.deepEqual(plans[0].limits, {});
    assert.equal(plans[0].pricing.status, 'unavailable');
    assert.equal(plans[0].name, 'Plan B');
});

test('normalizePublicPlans never exposes English server highlight text', () => {
    const plans = normalizePublicPlans([validPlan]);
    assert.equal(JSON.stringify(plans).includes('Unverified English text'), false);
    assert.equal(JSON.stringify(plans).includes('featured'), false);
});

test('normalizePublicPlans only advertises approved, strictly enabled feature keys', () => {
    const plans = normalizePublicPlans([validPlan], ['readingAssistant', 'writingAssistant']);
    assert.deepEqual(plans[0].publicFeatureKeys, ['readingAssistant']);

    const unapproved = normalizePublicPlans([validPlan], []);
    assert.deepEqual(unapproved[0].publicFeatureKeys, []);
});

test('formatPlanPrice treats zero as a real amount', () => {
    const price = formatPlanPrice({ amount: 0, currency: 'USD', interval: 'month' }, 'en');
    assert.ok(price);
    assert.match(price.amountText, /0/);
    assert.equal(price.intervalKey, 'publicPage.pricing.month');
});

test('formatPlanPrice withholds invalid commercial values', () => {
    const cases = [
        { amount: -1, currency: 'USD', interval: 'month' },
        { amount: null, currency: 'USD', interval: 'month' },
        { amount: '0', currency: 'USD', interval: 'month' },
        { amount: Number.NaN, currency: 'USD', interval: 'month' },
        { amount: 10, currency: 'ZZZ', interval: 'month' },
        { amount: 10, currency: 'US', interval: 'month' },
        { amount: 10, currency: 'USD', interval: 'week' },
        { amount: 10, currency: 'USD' },
    ];
    for (const pricing of cases) {
        assert.equal(formatPlanPrice(pricing), null);
    }
    assert.equal(formatPlanPrice(null), null);
});

test('formatPlanPrice normalises currency case and keeps natural decimals', () => {
    const yearly = formatPlanPrice({ amount: 120, currency: ' usd ', interval: 'year' }, 'en');
    assert.equal(yearly.intervalKey, 'publicPage.pricing.year');
    assert.match(yearly.amountText, /USD/);

    const jpy = formatPlanPrice({ amount: 1200, currency: 'JPY', interval: 'month' }, 'en');
    assert.equal(jpy.amountText.includes('.00'), false);
});

test('isSupportedCurrency accepts known currencies only', () => {
    assert.equal(isSupportedCurrency('USD'), true);
    assert.equal(isSupportedCurrency('EUR'), true);
    assert.equal(isSupportedCurrency('ZZZ'), false);
    assert.equal(isSupportedCurrency('US'), false);
    assert.equal(isSupportedCurrency(''), false);
    assert.equal(isSupportedCurrency(null), false);
});

test('toPlanLimit keeps zero, unlimited and unknown distinct', () => {
    assert.deepEqual(toPlanLimit(0), { kind: 'capped', value: 0 });
    assert.deepEqual(toPlanLimit(50), { kind: 'capped', value: 50 });
    assert.deepEqual(toPlanLimit(-1), { kind: 'unlimited', value: null });
    assert.equal(toPlanLimit(-2), null);
    assert.equal(toPlanLimit(1.5), null);
    assert.equal(toPlanLimit(null), null);
    assert.equal(toPlanLimit('50'), null);
    assert.equal(toPlanLimit(undefined), null);
});

test('formatPlanLimit maps a limit to its translated label and value', () => {
    const capped = formatPlanLimit({ kind: 'capped', value: 120 }, 'en');
    assert.equal(capped.valueKey, 'publicPage.pricing.capped');
    assert.equal(capped.value, '120');

    const unlimited = formatPlanLimit({ kind: 'unlimited', value: null }, 'en');
    assert.equal(unlimited.valueKey, 'publicPage.pricing.unlimited');
    assert.equal(unlimited.value, null);

    assert.equal(formatPlanLimit(null), null);
    assert.equal(formatPlanLimit({ kind: 'capped' }), null);
});

test('getPublicFeatureKeys only advertises approved, strictly enabled keys', () => {
    assert.deepEqual(
        getPublicFeatureKeys({ readingAssistant: true, writingAssistant: 'true', parentPortal: true, unknownKey: true }),
        ['readingAssistant']
    );
    assert.deepEqual(getPublicFeatureKeys(null), []);
    assert.deepEqual(getPublicFeatureKeys({ readingAssistant: 1 }), []);
});

test('composeDemoMessage appends a one-line plan summary without losing user text', () => {
    const composed = composeDemoMessage(
        'Gradebook and attendance',
        { key: 'plan-a', name: 'Plan A' },
        'en',
        (key, params) => `Plan interest: ${params.name} (${params.key})`
    );
    assert.equal(composed.message, 'Plan interest: Plan A (plan-a)\n\nGradebook and attendance');
    assert.equal(composed.used, composed.message.length);
    assert.equal(composed.max, DEMO_FIELD_LIMITS.message);
});

test('composeDemoMessage collapses newlines in the plan name and keeps user newlines', () => {
    const composed = composeDemoMessage(
        'First line\nSecond line',
        { key: 'plan-a', name: 'Plan\nA' },
        'en',
        (key, params) => `Plan interest: ${params.name} (${params.key})`
    );
    assert.equal(composed.message.split('\n')[0], 'Plan interest: Plan A (plan-a)');
    assert.equal(composed.message.includes('First line\nSecond line'), true);
});

test('composeDemoMessage returns the trimmed message when no plan is selected', () => {
    assert.equal(composeDemoMessage('  hello  ').message, 'hello');
    assert.equal(composeDemoMessage('').used, 0);
    assert.equal(composeDemoMessage('', null, 'en', () => 'x').message, '');
});

test('validateDemoForm reports required, format and length problems', () => {
    const empty = validateDemoForm({});
    assert.deepEqual(Object.keys(empty).sort(), ['email', 'name', 'schoolName']);
    assert.equal(empty.name.key, 'publicPage.validation.required');
    assert.equal(empty.email.key, 'publicPage.validation.required');

    const badEmail = validateDemoForm({ name: 'A', schoolName: 'B', email: 'nope' });
    assert.equal(badEmail.email.key, 'publicPage.validation.email');

    const longName = validateDemoForm({ name: 'x'.repeat(DEMO_FIELD_LIMITS.name + 1), schoolName: 'B', email: 'a@b.co' });
    assert.equal(longName.name.key, 'publicPage.validation.tooLong');
    assert.equal(longName.name.params.max, DEMO_FIELD_LIMITS.name);

    const longPhone = validateDemoForm({ name: 'A', schoolName: 'B', email: 'a@b.co', phone: '9'.repeat(41) });
    assert.equal(longPhone.phone.key, 'publicPage.validation.tooLong');
});

test('validateDemoForm accepts international phone numbers and optional fields', () => {
    const errors = validateDemoForm({
        name: 'Demo Contact',
        schoolName: 'Demo School',
        email: 'contact@example.com',
        phone: '+44 20 7946 0958 ext. 12',
        role: 'Principal',
    });
    assert.deepEqual(errors, {});
});

test('validateDemoForm flags a composed message that exceeds the budget', () => {
    const withinLimit = validateDemoForm(
        { name: 'A', schoolName: 'B', email: 'a@b.co', message: 'x'.repeat(1990) },
        'y'.repeat(2000)
    );
    assert.deepEqual(withinLimit, {});

    const overLimit = validateDemoForm(
        { name: 'A', schoolName: 'B', email: 'a@b.co', message: 'x'.repeat(1990) },
        'y'.repeat(2001)
    );
    assert.equal(overLimit.message.key, 'publicPage.validation.messageTooLong');
});

