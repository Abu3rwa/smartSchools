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

test('combined csv expands one row into a list, a word and per-source rows', async () => {
    const { parseCsvTable, expandCombinedRows, buildTemplateCsv, validateListRows, validateWordRows, validateSourceRows } = await import('../utils/vocabCsv.js');
    const csv = buildTemplateCsv('combined');
    const table = parseCsvTable(csv, 'combined');
    const { listRows, wordRows, sourceRows } = expandCombinedRows(table.rows);
    assert.equal(listRows.length, 1);
    assert.equal(wordRows.length, 1);
    assert.equal(sourceRows.length, 1);
    const lists = validateListRows(listRows);
    assert.deepEqual(lists.errors, []);
    assert.deepEqual(validateWordRows(wordRows, new Set(['S1-L1'])).errors, []);
    assert.deepEqual(validateSourceRows(sourceRows, new Set(['S1-L1'])).errors, []);
    const loose = parseCsvTable('list_id,word,part_of_speech\nS2-L3,seek,v.\nS2-L3,wages,n.\n', 'combined');
    const expanded = expandCombinedRows(loose.rows);
    assert.equal(expanded.listRows.length, 1);
    assert.equal(validateListRows(expanded.listRows).valid[0].title, 'Semester 2 - List 3');
    assert.equal(expanded.sourceRows.length, 0);
});

// ---- Phases 2-6 ----

test('spelling is strict; the base word is a near miss unless the list accepts it', async () => {
    const { gradeSpelling, NEAR_MISS_MESSAGE } = await import('../utils/vocabPractice.js');
    const wages = { word: 'wages', baseWord: 'wage', form: 'plural' };
    assert.equal(gradeSpelling({ answer: ' WAGES ', ...wages }).correct, true);
    const near = gradeSpelling({ answer: 'wage', ...wages });
    assert.deepEqual([near.correct, near.nearMiss, near.message], [false, true, NEAR_MISS_MESSAGE]);
    assert.equal(gradeSpelling({ answer: 'wage', ...wages, acceptBaseForm: true }).correct, true);
    assert.equal(gradeSpelling({ answer: 'wag', ...wages }).correct, false);
    assert.equal(gradeSpelling({ answer: 'data', word: 'analysis', baseWord: '', form: '' }).nearMiss, undefined);
});

test('grading: match, fill, part of speech and mcq; sentences stay pending', async () => {
    const { gradeAnswer } = await import('../utils/vocabPractice.js');
    const word = { _id: 'w1', word: 'debate', partOfSpeech: ['v', 'n'], baseWord: '', form: '' };
    assert.equal(gradeAnswer({ type: 'match', word, chosenWord: { _id: 'w1', word: 'debate' } }).correct, true);
    assert.equal(gradeAnswer({ type: 'match', word, chosenWord: { _id: 'w2', word: 'union' } }).correct, false);
    assert.ok(gradeAnswer({ type: 'match', word }).error);
    assert.equal(gradeAnswer({ type: 'fill', word, body: { answer: 'Debate' } }).correct, true);
    assert.equal(gradeAnswer({ type: 'pos', word, body: { answer: 'n.' } }).correct, true);
    assert.equal(gradeAnswer({ type: 'pos', word, body: { answer: 'adj' } }).correct, false);
    const mcq = { correct: 'B', explanation: 'because', options: [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }] };
    const right = gradeAnswer({ type: 'mcq', mcq, body: { answer: 'b' } });
    assert.deepEqual([right.correct, right.explanation, right.correctAnswer], [true, 'because', 'y']);
    assert.equal(gradeAnswer({ type: 'mcq', mcq, body: { answer: 'A' } }).correct, false);
    assert.ok(gradeAnswer({ type: 'mcq', mcq, body: { answer: 'D' } }).error);
    const sentence = gradeAnswer({ type: 'use_it', word, body: { answer: 'I will debate it.' } });
    assert.deepEqual([sentence.correct, sentence.status], [null, 'pending']);
    assert.ok(gradeAnswer({ type: 'use_it', word, body: { answer: 'x'.repeat(501) } }).error);
});

