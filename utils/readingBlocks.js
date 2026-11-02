import crypto from 'node:crypto';

import { countWords } from '../services/readingGate/settings.js';

/**
 * The server-side twin of the client's readingPresentation helpers. The text a
 * student is scored against must be the exact block they saw, so both sides
 * build levels and blocks with this same logic (a parity test guards it).
 */
const normalizeTerm = (value) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

const normalizeSections = (sections) => [...(sections || [])]
  .sort(byOrder)
  .map((section) => ({
    order: section.order,
    title: section.title || '',
    text: section.text || '',
  }));

export const buildReadingLevels = (content) => {
  const levels = Array.isArray(content?.readingLevels) ? content.readingLevels : [];
  const mapped = levels
    .filter((level) => String(level?.text || '').trim() || level?.sections?.length)
    .map((level) => {
      const sections = normalizeSections(level.sections);
      const text = String(level.text || '');
      return {
        targetLevel: level.targetLevel,
        text,
        sections,
        vocabularySubstitutions: level.vocabularySubstitutions || [],
        wordCount: Number.isFinite(Number(level.wordCount))
          ? Number(level.wordCount)
          : countWords(sections.length ? sections.map((section) => section.text).join('\n\n') : text),
      };
    });
  if (mapped.length) return mapped;
  const fallbackText = String(content?.simplifiedContent || content?.text?.originalText || '');
  return [{
    targetLevel: content?.targetLevel ?? null,
    text: fallbackText,
    sections: normalizeSections(content?.text?.sections),
    vocabularySubstitutions: [],
    wordCount: countWords(fallbackText),
  }];
};

/**
 * Build levels straight from a stored text, without the student-specific
 * vocabulary work. Mirrors the level selection inside getSimplifiedForStudent.
 */
export const buildLevelsForTextDocument = (text) => {
  const source = typeof text?.toObject === 'function' ? text.toObject() : (text || {});
  return buildReadingLevels({
    readingLevels: (source.simplifiedVersions || []).map((version) => ({
      targetLevel: version.targetLevel,
      text: version.simplifiedText,
      sections: [],
      vocabularySubstitutions: version.vocabularySubstitutions || [],
    })),
    simplifiedContent: source.originalText,
    targetLevel: source.originalComplexity ?? null,
    text: { originalText: source.originalText, sections: source.sections || [] },
  });
};

export const findLevelIndex = (levels, targetLevel) => {
  if (!levels.length) return 0;
  const index = levels.findIndex((level) => level.targetLevel === targetLevel);
  return index < 0 ? 0 : index;
};

export const mergeVocabulary = (enriched, levelVocabulary) => {
  const byTerm = new Map();
  const remember = (item, priority) => {
    const original = normalizeTerm(item?.original);
    if (!original) return;
    const existing = byTerm.get(original);
    if (existing && existing.priority >= priority) return;
    byTerm.set(original, { ...item, priority });
  };
  (enriched || []).forEach((item) => remember(item, 2));
  (levelVocabulary || []).forEach((item) => remember(item, 1));
  const merged = [...byTerm.values()].map((item) => ({ ...item }));
  for (const item of merged) delete item.priority;
  return merged;
};

export const toParagraphs = (text) => String(text || '')
  .split(/\n{2,}/)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean);

export const readingBlocksFor = (level) => {
  if (level.sections.length) {
    return level.sections.map((section) => ({
      key: `s-${section.order}`,
      title: section.title,
      text: section.text,
    }));
  }
  return toParagraphs(level.text).map((paragraph, index) => ({
    key: `p-${index}`,
    title: '',
    text: paragraph,
  }));
};

/** One hash for the exact block a student read: level, key and text. */
export const readingTextHash = ({ targetLevel, blockKey, text }) => crypto
  .createHash('sha256')
  .update(`${targetLevel ?? ''}|${blockKey}|${text}`)
  .digest('hex');

/** A timeline or bullet list is suggested off: lists are unnatural to read aloud. */
export const looksLikeListPart = (block) => {
  const lines = String(block?.text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  const listy = lines.filter((line) => /^(\d{3,4}|\d{1,3}[.)]\s|[-*•])/.test(line)).length;
  return listy / lines.length >= 0.5;
};

export const suggestedPartKeys = (blocks = []) => blocks
  .filter((block) => !looksLikeListPart(block))
  .map((block) => block.key);
