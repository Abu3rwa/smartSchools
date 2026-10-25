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

/**
 * The text a student reads comes from the level versions the server prepared, never from the
 * original passage. `readingLevels` is the ordered list; the recommended level is `targetLevel`.
 */
export const buildReadingLevels = (content) => {
  const levels = Array.isArray(content?.readingLevels) ? content.readingLevels : [];
  const mapped = levels
    .filter((level) => String(level?.text || '').trim() || level?.sections?.length)
    .map((level) => ({
      targetLevel: level.targetLevel,
      text: String(level.text || ''),
      sections: normalizeSections(level.sections),
      vocabularySubstitutions: level.vocabularySubstitutions || [],
    }));
  if (mapped.length) return mapped;
  const fallbackText = String(content?.simplifiedContent || content?.text?.originalText || '');
  return [{
    targetLevel: content?.targetLevel ?? null,
    text: fallbackText,
    sections: normalizeSections(content?.text?.sections),
    vocabularySubstitutions: [],
  }];
};

export const findLevelIndex = (levels, targetLevel) => {
  if (!levels.length) return 0;
  const index = levels.findIndex((level) => level.targetLevel === targetLevel);
  return index < 0 ? 0 : index;
};

/** The lesson words the student can tap, with the audio-enriched record winning for each term. */
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
  return [...byTerm.values()].map(({ priority, ...item }) => item);
};

/** A levelled version is one flat passage, so blank lines become the paragraphs students see. */
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
