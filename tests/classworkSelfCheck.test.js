import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as tick } from 'node:timers/promises';

import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import ClassworkSelfCheck from '../models/ClassworkSelfCheck.js';
import ClassworkSelfCheckResponse from '../models/ClassworkSelfCheckResponse.js';
import {
  DEFAULT_CLASSWORK_RULES,
  buildClassworkRemark,
  computeClassworkScore,
  normalizeClassworkRules,
  pickSelectedRuleIds
} from '../services/classworkSelfCheckScore.js';
import {
  DEFAULT_CLASSWORK_RULES as CLIENT_DEFAULT_RULES,
  buildClassworkRemark as clientBuildRemark,
  calculateClassworkScore
} from '../client/src/components/grades/classworkBehaviorUtils.js';
import {
  getCurrentCheck,
  myChecks,
  saveMyResponse,
  setCheck
} from '../controllers/classworkSelfCheckController.js';
import router from '../routes/classworkSelfCheckRoutes.js';

const schoolId = '507f1f77bcf86cd799439011';
const classId = '507f1f77bcf86cd799439012';
const otherClassId = '507f1f77bcf86cd799439013';
const subjectId = '507f1f77bcf86cd799439014';
const studentId = '507f1f77bcf86cd799439015';
const otherStudentId = '507f1f77bcf86cd799439016';
const userId = '507f1f77bcf86cd799439017';
const teacherId = '507f1f77bcf86cd799439018';
const otherTeacherId = '507f1f77bcf86cd799439019';
const checkId = '507f1f77bcf86cd799439020';

