export const DEFAULT_STUDENT_GROUPING_REPORT_SETTINGS = Object.freeze({
    showSummaryMetrics: true,
    showHeatmapTable: true,
    showTopNeedIntervention: true,
    showTopStrongStandards: true,
    showStudentTable: true,
    showSuggestedActivities: true,
    showNotStartedStudents: true,
    showTrendColumn: true,
    showAttemptsColumn: true,
    showOverrideColumn: true
});

export const STUDENT_GROUPING_REPORT_SETTING_KEYS = Object.freeze(
    Object.keys(DEFAULT_STUDENT_GROUPING_REPORT_SETTINGS)
);

export const normalizeStudentGroupingReportSettings = (candidate = {}) => {
    const source = candidate && typeof candidate === 'object' ? candidate : {};

    return STUDENT_GROUPING_REPORT_SETTING_KEYS.reduce((acc, key) => {
        const fallback = DEFAULT_STUDENT_GROUPING_REPORT_SETTINGS[key];
        acc[key] = typeof source[key] === 'boolean' ? source[key] : fallback;
        return acc;
    }, {});
};