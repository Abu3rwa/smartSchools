import assert from 'node:assert/strict';
import test from 'node:test';
import WritingAssessment from '../models/WritingAssessment.js';
import WritingAssignment from '../models/WritingAssignment.js';
import WritingProject from '../models/WritingProject.js';
import WritingDraft from '../models/WritingDraft.js';
import { runWritingFeedbackEmailRetry } from '../jobs/writingFeedbackEmailRetryJob.js';

const chain = (value, spy) => ({
    select() { return this; },
    limit(n) { spy.limit = n; return this; },
    lean() { return this; },
    setOptions(options) { spy.options = options; return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

test('retry sweep only looks at unfinished, retryable sends and never crosses schools', async (t) => {
    const spy = {};
    t.mock.method(WritingAssessment, 'find', (filter) => {
        spy.filter = filter;
        return chain([], spy);
    });
    const summary = await runWritingFeedbackEmailRetry(new Date('2026-11-13T12:00:00.000Z'));
    assert.deepEqual(summary, { checked: 0, retried: 0, sent: 0, failed: 0 });
    assert.deepEqual(spy.filter['publish.email.status'], { $in: ['pending', 'failed'] });
    // Three attempts is the cap: a send that failed that often will not heal.
    assert.deepEqual(spy.filter['publish.email.attempts'], { $lt: 3 });
    assert.equal(spy.filter['publish.state'], 'published');
    const cutoff = spy.filter.$or[0]['publish.email.lastAttemptAt'].$lte;
    assert.equal(cutoff.toISOString(), '2026-11-13T11:50:00.000Z');
    assert.deepEqual(spy.options, { skipTenantFilter: true });
    assert.equal(spy.limit, 50);
});

test('a record whose draft is gone is left alone instead of sending stale feedback', async (t) => {
    const row = {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        school: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        project: 'cccccccccccccccccccccccc',
        assignment: 'dddddddddddddddddddddddd',
        draft: 'eeeeeeeeeeeeeeeeeeeeeeee',
    };
    t.mock.method(WritingAssessment, 'find', () => chain([row], {}));
    t.mock.method(WritingProject, 'findOne', () => chain(null, {}));
    t.mock.method(WritingAssignment, 'findOne', () => chain(null, {}));
    t.mock.method(WritingDraft, 'findOne', () => chain(null, {}));
    t.mock.method(WritingAssessment, 'findOne', () => chain(null, {}));
    t.mock.method(WritingAssessment, 'updateOne', async () => assert.fail('nothing to reach'));
    const summary = await runWritingFeedbackEmailRetry();
    assert.deepEqual(summary, { checked: 1, retried: 0, sent: 0, failed: 0 });
});