test('mastery needs the threshold in a row; a miss resets it; idle words need review', async () => {
    const { applyAnswer, effectiveState } = await import('../utils/vocabPractice.js');
    const now = new Date('2026-01-10T00:00:00Z');
    let m = applyAnswer(null, true, { threshold: 2, now });
    assert.equal(effectiveState(m, { threshold: 2, now }), 'practicing');
    m = applyAnswer(m, true, { threshold: 2, now });
    assert.equal(effectiveState(m, { threshold: 2, now }), 'mastered');
    m = applyAnswer(m, false, { threshold: 2, now });
    assert.equal(effectiveState(m, { threshold: 2, now }), 'practicing');
    assert.equal(m.consecutiveCorrect, 0);
    m = applyAnswer(applyAnswer(m, true, { now }), true, { now });
    const later = new Date('2026-01-20T00:00:00Z');
    assert.equal(effectiveState(m, { threshold: 2, inactivityDays: 7, now: later }), 'needs_review');
    assert.equal(effectiveState(null, {}), 'not_started');
});

test('weak words are ordered first', async () => {
    const { orderWords } = await import('../utils/vocabPractice.js');
    const states = { a: 'mastered', b: 'not_started', c: 'practicing', d: 'needs_review' };
    const words = ['a', 'b', 'c', 'd'].map((id) => ({ id, word: id, listId: 'S1-L1' }));
    assert.deepEqual(orderWords(words, (w) => states[w.id]).map((w) => w.id), ['c', 'd', 'b', 'a']);
});

test('missed words come back in the session and leave after the threshold', async () => {
    const { createQueue, recordResult, currentItem, isDone } = await import('../client/src/utils/vocabSession.js');
    const words = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, word: id }));
    let q = createQueue(words, 2);
    q = recordResult(q, false);
    assert.equal(q.items.length, 5);
    assert.equal(q.items[3].word.id, 'a');
    q = recordResult(q, true); q = recordResult(q, true); q = recordResult(q, true);
    assert.equal(currentItem(q).word.id, 'a');
    q = recordResult(q, true);
    assert.equal(q.items.length, 2);
    q = recordResult(q, true);
    assert.equal(currentItem(q).word.id, 'a');
    q = recordResult(q, true);
    assert.ok(isDone(q));
    assert.ok(q.missed.has('a'));
});

test('audio fallback order: chosen voice, other recordings, never another word, then text-to-speech', async () => {
    const { planAudio, playChain, needsBaseWordNotice, baseWordNotice } = await import('../client/src/utils/vocabAudio.js');
    const audio = { dictionaries: { webster: { us: 'w-us' }, longman: { uk: 'l-uk', us: 'l-us' }, oxford: { us: 'o-us', uk: 'o-uk' } } };
    assert.deepEqual(planAudio(audio, 'longman-uk'), ['l-uk', 'o-us', 'o-uk', 'l-us', 'w-us']);
    assert.deepEqual(planAudio(audio, 'default'), ['o-us', 'o-uk', 'l-us', 'l-uk', 'w-us']);
    assert.deepEqual(planAudio({ dictionaries: {} }, 'oxford-us'), []);
    const played = []; const spoken = []; const notices = [];
    playChain({ urls: ['a', 'b'], text: 'word', onFallback: (k) => notices.push(k), play: (url, { onFail }) => { played.push(url); onFail(); return {}; }, speak: (t) => spoken.push(t) });
    assert.deepEqual(played, ['a', 'b']);
    assert.deepEqual(spoken, ['word']);
    assert.deepEqual(notices, ['other', 'tts']);
    const word = { form: 'plural', baseWord: 'wage', audio };
    assert.equal(needsBaseWordNotice(word), true);
    assert.equal(needsBaseWordNotice({ ...word, audio: { dictionaries: {} } }), false);
    assert.equal(needsBaseWordNotice({ form: '', baseWord: '', audio }), false);
    assert.match(baseWordNotice(word), /the single word "wage"\. This word is a plural/);
});

