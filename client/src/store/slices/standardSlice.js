/**
 * standardSlice.js — Barrel re-export file.
 *
 * All standards-related code has been split into focused modules:
 *   - standardCoreSlice.js        → Standards CRUD + import
 *   - standardAssignmentSlice.js  → Assignment CRUD + progress tracking
 *   - sbGradebookSlice.js         → SB Gradebook list, matrix, bulk scores
 *
 * This file re-exports everything so existing imports remain unchanged.
 */

import { selectStandardsCoreLoading } from './standardCoreSlice';
import { selectAssignmentsLoading } from './standardAssignmentSlice';

// Default export = core reducer (registered in store as "standards")
export { default } from './standardCoreSlice';

// Core: CRUD, import, selectors, actions
export * from './standardCoreSlice';

// Assignments: CRUD, progress, selectors, actions
export * from './standardAssignmentSlice';

// SB Gradebook: list, matrix, bulk save, selectors, actions
export * from './sbGradebookSlice';

// Composed selector: loading is true when ANY standards-domain operation is loading
// (preserves the original shared `loading` boolean behaviour)
export const selectStandardsLoading = (state) =>
    selectStandardsCoreLoading(state) || selectAssignmentsLoading(state) || false;
