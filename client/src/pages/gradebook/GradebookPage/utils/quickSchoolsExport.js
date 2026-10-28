import { resolveCategoryMaxMarks } from './gradebookDefaults.js';

// Categories as they usually appear in QuickSchools. Everything here is only a
// starting value — the category cell stays editable because schools spell them
// differently ("Activities", "Activites", …).
export const QUICK_SCHOOL_CATEGORY_DEFAULTS = {
    classwork: 'Activities',
    homework: 'Assignment',
    quiz: 'Quiz',
    test: 'Tests',
    project: 'Project',
    participation: 'Participation',
    oral: 'Oral',
    practical: 'Practical',
    midterm_exam: 'Midterms',
    final_exam: 'Final Exams'
};

const CATEGORY_ALIASES = {
    classwork: ['daily'],
    test: ['monthly_test'],
    exam: ['semester_exam'],
    midterm_exam: ['midterm'],
    final_exam: ['final']
};

const normalizeKey = (value) =>
    String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export const gradeLevelLabel = (grade) => {
    const number = Number(grade);
    if (!Number.isFinite(number) || number <= 0) return '';
    const lastTwo = number % 100;
    const lastOne = number % 10;
    let suffix = 'th';
    if (lastTwo < 11 || lastTwo > 13) {
        if (lastOne === 1) suffix = 'st';
        else if (lastOne === 2) suffix = 'nd';
        else if (lastOne === 3) suffix = 'rd';
    }
    return `${number}${suffix} Grade`;
};

export const toDateInput = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const categoriesWithGrades = (grades) => {
    const keys = new Set();
    for (const grade of grades || []) {
        const raw = normalizeKey(grade?.category || grade?.gradeType);
        if (!raw) continue;
        keys.add(raw);
        for (const alias of CATEGORY_ALIASES[raw] || []) keys.add(alias);
    }
    return keys;
};

/**
 * One column per app category, in the school's order. Categories the month
 * actually has grades for start enabled; everything else is left for the
 * teacher to tick.
 */
export const buildDefaultColumns = ({
    categories = [],
    categoryMaxMarks = null,
    grades = [],
    today = new Date()
} = {}) => {
    const present = categoriesWithGrades(grades);
    const fallbackEnabled = new Set(['classwork', 'homework']);
    const useFallback = present.size === 0;
    const fixedDate = toDateInput(today);

    return categories.map((category) => {
        const key = normalizeKey(category?.key);
        const label = String(category?.label || category?.key || '').trim() || key;
        const configured = Number(category?.defaultMaxMarks);
        return {
            sourceType: key,
            enabled: useFallback ? fallbackEnabled.has(key) : present.has(key),
            columnName: `${label} ({MMM})`,
            category: QUICK_SCHOOL_CATEGORY_DEFAULTS[key] || label,
            totalMarks: configured > 0 ? configured : resolveCategoryMaxMarks(key, categoryMaxMarks),
            dateRule: 'fixed',
            fixedDate
        };
    });
};

export const semesterNameFor = (academicYear, semester, semesters = []) => {
    const number = Number(semester);
    if (!number) return String(academicYear || '');
    const found = (semesters || []).find((item) => Number(item.number) === number);
    const label = found?.label || `Semester ${number}`;
    return academicYear ? `${academicYear}, ${label}` : label;
};

export const buildDefaultProfile = ({
    className = '',
    subjectName = '',
    subjectCode = '',
    classGrade = null,
    academicYear = '',
    semester = null,
    semesters = [],
    categories = [],
    categoryMaxMarks = null,
    grades = [],
    today = new Date()
} = {}) => ({
    name: `${subjectCode || subjectName || 'Subject'} — ${className || 'Class'}`,
    subjectValue: subjectCode || subjectName || '',
    gradeLevel: gradeLevelLabel(classGrade),
    semester: Number(semester) === 1 || Number(semester) === 2 ? Number(semester) : null,
    semesterName: semesterNameFor(academicYear, semester, semesters),
    columns: buildDefaultColumns({ categories, categoryMaxMarks, grades, today }),
    nameSource: 'externalName',
    skipEmpty: true,
    roundTo: 2
});

/** The body the preview and download endpoints expect. */
export const buildExportRequest = ({
    profile,
    classId,
    subjectId,
    academicYear,
    dateFrom = '',
    dateTo = ''
}) => ({
    profile: {
        classId,
        subjectId,
        academicYear,
        semester: profile.semester,
        subjectValue: profile.subjectValue,
        gradeLevel: profile.gradeLevel,
        semesterName: profile.semesterName,
        columns: profile.columns,
        nameSource: profile.nameSource,
        skipEmpty: profile.skipEmpty,
        roundTo: profile.roundTo
    },
    dateFrom: dateFrom || null,
    dateTo: dateTo || null
});

export const filenameFromDisposition = (header) => {
    if (!header) return '';
    const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (utf) {
        try {
            return decodeURIComponent(utf[1].trim().replace(/^"|"$/g, ''));
        } catch {
            return utf[1].trim();
        }
    }
    const plain = /filename="([^"]+)"/i.exec(header) || /filename=([^;]+)/i.exec(header);
    return plain ? plain[1].trim() : '';
};
