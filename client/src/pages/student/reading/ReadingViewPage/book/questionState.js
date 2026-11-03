const CLOSED_CODES = new Set(['READING_NOT_PUBLISHED', 'READING_ASSIGNMENT_NOT_FOUND']);

/**
 * What a question page should show: a locked gate wins over a closed reading,
 * and work already submitted stays visible even if the reading later closes.
 */
export const deriveQuestionState = ({
  gateEnabled = false,
  completed = false,
  closedCode = null,
} = {}) => {
  if (completed) return { state: 'submitted', reason: null };
  if (gateEnabled) return { state: 'locked', reason: 'reading_gate' };
  if (CLOSED_CODES.has(String(closedCode || ''))) {
    return { state: 'closed', reason: String(closedCode) };
  }
  return { state: 'ready', reason: null };
};
