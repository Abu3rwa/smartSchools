import test from 'node:test';
import assert from 'node:assert/strict';
import { updateSpellingClassSettings } from '../services/spellingClassSettingsService.js';

test('class spelling settings reject unsupported retest intervals before database access', async () => {
    await assert.rejects(
        () => updateSpellingClassSettings({
            schoolId: 'school-1',
            classId: 'class-1',
            teacherId: 'teacher-1',
            input: { retestIntervalDays: 14 }
        }),
        (error) => error.statusCode === 400 && /retestIntervalDays must be 7, 30, or 60/.test(error.message)
    );
});

test('class spelling settings reject an invalid Gradebook subject ID before database access', async () => {
    await assert.rejects(
        () => updateSpellingClassSettings({
            schoolId: 'school-1',
            classId: 'class-1',
            teacherId: 'teacher-1',
            input: { gradebookSubject: 'not-a-subject-id' }
        }),
        (error) => error.statusCode === 400 && /gradebookSubject must be a valid subject ID/.test(error.message)
    );
});
