export const SUBJECT_TYPES = [
    { value: 'core', labelKey: 'types.core' },
    { value: 'elective', labelKey: 'types.elective' },
    { value: 'extra', labelKey: 'types.extra' }
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
