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

export const KNOWN_GRADE_CATEGORY_KEYS = new Set([
    'classwork', 'homework', 'quiz', 'project', 'participation', 'test', 'exam',
    'midterm', 'final', 'oral', 'practical', 'assignment', 'other', 'daily',
    'weekly', 'monthly_test', 'midterm_exam', 'semester_exam', 'final_exam'
]);
export const CUSTOM_CATEGORY_MAX_LENGTH = 40;
const CUSTOM_CATEGORY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s'’&()/_+-]*$/u;

export const validateCustomCategory = (value) => {
    const category = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!category) {
        return { valid: false, category: '', message: 'Enter a category name.' };
    }
    if (category.length > CUSTOM_CATEGORY_MAX_LENGTH) {
        return {
            valid: false,
            category,
            message: `Category must be ${CUSTOM_CATEGORY_MAX_LENGTH} characters or fewer.`
        };
    }
    if (!CUSTOM_CATEGORY_PATTERN.test(category)) {
        return {
            valid: false,
            category,
            message: 'Category must start with a letter or number and use only letters, numbers, spaces, apostrophes, &, parentheses, /, _, + or -.'
        };
    }
    return { valid: true, category, message: '' };
};

export const getDefaultMaxMarksForCategory = (category) => {
    const normalizedCategory = normalizeGradeCategoryKey(category);
    if (normalizedCategory === 'project') return 20;
    if (EXAM_CATEGORIES.has(normalizedCategory)) return 25;
    return 10;
};

/**
 * A school's own maximum for a category, from GradebookConfig.categories.
 * Only positive numbers count — a stored null or 0 means the school never chose
 * one and the built-in default has to keep applying.
 */
export const getMaxMarksFromSchoolConfig = (categoryMaxMarks, category) => {
    const key = normalizeGradeCategoryKey(category);
    const value = Number(categoryMaxMarks?.[key]);
    return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * The maximum marks a new entry of this category should carry: the school's
 * configured value when it has one, otherwise the app-wide default.
 */
export const resolveCategoryMaxMarks = (category, categoryMaxMarks = null) =>
    getMaxMarksFromSchoolConfig(categoryMaxMarks, category)
    ?? getDefaultMaxMarksForCategory(category);
