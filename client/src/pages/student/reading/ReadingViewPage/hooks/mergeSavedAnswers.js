/**
 * Server answers only fill keys the student has not touched, so a reload after
 * unlocking the gate never wipes answers that are still being written.
 */
export const mergeSavedAnswers = (current = {}, saved = {}) => {
  const merged = { ...(current || {}) };
  Object.entries(saved || {}).forEach(([key, value]) => {
    if (!(key in merged)) merged[key] = value;
  });
  return merged;
};
