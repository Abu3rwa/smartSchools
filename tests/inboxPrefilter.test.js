import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyByRule, ruleResultForSender } from '../services/inbox/inboxPrefilter.js';

test('a newsletter header is ignored without an AI call', () => {
    const result = classifyByRule({ 'List-Unsubscribe': '<mailto:leave@news.test>' }, 'news@paper.test');
    assert.equal(result.priority, 'ignore');
    assert.match(result.reason, /unsubscribe/);
});

test('a person from this school is never ignored by a mailing header', () => {
    const headers = { 'List-Unsubscribe': '<mailto:leave@news.test>' };
    assert.equal(classifyByRule(headers, 'huda@school.test').priority, 'ignore');
    assert.equal(
        ruleResultForSender({ headers, fromEmail: 'huda@school.test', senderRole: 'teacher' }),
        null
    );
});

test('bulk, list and junk precedence are ignored', () => {
    for (const value of ['bulk', 'list', 'junk']) {
        assert.equal(classifyByRule({ Precedence: value }, 'x@y.test').priority, 'ignore');
    }
});

test('automatic and robot addresses are ignored, a normal person is not', () => {
    assert.equal(classifyByRule({ 'Auto-Submitted': 'auto-generated' }, 'system@x.test').priority, 'ignore');
    assert.equal(classifyByRule({ 'Auto-Submitted': 'no' }, 'person@x.test'), null);
    assert.equal(classifyByRule({}, 'no-reply@x.test').priority, 'ignore');
    assert.equal(classifyByRule({}, 'do-not-reply@x.test').priority, 'ignore');
    assert.equal(classifyByRule({}, 'mailer-daemon@x.test').priority, 'ignore');
    assert.equal(classifyByRule({}, 'notifications@x.test').priority, 'ignore');
    assert.equal(classifyByRule({}, 'huda@school.test'), null);
});

test('headers can be given in Gmail header-list form', () => {
    const headers = [{ name: 'Precedence', value: 'bulk' }];
    assert.equal(classifyByRule(headers, 'any@x.test').priority, 'ignore');
});
