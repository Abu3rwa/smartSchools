/**
 * Client-side companion to server/services/writingAssistantLogic.js.
 * Only what the interface needs to show before the server answers; the server
 * stays the authority on whether a draft may be submitted.
 */

export const countWords = (text) => {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 0;
  return cleaned.split(' ').filter(Boolean).length;
};

export const slotId = (section) => `${section?.key}:${Number(section?.index) || 0}`;

/** Live totals for the workspace footer and the submit sheet. */
export const draftReadiness = ({ assignment, sections = [] }) => {
  const definitions = assignment?.sections || [];
  const counts = new Map();
  const perSection = sections.map((row) => {
    const words = countWords(row?.text);
    counts.set(row?.key, (counts.get(row?.key) || 0) + 1);
    return { key: row?.key, index: Number(row?.index) || 0, words };
  });

  const totalWords = perSection.reduce((sum, row) => sum + row.words, 0);
  const missing = [];
  const short = [];
  const tooFew = [];

  for (const definition of definitions) {
    const seen = counts.get(definition.key) || 0;
    const rows = perSection.filter((row) => row.key === definition.key);
    if (definition.required && seen === 0) {
      missing.push({ key: definition.key, label: definition.label });
      continue;
    }
    const minCount = definition.required ? Math.max(Number(definition.minCount) || 1, 1) : 0;
    if (definition.repeatable && seen > 0 && seen < minCount) {
      tooFew.push({ key: definition.key, label: definition.label, needed: minCount - seen });
    }
    if (definition.required && rows.some((row) => row.words === 0)) {
      short.push({ key: definition.key, label: definition.label, empty: true });
    }
    if (definition.minWords > 0) {
      for (const row of rows) {
        if (row.words < definition.minWords) {
          short.push({
            key: definition.key,
            label: definition.label,
            words: row.words,
            minWords: definition.minWords,
          });
        }
      }
    }
  }

  const minWords = Number(assignment?.minWords) || 0;
  const maxWords = Number(assignment?.maxWords) || 0;
  const belowRange = minWords > 0 && totalWords < minWords;
  const aboveRange = maxWords > 0 && totalWords > maxWords;

  return {
    totalWords,
    perSection,
    missingRequired: missing,
    shortSections: short,
    belowMinCount: tooFew,
    belowRange,
    aboveRange,
  };
};

/** Tracker steps come from the server as keys; the interface supplies the words. */
export const trackerTranslationKey = (step) => `writing:student.tracker.${step?.key}`;

export const nextActionTranslationKey = (action) => `writing:student.actions.${action?.action}`;

/** The board funnel groups the server summary already reports. */
export const BOARD_GROUPS = [
  'notStarted',
  'awaitingAssessment',
  'awaitingPublish',
  'revising',
  'readyForNotebook',
  'notebookToCheck',
  'completed',
];

export const stageTone = (stage) => {
  if (stage === 'completed') return 'is-done';
  if (stage === 'submitted' || stage === 'feedback_ready' || stage === 'awaiting_notebook_check') {
    return 'is-waiting';
  }
  if (stage === 'ready_for_notebook' || stage === 'feedback_published' || stage === 'compared') {
    return 'is-ready';
  }
  if (stage === 'revising') return 'is-active';
  return 'is-idle';
};
