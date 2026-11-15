import assert from 'node:assert/strict';
import test from 'node:test';

import {
    RECENCY_HALF_LIFE_MONTHS,
    SELECTION_ALGORITHM_VERSION,
    concernScores,
    monthsOldWeight,
    selectQuestions,
    selectionConfig,
    surveyPeriod,
} from '../services/supportSelectionService.js';
import {
    canParticipate,
    effectiveSettings,
    isCounselor,
    isSupportAdmin,
    reviewCadenceFor,
    studentAge,
    studentSurveyDefault,
    userRoles,
} from '../services/supportSettingsService.js';
import {
    checkInKey,
    serializePlan,
    serializeRespondent,
    serializeSurvey,
    studentSummary,
} from '../services/supportSerializers.js';
import { canApproveVersion, academicPeriodFor } from '../services/supportPlanVersionService.js';
import { questionsForRound, surveyStatusCounts } from '../services/supportSurveyService.js';
import { SUPPORT_SETTINGS_DEFAULTS } from '../models/SupportSettings.js';

/* ------------------------------- fixtures --------------------------------- */

const REVIEW_PERIOD = { month: 10, academicYear: '2026-2027' };

const bankRow = (ref, concern, extra = {}) => ({
    ref,
    concern,
    domain: 'academic',
    prompt: `Prompt ${ref}`,
    promptAr: `نص ${ref}`,
    kind: 'scale',
    scaleMax: 4,
    required: true,
    trendAnchor: false,
    followUpFor: [],
    version: 1,
    ...extra,
});

const refIds = (result) => result.refs.map((row) => row.id);

const BANK = [
    bankRow('A1', 'effort', { trendAnchor: true }),
    bankRow('A2', 'understanding', { trendAnchor: true }),
    bankRow('B1', 'homework'),
    bankRow('OPT', 'mood', { required: false }),
    bankRow('FU1', 'effort', { followUpFor: ['effort'] }),
];

const surveyOf = ({
    id = 'SV1',
    audience = 'teacher',
    subject = 'S1',
    month = 9,
    academicYear = '2026-2027',
    questionKey = 'effort',
    scaleValue = 1,
    respondent = 'R1',
    review = undefined,
    submittedAt = '2026-10-01T00:00:00.000Z',
    status = 'submitted',
} = {}) => ({
    _id: id,
    audience,
    subject,
    month,
    academicYear,
    review,
    respondent,
    status,
    submittedAt,
    questions: [{ id: 'q1', key: questionKey, domain: 'academic', kind: 'scale', scaleMax: 4 }],
    answers: [{ questionId: 'q1', scaleValue }],
});

/* --------------------------- selection service ---------------------------- */

test('recency weight halves every three months and never exceeds 1', () => {
    assert.equal(RECENCY_HALF_LIFE_MONTHS, 3);
    assert.equal(monthsOldWeight(0), 1);
    assert.equal(monthsOldWeight(3), 0.5);
    assert.equal(monthsOldWeight(6), 0.25);
    assert.equal(monthsOldWeight(-4), 1);
});

test('a survey period comes from the review first, then its own month', () => {
    assert.deepEqual(
        surveyPeriod({ review: { month: 11, academicYear: '2026-2027' }, month: 9, academicYear: '2025-2026' }),
        { month: 11, academicYear: '2026-2027' },
    );
    assert.deepEqual(
        surveyPeriod({ month: 9, academicYear: '2026-2027' }),
        { month: 9, academicYear: '2026-2027' },
    );
    assert.equal(surveyPeriod({ month: 9 }), null);
    assert.equal(surveyPeriod(null), null);
});

test('concern scores favour recent answers over older ones', () => {
    const [score] = concernScores({
        surveys: [
            surveyOf({ id: 'recent', month: 10, scaleValue: 2 }),
            surveyOf({ id: 'old', month: 4, academicYear: '2025-2026', scaleValue: 4 }),
        ],
        reviewPeriod: REVIEW_PERIOD,
    });
    assert.equal(score.key, 'effort');
    assert.equal(score.answers, 2);
    assert.equal(score.score, 0.467);
    assert.ok(score.score < 0.5, 'a fresh low answer pulls the weighted score down');
});

