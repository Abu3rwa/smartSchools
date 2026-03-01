export const QUESTION_TYPE_OPTIONS = ['multiple_choice', 'short_answer', 'true_false'];
export const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'];
export const SEMESTER_OPTIONS = [1, 2];

export const DEFAULT_PRACTICE_CONFIG = {
    sessionType: 'practice',
    questionLimit: '',
    timeLimitSeconds: '',
    allowedQuestionTypes: [...QUESTION_TYPE_OPTIONS],
    allowedDifficulties: [...DIFFICULTY_OPTIONS],
    availability: {
        startAt: '',
        endAt: ''
    },
    lockStudentOptions: false
};

export const DEFAULT_ASSESSMENT_CONFIG = {
    maxMarks: '100',
    passMarks: '40',
    resultsVisibility: 'immediate',
    resultsReleaseAt: ''
};

export const createInitialFormData = (semester = 1) => ({
    title: '',
    standardId: '',
    classId: '',
    subjectId: '',
    semester: semester || 1,
    students: [],
    dueDate: '',
    instructions: '',
    practiceConfig: {
        ...DEFAULT_PRACTICE_CONFIG,
        allowedQuestionTypes: [...DEFAULT_PRACTICE_CONFIG.allowedQuestionTypes],
        allowedDifficulties: [...DEFAULT_PRACTICE_CONFIG.allowedDifficulties],
        availability: { ...DEFAULT_PRACTICE_CONFIG.availability }
    },
    assessmentConfig: { ...DEFAULT_ASSESSMENT_CONFIG }
});
