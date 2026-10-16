const normalizeTerm = (value) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export const findVocabularyMatches = (text, vocabulary) => {
  if (!text || !Array.isArray(vocabulary) || vocabulary.length === 0) return [];

  const vocabularyByTerm = new Map();
  vocabulary.forEach((item) => {
    if (item.original) vocabularyByTerm.set(normalizeTerm(item.original), item);
    if (item.simple && normalizeTerm(item.simple) !== normalizeTerm(item.original)) {
      vocabularyByTerm.set(normalizeTerm(item.simple), item);
    }
  });

  const terms = [...vocabularyByTerm.keys()].sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [];

  const escapedTerms = terms.map((term) => term
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+'));
  const matcher = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapedTerms.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu');
  const matches = [];
  let match;

  while ((match = matcher.exec(text)) !== null) {
    const start = match.index + match[1].length;
    const end = start + match[2].length;
    matches.push({
      start,
      end,
      term: match[2],
      vocabulary: vocabularyByTerm.get(normalizeTerm(match[2])),
    });
    matcher.lastIndex = end;
  }

  return matches;
};