test('re-submitting a survey replaces the first submit instead of counting twice', () => {
    const [score] = concernScores({
        surveys: [
            surveyOf({ id: 'SV1', scaleValue: 1, submittedAt: '2026-10-01T00:00:00.000Z' }),
            surveyOf({ id: 'SV1', scaleValue: 4, submittedAt: '2026-10-02T00:00:00.000Z' }),
        ],
        reviewPeriod: REVIEW_PERIOD,
    });
    assert.equal(score.answers, 1);
    assert.equal(score.respondents, 1);
    assert.equal(score.score, 1);
});

test('concern scores stay inside their audience and skip informal questions', () => {
    const surveys = [
        surveyOf({ id: 't1', audience: 'teacher', scaleValue: 4, respondent: 'T1' }),
        surveyOf({ id: 'p1', audience: 'parent', scaleValue: 1, respondent: 'P1' }),
        surveyOf({ id: 's1', audience: 'teacher', questionKey: 'general', respondent: 'T2' }),
    ];
    const parentOnly = concernScores({ surveys, reviewPeriod: REVIEW_PERIOD, audience: 'parent' });
    assert.equal(parentOnly.length, 1);
    assert.equal(parentOnly[0].score, 0);
    assert.equal(parentOnly[0].answers, 1);

    const combined = concernScores({ surveys, reviewPeriod: REVIEW_PERIOD });
    assert.equal(combined.length, 1);
    assert.equal(combined[0].answers, 2);
    assert.deepEqual([...combined[0].audiences].sort(), ['parent', 'teacher']);
});

test('selection length is clamped by the school maximum and stays at least one', () => {
    const defaults = SUPPORT_SETTINGS_DEFAULTS;
    assert.equal(selectionConfig({ audience: 'teacher', settings: defaults }).maxLength, 6);
    assert.equal(selectionConfig({ audience: 'teacher', settings: defaults, length: 8 }).maxLength, 8);
    assert.equal(selectionConfig({ audience: 'teacher', settings: defaults, length: 40 }).maxLength, 10);
    assert.equal(
        selectionConfig({ audience: 'teacher', settings: { ...defaults, maxSurveyLength: 3 }, length: 9 }).maxLength,
        3,
    );
    assert.equal(selectionConfig({ audience: 'student', settings: defaults }).anchorTarget, 1);
    assert.equal(selectionConfig({ audience: 'teacher', settings: defaults }).followUpTarget, 2);
});

test('a first survey is a baseline: anchors first, then required, then optional', async () => {
    const result = await selectQuestions({
        schoolId: 'school',
        audience: 'teacher',
        subjectId: 'S1',
        reviewPeriod: REVIEW_PERIOD,
        surveys: [],
        settings: { ...SUPPORT_SETTINGS_DEFAULTS, defaultSurveyLength: 5 },
        bank: BANK,
    });
    assert.equal(result.mode, 'baseline');
    assert.deepEqual(refIds(result), ['A1', 'A2', 'B1', 'OPT']);
    assert.equal(result.algorithm, SELECTION_ALGORITHM_VERSION);
});

test('another audience or subject never counts as this audience baseline', async () => {
    const result = await selectQuestions({
        schoolId: 'school',
        audience: 'teacher',
        subjectId: 'S1',
        reviewPeriod: REVIEW_PERIOD,
        surveys: [
            surveyOf({ id: 'parent', audience: 'parent' }),
            surveyOf({ id: 'other-subject', subject: 'S2' }),
        ],
        settings: SUPPORT_SETTINGS_DEFAULTS,
        bank: BANK,
    });
    assert.equal(result.mode, 'baseline');
});

test('a follow-up survey keeps trend anchors and asks about the low concern', async () => {
    const result = await selectQuestions({
        schoolId: 'school',
        audience: 'teacher',
        subjectId: 'S1',
        reviewPeriod: REVIEW_PERIOD,
        surveys: [surveyOf()],
        settings: SUPPORT_SETTINGS_DEFAULTS,
        bank: BANK,
    });
    assert.equal(result.mode, 'follow_up');
    assert.deepEqual(refIds(result), ['A1', 'A2', 'FU1', 'B1']);
    assert.deepEqual(result.focusKeys, ['effort']);
    assert.equal(result.anchorCount, 2);
    assert.equal(result.comparable, true);
});

test('a short survey drops the follow-up before dropping a trend anchor', async () => {
    const result = await selectQuestions({
        schoolId: 'school',
        audience: 'teacher',
        subjectId: 'S1',
        reviewPeriod: REVIEW_PERIOD,
        surveys: [surveyOf()],
        settings: SUPPORT_SETTINGS_DEFAULTS,
        length: 2,
        bank: BANK,
    });
    assert.deepEqual(refIds(result), ['A1', 'A2']);
    assert.equal(result.anchorCount, 2);
});

