import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ESTIMATE_TOKENS,
    estimateDraftCents,
    estimateScanCents
} from '../services/inbox/inboxCostEstimator.js';

const RATES = {
    inputPerMillionCents: 75,
    cachedInputPerMillionCents: 7.5,
    outputPerMillionCents: 450
};

test('a scan estimate grows with the number of emails', () => {
    const one = estimateScanCents({ emailCount: 1, markupPercent: 0, rates: RATES });
    const eight = estimateScanCents({ emailCount: 8, markupPercent: 0, rates: RATES });
    const twentyFive = estimateScanCents({ emailCount: 25, markupPercent: 0, rates: RATES });
    assert.ok(one > 0);
    assert.ok(eight > one);
    assert.ok(twentyFive > eight);
    assert.equal(estimateScanCents({ emailCount: 0, markupPercent: 0, rates: RATES }), 0);
});

test('the markup is applied on top of the provider cost', () => {
    const exact = (
        (ESTIMATE_TOKENS.emailInput * 8 + ESTIMATE_TOKENS.callOverheadInput) * RATES.inputPerMillionCents
        + ESTIMATE_TOKENS.emailOutput * 8 * RATES.outputPerMillionCents
    ) / 1_000_000;
    const doubled = estimateScanCents({ emailCount: 8, markupPercent: 100, rates: RATES });
    assert.equal(doubled, Math.ceil(exact * 2 * 100) / 100);
});

test('one chunk of eight emails adds one call overhead', () => {
    const exact = (
        (ESTIMATE_TOKENS.emailInput * 8 + ESTIMATE_TOKENS.callOverheadInput) * RATES.inputPerMillionCents
        + ESTIMATE_TOKENS.emailOutput * 8 * RATES.outputPerMillionCents
    ) / 1_000_000;
    assert.equal(
        estimateScanCents({ emailCount: 8, markupPercent: 0, rates: RATES }),
        Math.ceil(exact * 100) / 100
    );
});

test('a draft estimate includes the call overhead and is always positive', () => {
    const exact = (
        (ESTIMATE_TOKENS.draftInput + ESTIMATE_TOKENS.callOverheadInput) * RATES.inputPerMillionCents
        + ESTIMATE_TOKENS.draftOutput * RATES.outputPerMillionCents
    ) / 1_000_000;
    const cents = estimateDraftCents({ markupPercent: 0, rates: RATES });
    assert.ok(cents > 0);
    assert.equal(cents, Math.ceil(exact * 100) / 100);
    assert.equal(
        estimateDraftCents({ markupPercent: 100, rates: RATES }),
        Math.ceil(exact * 2 * 100) / 100
    );
});
