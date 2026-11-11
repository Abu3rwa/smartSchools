import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    matchStudentsInText,
    normalizeNameToken,
    rosterNames,
} from '../services/plpObservationCaptureService.js';

const ROSTER = [
    { _id: 's1', firstName: 'Ahmed', lastName: 'Hassan' },
    { _id: 's2', firstName: 'Sara', lastName: 'Mahmoud' },
    { _id: 's3', firstName: 'Ahmed', lastName: 'Khalil' },
    { _id: 's4', firstName: 'فاطمة', lastName: 'علي' },
    { _id: 's5', firstName: 'Omar', lastName: 'Youssef' },
    { _id: 's6', firstName: 'ليلى', lastName: 'حسن' },
];

test('a full name wins over a bare first name', () => {
    const result = matchStudentsInText('Ahmed Hassan helped the new student today.', ROSTER);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].studentId, 's1');
    assert.equal(result.matches[0].matchType, 'full');
    assert.deepEqual(result.ambiguous, []);
});

test('a unique first name is matched on its own', () => {
    const result = matchStudentsInText('Sara stayed focused during the group task.', ROSTER);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].studentId, 's2');
    assert.equal(result.matches[0].matchedText, 'Sara');
});

test('a first name shared by two students is never guessed', () => {
    const result = matchStudentsInText('Ahmed was very patient with his partner.', ROSTER);
    assert.equal(result.matches.length, 0);
    assert.equal(result.ambiguous.length, 1);
    assert.deepEqual([...result.ambiguous[0].candidateIds].sort(), ['s1', 's3']);
});

test('a full name resolves an otherwise ambiguous first name', () => {
    const result = matchStudentsInText('Ahmed Khalil stayed back to tidy the class.', ROSTER);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].studentId, 's3');
    assert.deepEqual(result.ambiguous, []);
});

test('two students in one sentence are both found', () => {
    const result = matchStudentsInText('Omar and Sara helped the new student feel welcome.', ROSTER);
    assert.deepEqual(result.matches.map((match) => match.studentId).sort(), ['s2', 's5']);
});

test('Arabic spelling variants and diacritics still match', () => {
    assert.equal(normalizeNameToken('فاطِمَة'), normalizeNameToken('فاطمة'));
    const result = matchStudentsInText('فَاطِمَة ساعدت زميلتها في الدرس.', ROSTER);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].studentId, 's4');
});

test('Latin names are case-insensitive and tolerate punctuation', () => {
    const result = matchStudentsInText('Today, OMAR, finished his work early.', ROSTER);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].studentId, 's5');
});

test('words that only contain a name do not match', () => {
    const result = matchStudentsInText('The classroom was calm and orderly.', ROSTER);
    assert.equal(result.matches.length, 0);
    assert.deepEqual(result.ambiguous, []);
});

test('a name said twice is reported once', () => {
    const result = matchStudentsInText('Sara helped Sara with the poster.', ROSTER);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].studentId, 's2');
});

test('roster names are listed for prompt scrubbing', () => {
    assert.deepEqual(rosterNames(ROSTER), [
        'Ahmed Hassan',
        'Sara Mahmoud',
        'Ahmed Khalil',
        'فاطمة علي',
        'Omar Youssef',
        'ليلى حسن',
    ]);
});
