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

export const getDefaultMaxMarksForCategory = (category) => {
    const normalizedCategory = String(category || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (normalizedCategory === 'project') return 20;
    if (EXAM_CATEGORIES.has(normalizedCategory)) return 25;
    return 10;
};