test('mcq csv: scope single, multiple and ALL; invalid scope, bad answers and duplicates are row errors', async () => {
    const { parseCsvTable, validateMcqRows, buildTemplateCsv } = await import('../utils/vocabCsv.js');
    const known = new Set(['S1-L3', 'S1-L4']);
    const header = 'question_id,scope,word,question,option_a,option_b,option_c,option_d,correct,explanation\n';
    const run = (rows) => validateMcqRows(parseCsvTable(header + rows, 'mcq').rows, known);
    const ok = run('q1,S1-L3,,Q?,a,b,c,d,A,\nq2,S1-L3;S1-L4,,Q?,a,b,,,B,\nq3,all,,Q?,a,b,c,d,D,why\n');
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.valid.map((q) => [q.scopeAll, q.listIds.length]), [[false, 1], [false, 2], [true, 0]]);
    const bad = run('q4,S9-L1,,Q?,a,b,c,d,A,\nq5,S1-L3,,Q?,a,b,,,C,\nq6,S1-L3,,Q?,a,a,c,d,A,\nq1,S1-L3,,Q?,a,b,c,d,A,\nq1,S1-L3,,Q?,a,b,c,d,A,\nq7,,,Q?,a,b,c,d,A,\nq8,S1-L3,,Q?,a,b,c,d,E,\n');
    const byRow = (row) => bad.errors.filter((e) => e.row === row).map((e) => e.column);
    assert.ok(byRow(2).includes('scope'));
    assert.ok(byRow(3).includes('correct'));
    assert.ok(byRow(4).includes('option_b'));
    assert.ok(byRow(6).includes('question_id'));
    assert.ok(byRow(7).includes('scope'));
    assert.ok(byRow(8).includes('correct'));
    assert.equal(bad.valid.length, 1);
    const template = parseCsvTable(buildTemplateCsv('mcq'), 'mcq');
    assert.deepEqual(validateMcqRows(template.rows, new Set(['S1-L1', 'S1-L2', 'S1-L3', 'S1-L4'])).errors, []);
});

test('mcq scope matching and shuffling keep every option', async () => {
    const { mcqInScope, shuffle } = await import('../utils/vocabPractice.js');
    assert.equal(mcqInScope({ scopeAll: true, listIds: [] }, ['S1-L1']), true);
    assert.equal(mcqInScope({ scopeAll: false, listIds: ['S1-L3', 'S1-L4'] }, ['S1-L4']), true);
    assert.equal(mcqInScope({ scopeAll: false, listIds: ['S1-L3'] }, ['S2-L3']), false);
    assert.deepEqual(shuffle(['A', 'B', 'C', 'D']).sort(), ['A', 'B', 'C', 'D']);
});

