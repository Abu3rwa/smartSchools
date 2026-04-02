import GradebookConfig, { DEFAULT_CATEGORIES } from '../models/GradebookConfig.js';

/**
 * Get the active gradebook config for a school + academic year.
 * Returns null if none exists (callers should fall back to defaults).
 */
export const getGradebookConfig = async (schoolId, academicYear) => {
    if (!schoolId || !academicYear) return null;

    return GradebookConfig.findOne({ school: schoolId, academicYear, isActive: true }).lean();
};

/**
 * Get config for current school, any active year — convenience for when caller
 * does not know the year yet.
 */
export const getActiveGradebookConfig = async (schoolId) => {
    if (!schoolId) return null;

    return GradebookConfig.findOne({ school: schoolId, isActive: true })
        .sort({ createdAt: -1 })
        .lean();
};

/**
 * Create a new gradebook config. Enforces one active config per school+year.
 */
export const createGradebookConfig = async ({ school, academicYear, semesters, categories, gradingPolicy, createdBy }) => {
    // Deactivate any existing config for the same school + year
    await GradebookConfig.updateMany(
        { school, academicYear },
        { $set: { isActive: false } }
    );

    const config = new GradebookConfig({
        school,
        academicYear,
        semesters: semesters || [],
        categories: Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_CATEGORIES,
        gradingPolicy: gradingPolicy || {},
        isActive: true,
        createdBy
    });

    return config.save();
};

/**
 * Update an existing gradebook config.
 */
export const updateGradebookConfig = async (configId, updates) => {
    const allowed = {};

    if (updates.semesters !== undefined) allowed.semesters = updates.semesters;
    if (updates.categories !== undefined) allowed.categories = updates.categories;
    if (updates.gradingPolicy !== undefined) allowed.gradingPolicy = updates.gradingPolicy;
    if (updates.isActive !== undefined) allowed.isActive = updates.isActive;

    return GradebookConfig.findByIdAndUpdate(configId, { $set: allowed }, { new: true, runValidators: true });
};

/**
 * Clone a config for a new academic year.
 * Copies categories and gradingPolicy; resets semesters to empty (dates need updating).
 */
export const cloneGradebookConfig = async (configId, newAcademicYear, createdBy) => {
    const source = await GradebookConfig.findById(configId).lean();
    if (!source) return null;

    // Deactivate any existing config for the target year
    await GradebookConfig.updateMany(
        { school: source.school, academicYear: newAcademicYear },
        { $set: { isActive: false } }
    );

    const clone = new GradebookConfig({
        school: source.school,
        academicYear: newAcademicYear,
        semesters: [], // dates must be set for the new year
        categories: source.categories,
        gradingPolicy: source.gradingPolicy,
        isActive: true,
        createdBy
    });

    return clone.save();
};

/**
 * Get active categories for a school. Returns defaults if no config exists.
 */
export const getCategories = async (schoolId, academicYear) => {
    const config = await getGradebookConfig(schoolId, academicYear);
    if (config?.categories?.length > 0) {
        return config.categories.filter((c) => c.isActive);
    }
    return DEFAULT_CATEGORIES.filter((c) => c.isActive);
};

/**
 * Resolve semester number for a date using gradebook config, with fallback.
 */
export const resolveSemesterForDate = async (schoolId, date) => {
    if (!schoolId || !date) return null;

    const d = new Date(date);
    const config = await GradebookConfig.findOne({ school: schoolId, isActive: true })
        .sort({ createdAt: -1 })
        .lean();

    if (config?.semesters?.length > 0) {
        for (const semester of config.semesters) {
            if (d >= new Date(semester.startDate) && d <= new Date(semester.endDate)) {
                return semester.number;
            }
        }
    }

    // Fallback: month-based (Aug-Dec = 1, Jan-Jul = 2)
    const month = d.getMonth() + 1;
    return (month >= 8 && month <= 12) ? 1 : 2;
};

/**
 * Resolve exam period type for a date using gradebook config.
 * Returns 'midterm', 'final', or null.
 */
export const resolveExamPeriodForDate = async (schoolId, date) => {
    if (!schoolId || !date) return null;

    const d = new Date(date);
    const config = await GradebookConfig.findOne({ school: schoolId, isActive: true })
        .sort({ createdAt: -1 })
        .lean();

    if (config?.semesters?.length > 0) {
        for (const semester of config.semesters) {
            for (const examPeriod of (semester.examPeriods || [])) {
                if (d >= new Date(examPeriod.startDate) && d <= new Date(examPeriod.endDate)) {
                    return examPeriod.type;
                }
            }
        }
    }

    return null;
};
