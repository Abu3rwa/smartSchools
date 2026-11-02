const SENTENCE_PATTERN = /[^.!?؟۔…]+[.!?؟۔…]+[”’"')\]»]*|[^.!?؟۔…]+$/gu;

/** Split a passage into sentences, honouring the punctuation Arabic texts actually use. */
export const splitSentences = (text) => {
  const matches = String(text || '').match(SENTENCE_PATTERN) || [];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
};

const splitByWords = (paragraph, measure, limit) => {
  const words = String(paragraph.text || '').split(/\s+/).filter(Boolean);
  const pieces = [];
  let index = 0;
  while (index < words.length) {
    let end = index + 1;
    let text = words[index];
    while (end < words.length) {
      const next = `${text} ${words[end]}`;
      const height = Number(measure({
        ...paragraph,
        text: next,
        title: index === 0 ? paragraph.title : '',
      })) || 0;
      if (height > limit) break;
      text = next;
      end += 1;
    }
    pieces.push({
      key: `${paragraph.key}-w${index}`,
      blockKey: paragraph.blockKey,
      instruction: Boolean(paragraph.instruction),
      title: index === 0 ? paragraph.title : '',
      text,
    });
    index = end;
  }
  return pieces;
};

/**
 * Lay reading blocks out on pages using a measurer supplied by the caller, so the same
 * function can be unit-tested and reused for any page or font size. A measurer receives a
 * paragraph `{ title, text }` and returns the rendered height in pixels.
 */
export const paginateBlocks = (blocks, measure, { pageHeight } = {}) => {
  const list = Array.isArray(blocks)
    ? blocks.filter((block) => String(block?.text || '').trim())
    : [];
  if (!list.length) return [];

  const height = Number(pageHeight);
  const limit = height > 0 ? height : Infinity;
  const pages = [];
  let current = [];
  let used = 0;

  const newPage = () => {
    if (current.length) pages.push({ paragraphs: current });
    current = [];
    used = 0;
  };

  const place = (paragraph) => {
    const measured = Number(measure(paragraph)) || 0;
    if (measured <= limit) {
      if (current.length && used + measured > limit) newPage();
      current.push(paragraph);
      used += measured;
      return;
    }
    splitByWords(paragraph, measure, limit).forEach((piece) => {
      const pieceHeight = Number(measure(piece)) || 0;
      if (current.length && used + pieceHeight > limit) newPage();
      current.push(piece);
      used += pieceHeight;
    });
  };

  list.forEach((block, blockIndex) => {
    const key = String(block.key || `b-${blockIndex}`);
    const base = {
      key,
      blockKey: block.key || key,
      instruction: Boolean(block.instruction),
      title: block.title || '',
      text: String(block.text || ''),
    };
    if ((Number(measure(base)) || 0) <= limit) {
      place(base);
      return;
    }
    const sentences = splitSentences(base.text);
    const units = sentences.length > 1 ? sentences : [base.text];
    units.forEach((text, index) => {
      place({
        ...base,
        key: units.length > 1 ? `${key}-s${index}` : key,
        title: index === 0 ? base.title : '',
        text,
      });
    });
  });

  newPage();
  return pages;
};
