/**
 * practiceSlice.js — Barrel re-export file.
 *
 * All practice-related code has been split into focused modules:
 *   - practiceCoreSlice.js      → Assignments, question generation, answer submission
 *   - practiceHistorySlice.js   → Practice history, review queue, assessment results
 *
 * This file re-exports everything so existing imports remain unchanged.
 */

import { clearCoreError } from './practiceCoreSlice';
import { clearHistoryError } from './practiceHistorySlice';
import { selectPracticeAssignmentsLoading } from './practiceCoreSlice';
import { selectPracticeHistoryLoading } from './practiceHistorySlice';

// Default export = core reducer (registered in store as "practice")
export { default } from './practiceCoreSlice';

// Core: assignments, question gen, answer submit, selectors, actions
export * from './practiceCoreSlice';

// History: history, review queue, assessment results, selectors, actions
export * from './practiceHistorySlice';

// Composed selector: loading is true when ANY practice-domain operation is loading
// (preserves the original shared `loading` boolean behaviour)
export const selectPracticeLoading = (state) =>
    selectPracticeAssignmentsLoading(state) || selectPracticeHistoryLoading(state) || false;

// Composed action: clears errors in both core and history slices
// (preserves the original clearError which cleared state.error + state.reviewQueueError)
export const clearError = () => (dispatch) => {
    dispatch(clearCoreError());
    dispatch(clearHistoryError());
};
