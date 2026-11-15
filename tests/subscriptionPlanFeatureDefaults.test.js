import test from 'node:test';
import assert from 'node:assert/strict';

import { FEATURES, getFeaturesForPlan } from '../constants/features.js';
import { serializePlan } from '../controllers/subscriptionController.js';

test('student support is a catalog feature on professional and enterprise', () => {
    assert.ok(FEATURES.studentSupport, 'studentSupport must exist in the feature catalog');
    assert.equal(FEATURES.studentSupport.label, 'Student Support');
    assert.deepEqual(FEATURES.studentSupport.plans, ['professional', 'enterprise']);

    assert.equal(getFeaturesForPlan('starter').studentSupport, false);
    assert.equal(getFeaturesForPlan('professional').studentSupport, true);
    assert.equal(getFeaturesForPlan('enterprise').studentSupport, true);
});

test('a plan saved before student support existed picks up the new default', () => {
    const storedPlan = {
        key: 'enterprise',
        name: 'Enterprise',
        features: { parentPortal: true, dataExport: true }
    };

    const serialized = serializePlan(storedPlan);

    assert.equal(serialized.features.studentSupport, true);
    assert.equal(serialized.features.parentPortal, true);
    assert.equal(serialized.features.dataExport, true);
});

test('a plan that explicitly switched a feature off keeps it off', () => {
    const storedPlan = {
        key: 'enterprise',
        name: 'Enterprise',
        features: { studentSupport: false }
    };

    const serialized = serializePlan(storedPlan);

    assert.equal(serialized.features.studentSupport, false);
});
