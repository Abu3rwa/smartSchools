import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyMarkupCents,
  centsToDollarsInput,
  creditErrorMessage,
  creditState,
  dollarsToCents,
  formatBalance,
  formatCents,
  formatUsd,
} from './aiCredit.js';

test('dollar input becomes whole cents and junk is rejected', () => {
  assert.equal(dollarsToCents('5'), 500);
  assert.equal(dollarsToCents('$5.5'), 550);
  assert.equal(dollarsToCents('1,000.25'), 100025);
  assert.ok(Number.isNaN(dollarsToCents('')));
  assert.ok(Number.isNaN(dollarsToCents('5.555')));
  assert.ok(Number.isNaN(dollarsToCents('-3')));
  assert.equal(centsToDollarsInput(500), '5');
  assert.equal(centsToDollarsInput(550), '5.50');
});

test('money and cents read naturally, and a balance never shows below zero', () => {
  assert.equal(formatUsd(408), '$4.08');
  assert.equal(formatUsd(7.5, 'en', 4), '$0.075');
  assert.equal(formatBalance(-0.4), '$0.00');
  assert.equal(formatCents(0.975), '0.975¢');
  assert.equal(formatCents(0.0001), '0.0001¢');
  assert.equal(formatCents(12), '12¢');
});

test('markup preview matches the server: cost plus a percentage', () => {
  assert.equal(applyMarkupCents(100, 0), 100);
  assert.equal(applyMarkupCents(100, 50), 150);
  assert.equal(applyMarkupCents(100, 100), 200);
  assert.equal(applyMarkupCents(97.5, 100), 195);
  assert.equal(applyMarkupCents(50.56, 50), 75.84);
  assert.equal(applyMarkupCents(0, 100), 0);
});

test('creditState picks the one label the teacher sees', () => {
  assert.equal(creditState({ exempt: true }), 'empty');
  assert.equal(creditState({ paused: true, balanceCents: 500 }), 'paused');
  assert.equal(creditState({ balanceCents: 0, lowBalanceCents: 100 }), 'empty');
  assert.equal(creditState({ balanceCents: 90, lowBalanceCents: 100 }), 'low');
  assert.equal(creditState({ balanceCents: 900, lowBalanceCents: 100 }), 'ok');
});

test('credit refusals translate by code, other errors fall through', () => {
  const t = (key) => key;
  const error = (code) => ({ response: { data: { code } } });
  assert.equal(creditErrorMessage(error('AI_CREDIT_REQUIRED'), t), 'aiCredit:errors.required');
  assert.equal(creditErrorMessage(error('AI_CREDIT_PAUSED'), t), 'aiCredit:errors.paused');
  assert.equal(creditErrorMessage(error('AI_CREDIT_PRICING_REQUIRED'), t), 'aiCredit:errors.pricing');
  assert.equal(creditErrorMessage(error('OTHER'), t), '');
});

test('credit routes live outside the Writing feature gate', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  for (const [path, roles, page] of [
    ['ai-credit', '["admin"]', 'AiCreditAdminPage'],
    ['ai-credit/me', '["teacher", "admin"]', 'MyAiCreditPage'],
  ]) {
    const route = app.match(new RegExp(`<Route\\s+path="${path}"[\\s\\S]*?</RoleRoute>`))?.[0];
    assert.ok(route, `Missing route: ${path}`);
    assert.ok(route.includes(`<RoleRoute roles={${roles}}>`));
    assert.ok(route.includes(`<${page} />`));
    assert.doesNotMatch(route, /FeatureGate feature="writingAssistant"/);
  }
  assert.match(app, /path="writing\/credit" element=\{<Navigate to="\/portal\/ai-credit\/me" replace \/>\}/);
});

test('only admins have the AI credit dashboard sidebar entry', () => {
  const sidebar = readFileSync(new URL('../components/layout/Sidebar.jsx', import.meta.url), 'utf8');
  const entry = sidebar.match(/\{\s*path: "\/portal\/ai-credit",[^}]+\}/)?.[0];
  assert.ok(entry);
  assert.match(entry, /roles: \["admin"\]/);
  assert.match(entry, /section: "admin"/);
  assert.match(entry, /labelKey: "aiCreditDashboard"/);
  assert.doesNotMatch(entry, /feature: "writingAssistant"/);
  assert.doesNotMatch(sidebar, /path: "\/portal\/writing\/credit"/);
});

test('only the platform sidebar reaches the markup page', () => {
  const sidebar = readFileSync(new URL('../components/layout/AdminSidebar.jsx', import.meta.url), 'utf8');
  assert.match(sidebar, /path: '\/admin\/ai-credit'/);
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(app, /path="ai-credit" element=\{<SuperAdminAiCreditPage \/>\}/);
  const page = readFileSync(new URL('../pages/superAdmin/SuperAdminAiCreditPage/SuperAdminAiCreditPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /api\.patch|platformAiCreditService\.updateMarkup/);
  assert.match(page, /settings\.applyNote/);
});

test('both languages label the admin dashboard distinctly', () => {
  for (const language of ['en', 'ar']) {
    const sidebar = JSON.parse(readFileSync(new URL(`../i18n/locales/${language}/layout.sidebar.json`, import.meta.url), 'utf8'));
    const copy = JSON.parse(readFileSync(new URL(`../i18n/locales/${language}/aiCredit.json`, import.meta.url), 'utf8'));
    assert.ok(sidebar.items.aiCreditDashboard);
    assert.equal(sidebar.items.aiCreditDashboard, copy.admin.title);
    assert.equal(sidebar.sections.admin, copy.admin.eyebrow);
    assert.notEqual(copy.title, copy.admin.title);
  }
});

test('every metered feature has a label in both languages', () => {
  const read = (language) => JSON.parse(readFileSync(
    new URL(`../i18n/locales/${language}/aiCredit.json`, import.meta.url),
    'utf8'
  )).history.features;
  const en = read('en');
  const ar = read('ar');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  assert.ok(en.general && ar.general);
});
