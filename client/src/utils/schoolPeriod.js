const DEFAULT_ACADEMIC_YEAR_START_MONTH = 8;

export const inferAcademicYear = (date = new Date(), startMonth = DEFAULT_ACADEMIC_YEAR_START_MONTH) => {
    const currentMonth = date.getMonth() + 1;
    const startYear = currentMonth >= startMonth ? date.getFullYear() : date.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
};

export const inferSemester = (date = new Date()) => (date.getMonth() >= 7 ? 1 : 2);

// The working academic context follows the school's active period, resolved at
// boot. Personal browser preferences must not silently override it, so the old
// localStorage keys are retired rather than read.
export const retireLegacyPeriodPrefs = (storage) => {
    if (!storage) return;
    storage.removeItem('currentAcademicYear');
    storage.removeItem('selectedSemester');
};

export const applySchoolPeriod = (state, period) => {
    if (!period) return;
    if (period.academicYear) {
        state.currentAcademicYear = period.academicYear;
        state.schoolCurrentYear = period.academicYear;
    }
    if (period.semester === 1 || period.semester === 2) {
        state.selectedSemester = period.semester;
        state.schoolCurrentSemester = period.semester;
    }
};