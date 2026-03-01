export const SUBJECT_TYPES = [
    { value: 'core', label: 'Core' },
    { value: 'elective', label: 'Elective' },
    { value: 'extra', label: 'Extra-curricular' }
];

export const DEFAULT_SUBJECT_FORM = {
    name: '',
    code: '',
    description: '',
    dailyMaxMarks: 10,
    maxMarks: 100,
    passingMarks: 40,
    type: 'core'
};

export const createDefaultSubjectForm = () => ({ ...DEFAULT_SUBJECT_FORM });