test('operator-chosen questions must be approved and fit the survey limit', async () => {
    const manual = await selectQuestions({
        schoolId: 'school',
        audience: 'teacher',
        reviewPeriod: REVIEW_PERIOD,
        settings: SUPPORT_SETTINGS_DEFAULTS,
        bank: BANK,
        overrides: ['A1', 'B1'],
    });
    assert.equal(manual.mode, 'manual');
    assert.deepEqual(refIds(manual), ['A1', 'B1']);

    await assert.rejects(
        selectQuestions({
            schoolId: 'school',
            audience: 'teacher',
            reviewPeriod: REVIEW_PERIOD,
            settings: SUPPORT_SETTINGS_DEFAULTS,
            bank: BANK,
            overrides: ['NOT-IN-BANK'],
        }),
        (error) => error.code === 'QUESTION_NOT_ELIGIBLE',
    );

    await assert.rejects(
        selectQuestions({
            schoolId: 'school',
            audience: 'teacher',
            reviewPeriod: REVIEW_PERIOD,
            settings: SUPPORT_SETTINGS_DEFAULTS,
            length: 2,
            bank: BANK,
            overrides: ['A1', 'A2', 'B1'],
        }),
        (error) => error.code === 'SURVEY_TOO_LONG',
    );
});

test('an audience with no approved questions fails loudly', async () => {
    await assert.rejects(
        selectQuestions({
            schoolId: 'school',
            audience: 'parent',
            reviewPeriod: REVIEW_PERIOD,
            settings: SUPPORT_SETTINGS_DEFAULTS,
            bank: [],
        }),
        (error) => error.status === 500 && error.code === 'BANK_EMPTY',
    );
});

/* ------------------------- survey rounds and counts ----------------------- */

test('a first round is fixed, and later rounds stay inside their audience wording', () => {
    const teacherFirst = questionsForRound({ audience: 'teacher', round: 1 });
    const parentFirst = questionsForRound({ audience: 'parent', round: 1 });
    assert.ok(teacherFirst.length > 0 && parentFirst.length > 0);
    assert.notDeepEqual(
        teacherFirst.map((question) => question.prompt),
        parentFirst.map((question) => question.prompt),
    );

    const previousSurveys = [surveyOf({ scaleValue: 1 })];
    const teacherSecond = questionsForRound({ audience: 'teacher', round: 2, previousSurveys });
    const parentSecond = questionsForRound({ audience: 'parent', round: 2, previousSurveys });
    assert.ok(teacherSecond.some((question) => question.id === 't_f_effort'));
    assert.equal(parentSecond.some((question) => question.id.startsWith('t_')), false);
    assert.equal(teacherSecond.some((question) => question.id.startsWith('p_')), false);
});

test('cycle counts split teacher and parent surveys and ignore unsent drafts', () => {
    const counts = surveyStatusCounts([
        { audience: 'teacher', status: 'submitted' },
        { audience: 'teacher', status: 'sent' },
        { audience: 'teacher', status: 'draft' },
        { audience: 'parent', status: 'submitted' },
        { audience: 'parent', status: 'opened' },
    ]);
    assert.deepEqual(counts, {
        total: 5,
        submitted: 2,
        teacherTotal: 3,
        teacherSubmitted: 1,
        parentTotal: 2,
        parentSubmitted: 1,
        sent: 2,
    });
});

/* ------------------------------- settings --------------------------------- */

test('settings fall back to platform defaults', () => {
    const defaults = effectiveSettings(null);
    assert.equal(defaults.enabled, false);
    assert.deepEqual(defaults.roles, SUPPORT_SETTINGS_DEFAULTS.roles);
    assert.equal(defaults.approvalMode, 'owner_release');

    const merged = effectiveSettings({
        enabled: true,
        roles: [],
        notifications: { reminder: false },
        severityCadence: { watch: 45 },
    });
    assert.equal(merged.enabled, true);
    assert.deepEqual(merged.roles, SUPPORT_SETTINGS_DEFAULTS.roles);
    assert.equal(merged.notifications.reminder, false);
    assert.equal(merged.notifications.planPublished, true);
    assert.equal(merged.severityCadence.watch, 45);
    assert.equal(merged.severityCadence.intensive, 14);
});

