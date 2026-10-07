import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSubjectRef, resolveSubjectByRef } from '../services/import/importPipeline.js';

test('normalizeSubjectRef collapses punctuation and spacing in subject references', () => {
    assert.equal(normalizeSubjectRef('SS-5'), 'ss5');
    assert.equal(normalizeSubjectRef('Social Studies 5'), 'socialstudies5');
    assert.equal(normalizeSubjectRef('   ss_5   '), 'ss5');
});

test('resolveSubjectByRef accepts normalized code and name variants', () => {
    const subject = { _id: 'sub-1', code: 'SS-5', name: 'Social Studies 5' };
    const lookup = {
        byId: new Map(),
        byCode: new Map([['SS-5', subject], ['SS5', subject]]),
        byCodeNormalized: new Map([['ss5', subject]]),
        byName: new Map([['social studies 5', subject]]),
        byNameNormalized: new Map([['socialstudies5', subject]]),
        byNormalized: new Map([['ss5', subject], ['socialstudies5', subject]])
    };

    assert.equal(resolveSubjectByRef('SS-5', lookup), subject);
    assert.equal(resolveSubjectByRef('SS5', lookup), subject);
    assert.equal(resolveSubjectByRef('Social Studies 5', lookup), subject);
    assert.equal(resolveSubjectByRef(' social studies_5 ', lookup), subject);
});
