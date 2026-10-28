/**
 * One CSV cell reader for every teacher import, so a quoted value with commas or
 * line breaks behaves the same in the Reading, Assignments and Writing importers.
 */

export const parseCsvRows = (source) => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"' && value.length === 0 && !closedQuote) {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
      closedQuote = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
      closedQuote = false;
    } else {
      if (closedQuote && !/\s/.test(character)) {
        throw new Error('The CSV has unexpected text after a quoted value.');
      }
      if (!closedQuote) value += character;
    }
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
};

export const normalizeHeader = (header) => header
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

export const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows) => `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

export const MAX_CSV_BYTES = 700 * 1024;