test('roles[] is honoured everywhere a role check happens', () => {
    const dual = { _id: 'U1', role: 'teacher', roles: ['teacher', 'admin'] };
    assert.deepEqual(userRoles(dual), ['teacher', 'admin']);
    assert.equal(isSupportAdmin(dual), true);
    assert.equal(isSupportAdmin({ role: 'teacher', roles: [] }), false);
    assert.equal(isCounselor({ role: 'teacher', roles: ['counselor'] }), true);

    const settings = { roles: ['counselor'] };
    assert.equal(canParticipate(settings, { role: 'teacher', roles: ['teacher', 'counselor'] }), true);
    assert.equal(canParticipate(settings, { role: 'teacher', roles: [] }), false);
    assert.equal(canParticipate(settings, { role: 'nurse', roles: ['admin'] }), true);
});

test('student age and survey default follow the date of birth', () => {
    const at = new Date('2026-11-13T12:00:00.000Z');
    assert.equal(studentAge({ dateOfBirth: '2015-11-13' }, at), 11);
    assert.equal(studentAge({ dateOfBirth: '2015-11-14' }, at), 10);
    assert.equal(studentAge({ dob: 'not-a-date' }, at), null);
    assert.equal(studentAge({}, at), null);
    assert.equal(studentAge({ dateOfBirth: '1800-01-01' }, at), null);

    const settings = { ...SUPPORT_SETTINGS_DEFAULTS };
    assert.equal(studentSurveyDefault(settings, { dateOfBirth: '2015-11-13' }), true);
    assert.equal(studentSurveyDefault({ ...settings, studentAgeMin: 12 }, { dateOfBirth: '2015-11-13' }), false);
    assert.equal(studentSurveyDefault(settings, {}), false);
});

test('review cadence falls back to the support interval when a severity is unknown', () => {
    const settings = { ...SUPPORT_SETTINGS_DEFAULTS };
    assert.equal(reviewCadenceFor(settings, 'watch'), 60);
    assert.equal(reviewCadenceFor(settings, 'intensive'), 14);
    assert.equal(reviewCadenceFor(settings, 'unknown'), 30);
    assert.equal(reviewCadenceFor({}, 'watch'), 30);
});

test('the academic period is the month the plan is written in', () => {
    assert.deepEqual(
        academicPeriodFor('2026-2027', new Date('2026-01-05T08:00:00.000Z')),
        { month: 1, academicYear: '2026-2027' },
    );
    assert.deepEqual(
        academicPeriodFor('  2026-2027  ', new Date('2026-11-13T08:00:00.000Z')),
        { month: 11, academicYear: '2026-2027' },
    );
});

/* ------------------------------ approval ---------------------------------- */

const approvalUser = (id, role, roles = []) => ({ _id: id, role, roles });

const caseDoc = {
    _id: 'C1',
    owner: { _id: 'OWNER' },
    homeroomTeacher: 'HOMEROOM',
    counselor: { _id: 'COUNSELOR' },
    participants: [{ role: 'counselor', user: { _id: 'ASSISTANT' } }],
};

test('owner release lets the case owner or homeroom teacher approve only', () => {
    const settings = { ...SUPPORT_SETTINGS_DEFAULTS, approvalMode: 'owner_release' };
    assert.equal(canApproveVersion({ caseDoc, user: approvalUser('OWNER', 'teacher'), settings }), true);
    assert.equal(canApproveVersion({ caseDoc, user: approvalUser('HOMEROOM', 'teacher'), settings }), true);
    assert.equal(canApproveVersion({ caseDoc, user: approvalUser('COUNSELOR', 'counselor'), settings }), false);
    assert.equal(canApproveVersion({ caseDoc, user: approvalUser('ASSISTANT', 'counselor'), settings }), false);
    assert.equal(canApproveVersion({ caseDoc, user: {}, settings }), false);
});

