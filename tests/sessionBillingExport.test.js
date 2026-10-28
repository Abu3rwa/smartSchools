import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildStatementCsv,
    buildStudentsCsv,
    csvNumberCell,
    csvTextCell
} from '../services/sessionBillingExportService.js';

const overview = (overrides = {}) => ({
    settings: { currency: 'USD' },
    students: [
        {
            studentId: 's1',
            name: 'Ruvan Alhaj',
            rangeSessions: 3,
            rangeMinutes: 150.4,
            rangeCharged: 100,
            rangePaid: 40.5,
            balance: -59.5,
            lastAt: new Date('2026-10-20T12:00:00Z')
        }
    ],
    ...overrides
});

test('csv cells quote separators, quotes and line breaks', () => {
    assert.equal(csvTextCell('plain'), 'plain');
    assert.equal(csvTextCell('Alhaj, Ruvan'), '"Alhaj, Ruvan"');
    assert.equal(csvTextCell('He said "hi"'), '"He said ""hi"""');
    assert.equal(csvTextCell('line one\nline two'), '"line one\nline two"');
});

test('csv text cells neutralise spreadsheet formulas', () => {
    assert.equal(csvTextCell('=1+1'), "'=1+1");
    assert.equal(csvTextCell('+964 770'), "'+964 770");
    assert.equal(csvTextCell('@here'), "'@here");
    // A negative number stays a number, so spreadsheets do not read it as text.
    assert.equal(csvNumberCell(-59.5), '-59.50');
    assert.equal(csvNumberCell(150.4, 0), '150');
    assert.equal(csvNumberCell(undefined), '');
});

test('students csv has a header and one row per student', () => {
    const csv = buildStudentsCsv(overview());
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'Student,Sessions,Minutes,Charged,Paid,Balance,Currency,Last activity');
    assert.equal(lines[1], 'Ruvan Alhaj,3,150,100.00,40.50,-59.50,USD,2026-10-20');
    assert.equal(lines.length, 2);
});

test('students csv carries the school currency and escapes names', () => {
    const csv = buildStudentsCsv(overview({
        settings: { currency: 'AED' },
        students: [{
            ...overview().students[0],
            name: 'Alhaj, "Ruvan"',
            lastAt: null
        }]
    }));
    assert.match(csv, /AED,,?$/);
    assert.match(csv, /"Alhaj, ""Ruvan"""/);
});

test('statement csv lists charges, manual lessons and payments', () => {
    const csv = buildStatementCsv({
        currency: 'USD',
        student: { name: 'Ruvan Alhaj' },
        entries: [
            {
                kind: 'charge',
                occurredAt: new Date('2026-10-01T10:00:00Z'),
                minutes: 60,
                hourlyRate: 40,
                amount: 40,
                balanceAfter: -40,
                status: 'active',
                source: 'auto',
                sessionTitle: 'Fractions, decimals',
                note: 'Good work'
            },
            {
                kind: 'payment',
                occurredAt: new Date('2026-10-03T10:00:00Z'),
                amount: 100,
                balanceAfter: 60,
                status: 'active',
                method: 'bank-transfer',
                reference: 'TRX-9',
                note: ''
            },
            {
                kind: 'charge',
                occurredAt: new Date('2026-10-04T10:00:00Z'),
                minutes: 45,
                hourlyRate: 40,
                amount: 30,
                balanceAfter: 30,
                status: 'void',
                source: 'manual',
                sessionTitle: 'Off-platform lesson',
                note: '',
                voidReason: 'Wrong student'
            }
        ]
    });
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'Date,Type,Detail,Minutes,Hourly rate,Amount,Currency,Balance after,Status,Note');
    assert.equal(lines[1], '2026-10-01,Lesson,"Fractions, decimals",60,40.00,40.00,USD,-40.00,Active,Good work');
    assert.match(lines[2], /^2026-10-03,Payment,Payment \(bank transfer\) — TRX-9,,,100\.00,USD,60\.00,Active,$/);
    assert.match(lines[3], /^2026-10-04,Manual lesson,Off-platform lesson,45,40\.00,30\.00,USD,30\.00,Voided,Void reason: Wrong student$/);
});
