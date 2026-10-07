export const SPELLING_CURRICULUM_GRADES = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];

export function getNextSpellingGrade(grade) {
    const index = SPELLING_CURRICULUM_GRADES.indexOf(grade);
    return index >= 0 ? SPELLING_CURRICULUM_GRADES[index + 1] || null : null;
}

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
