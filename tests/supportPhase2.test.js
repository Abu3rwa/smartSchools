import assert from 'node:assert/strict';
import test from 'node:test';

import mongoose from 'mongoose';

import SupportPlan from '../models/SupportPlan.js';
import SupportPlanVersion from '../models/SupportPlanVersion.js';
import {
    adminApprovalNeedsNote,
    canApproveVersion,
    metOutcomeReady,
} from '../services/supportPlanVersionService.js';

const ids = {
    owner: '650000000000000000000001',
    counselor: '650000000000000000000002',
    admin: '650000000000000000000003',
    teacher: '650000000000000000000004',
};

const user = (id, role = 'teacher') => ({ _id: id, roles: [role] });
const admin = () => user(ids.admin, 'admin');

const caseWithCounselor = () => ({
    owner: { _id: ids.owner },
    homeroomTeacher: { _id: ids.owner },
    counselor: { _id: ids.counselor },
    participants: [{ role: 'counselor', user: { _id: ids.counselor } }],
});

const caseWithoutCounselor = () => ({
    owner: { _id: ids.owner },
    homeroomTeacher: { _id: ids.owner },
    counselor: null,
    participants: [],
});

/* --------------------------- approval permissions -------------------------- */

test('counselor_approve lets the assigned counselor approve', () => {
    assert.equal(canApproveVersion({
        caseDoc: caseWithCounselor(),
        user: user(ids.counselor, 'counselor'),
        settings: { approvalMode: 'counselor_approve' },
    }), true);
});

test('counselor_approve no longer lets the case owner self-approve', () => {
    assert.equal(canApproveVersion({
        caseDoc: caseWithoutCounselor(),
        user: user(ids.owner),
        settings: { approvalMode: 'counselor_approve' },
    }), false);
});

test('counselor_approve still lets a designated admin approve', () => {
    assert.equal(canApproveVersion({
        caseDoc: caseWithoutCounselor(),
        user: admin(),
        settings: { approvalMode: 'counselor_approve' },
    }), true);
});

test('admin_approve reserves approval for admins only', () => {
    const settings = { approvalMode: 'admin_approve' };
    assert.equal(canApproveVersion({ caseDoc: caseWithoutCounselor(), user: user(ids.owner), settings }), false);
    assert.equal(canApproveVersion({ caseDoc: caseWithoutCounselor(), user: admin(), settings }), true);
});

test('the default mode keeps approval with the case owner', () => {
    const settings = {};
    assert.equal(canApproveVersion({ caseDoc: caseWithoutCounselor(), user: user(ids.owner), settings }), true);
    assert.equal(canApproveVersion({ caseDoc: caseWithoutCounselor(), user: user(ids.teacher), settings }), false);
});

test('an admin substituting for the counselor must record a reason', () => {
    const settings = { approvalMode: 'counselor_approve' };
    assert.equal(adminApprovalNeedsNote({ caseDoc: caseWithoutCounselor(), user: admin(), settings }), true);
    assert.equal(adminApprovalNeedsNote({ caseDoc: caseWithCounselor(), user: user(ids.counselor, 'counselor'), settings }), false);
    assert.equal(adminApprovalNeedsNote({ caseDoc: caseWithCounselor(), user: admin(), settings }), true);
    assert.equal(adminApprovalNeedsNote({ caseDoc: caseWithoutCounselor(), user: admin(), settings: { approvalMode: 'admin_approve' } }), false);
});

/* ------------------------------ evidence rule ------------------------------ */

const metGoal = (overrides = {}) => ({
    baseline: 'Reads 12 of 40 words per minute',
    targetDate: new Date('2026-12-01'),
    successLook: '',
    successLookAr: '',
    ...overrides,
});

test('met needs a baseline, a target, and a written note', () => {
    assert.equal(metOutcomeReady(metGoal(), 'Dibels retell went from 12 to 31.'), true);
    assert.equal(metOutcomeReady(metGoal({ targetDate: null, successLook: 'Reads a page without help' }), 'note'), true);
    assert.equal(metOutcomeReady(metGoal({ targetDate: null, successLookAr: 'يقرأ صفحة دون مساعدة' }), 'note'), true);
});

test('met is refused without each required piece of evidence', () => {
    assert.equal(metOutcomeReady(metGoal({ baseline: '' }), 'note'), false);
    assert.equal(metOutcomeReady(metGoal({ targetDate: null }), ''), false);
    assert.equal(metOutcomeReady(metGoal(), ''), false);
    assert.equal(metOutcomeReady(metGoal({ targetDate: null, successLook: '', successLookAr: '' }), 'note'), false);
    assert.equal(metOutcomeReady(null, 'note'), false);
});

/* ----------------------------- schema alignment ---------------------------- */

test('the live plan accepts the same goal shape as the draft version', () => {
    const doc = new SupportPlan({
        school: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        class: new mongoose.Types.ObjectId(),
        academicYear: '2026-2027',
        month: 11,
        status: 'published',
        goals: [{
            id: 'g1',
            title: 'Reading fluency',
            domain: 'general',
            sourceRole: 'staff',
            baseline: '12 words per minute',
            targetDate: new Date('2026-12-01'),
            responsibleRole: 'family',
            responsibleUser: new mongoose.Types.ObjectId(),
            outcome: 'partially_met',
            outcomeNote: 'Halfway to target.',
            reviewedAt: new Date(),
        }],
    });
    const errors = doc.validateSync();
    const goalErrors = Object.keys(errors?.errors || {}).filter((key) => key.startsWith('goals.0.'));
    assert.deepEqual(goalErrors, []);
});

test('the live plan still rejects a bogus outcome', () => {
    const doc = new SupportPlan({
        school: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        class: new mongoose.Types.ObjectId(),
        academicYear: '2026-2027',
        month: 11,
        goals: [{ id: 'g1', title: 'Reading', outcome: 'excellent' }],
    });
    const errors = doc.validateSync();
    assert.match(String(errors.errors['goals.0.outcome']?.message || ''), /excellent/);
});

test('plan versions keep the approval note within its limit', () => {
    const doc = new SupportPlanVersion({
        school: new mongoose.Types.ObjectId(),
        plan: new mongoose.Types.ObjectId(),
        case: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        version: 1,
        approvalNote: 'x'.repeat(601),
    });
    const errors = doc.validateSync();
    assert.match(String(errors.errors['approvalNote']?.message || ''), /600/);
});
