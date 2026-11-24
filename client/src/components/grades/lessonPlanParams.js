export const LESSON_PLAN_DEBOUNCE_MS = 300;
export const LESSON_PLAN_DEFAULT_LIMIT = 10;
export const LESSON_PLAN_SEARCH_LIMIT = 20;

export const buildLessonPlanParams = ({ classId, subjectId, search } = {}) => {
    const trimmedSearch = String(search || '').trim();
    const params = {
        class: classId,
        subject: subjectId,
        page: 1,
        limit: trimmedSearch ? LESSON_PLAN_SEARCH_LIMIT : LESSON_PLAN_DEFAULT_LIMIT
    };
    if (trimmedSearch) params.search = trimmedSearch;
    return params;
};
