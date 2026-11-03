import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBookPages, groupQuestions } from './bookPages.js';

const chapters = [
  { _id: 'a1', chapterNumber: 1, locked: false, text: { title: 'A River' }, completed: true, score: { correctCount: 2, totalCount: 3 } },
  { _id: 'a2', chapterNumber: 2, locked: true, publishAt: '2026-12-01T08:00:00.000Z' },
  { _id: 'a3', chapterNumber: 3, locked: false, text: { title: 'A Mountain' }, completed: false },
];

const readyContent = (overrides = {}) => ({
  status: 'ready',
  pages: [
    { paragraphs: [{ key: 'p-0', text: 'Page one.' }] },
    { paragraphs: [{ key: 'p-1', text: 'Page two.' }] },
  ],
  thinking: [],
  quiz: [],
  gate: { enabled: false, locked: false },
  result: null,
  ...overrides,
});

test('the cover and contents open the book, then chapters run oldest first', () => {
  const pages = buildBookPages({ chapters });
  assert.deepEqual(pages.slice(0, 2).map((page) => page.kind), ['cover', 'contents']);
  assert.equal(pages[0].chapterCount, 3);
  assert.equal(pages[0].completedCount, 1);
  assert.deepEqual(
    pages.filter((page) => page.kind === 'chapter-title').map((page) => page.chapterNumber),
    [1, 3]
  );
});

test('a locked chapter is one page that carries no content', () => {
  const pages = buildBookPages({ chapters });
  const locked = pages.filter((page) => page.kind === 'locked');
  assert.equal(locked.length, 1);
  assert.deepEqual(locked[0], {
    kind: 'locked',
    id: 'locked-a2',
    chapterId: 'a2',
    chapterNumber: 2,
    publishAt: '2026-12-01T08:00:00.000Z',
  });
  const serialized = JSON.stringify(locked[0]);
  assert.equal(serialized.includes('A River'), false);
  assert.equal(serialized.includes('title'), false);
});

test('the active chapter adds passage pages, quiz pages and a results page', () => {
  const quiz = ['q1', 'q2', 'q3', 'q4'].map((id) => ({ _id: id }));
  const pages = buildBookPages({
    chapters,
    activeChapterId: 'a1',
    content: readyContent({ quiz, result: { correctCount: 3, totalCount: 4 } }),
  });
  const kinds = pages.map((page) => page.kind);
  assert.deepEqual(
    kinds,
    ['cover', 'contents', 'chapter-title', 'passage', 'passage', 'quiz', 'quiz', 'results',
      'locked', 'chapter-title']
  );
  const quizPages = pages.filter((page) => page.kind === 'quiz');
  assert.deepEqual(quizPages.map((page) => page.questions.length), [3, 1]);
  assert.equal(quizPages[1].isLast, true);
  assert.equal(pages[pages.length - 1].chapterId, 'a3');
});

test('a locked gate replaces both question pages with one page', () => {
  const pages = buildBookPages({
    chapters,
    activeChapterId: 'a3',
    content: readyContent({
      thinking: [{ _id: 't1' }],
      quiz: [{ _id: 'q1' }],
      gate: { enabled: true, locked: true, lockScope: 'quiz_and_thinking' },
    }),
  });
  const chapterPages = pages.filter((page) => page.chapterId === 'a3');
  assert.deepEqual(chapterPages.map((page) => page.kind), ['chapter-title', 'passage', 'passage', 'gate']);
  const gate = chapterPages[chapterPages.length - 1];
  assert.equal('questions' in gate, false);
  assert.equal(JSON.stringify(gate).includes('q1'), false);
});

test('a quiz-only gate still shows the critical-thinking pages', () => {
  const pages = buildBookPages({
    chapters,
    activeChapterId: 'a3',
    content: readyContent({
      thinking: [{ _id: 't1' }, { _id: 't2' }],
      quiz: [{ _id: 'q1' }],
      gate: { enabled: true, locked: true, lockScope: 'quiz' },
    }),
  });
  const kinds = pages.filter((page) => page.chapterId === 'a3').map((page) => page.kind);
  assert.deepEqual(kinds, ['chapter-title', 'passage', 'passage', 'thinking', 'gate']);
});

