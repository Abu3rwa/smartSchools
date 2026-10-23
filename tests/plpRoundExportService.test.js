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

const readDocxText = async (buffer) => {
    const contents = await JSZip.loadAsync(buffer);
    return (await contents.file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');
};

test('round report prints human labels, the observation log and only this record data', async () => {
    const record = {
        _id: 'record-1',
        academicYear: '2026-2027',
        month: 10,
        status: 'submitted',
        awardDecision: 'selected',
        level: 'strong',
        student: { firstName: 'Ava', lastName: 'Lee', studentId: 'GB-1042' },
        class: { name: 'Grade 5-A' },
        cycle: { title: 'Round 1' },
    };
    const goal = {
        _id: 'goal-1',
        plpRecord: 'record-1',
        goalType: 'character',
        title: 'Practice persistence',
        status: 'active',
        linkedPractice: [{ kind: 'spelling_session', targetId: 'session-1', label: 'Week 4 missed words', detail: '4 of 12 words missed', source: 'teacher' }],
    };
    const otherGoal = { _id: 'goal-2', plpRecord: 'record-9', goalType: 'academic', title: 'Another student goal', status: 'active' };
    const task = { _id: 'task-1', plpRecord: 'record-1', plpGoal: 'goal-1', title: 'Finish one challenge', status: 'submitted_by_student' };
    const evidence = [{
        _id: 'e1',
        plpRecord: 'record-1',
        type: 'observation',
        note: 'Kept going after two failed attempts.',
        createdAt: new Date('2026-10-12T00:00:00.000Z'),
        traitId: { name: 'Persistence' },
        teacher: { firstName: 'Rami', lastName: 'Odeh' },
    }];

    const xml = await readDocxText(await buildPlpRoundReportDocx({
        record, goals: [goal, otherGoal], tasks: [task], evidence, school: { name: 'Green Belt School' },
    }));

    assert.match(xml, /Sent for review/);
    assert.match(xml, /Selected for the award/);
    assert.match(xml, /Submitted by student/);
    assert.match(xml, /Week 4 missed words/);
    assert.match(xml, /Kept going after two failed attempts/);
    assert.match(xml, /Green Belt School/);
    assert.doesNotMatch(xml, /Another student goal/, 'a sibling record must not leak into this report');
    assert.doesNotMatch(xml, /submitted_by_student|not_selected|in_progress/);
});
