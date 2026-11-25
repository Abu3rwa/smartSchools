export const SPELLING_CURRICULUM_GRADES = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];

// One source of truth for the week ceiling per grade. Session start, library
// validation and import validation must agree on what a valid week is.
export const SPELLING_GRADE_MAX_WEEK = Object.freeze({
    KG: 40,
    G1: 36,
    G2: 36,
    G3: 36,
    G4: 36,
    G5: 36
});

export function getNextSpellingGrade(grade) {
    const index = SPELLING_CURRICULUM_GRADES.indexOf(grade);
    return index >= 0 ? SPELLING_CURRICULUM_GRADES[index + 1] || null : null;
}

export const isValidSpellingGrade = (grade) => SPELLING_CURRICULUM_GRADES.includes(grade);

export const isValidSpellingWeek = (grade, week) => {
    const maximum = SPELLING_GRADE_MAX_WEEK[grade];
    return Number.isInteger(week) && week >= 1 && (!maximum || week <= maximum);
};

export function getSpellingGradeProgress(student, grade) {
    const progress = student?.spelling?.progressByGrade?.find((entry) => entry.grade === grade);
    if (progress) {
        return {
            week: progress.week,
            lastWordIndex: progress.lastWordIndex || 0
        };
    }

    if (
        student?.spelling?.currentGrade === grade
        && (student?.spelling?.progressByGrade?.length || 0) === 0
    ) {
        return {
            week: student.spelling.currentWeek,
            lastWordIndex: student.spelling.lastWordIndex || 0
        };
    }

    return { week: null, lastWordIndex: 0 };
}
