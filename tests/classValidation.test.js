import assert from 'node:assert/strict';
import test from 'node:test';
import { validationResult } from 'express-validator';
import { validationRules } from '../middleware/validator.js';

test('class creation can use the school academic year when none is submitted', async () => {
    const req = { body: { grade: '5' } };
    await Promise.all(validationRules.createClass.map((rule) => rule.run(req)));

    assert.equal(validationResult(req).isEmpty(), true);
});

test('class creation still rejects a grade outside the supported range', async () => {
    const req = { body: { grade: '13' } };
    await Promise.all(validationRules.createClass.map((rule) => rule.run(req)));

    assert.equal(validationResult(req).isEmpty(), false);
});
