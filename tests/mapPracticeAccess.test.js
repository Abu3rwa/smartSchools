import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureStudentOwnsPracticeData, ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';

const classIdA = '507f1f77bcf86cd799439011';
const classIdB = '507f1f77bcf86cd799439012';

test('ensureStudentOwnsPracticeData only allows the logged-in student', async () => {
  const studentModel = {
    findOne: ({ _id, school, user }) => {
      const match = String(_id) === 'student-1' && String(school) === 'school-1' && String(user) === 'user-1';
      return {
        select() { return this; },
        lean: async () => match ? { _id: 'student-1' } : null
      };
    }
  };

  const matching = await ensureStudentOwnsPracticeData({
    req: { user: { _id: 'user-1' }, schoolId: 'school-1' },
    studentId: 'student-1',
    studentModel
  });

  const blocked = await ensureStudentOwnsPracticeData({
    req: { user: { _id: 'user-1' }, schoolId: 'school-1' },
    studentId: 'student-2',
    studentModel
  });

  assert.equal(matching, true);
  assert.equal(blocked, false);
});

test('ensureTeacherCanAccessStudent only permits teachers for their own classes', async () => {
  const studentModel = {
    findOne: ({ _id, school }) => {
      const currentClass = String(_id) === 'student-1' && String(school) === 'school-1'
        ? classIdA
        : String(_id) === 'student-2' && String(school) === 'school-1'
          ? classIdB
          : null;

      return {
        select() { return this; },
        lean: async () => (currentClass ? { currentClass } : null)
      };
    }
  };

  const teacherScope = {
    resolveTeacherProfile: async () => ({ _id: 'teacher-1' }),
    getTeacherClassIds: async () => [classIdA]
  };

  const allowed = await ensureTeacherCanAccessStudent({
    req: { user: { role: 'teacher', _id: 'teacher-user' }, schoolId: 'school-1' },
    studentId: 'student-1',
    studentModel,
    teacherScope
  });

  const denied = await ensureTeacherCanAccessStudent({
    req: { user: { role: 'teacher', _id: 'teacher-user' }, schoolId: 'school-1' },
    studentId: 'student-2',
    studentModel,
    teacherScope
  });

  assert.equal(allowed, true);
  assert.equal(denied, false);
});

test('review queue policy respects teacher scope and keeps class data private', async () => {
  const studentModel = {
    findOne: ({ _id, school }) => {
      const currentClass = String(_id) === 'student-1' && String(school) === 'school-1'
        ? classIdA
        : String(_id) === 'student-2' && String(school) === 'school-1'
          ? classIdB
          : null;

      return {
        select() { return this; },
        lean: async () => (currentClass ? { currentClass } : null)
      };
    }
  };

  const teacherScope = {
    resolveTeacherProfile: async () => ({ _id: 'teacher-1' }),
    getTeacherClassIds: async () => [classIdA]
  };

  const allowed = await ensureTeacherCanAccessStudent({
    req: { user: { role: 'teacher', _id: 'teacher-user' }, schoolId: 'school-1' },
    studentId: 'student-1',
    studentModel,
    teacherScope
  });

  const blocked = await ensureTeacherCanAccessStudent({
    req: { user: { role: 'teacher', _id: 'teacher-user' }, schoolId: 'school-1' },
    studentId: 'student-2',
    studentModel,
    teacherScope
  });

  assert.equal(allowed, true);
  assert.equal(blocked, false);
});
