import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../middleware/auth.js';
import {
    buildTemplateCsv,
    parseCsvRecords,
    parseCsvTable,
    parsePartOfSpeech,
    validateListRows,
    validateSourceRows,
    validateWordRows
} from '../utils/vocabCsv.js';
import { buildSeedData } from '../utils/vocabSeed.js';
import { resolveSelection } from '../services/vocabularyService.js';

const table = (type, text) => parseCsvTable(text, type).rows;
const LIST_HEADER = 'list_id,semester,list_number,title,lesson_title,order,visible\n';
const WORD_HEADER = 'list_id,word,part_of_speech,form,base_word,example_sentence,student_friendly_meaning,arabic_meaning,notes\n';
const SOURCE_HEADER = 'list_id,word,part_of_speech,source,definition_text,page_url,audio_us_url,audio_uk_url,example_audio_url\n';

test('seed data has 13 lists and 96 words with unique per-semester list ids', () => {
    const { lists, words } = buildSeedData();
    assert.equal(lists.length, 13);
    assert.equal(words.length, 96);
    assert.equal(new Set(lists.map((list) => list.listId)).size, 13);
    assert.ok(lists.some((list) => list.listId === 'S1-L1') && lists.some((list) => list.listId === 'S2-L1'));
    assert.equal(lists.find((list) => list.listId === 'S2-L3').title, 'Semester 2 - List 3');
    const debate = words.find((word) => word.word === 'debate');
    assert.deepEqual(debate.partOfSpeech, ['v', 'n']);
    assert.equal(words.find((word) => word.word === 'wages').baseWord, 'wage');
    assert.equal(words.find((word) => word.word === 'data').form, '');
    assert.equal(words.find((word) => word.word === 'analysis').form, '');
    assert.equal(new Set(words.map((word) => `${word.listId}|${word.normalizedWord}|${word.posKey}`)).size, 96);
});

test('part of speech parsing accepts dual senses and rejects unknown tags', () => {
    assert.deepEqual(parsePartOfSpeech('v./n.'), ['v', 'n']);
    assert.deepEqual(parsePartOfSpeech('adj.'), ['adj']);
    assert.equal(parsePartOfSpeech('noun'), null);
    assert.equal(parsePartOfSpeech(''), null);
});

test('csv parser handles BOM, quoted commas, escaped quotes, line breaks and Arabic', () => {
    const csv = '\uFEFFa,b\r\n"x, y","say ""hi""\nthere"\r\nمرحبا,ok\r\n';
    const records = parseCsvRecords(csv);
    assert.deepEqual(records[0].cells, ['a', 'b']);
    assert.deepEqual(records[1].cells, ['x, y', 'say "hi"\nthere']);
    assert.deepEqual(records[2].cells, ['مرحبا', 'ok']);
    assert.throws(() => parseCsvRecords('a,b\n"open'), /never closed/);
});

test('import rejects files with missing required columns', () => {
    assert.throws(() => parseCsvTable('list_id,word\nS1-L1,x', 'words'), /Missing required column/);
});

test('list validation keeps S1-L1 and S2-L1 distinct and checks ids, semester and duplicates', () => {
    const rows = table('lists', `${LIST_HEADER}S1-L1,1,1,One,,1,true\nS2-L1,2,1,Two,,,yes\nS1-L1,1,1,Dup,,1,true\nS3-L1,1,1,Bad,,1,true\nS2-L2,1,2,Mismatch,,2,true\nS1-L2,1,2,,,2,true`);
    const { valid, errors } = validateListRows(rows);
    assert.deepEqual(valid.map((row) => row.listId), ['S1-L1', 'S2-L1']);
    assert.equal(valid[1].order, 1);
    assert.ok(errors.some((error) => error.column === 'list_id' && /Duplicate/.test(error.message)));
    assert.ok(errors.some((error) => error.column === 'list_id' && /look like/.test(error.message)));
    assert.ok(errors.some((error) => error.column === 'semester'));
    assert.ok(errors.some((error) => error.column === 'title'));
});

test('word validation flags unknown lists, bad pos, bad form and duplicate keys', () => {
    const known = new Set(['S1-L1']);
    const rows = table('words', `${WORD_HEADER}S1-L1,wages,n.,plural,wage,,,,\nS1-L1,Wages,n.,,,,,,\nS9-L1,x,n.,,,,,,\nS1-L1,y,noun,,,,,,\nS1-L1,z,n.,weird,z,,,,\nS1-L1,w,n.,plural,,,,,\nS1-L1,debate,v./n.,,,,,,\nS1-L1,debate,n./v.,,,,,,`);
    const { valid, errors } = validateWordRows(rows, known);
    assert.deepEqual(valid.map((row) => row.word), ['wages', 'debate']);
    assert.equal(valid[0].form, 'plural');
    assert.equal(valid[1].posKey, 'n/v');
    const columns = errors.map((error) => error.column);
    for (const column of ['word', 'list_id', 'part_of_speech', 'form', 'base_word']) assert.ok(columns.includes(column), column);
});

test('source validation requires http(s) urls, a known source and one sense per source', () => {
    const known = new Set(['S1-L1']);
    const rows = table('word_sources', `${SOURCE_HEADER}S1-L1,debris,n.,oxford,pieces,https://x.test/a,,,\nS1-L1,debris,n.,oxford,again,,,,\nS1-L1,debris,n.,collins,x,,,,\nS1-L1,debris,n.,longman,x,ftp://x.test/a.mp3,,,\nS1-L1,debris,n.,webster,,,,,`);
    const { valid, errors } = validateSourceRows(rows, known);
    assert.equal(valid.length, 1);
    assert.equal(errors.length, 4);
    assert.ok(errors.some((error) => /http/.test(error.message)));
    assert.ok(errors.some((error) => /one sense/.test(error.message)));
});

test('templates round-trip through the parser with their own headers', () => {
    for (const type of ['lists', 'words', 'word_sources']) {
        const parsed = parseCsvTable(buildTemplateCsv(type), type);
        assert.ok(parsed.rows.length >= 1);
    }
    const { valid } = validateWordRows(parseCsvTable(buildTemplateCsv('words'), 'words').rows, new Set(['S1-L1', 'S1-L2']));
    assert.equal(valid.length, 2);
});

test('selection resolves only to assigned lists (single, several, all)', () => {
    const assigned = [{ listId: 'S1-L1' }, { listId: 'S2-L1' }, { listId: 'S2-L3' }];
    assert.deepEqual(resolveSelection(assigned, { listIds: ['s1-l1'] }), ['S1-L1']);
    assert.deepEqual(resolveSelection(assigned, { listIds: ['S1-L1', 'S2-L3', 'S1-L5'] }), ['S1-L1', 'S2-L3']);
    assert.deepEqual(resolveSelection(assigned, { all: true }), ['S1-L1', 'S2-L1', 'S2-L3']);
    assert.deepEqual(resolveSelection([], { all: true }), []);
});

test('vocabulary role guards: students blocked from staff routes, staff blocked from student routes', () => {
    const run = (middleware, role) => {
        let nextCalled = false;
        const res = { statusCode: null, status(code) { this.statusCode = code; return this; }, json() { return this; } };
        middleware({ user: { role } }, res, () => { nextCalled = true; });
        return { nextCalled, statusCode: res.statusCode };
    };
    const staff = authorize('admin', 'department_principal', 'teacher');
    assert.equal(run(staff, 'student').statusCode, 403);
    assert.equal(run(staff, 'teacher').nextCalled, true);
    assert.equal(run(authorize('student'), 'teacher').statusCode, 403);
});
