const EXAM_CATEGORIES = new Set([
    'exam',
    'midterm',
    'final',
    'midterm_exam',
    'final_exam',
    'semester_exam',
    'monthly_test',
    'test'
]);

export const normalizeGradeCategoryKey = (category) =>
    String(category || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export const getDefaultMaxMarksForCategory = (category) => {
    const normalizedCategory = normalizeGradeCategoryKey(category);
    if (normalizedCategory === 'project') return 20;
    if (EXAM_CATEGORIES.has(normalizedCategory)) return 25;
    return 10;
};

export const getMaxMarksFromSchoolConfig = (categoryMaxMarks, category) => {
    const value = Number(categoryMaxMarks?.[normalizeGradeCategoryKey(category)]);
    return Number.isFinite(value) && value > 0 ? value : null;
};

export const resolveCategoryMaxMarks = (category, categoryMaxMarks = null) =>
    getMaxMarksFromSchoolConfig(categoryMaxMarks, category)
    ?? getDefaultMaxMarksForCategory(category);
