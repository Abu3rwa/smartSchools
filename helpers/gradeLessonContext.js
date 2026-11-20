export const LESSON_TITLE_MAX = 200;
export const LESSON_SUMMARY_MAX = 5000;

const lessonContextError = (message, code) => {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = code;
    return error;
};

/**
 * Shared lesson context for one assessment group. A summary without a title is
 * rejected; a title alone stays valid. Plain text only — callers escape on render.
 */
export const normalizeLessonContext = ({ title, lessonSummary } = {}) => {
    const cleanTitle = String(title ?? '').trim();
    const cleanSummary = String(lessonSummary ?? '').trim();

    if (cleanTitle.length > LESSON_TITLE_MAX) {
        throw lessonContextError(
            `The lesson title must be ${LESSON_TITLE_MAX} characters or fewer.`,
            'LESSON_TITLE_TOO_LONG'
        );
    }
    if (cleanSummary.length > LESSON_SUMMARY_MAX) {
        throw lessonContextError(
            `The lesson summary must be ${LESSON_SUMMARY_MAX} characters or fewer.`,
            'LESSON_SUMMARY_TOO_LONG'
        );
    }
    if (cleanSummary && !cleanTitle) {
        throw lessonContextError(
            'Add a lesson title before saving a lesson summary.',
            'LESSON_TITLE_REQUIRED'
        );
    }

    return { title: cleanTitle, lessonSummary: cleanSummary };
};