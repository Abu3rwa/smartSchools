/**
 * studentSlice.js — Barrel re-export file.
 *
 * All student-related code has been split into focused modules:
 *   - studentCoreSlice.js        → Student CRUD + photo management
 *   - studentCredentialsSlice.js  → Login creation, password reset, invites
 *   - studentPromotionSlice.js    → Promotion queue, decisions, re-enrollment
 *
 * This file re-exports everything so existing imports remain unchanged.
 */

// Default export = core reducer (registered in store as "students")
export { default } from './studentCoreSlice';

// Core: CRUD, photo, selectors, actions
export * from './studentCoreSlice';

// Credentials: login/invite thunks (no reducer, fire-and-forget)
export * from './studentCredentialsSlice';

// Promotion: queue, decisions, re-enrollment
export * from './studentPromotionSlice';