test('a stripped gated chapter still ends with its gate page', () => {
  for (const lockScope of ['quiz_and_thinking', 'quiz']) {
    const pages = buildBookPages({
      chapters,
      activeChapterId: 'a3',
      content: readyContent({
        thinking: [],
        quiz: [],
        questionCounts: { comprehension: 2, criticalThinking: 1 },
        gate: { enabled: true, locked: true, lockScope },
      }),
    });
    const chapterPages = pages.filter((page) => page.chapterId === 'a3');
    const kinds = chapterPages.map((page) => page.kind);
    assert.deepEqual(kinds, ['chapter-title', 'passage', 'passage', 'gate']);
    const gate = chapterPages[chapterPages.length - 1];
    assert.equal(gate.kind, 'gate');
    assert.equal('questions' in gate, false);
  }
});

test('a stripped quiz-only gate keeps the thinking pages and skips the quiz pages', () => {
  const pages = buildBookPages({
    chapters,
    activeChapterId: 'a3',
    content: readyContent({
      thinking: [{ _id: 't1' }, { _id: 't2' }, { _id: 't3' }, { _id: 't4' }],
      quiz: [],
      questionCounts: { comprehension: 3, criticalThinking: 4 },
      gate: { enabled: true, locked: true, lockScope: 'quiz' },
    }),
  });
  const kinds = pages.filter((page) => page.chapterId === 'a3').map((page) => page.kind);
  assert.deepEqual(kinds, [
    'chapter-title',
    'passage',
    'passage',
    'thinking',
    'thinking',
    'gate',
  ]);
});

test('a quiz-only gate with no objective questions ends on the last thinking page', () => {
  const pages = buildBookPages({
    chapters,
    activeChapterId: 'a3',
    content: readyContent({
      thinking: [{ _id: 't1' }],
      quiz: [],
      questionCounts: { comprehension: 0, criticalThinking: 1 },
      gate: { enabled: true, locked: true, lockScope: 'quiz' },
    }),
  });
  const kinds = pages.filter((page) => page.chapterId === 'a3').map((page) => page.kind);
  assert.deepEqual(kinds, ['chapter-title', 'passage', 'passage', 'thinking']);
});

test('zero question counts leave the chapter on its end page', () => {
  const pages = buildBookPages({
    chapters,
    activeChapterId: 'a3',
    content: readyContent({
      thinking: [],
      quiz: [],
      questionCounts: { comprehension: 0, criticalThinking: 0 },
      gate: { enabled: true, locked: true, lockScope: 'quiz_and_thinking' },
    }),
  });
  const kinds = pages.filter((page) => page.chapterId === 'a3').map((page) => page.kind);
  assert.deepEqual(kinds, ['chapter-title', 'passage', 'passage', 'end']);
});


test('a chapter with no questions ends without a quiz or gate', () => {
  const pages = buildBookPages({ chapters, activeChapterId: 'a3', content: readyContent() });
  const kinds = pages.filter((page) => page.chapterId === 'a3').map((page) => page.kind);
  assert.deepEqual(kinds, ['chapter-title', 'passage', 'passage', 'end']);
});

test('loading and failed chapters show one retry page', () => {
  const loading = buildBookPages({
    chapters,
    activeChapterId: 'a3',
    content: { status: 'loading' },
  }).filter((page) => page.chapterId === 'a3').map((page) => page.kind);
  assert.deepEqual(loading, ['chapter-title', 'chapter-loading']);

  const failed = buildBookPages({
    chapters,
    activeChapterId: 'a3',
    content: { status: 'error', error: 'Network down' },
  }).filter((page) => page.chapterId === 'a3').map((page) => page.kind);
  assert.deepEqual(failed, ['chapter-title', 'chapter-error']);
});

test('an empty book is just a closed cover and contents', () => {
  const pages = buildBookPages({ chapters: [] });
  assert.deepEqual(pages.map((page) => page.kind), ['cover', 'contents']);
  assert.equal(pages[0].empty, true);
});

test('questions are grouped three to a page', () => {
  assert.deepEqual(groupQuestions([1, 2, 3, 4, 5, 6, 7]).map((group) => group.length), [3, 3, 1]);
  assert.deepEqual(groupQuestions(null), []);
});
