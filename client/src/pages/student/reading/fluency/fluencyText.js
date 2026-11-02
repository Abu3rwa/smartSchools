// Mirrors the server's reference tokenizer so statusMap[i] lands on the word the student saw.
const TOKEN_PATTERN = /\p{N}+(?:[.,]\p{N}+)*(?:st|nd|rd|th)?|\p{L}[\p{L}\p{M}]*(?:['’\u002d\u2013\u2014][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/giu;

export const referenceTokens = (text) => {
  const source = String(text || '');
  const tokens = [];
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    tokens.push({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
};

export const markedTokens = (text, statusMap) => {
  const statuses = String(statusMap || '');
  return referenceTokens(text).map((token, index) => ({
    ...token,
    status: statuses[index] || 'u',
  }));
};

export const issuesByIndex = (issues = []) => new Map(
  issues.map((issue) => [Number(issue.i), String(issue.heard || '')])
);

export const goalDots = (readings, minReadings) => {
  const total = Math.max(0, Number(minReadings) || 0);
  const filled = Math.min(total, Number(readings) || 0);
  return Array.from({ length: total }, (_, index) => index < filled);
};

export const deltaSinceFirst = (latest, first) => {
  if (latest === null || latest === undefined) return null;
  if (first === null || first === undefined) return null;
  return Math.round(Number(latest) - Number(first));
};

export const smoothnessStars = (smoothness) => [1, 2, 3].map(
  (star) => star <= (Number(smoothness) || 0)
);

export const sparklinePoints = (values, width = 180, height = 34, pad = 4) => {
  const numbers = (values || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numbers.length < 2) return '';
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  return numbers.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / (numbers.length - 1);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  }).join(' ');
};

export const signedDelta = (delta) => {
  if (delta === null || delta === undefined) return '';
  return delta > 0 ? `+${delta}` : String(delta);
};