/** A Mongoose-like query: chainable, awaitable, and lean-able. */
const query = (value) => {
  const chain = {
    populate: () => chain,
    select: () => chain,
    sort: () => chain,
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return chain;
};

const mockRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

/** asyncHandler does not return the promise, so wait for the response to land. */
const runController = async (controller, req) => {
  const res = mockRes();
  let finished = false;
  let nextError = null;
  controller(req, res, (error) => {
    finished = true;
    nextError = error || new Error('The controller called next without an error.');
  });
  for (let i = 0; i < 100 && !finished; i += 1) {
    if (res.body) break;
    await tick();
  }
  if (finished) throw nextError;
  return res;
};

const runMiddleware = (middleware, user) => {
  const req = { user, schoolId };
  const res = mockRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
};

const routeOf = (path, method) => router.stack
  .find((layer) => layer.route?.path === path && layer.route.methods[method])?.route;

const openCheckDoc = (overrides = {}) => ({
  _id: checkId,
  school: schoolId,
  class: classId,
  subject: subjectId,
  teacher: userId,
  academicYear: '2025-2026',
  date: new Date('2026-11-04T00:00:00.000Z'),
  maxMarks: 10,
  status: 'open',
  rules: normalizeClassworkRules(DEFAULT_CLASSWORK_RULES),
  ...overrides
});

test('server scoring and remark match the client helper exactly', () => {
  const strippedDefaults = normalizeClassworkRules(DEFAULT_CLASSWORK_RULES).map((rule) => ({
    id: rule.id,
    label: rule.label,
    value: rule.value,
    direction: rule.direction
  }));
  assert.deepEqual(strippedDefaults, CLIENT_DEFAULT_RULES);

  const cases = [
    { maxMarks: 10, selectedRuleIds: [] },
    {
      maxMarks: 10,
      selectedRuleIds: [
        'completed-on-time',
        'active-participation',
        'followed-rules',
        'helpful-teamwork',
        'exceptional-effort'
      ]
    },
    {
      maxMarks: 10,
      selectedRuleIds: [
        'completed-on-time',
        'completed-on-time',
        'talking-out-of-turn',
        'off-task',
        'incomplete-classwork',
        'missing-materials',
        'refusal-to-follow-rules'
      ]
    },
    { maxMarks: 4, selectedRuleIds: ['completed-on-time', 'exceptional-effort'] },
    { maxMarks: 10, selectedRuleIds: ['not-a-real-rule', 'active-participation'] },
    { maxMarks: 0, selectedRuleIds: ['active-participation'] }
  ];

  for (const testCase of cases) {
    const server = computeClassworkScore(testCase);
    const client = calculateClassworkScore({
      ...testCase,
      baseScore: 0,
      rules: DEFAULT_CLASSWORK_RULES
    });
    assert.equal(server.score, client.score);
  }

  assert.equal(
    computeClassworkScore({ maxMarks: 4, selectedRuleIds: ['completed-on-time', 'exceptional-effort'] }).score,
    4
  );
  assert.equal(
    computeClassworkScore({
      maxMarks: 10,
      selectedRuleIds: ['talking-out-of-turn', 'off-task', 'incomplete-classwork', 'missing-materials', 'refusal-to-follow-rules']
    }).score,
    0
  );
});

test('the remark keeps the exact format parent emails parse', () => {
  const { selectedRules } = computeClassworkScore({
    maxMarks: 10,
    selectedRuleIds: ['completed-on-time', 'talking-out-of-turn']
  });
  const remark = buildClassworkRemark(selectedRules);

  assert.equal(remark, 'Completed classwork on time (+4); Disruptive / Talking out of turn (-1)');
  assert.equal(remark, clientBuildRemark(selectedRules));
});

test('only ids from the check snapshot survive, without duplicates', () => {
  assert.deepEqual(
    pickSelectedRuleIds(['active-participation', 'not-a-real-rule', 'active-participation', ''], DEFAULT_CLASSWORK_RULES),
    ['active-participation']
  );
  assert.equal(
    pickSelectedRuleIds(DEFAULT_CLASSWORK_RULES.map((rule) => rule.id), DEFAULT_CLASSWORK_RULES, 3).length,
    3
  );
  assert.deepEqual(pickSelectedRuleIds('not-an-array', DEFAULT_CLASSWORK_RULES), []);
});

test('students can read and write only their own check routes', () => {
  const mine = routeOf('/mine', 'get');
  const save = routeOf('/:id/responses', 'post');
  const current = routeOf('/current', 'get');
  const open = routeOf('/', 'put');
  assert.ok(mine);
  assert.ok(save);
  assert.ok(current);
  assert.ok(open);

  assert.equal(runMiddleware(mine.stack[0].handle, { role: 'student' }).nextCalled, true);
  assert.equal(runMiddleware(save.stack[0].handle, { role: 'student' }).nextCalled, true);
  assert.equal(runMiddleware(current.stack[0].handle, { role: 'student' }).res.statusCode, 403);
  assert.equal(runMiddleware(open.stack[0].handle, { role: 'student' }).res.statusCode, 403);
  assert.equal(runMiddleware(current.stack[0].handle, { role: 'teacher' }).nextCalled, true);
  assert.equal(runMiddleware(open.stack[0].handle, { role: 'admin' }).nextCalled, true);
});

test('a teacher who does not teach the class and subject cannot open a check', async (t) => {
  t.mock.method(Teacher, 'findOne', () => query({ _id: teacherId, user: userId }));
  t.mock.method(Class, 'findById', () => query({
    _id: classId,
    subjects: [{ subject: subjectId, teacher: otherTeacherId }]
  }));
  const create = t.mock.method(ClassworkSelfCheck, 'create', () => {
    throw new Error('a forbidden teacher must never create a check');
  });

  const req = {
    schoolId,
    academicYear: '2025-2026',
    user: { _id: userId, role: 'teacher', uiPreferences: {} },
    body: { classId, subjectId, date: '2026-11-04', open: true, maxMarks: 10 }
  };
  const res = await runController(setCheck, req);

  assert.equal(res.statusCode, 403);
  assert.equal(create.mock.callCount(), 0);
});

test('opening an existing day reopens that document instead of creating a duplicate', async (t) => {
  t.mock.method(ClassworkSelfCheck, 'findOne', () => query({ _id: checkId, status: 'closed' }));
  const update = t.mock.method(ClassworkSelfCheck, 'findByIdAndUpdate', () => query(openCheckDoc()));
  const create = t.mock.method(ClassworkSelfCheck, 'create', () => {
    throw new Error('must not create a second check for the same day');
  });

  const req = {
    schoolId,
    academicYear: '2025-2026',
    user: { _id: userId, role: 'admin', uiPreferences: {} },
    body: { classId, subjectId, date: '2026-11-04', open: true, maxMarks: 10 }
  };
  const res = await runController(setCheck, req);

  assert.equal(res.statusCode, 200);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(String(update.mock.calls[0].arguments[0]), checkId);
  assert.equal(create.mock.callCount(), 0);
});

test('a closed check refuses a late save with 409', async (t) => {
  t.mock.method(ClassworkSelfCheck, 'findOne', () => query(openCheckDoc({ status: 'closed' })));

  const req = {
    schoolId,
    academicYear: '2025-2026',
    user: { _id: userId, role: 'student' },
    params: { id: checkId },
    body: { selectedRuleIds: ['active-participation'] }
  };
  const res = await runController(saveMyResponse, req);

  assert.equal(res.statusCode, 409);
});

test('a student of another class gets 403', async (t) => {
  t.mock.method(ClassworkSelfCheck, 'findOne', () => query(openCheckDoc()));
  t.mock.method(Student, 'findOne', () => query({
    _id: studentId,
    currentClass: otherClassId,
    enrolledClasses: [otherClassId]
  }));

  const req = {
    schoolId,
    academicYear: '2025-2026',
    user: { _id: userId, role: 'student' },
    params: { id: checkId },
    body: { selectedRuleIds: ['active-participation'] }
  };
  const res = await runController(saveMyResponse, req);

  assert.equal(res.statusCode, 403);
});

test('the student save stores ids only and never returns a mark', async (t) => {
  const submittedAt = new Date('2026-11-04T09:00:00.000Z');
  t.mock.method(ClassworkSelfCheck, 'findOne', () => query(openCheckDoc()));
  t.mock.method(Student, 'findOne', () => query({
    _id: studentId,
    currentClass: classId,
    enrolledClasses: [classId]
  }));
  const upsert = t.mock.method(ClassworkSelfCheckResponse, 'findOneAndUpdate', (filter, update) => {
    assert.equal(String(filter.check), checkId);
    assert.equal(String(filter.student), studentId);
    assert.deepEqual(update.$set.selectedRuleIds, ['active-participation', 'completed-on-time']);
    assert.equal(update.$set.mark, undefined);
    return query({ submittedAt });
  });

  const req = {
    schoolId,
    academicYear: '2025-2026',
    user: { _id: userId, role: 'student' },
    params: { id: checkId },
    body: { selectedRuleIds: ['active-participation', 'made-up-rule', 'completed-on-time'] }
  };
  const res = await runController(saveMyResponse, req);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body.data).sort(), ['submitted', 'submittedAt']);
  assert.equal(JSON.stringify(res.body).includes('score'), false);
  assert.equal(JSON.stringify(res.body).includes('"mark"'), false);
  assert.equal(upsert.mock.callCount(), 1);
});