test('counselor approval adds the assigned counselor, admin approval removes everyone else', () => {
    const counselorMode = { ...SUPPORT_SETTINGS_DEFAULTS, approvalMode: 'counselor_approve' };
    const canWith = (user) => canApproveVersion({ caseDoc, user, settings: counselorMode });
    assert.equal(canWith(approvalUser('OWNER', 'teacher')), true);
    assert.equal(canWith(approvalUser('COUNSELOR', 'counselor')), true);
    assert.equal(canWith(approvalUser('ASSISTANT', 'counselor')), true);
    assert.equal(canWith(approvalUser('STRANGER', 'teacher')), false);

    const adminMode = { ...SUPPORT_SETTINGS_DEFAULTS, approvalMode: 'admin_approve' };
    assert.equal(canApproveVersion({ caseDoc, user: approvalUser('OWNER', 'teacher'), settings: adminMode }), false);
    assert.equal(
        canApproveVersion({ caseDoc, user: approvalUser('ADMIN', 'teacher', ['admin']), settings: adminMode }),
        true,
    );
    assert.equal(
        canApproveVersion({ caseDoc, user: approvalUser('SUPER', 'super_admin'), settings: adminMode }),
        true,
    );
});

/* ------------------------------ serializers ------------------------------- */

test('a survey response can be shown without its answers', () => {
    const doc = {
        _id: 'SV1',
        audience: 'parent',
        status: 'submitted',
        round: 2,
        month: 10,
        academicYear: '2026-2027',
        questions: [{
            id: 'q1',
            key: 'effort',
            domain: 'academic',
            kind: 'scale',
            scaleMax: 4,
            prompt: 'Prompt',
            promptAr: 'نص',
            required: true,
        }],
        answers: [{ questionId: 'q1', scaleValue: 3 }],
        deliveryMethod: 'printed',
        deliveryState: 'handed_over',
    };
    const withAnswers = serializeSurvey(doc);
    assert.equal(withAnswers.answers.length, 1);
    assert.equal(withAnswers.revision, 1);
    assert.equal(withAnswers.noConcerns, false);

    const withoutAnswers = serializeSurvey(doc, { includeAnswers: false });
    assert.deepEqual(withoutAnswers.answers, []);
    assert.equal(withoutAnswers.deliveryMethod, 'printed');
    assert.equal(withoutAnswers.deliveryState, 'handed_over');
});

test('plan check-ins merge per task and scope, and progress counts both', () => {
    assert.equal(checkInKey('task-1', 'home'), 'home:task-1');
    const plan = {
        _id: 'PL1',
        currentVersion: 3,
        status: 'published',
        headline: 'Headline',
        headlineAr: 'عنوان',
        summary: 'Summary',
        goals: [{
            id: 'G1',
            concern: 'effort',
            title: 'Goal',
            homeTasks: [{ id: 'shared', title: 'Home task' }],
            classTasks: [{ id: 'shared', title: 'Class task' }],
        }],
    };
    const serialized = serializePlan(plan, [
        { taskId: 'shared', scope: 'home', status: 'done', note: 'finished', updatedAt: '2026-11-01' },
        { taskId: 'shared', scope: 'class', status: 'need_help', note: '', updatedAt: '2026-11-02' },
    ]);
    assert.equal(serialized.version, 3);
    assert.equal(serialized.headlineAr, 'عنوان');
    assert.equal(serialized.summaryAr, '');
    assert.equal(serialized.goals[0].homeTasks[0].status, 'done');
    assert.equal(serialized.goals[0].homeTasks[0].note2, 'finished');
    assert.equal(serialized.goals[0].classTasks[0].status, 'need_help');
    assert.deepEqual(serialized.homeProgress, { total: 1, done: 1, needHelp: 0 });
    assert.deepEqual(serialized.classProgress, { total: 1, done: 0, needHelp: 1 });
});

test('student and respondent summaries expose only display fields', () => {
    const student = studentSummary({
        _id: 'ST1',
        firstName: 'Sara',
        lastName: 'Hassan',
        gender: 'female',
        academicYear: '2026-2027',
        currentClass: { name: '5A', grade: 5, section: 'A' },
    });
    assert.deepEqual(student, {
        id: 'ST1',
        name: 'Sara Hassan',
        firstName: 'Sara',
        lastName: 'Hassan',
        gender: 'female',
        class: '5A',
        grade: 5,
        section: 'A',
        academicYear: '2026-2027',
    });
    assert.equal(studentSummary(null), null);

    const respondent = serializeRespondent({
        _id: 'R1',
        kind: 'internal_teacher',
        teacher: { firstName: 'Omar', lastName: 'Ali', email: 'omar@example.com' },
        sharedFieldThatMustNotLeak: 'secret',
    });
    assert.equal(respondent.name, 'Omar Ali');
    assert.equal(respondent.email, 'omar@example.com');
    assert.equal(respondent.sharedFieldThatMustNotLeak, undefined);
});
