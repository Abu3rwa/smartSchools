export const QUESTIONS_PER_PAGE = 3;

export const groupQuestions = (questions = [], perPage = QUESTIONS_PER_PAGE) => {
  const list = Array.isArray(questions) ? questions : [];
  const groups = [];
  for (let index = 0; index < list.length; index += perPage) {
    groups.push(list.slice(index, index + perPage));
  }
  return groups;
};

const questionPages = (kind, chapter, questions) => groupQuestions(questions).map((group, index, groups) => ({
  kind,
  id: `${kind}-${chapter._id}-${index}`,
  chapterId: chapter._id,
  chapterNumber: chapter.chapterNumber,
  questions: group,
  startIndex: index * QUESTIONS_PER_PAGE,
  pageNumber: index + 1,
  pageCount: groups.length,
  isLast: index === groups.length - 1,
}));

/**
 * Turn the chapter summaries and the active chapter's content into the ordered page list
 * the flip book renders. Chapters other than the active one contribute only their title
 * (or lock) page until their content is fetched.
 */
export const buildBookPages = ({
  chapters = [],
  activeChapterId = null,
  content = null,
} = {}) => {
  const list = Array.isArray(chapters) ? chapters : [];
  const completedCount = list.filter((chapter) => chapter.completed).length;
  const pages = [
    {
      kind: 'cover',
      id: 'cover',
      chapterCount: list.length,
      completedCount,
      empty: list.length === 0,
    },
    { kind: 'contents', id: 'contents' },
  ];

  list.forEach((chapter) => {
    if (chapter.locked) {
      pages.push({
        kind: 'locked',
        id: `locked-${chapter._id}`,
        chapterId: chapter._id,
        chapterNumber: chapter.chapterNumber,
        publishAt: chapter.publishAt || null,
      });
      return;
    }

    const titlePage = {
      kind: 'chapter-title',
      id: `title-${chapter._id}`,
      chapterId: chapter._id,
      chapterNumber: chapter.chapterNumber,
      chapter,
    };

    if (chapter._id !== activeChapterId) {
      pages.push(titlePage);
      return;
    }

    pages.push(titlePage);
    const status = content?.status || 'idle';
    if (status === 'loading' || status === 'idle') {
      pages.push({
        kind: 'chapter-loading',
        id: `loading-${chapter._id}`,
        chapterId: chapter._id,
        chapterNumber: chapter.chapterNumber,
      });
      return;
    }
    if (status === 'error') {
      pages.push({
        kind: 'chapter-error',
        id: `error-${chapter._id}`,
        chapterId: chapter._id,
        chapterNumber: chapter.chapterNumber,
        message: content?.error || '',
      });
      return;
    }

    const passagePages = Array.isArray(content?.pages) ? content.pages : [];
    passagePages.forEach((page, index) => {
      pages.push({
        kind: 'passage',
        id: `passage-${chapter._id}-${index}`,
        chapterId: chapter._id,
        chapterNumber: chapter.chapterNumber,
        paragraphs: page.paragraphs || [],
        pageNumber: index + 1,
        pageCount: passagePages.length,
        isLast: index === passagePages.length - 1,
      });
    });

    const gate = content?.gate || { enabled: false, locked: false };
    const thinking = Array.isArray(content?.thinking) ? content.thinking : [];
    const quiz = Array.isArray(content?.quiz) ? content.quiz : [];
    // A gated student gets stripped question arrays, so the server's counts decide
    // whether the chapter has questions and whether its gate page is needed.
    const counts = content?.questionCounts || {};
    const thinkingTotal = Math.max(thinking.length, Number(counts.criticalThinking) || 0);
    const quizTotal = Math.max(quiz.length, Number(counts.comprehension) || 0);
    const hasQuestions = thinkingTotal > 0 || quizTotal > 0;

    if (!hasQuestions) {
      pages.push({
        kind: 'end',
        id: `end-${chapter._id}`,
        chapterId: chapter._id,
        chapterNumber: chapter.chapterNumber,
      });
      return;
    }

    const gatePage = {
      kind: 'gate',
      id: `gate-${chapter._id}`,
      chapterId: chapter._id,
      chapterNumber: chapter.chapterNumber,
      gate,
    };

    if (gate.enabled && gate.locked && gate.lockScope === 'quiz_and_thinking') {
      pages.push(gatePage);
      return;
    }

    if (thinking.length) pages.push(...questionPages('thinking', chapter, thinking));
    if (gate.enabled && gate.locked) {
      if (quizTotal > 0) pages.push(gatePage);
    } else if (quiz.length) {
      pages.push(...questionPages('quiz', chapter, quiz));
    }

    const result = content?.result || null;
    if (result) {
      pages.push({
        kind: 'results',
        id: `results-${chapter._id}`,
        chapterId: chapter._id,
        chapterNumber: chapter.chapterNumber,
        result,
        chapter,
      });
    }
  });

  return pages;
};
