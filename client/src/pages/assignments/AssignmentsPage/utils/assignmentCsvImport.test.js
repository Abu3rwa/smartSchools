import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssignmentCsvTemplate, parseAssignmentCsv } from './assignmentCsvImport.js';

test('assignment CSV template parses as a single assignment with multiple links', () => {
    const imported = parseAssignmentCsv(buildAssignmentCsvTemplate());

    assert.equal(imported.title, 'Read chapter 3');
    assert.equal(imported.maxMarks, 10);
    assert.equal(imported.links.length, 1);
    assert.equal(imported.links[0].title, 'Reading');
    assert.equal(imported.links[0].url, 'https://example.com/reading');
    assert.equal(imported.publishNow, false);
    assert.equal(imported.notifyOnAssign, true);
});

test('assignment CSV supports quoted commas, quoted newlines, and multiple links', () => {
    const csv = [
        'title,instructions,due_date,max_marks,links_json',
        '"Read, review, and respond","Read the first line',
        'then answer the questions.",2026-10-30,15,"[{""type"":""external_url"",""title"":""Book"",""url"":""https://example.com/book""},{""type"":""external_url"",""title"":""Video"",""url"":""https://example.com/video""}]"'
    ].join('\r\n');
    const imported = parseAssignmentCsv(csv);

    assert.equal(imported.title, 'Read, review, and respond');
    assert.equal(imported.instructions, 'Read the first line\r\nthen answer the questions.');
    assert.equal(imported.links.length, 2);
});

test('assignment CSV rejects multiple assignment rows', () => {
    assert.throws(
        () => parseAssignmentCsv('title\nAssignment one\nAssignment two'),
        /one assignment at a time/
    );
});

test('assignment CSV rejects invalid dates, URLs, and notification options', () => {
    assert.throws(
        () => parseAssignmentCsv('title,due_date\nAssignment,2026-02-30'),
        /YYYY-MM-DD/
    );
    assert.throws(
        () => parseAssignmentCsv('title,link_url\nAssignment,javascript:alert(1)'),
        /HTTP or HTTPS/
    );
    assert.throws(
        () => parseAssignmentCsv('title,notify_audience\nAssignment,staff'),
        /notify_audience/
    );
});
