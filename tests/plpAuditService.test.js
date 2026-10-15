import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlpAuditWriter } from '../services/plpAuditService.js';

test('PLP audit writer rethrows persistence errors after logging them', async () => {
    const expectedError = new Error('database unavailable');
    const logged = [];
    const write = createPlpAuditWriter({
        create: async () => { throw expectedError; },
        log: (...args) => logged.push(args),
    });

    await assert.rejects(
        write({
            school: 'school-id',
            actor: 'teacher-id',
            action: 'goal_plan_copied',
            targetType: 'PlpGoal',
            targetId: 'goal-id',
        }),
        expectedError
    );
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], 'PLP audit write failed');
    assert.equal(logged[0][1].action, 'goal_plan_copied');
});

test('PLP audit writer passes transaction session to the database create call', async () => {
    const session = { id: 'transaction-session' };
    let writeOptions;
    const write = createPlpAuditWriter({
        create: async (_records, options) => {
            writeOptions = options;
            return [{ _id: 'audit-id' }];
        },
        log: () => {},
    });

    const result = await write({
        school: 'school-id',
        actor: 'teacher-id',
        action: 'goal_plan_copied',
        targetType: 'PlpGoal',
        targetId: 'goal-id',
        session,
    });
    assert.deepEqual(writeOptions, { session });
    assert.equal(result._id, 'audit-id');
});