test('reports match the logged attempts', async () => {
    const r = await import('../utils/vocabReports.js');
    const at = (student, word, listId, correct, given = '', extra = {}) => ({ student, word, listId, correct, given, sessionId: 's1', createdAt: new Date('2026-01-01'), type: 'spelling', timeMs: 6000, ...extra });
    const attempts = [at('u1', 'w1', 'S1-L1', true), at('u1', 'w1', 'S1-L1', false, 'wage'), at('u2', 'w1', 'S1-L1', false, 'wage'), at('u2', 'w2', 'S1-L1', true), at('u1', 'w2', 'S1-L1', null, 'my sentence', { type: 'use_it' })];
    const [row] = r.classOverview(attempts, ['S1-L1'], 4);
    assert.deepEqual([row.participants, row.attempts, row.correct, row.accuracyPct, row.participationPct], [2, 4, 2, 50, 50]);
    const words = new Map([['w1', { word: 'wages', listId: 'S1-L1' }], ['w2', { word: 'seek', listId: 'S1-L1' }]]);
    const [top] = r.wordDifficulty(attempts, words);
    assert.deepEqual([top.word, top.attempts, top.wrong, top.topWrongAnswers[0]], ['wages', 3, 2, { answer: 'wage', count: 2 }]);
    const detail = r.studentDetail(attempts.filter((a) => a.student === 'u1'), words, new Map(), {});
    assert.equal(detail.words.find((w) => w.word === 'wages').accuracyPct, 50);
    assert.equal(detail.minutesPracticed, 0.3);
    const mcqAttempts = Array.from({ length: 6 }, (_, i) => ({ type: 'mcq', questionId: 'q1', correct: i === 0, choice: i === 0 ? 'A' : 'C' }));
    const [item] = r.mcqAnalysis(mcqAttempts, new Map([['q1', { question: 'Q?', correct: 'A' }]]));
    assert.deepEqual([item.attempts, item.correctPct, item.choices.C, item.lowScore], [6, 16.7, 5, true]);
    const idle = r.inactiveStudents([{ _id: 'u1', firstName: 'Ali', lastName: 'K' }, { _id: 'u2', firstName: 'Sara' }, { _id: 'u3', firstName: 'Noor' }], new Map([['u1', new Date('2026-01-09')], ['u2', new Date('2025-12-01')]]), 7, new Date('2026-01-10'));
    assert.deepEqual(idle.map((s) => s.name), ['Sara', 'Noor']);
});

test('report csv exports keep Arabic and neutralise spreadsheet formulas', async () => {
    const { reportToCsv } = await import('../services/vocabularyReportService.js');
    const csv = reportToCsv({ name: 'inactive', rows: [{ name: 'سارة', lastPracticed: null }, { name: '=HYPERLINK("x")', lastPracticed: '2026-01-02' }] });
    assert.ok(csv.startsWith('\uFEFF'));
    assert.match(csv, /سارة,never/);
    assert.match(csv, /'=HYPERLINK/);
});

test('audio checker refuses private and local addresses', async () => {
    const { isPrivateIp, isPublicHttpUrl } = await import('../services/vocabularyAudioCheck.js');
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.equal(isPrivateIp(ip), true, ip);
    assert.equal(isPrivateIp('8.8.8.8'), false);
    assert.equal(await isPublicHttpUrl('http://127.0.0.1/a.mp3'), false);
    assert.equal(await isPublicHttpUrl('ftp://example.com/a.mp3'), false);
    assert.equal(await isPublicHttpUrl('not a url'), false);
});

test('new vocabulary routes keep students out of teacher tools and staff out of student tools', async () => {
    const { default: router } = await import('../routes/vocabularyRoutes.js');
    const routes = router.stack.filter((layer) => layer.route).map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0],
        guards: layer.route.stack.length
    }));
    for (const path of ['/reports/:name', '/reviews', '/reviews/:id', '/audio-check', '/student/answer', '/student/progress', '/student/mcq']) {
        assert.ok(routes.some((route) => route.path === path), path);
    }
});

test('every downloadable template imports without errors', async () => {
    const v = await import('../utils/vocabCsv.js');
    const lists = v.validateListRows(v.parseCsvTable(v.buildTemplateCsv('lists'), 'lists').rows);
    assert.deepEqual(lists.errors, []);
    const ids = new Set(lists.valid.map((l) => l.listId));
    assert.deepEqual(v.validateWordRows(v.parseCsvTable(v.buildTemplateCsv('words'), 'words').rows, ids).errors, []);
    assert.deepEqual(v.validateSourceRows(v.parseCsvTable(v.buildTemplateCsv('word_sources'), 'word_sources').rows, ids).errors, []);
    const mcq = v.validateMcqRows(v.parseCsvTable(v.buildTemplateCsv('mcq'), 'mcq').rows, ids);
    assert.deepEqual(mcq.errors, []);
    assert.equal(mcq.valid.length, 4);
    const combined = v.expandCombinedRows(v.parseCsvTable(v.buildTemplateCsv('combined'), 'combined').rows);
    assert.deepEqual(v.validateWordRows(combined.wordRows, new Set(combined.listRows.map((l) => l.data.list_id))).errors, []);
});
