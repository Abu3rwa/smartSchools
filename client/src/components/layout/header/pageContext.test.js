import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePageContext } from './pageContext.js';

test('every page resolves a context, including non-pinnable pages', () => {
    assert.deepEqual(resolvePageContext('/portal/dashboard', 'teacher'), { labelKey: 'dashboard', section: 'overview' });
    assert.deepEqual(resolvePageContext('/portal/reports/generator', 'admin'), { labelKey: 'reportGenerator', section: 'operations' });
    assert.deepEqual(resolvePageContext('/portal/school-settings', 'admin'), { labelKey: 'schoolSettings', section: 'admin' });
});

test('longest path wins over its parent', () => {
    assert.deepEqual(resolvePageContext('/portal/ai-credit/me', 'teacher'), { labelKey: 'aiCreditDashboard', section: 'account' });
    assert.deepEqual(resolvePageContext('/portal/ai-credit', 'admin'), { labelKey: 'aiCreditDashboard', section: 'admin' });
    assert.deepEqual(resolvePageContext('/portal/settings/subscription', 'admin'), { labelKey: 'subscription', section: 'admin' });
    assert.deepEqual(resolvePageContext('/portal/settings', 'teacher'), { labelKey: 'settings', section: 'account' });
});

test('detail routes inherit their list page context', () => {
    assert.deepEqual(resolvePageContext('/portal/gradebook/class/123', 'teacher'), { labelKey: 'gradebook', section: 'assessment' });
    assert.deepEqual(resolvePageContext('/portal/reports/templates/abc/edit', 'admin'), { labelKey: 'reportTemplates', section: 'operations' });
});

test('role-specific candidates win ties and are hidden from other roles', () => {
    assert.deepEqual(resolvePageContext('/portal/spelling/student', 'student'), { labelKey: 'spelling', section: 'learning' });
    const teacherView = resolvePageContext('/portal/spelling/student', 'teacher');
    assert.equal(teacherView.section, 'assessment');
});

test('unknown paths resolve to nothing rather than a wrong label', () => {
    assert.equal(resolvePageContext('/portal/does-not-exist', 'admin'), null);
    assert.equal(resolvePageContext('/login', 'teacher'), null);
    assert.equal(resolvePageContext('/portal/dashboardish', 'teacher'), null);
});