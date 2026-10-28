/**
 * A submitted draft read as an essay: paragraphs in the order the assignment
 * asked for, with no section headings. Sections that no longer exist in the
 * assignment (an older config) are appended so nothing disappears from view.
 */
export const essayParagraphs = ({ assignment, sections = [] }) => {
  const rows = (sections || [])
    .map((row) => ({
      key: row?.key || "",
      index: Number(row?.index) || 0,
      text: String(row?.text || "").trim(),
    }))
    .filter((row) => row.text);

  const definitions = assignment?.sections || [];
  const used = new Set();
  const ordered = [];

  for (const definition of definitions) {
    rows
      .filter((row) => row.key === definition.key)
      .sort((a, b) => a.index - b.index)
      .forEach((row) => {
        ordered.push(row);
        used.add(`${row.key}:${row.index}`);
      });
  }

  rows
    .filter((row) => !used.has(`${row.key}:${row.index}`))
    .sort((a, b) => a.key.localeCompare(b.key) || a.index - b.index)
    .forEach((row) => ordered.push(row));

  return ordered;
};
