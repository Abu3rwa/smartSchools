# Plan: Lesson Plan Draft Persistence

## Overview
To prevent data loss due to browser refreshes, crashes, or accidental modal closures, we will implement a local storage-based persistence layer. This will cache the teacher's progress in real-time and restore it when they return to the lesson plan editor.

## 1. Persistence Strategy

### Key Structure
Drafts will be keyed by user, school, and lesson ID to avoid collisions:
`lp_draft_${schoolId}_${teacherId}_${lessonId || 'new'}`

### Data Scope
- **Persist**: All text fields, selected standards, stages, and `contextText`.
- **Exclude**: `materialFile` (binary files cannot be stored in LocalStorage).
- **Metadata**: Include a `lastSaved` timestamp to handle stale drafts.

## 2. Architectural Components

### A. Utility: `utils/lessonPlanPersistence.js`
A clean functional utility to handle the raw LocalStorage interactions:
- `saveDraft(schoolId, userId, lessonId, data)`
- `getDraft(schoolId, userId, lessonId)`
- `clearDraft(schoolId, userId, lessonId)`
- `clearAllUserDrafts(schoolId, userId)`

### B. Custom Hook: `hooks/useLessonPlanPersistence.js`
A hook to be used within the `LessonPlanPage` or `LessonPlanFormModal`:
- **Auto-Save**: Uses a debounced `useEffect` to save changes to `formData` as the user types.
- **Draft Detection**: Provides a `hasDraft` state.
- **Restore Logic**: A `restore()` function that merges draft data back into the active form state.

## 3. User Experience (UX)

### New Lesson Flow
1. User clicks "New Lesson".
2. System checks for a `new` draft.
3. If found, automatically restore it (or show a small "Draft restored" toast with an "Undo" option).

### Existing Lesson Flow
1. User clicks "Edit" on a lesson.
2. System checks for a draft specific to that `lessonId`.
3. If the draft's timestamp is newer than the lesson's `updatedAt` from the server, show a prompt:
   > "You have unsaved changes from [Time]. Would you like to restore them?"
   - [Restore] [Discard]

## 4. Implementation Steps

1.  **Create Utility**: Implement `client/src/utils/lessonPlanPersistence.js`.
2.  **Create Hook**: Implement `client/src/hooks/useLessonPlanPersistence.js` with `lodash.debounce`.
3.  **Integrate with Modal**:
    *   Add a "Restore Draft" check when the modal opens.
    *   Add the debounced save trigger to `setFormData` changes.
4.  **Integrate with Submit**:
    *   Call `clearDraft()` inside the successful `createLesson` and `updateLesson` thunk handlers in `LessonPlanPage`.
5.  **Clean up**: Implement a strategy to clear drafts older than 7 days to keep LocalStorage lean.

## 5. Maintainability Considerations
- **Versioned Drafts**: Add a version key to the draft object. If the form schema changes in the future, we can safely invalidate old, incompatible drafts.
- **Separation of Concerns**: The `LessonPlanFormModal` remains a "dumb" component regarding storage; it just receives the data. The `LessonPlanPage` (the container) handles the persistence logic via the hook.
