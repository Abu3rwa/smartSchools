/** Feedback the teacher published for this exact slot, matched by key and index. */
export const noteForSlot = (feedback, section) => (
  (feedback?.sections || []).find(
    (row) => row.key === section.key && Number(row.index) === Number(section.index),
  ) || null
);