test('the teacher summary lists everyone with the computed mark', async (t) => {
  const check = openCheckDoc();
  t.mock.method(ClassworkSelfCheck, 'findOne', () => query(check));
  t.mock.method(Student, 'find', () => query([
    { _id: studentId, firstName: 'Lina', lastName: 'Hassan' },
    { _id: otherStudentId, firstName: 'Omar', lastName: 'Ali' }
  ]));
  t.mock.method(ClassworkSelfCheckResponse, 'find', () => query([
    { student: studentId, selectedRuleIds: ['completed-on-time'], submittedAt: new Date() }
  ]));

  const req = {
    schoolId,
    academicYear: '2025-2026',
    user: { _id: userId, role: 'admin' },
    query: { classId, subjectId, date: '2026-11-04' }
  };
  const res = await runController(getCurrentCheck, req);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.students.length, 2);
  const [submittedRow, emptyRow] = res.body.data.students;
  assert.equal(submittedRow.submitted, true);
  assert.equal(submittedRow.score, 4);
  assert.equal(submittedRow.remark, 'Completed classwork on time (+4)');
  assert.equal(emptyRow.submitted, false);
  assert.equal(emptyRow.score, 0);
});

test('the student list is scoped to the signed-in student and carries no mark', async (t) => {
  let responseFilter = null;
  const check = openCheckDoc({
    subject: { _id: subjectId, name: 'Social Studies', nameAr: 'الدراسات الاجتماعية' }
  });
  t.mock.method(SchoolCalendarConfig, 'findOne', () => query(null));
  t.mock.method(Student, 'findOne', () => query({
    _id: studentId,
    currentClass: classId,
    enrolledClasses: [classId]
  }));
  t.mock.method(ClassworkSelfCheck, 'find', () => query([check]));
  t.mock.method(ClassworkSelfCheckResponse, 'find', (filter) => {
    responseFilter = filter;
    return query([{ check: checkId, selectedRuleIds: ['active-participation'] }]);
  });

  const req = {
    schoolId,
    academicYear: '2025-2026',
    user: { _id: userId, role: 'student' }
  };
  const res = await runController(myChecks, req);

  assert.equal(res.statusCode, 200);
  assert.equal(String(responseFilter.student), studentId);
  assert.equal(res.body.data.checks[0].submitted, true);
  assert.deepEqual(res.body.data.checks[0].selectedRuleIds, ['active-participation']);
  assert.equal(res.body.data.checks[0].score, undefined);
  assert.equal(res.body.data.checks[0].mark, undefined);
});
