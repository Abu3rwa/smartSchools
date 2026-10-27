import { AI_LANGUAGE_OPTIONS } from '../../../constants/aiLanguages';
import {
    AI_GENERATED_QUESTION_TYPES,
    DEFAULT_PRACTICE_QUESTION_TYPES,
} from '../../../constants/practiceQuestionTypes';

// The generator only authors these types; a teacher adds the objective ones from the pool
// editor or a CSV import, so they stay out of the allowed-type choices.
export const QUESTION_TYPE_OPTIONS = AI_GENERATED_QUESTION_TYPES;
export const DEFAULT_QUESTION_TYPE_OPTIONS = DEFAULT_PRACTICE_QUESTION_TYPES;
export const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'];
export const GRAMMAR_LEVEL_OPTIONS = [
    { value: 'beginner', label: 'Beginner' },
    { value: 'elementary', label: 'Elementary' },
    { value: 'pre_intermediate', label: 'Pre-Intermediate' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'upper_intermediate', label: 'Upper Intermediate' },
    { value: 'advanced', label: 'Advanced' }
];
export const SEMESTER_OPTIONS = [1, 2];
export const AI_STANDARD_LANGUAGE_OPTIONS = AI_LANGUAGE_OPTIONS;

export const DEFAULT_PRACTICE_CONFIG = {
    sessionType: 'practice',
    questionLimit: '',
    timeLimitSeconds: '',
    allowedQuestionTypes: [...DEFAULT_QUESTION_TYPE_OPTIONS],
    allowedDifficulties: [...DIFFICULTY_OPTIONS],
    enableGrammarLeveling: false,
    grammarLevels: [],
    availability: {
        startAt: '',
        endAt: ''
    },
    lockStudentOptions: false
};

export const DEFAULT_ASSESSMENT_CONFIG = {
    maxMarks: '100',
    passMarks: '50',
    resultsVisibility: 'immediate',
    resultsReleaseAt: ''
};

export const createInitialFormData = (semester = 1) => ({
    title: '',
    standardId: '',
    generalTest: false,
    classId: '',
    subjectId: '',
    notifyParents: true,
    notifyStudents: true,
    preGeneratedQuestionCount: '10',
    semester: semester || 1,
    students: [],
    dueDate: '',
    instructions: '',
    aiLanguages: ['en'],
    importedQuestions: [],
    practiceConfig: {
        ...DEFAULT_PRACTICE_CONFIG,
        allowedQuestionTypes: [...DEFAULT_PRACTICE_CONFIG.allowedQuestionTypes],
        allowedDifficulties: [...DEFAULT_PRACTICE_CONFIG.allowedDifficulties],
        availability: { ...DEFAULT_PRACTICE_CONFIG.availability }
    },
    assessmentConfig: { ...DEFAULT_ASSESSMENT_CONFIG }
});
