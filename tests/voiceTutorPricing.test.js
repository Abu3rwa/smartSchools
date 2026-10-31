import test from 'node:test';
import assert from 'node:assert/strict';

import { audioCentsPerMinute, isAudioModelPriced } from '../config/aiPricing.js';
import {
    VOICE_DEFAULTS,
    loadVoicePricing,
    messageEconomics,
    messagePriceCents,
    suggestedMessageCredits,
    voiceCostCents,
    worstCaseMessageCostCents
} from '../services/voiceTutorPricing.js';

const MINI = { inputPerMillionCents: 75, cachedInputPerMillionCents: 7.5, outputPerMillionCents: 450 };

test('one voice message bills tokens and both directions of speech', () => {
    const cost = voiceCostCents({
        tokens: { inputTokens: 3000, cachedInputTokens: 0, outputTokens: 150, totalTokens: 3150 },
        transcriptSeconds: 10,
        speechSeconds: 25,
        modelRates: MINI,
        sttCentsPerMinute: 0.3,
        ttsCentsPerMinute: 1.5
    });
    // 0.2925 tokens + 0.05 listening + 0.625 speaking
    assert.equal(cost, 0.9675);
});

test('speech models are priced by the minute and can be overridden', () => {
    assert.equal(audioCentsPerMinute('gpt-4o-mini-tts', {}), 1.5);
    assert.equal(audioCentsPerMinute('gpt-4o-mini-transcribe', {}), 0.3);
    assert.equal(audioCentsPerMinute('unknown-voice', {}), null);
    assert.equal(isAudioModelPriced('unknown-voice', {}), false);

    const env = { AI_CREDIT_AUDIO_RATES: '{"gpt-4o-mini-tts":{"centsPerMinute":1.2}}' };
    assert.equal(audioCentsPerMinute('gpt-4o-mini-tts', env), 1.2);
    assert.equal(audioCentsPerMinute('gpt-4o-mini-tts', { AI_CREDIT_AUDIO_RATES: 'not json' }), 1.5);
});

test('a session refuses to start when any meter it uses has no price', () => {
    assert.ok(loadVoicePricing({ config: VOICE_DEFAULTS, env: {} }));
    assert.throws(
        () => loadVoicePricing({ config: { ...VOICE_DEFAULTS, model: 'unpriced-model' }, env: {} }),
        /no verified price/
    );
    assert.throws(
        () => loadVoicePricing({ config: { ...VOICE_DEFAULTS, ttsModel: 'unknown-voice' }, env: {} }),
        /text-to-speech/
    );
});

test('the flat price covers the worst case the caps allow', () => {
    const pricing = loadVoicePricing({ config: VOICE_DEFAULTS, env: {} });
    const worst = worstCaseMessageCostCents({ config: VOICE_DEFAULTS, pricing });
    assert.equal(worst, 2.031);

    const atThree = messageEconomics({ providerCostCents: worst, messageCredits: 3 });
    assert.equal(atThree.chargedCents, 3);
    assert.equal(atThree.profitCents, 0.969);
    assert.equal(atThree.marginPercent, 32.3);
});

test('the suggested price follows the markup and rounds up to a whole credit', () => {
    assert.equal(messagePriceCents(3), 3);
    assert.equal(suggestedMessageCredits({ averageProviderCostCents: 2.031, markupPercent: 200 }), 7);
    assert.equal(suggestedMessageCredits({ averageProviderCostCents: 0.2, markupPercent: 200 }), 1);
    assert.equal(suggestedMessageCredits({ averageProviderCostCents: 0, markupPercent: 0 }), 1);
});
