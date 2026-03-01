import { format } from 'date-fns';

export const MONTHS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
];

export const CATEGORY_FILTER_OPTIONS = [
    'Classwork',
    'Homework',
    'Test',
    'Quiz',
    'Project'
];

export const AI_LANGUAGE_OPTIONS = ['english', 'arabic', 'bilingual'];

export const AI_RECIPIENT_OPTIONS = ['mother', 'father', 'student', 'teacher'];

export const DEFAULT_AI_RECIPIENTS = {
    mother: true,
    father: true,
    student: false,
    teacher: true
};

export const createDefaultAIRecipients = () => ({ ...DEFAULT_AI_RECIPIENTS });

export const createDefaultGradeForm = (students = []) => {
    const studentGrades = {};
    students.forEach((student) => {
        studentGrades[student._id] = { marks: '', notes: '' };
    });

    return {
        date: format(new Date(), 'yyyy-MM-dd'),
        title: '',
        category: 'Classwork',
        customCategory: '',
        maxMarks: 10,
        studentGrades
    };
};
