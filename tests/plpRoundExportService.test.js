import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import JSZip from 'jszip';

import { buildPlpRoundReportDocx, buildPlpRoundZip } from '../services/plpRoundExportService.js';

test('round report and archive generate DOCX files for independent student records', async () => {
    const record = {
        _id: 'record-1',
        academicYear: '2026-2027',
        month: 10,
        status: 'in_progress',
        student: { firstName: 'Ava', lastName: 'Lee' },
        class: { name: 'Grade 5-A' },
        cycle: { title: 'Round 1' },
    };
    const goal = {
        _id: 'goal-1',
        plpRecord: 'record-1',
        goalType: 'character',
        title: 'Practice persistence',
        status: 'active',
    };
    const task = {
        _id: 'task-1',
        plpRecord: 'record-1',
        plpGoal: 'goal-1',
        title: 'Finish one challenge',
        status: 'assigned',
    };

    const docx = await buildPlpRoundReportDocx({ record, goals: [goal], tasks: [task] });
    const archive = await buildPlpRoundZip({ records: [record], goals: [goal], tasks: [task] });
    assert.ok(Buffer.isBuffer(docx));
    assert.ok(docx.length > 100);
    assert.ok(Buffer.isBuffer(archive));
    const contents = await JSZip.loadAsync(archive);
    const filenames = Object.keys(contents.files);
    assert.equal(filenames.length, 1);
    assert.match(filenames[0], /^ava-lee-record-1\.docx$/);
    assert.ok((await contents.file(filenames[0]).async('nodebuffer')).length > 100);
});
