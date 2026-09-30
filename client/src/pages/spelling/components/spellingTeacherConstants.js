export const PASSAGE_STATUS_COLOR = { draft: 'warning', approved: 'info', queued: 'info', sent: 'success', failed: 'error' };

export const isSkippedSpellingAttempt = (attempt) => attempt?.skipped === true || (
    attempt?.skipped === undefined && !String(attempt?.studentInput ?? '').trim()
);
