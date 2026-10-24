const text = (value) => String(value ?? '').trim();

// MAP calls the question body a stem while Standards calls it questionText; one reader keeps
// the shared answer inputs usable in both flows.
export const getQuestionPrompt = (question) => String(question?.stem ?? question?.questionText ?? '');

export const getOrderingItems = (question) => (Array.isArray(question?.orderingItems) ? question.orderingItems : [])
  .map((item) => ({ id: text(item?.id), text: text(item?.text) }))
  .filter((item) => item.id && item.text);

export const readOrderingOrder = (response) => (Array.isArray(response) ? response : String(response ?? '').split('>'))
  .map((entry) => text(entry && typeof entry === 'object' ? entry.id : entry))
  .filter(Boolean);

export const buildOrderingResponse = (ids) => ids.filter(Boolean);

export const moveOrderingItem = (ids, index, direction) => {
  const target = index + direction;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const getBlankIds = (question) => {
  const fromServer = Array.isArray(question?.blankIds) ? question.blankIds : [];
  const fromPrompt = (getQuestionPrompt(question).match(/\{\{\s*(?:blank:)?\s*([A-Za-z0-9_-]+)\s*\}\}/g) || [])
    .map((token) => token.replace(/[{}]|blank:/g, '').trim());
  const authored = (Array.isArray(question?.blanks) ? question.blanks : [])
    .map((blank) => text(blank?.id))
    .filter(Boolean);
  return [...new Set([...fromServer, ...fromPrompt, ...authored])].filter(Boolean);
};

export const readBlankAnswers = (response) => {
  if (Array.isArray(response)) {
    return new Map(response
      .filter((entry) => entry && typeof entry === 'object' && text(entry.id))
      .map((entry) => [text(entry.id), text(entry.text)]));
  }
  if (response && typeof response === 'object') {
    return new Map(Object.entries(response).map(([id, value]) => [text(id), text(value)]));
  }
  return new Map(String(response ?? '').split('|')
    .map((chunk) => chunk.split('::'))
    .filter(([id, value]) => text(id) && text(value))
    .map(([id, value]) => [text(id), text(value)]));
};

export const buildBlankResponse = (answersById) => [...answersById.entries()]
  .filter(([, value]) => text(value))
  .map(([id, value]) => ({ id, text: value }));

/**
 * The stem keeps the {{blank}} tokens, so the student types into the sentence itself.
 */
export const splitStemByBlanks = (stem, ids) => {
  const segments = [];
  const pattern = /\{\{\s*(?:blank:)?\s*([A-Za-z0-9_-]+)\s*\}\}/g;
  const source = String(stem ?? '');
  let cursor = 0;
  let position = 0;
  let match = pattern.exec(source);
  while (match) {
    if (match.index > cursor) segments.push({ type: 'text', text: source.slice(cursor, match.index) });
    segments.push({ type: 'blank', id: match[1], position: (position += 1) });
    cursor = match.index + match[0].length;
    match = pattern.exec(source);
  }
  if (cursor < source.length) segments.push({ type: 'text', text: source.slice(cursor) });
  if (segments.some((segment) => segment.type === 'blank')) return segments;

  const sentence = source.trim();
  if (!ids.length) return [{ type: 'text', text: sentence }];
  // Legacy rows without tokens still need an input per authored blank, shown under the sentence.
  return [{ type: 'text', text: sentence }, ...ids.map((id, index) => ({ type: 'blank', id, position: index + 1 }))];
};

export const getNumericHint = (question) => question?.numericHint
  || (question?.numericRule ? {
    unit: text(question.numericRule.unit),
    decimalPlaces: question.numericRule.decimalPlaces === '' ? null : Number(question.numericRule.decimalPlaces) || null,
    acceptFractions: Boolean(question.numericRule.allowFractions),
    acceptPercent: Boolean(question.numericRule.allowPercent),
    prompt: ''
  } : null);

export const describeOrderingAnswer = (question, response) => {
  const byId = new Map(getOrderingItems(question).map((item) => [item.id, item.text]));
  return readOrderingOrder(response)
    .map((id) => byId.get(id) || id)
    .join(' > ');
};

export const describeBlankAnswer = (question, response) => {
  const answers = readBlankAnswers(response);
  return getBlankIds(question)
    .map((id) => `${id}: ${answers.get(id) || '—'}`)
    .join('; ');
};

export const isObjectiveAnswerType = (questionType) => (
  ['ordering', 'fill_in_blank', 'numeric_response'].includes(questionType)
);

export const describeStudentAnswer = (question, response) => {
  if (question?.questionType === 'ordering') return describeOrderingAnswer(question, response);
  if (question?.questionType === 'fill_in_blank') return describeBlankAnswer(question, response);
  return text(response);
};

/**
 * Teachers read the key as words, never as opaque ids: the authored order is the answer here.
 */
export const describeCorrectAnswer = (question) => {
  if (question?.questionType === 'ordering') return describeOrderingAnswer(question, question?.correctAnswer);
  if (question?.questionType === 'fill_in_blank') {
    return (Array.isArray(question?.blanks) ? question.blanks : [])
      .map((blank) => `${text(blank?.id)}: ${(Array.isArray(blank?.accepts) ? blank.accepts : []).join(' / ')}`)
      .filter((entry) => entry !== ': ')
      .join('; ');
  }
  if (question?.questionType === 'numeric_response') {
    const rule = question?.numericRule;
    if (!rule) return text(question?.correctAnswer);
    const body = rule.mode === 'range'
      ? `${rule.min} to ${rule.max}`
      : `${text(rule.value)}${text(rule.tolerance) ? ` ± ${rule.tolerance}${rule.mode === 'relative' ? '%' : ''}` : ''}`;
    return `${body}${text(rule.unit) ? ` ${rule.unit}` : ''}`;
  }
  return text(question?.correctAnswer);
};
