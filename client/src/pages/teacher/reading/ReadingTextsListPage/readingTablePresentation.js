const byTextOrder = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export const readingLevelTargets = (text) => [...new Set((text?.simplifiedVersions || [])
  .map((version) => version?.targetLevel)
  .filter((level) => typeof level === 'number' && Number.isFinite(level)))]
  .sort((a, b) => a - b);

const questionLength = (items) => (Array.isArray(items) ? items.length : 0);

export const readingQuestionCounts = (text) => ({
  objective: questionLength(text?.comprehensionQuestions),
  thinking: questionLength(text?.criticalThinkingQuestions),
});

export const readingOwnerName = (text) => {
  const createdBy = text?.createdBy;
  if (!createdBy || typeof createdBy !== 'object') return '';
  return [createdBy.firstName, createdBy.lastName].filter(Boolean).join(' ').trim();
};

export const readingSummary = (texts, assignmentCountBy = () => 0) => ({
  total: texts.length,
  assigned: texts.filter((text) => assignmentCountBy(text._id) > 0).length,
  shared: texts.filter((text) => text.isShared).length,
});

const sortValues = (text, key, assignmentCountBy) => {
  if (key === 'difficulty') return Number(text?.originalComplexity ?? Number.NaN);
  if (key === 'levels') return readingLevelTargets(text).length;
  if (key === 'questions') {
    const { objective, thinking } = readingQuestionCounts(text);
    return objective + thinking;
  }
  if (key === 'assignments') return assignmentCountBy(text?._id);
  if (key === 'added') return new Date(text?.createdAt || 0).getTime();
  return String(text?.title || '');
};

/**
 * Clicking the active column flips the direction; a different column starts ascending,
 * except Added, which is most useful newest first.
 */
export const sortReadings = (texts, key, direction, assignmentCountBy = () => 0) => {
  if (!key) return [...texts];
  const factor = direction === 'desc' ? -1 : 1;
  return [...texts].sort((a, b) => {
    if (key === 'added') {
      return (sortValues(a, key, assignmentCountBy) - sortValues(b, key, assignmentCountBy)) * factor;
    }
    if (key === 'reading') return byTextOrder(sortValues(a, key, assignmentCountBy), sortValues(b, key, assignmentCountBy)) * factor;
    const left = sortValues(a, key, assignmentCountBy);
    const right = sortValues(b, key, assignmentCountBy);
    const leftMissing = Number.isNaN(left);
    const rightMissing = Number.isNaN(right);
    if (leftMissing && rightMissing) return byTextOrder(String(a?.title || ''), String(b?.title || ''));
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    if (left !== right) return (left - right) * factor;
    return byTextOrder(String(a?.title || ''), String(b?.title || ''));
  });
};

export const nextSort = (current, key) => (current.key === key
  ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  : { key, direction: key === 'added' ? 'desc' : 'asc' });

const searchHaystack = (text) => [
  text?.title,
  text?.subjectArea,
  readingOwnerName(text),
  ...(Array.isArray(text?.topicTags) ? text.topicTags : []),
  ...readingLevelTargets(text).map(String),
]
  .filter(Boolean)
  .join(' ')
  .normalize('NFKC')
  .toLocaleLowerCase();

export const filterReadings = (texts, term) => {
  const needle = String(term || '').normalize('NFKC').toLocaleLowerCase().trim();
  if (!needle) return [...texts];
  return texts.filter((text) => searchHaystack(text).includes(needle));
};

