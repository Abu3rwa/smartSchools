import { combineReducers, configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import classReducer from './slices/classSlice';
import studentReducer from './slices/studentSlice';
import gradeReducer from './slices/gradeSlice';
import subjectReducer from './slices/subjectSlice';
import teacherReducer from './slices/teacherSlice';
import notificationReducer from './slices/notificationSlice';
import lessonReducer from './slices/lessonSlice';
import dashboardReducer from './slices/dashboardSlice';
import schoolReducer from './slices/schoolSlice';
import subscriptionReducer from './slices/subscriptionSlice';
import behaviorReducer from './slices/behaviorSlice';
import newsletterReducer from './slices/newsletterSlice';
import standardReducer from './slices/standardSlice';
import practiceReducer from './slices/practiceSlice';
import revisionReducer from './slices/revisionSlice';
import readingReducer from './slices/readingSlice';
import departmentReducer from './slices/departmentSlice';
import substitutionsReducer from './slices/substitutionsSlice';
import calendarReducer from './slices/calendarSlice';
import studentPromotionReducer from './slices/studentPromotionSlice';
import standardAssignmentReducer from './slices/standardAssignmentSlice';
import sbGradebookReducer from './slices/sbGradebookSlice';
import practiceHistoryReducer from './slices/practiceHistorySlice';
import messagesReducer from './slices/messagesSlice';
import studentGroupingReducer from './slices/studentGroupingSlice';
import newsletterTemplatesReducer from './slices/newsletterTemplateSlice';
import presentationsReducer from './slices/presentationSlice';
import gradebookConfigReducer from './slices/gradebookConfigSlice';
import gradebookColumnsReducer from './slices/gradebookColumnsSlice';
import formulaReducer from './slices/formulaSlice';
import reportCardReducer from './slices/reportCardSlice';
import spreadsheetReducer from './slices/spreadsheetSlice';
import analyticsReducer from './slices/analyticsSlice';
import worksheetReducer from './slices/worksheetSlice';
import standardAssessmentReducer from './slices/standardAssessmentSlice';
import uiReducer, {
    fetchSchoolAcademicYear,
    updateSchoolAcademicYear
} from './slices/uiSlice';
import schoolFeaturesReducer from './slices/schoolFeaturesSlice';
const YEAR_SCOPED_SLICE_KEYS = [
    'classes',
    'students',
    'grades',
    'teachers',
    'notifications',
    'lessons',
    'newsletters',
    'dashboard',
    'behavior',
    'standards',
    'practice',
    'revision',
    'reading',
    'substitutions',
    'studentPromotion',
    'standardAssignments',
    'sbGradebook',
    'practiceHistory',
    'presentations',
    'gradebookConfig',
    'gradebookColumns',
    'formulas',
    'reportCards',
    'spreadsheet',
    'analytics',
    'worksheets',
];

const appReducer = combineReducers({
    auth: authReducer,
    departments: departmentReducer,
    classes: classReducer,
    students: studentReducer,
    grades: gradeReducer,
    subjects: subjectReducer,
    teachers: teacherReducer,
    notifications: notificationReducer,
    ui: uiReducer,
    lessons: lessonReducer,
    newsletters: newsletterReducer,
    dashboard: dashboardReducer,
    schools: schoolReducer,
    schoolFeatures: schoolFeaturesReducer,
    subscriptions: subscriptionReducer,
    behavior: behaviorReducer,
    standards: standardReducer,
    practice: practiceReducer,
    revision: revisionReducer,
    reading: readingReducer,
    substitutions: substitutionsReducer,
    calendar: calendarReducer,
    studentPromotion: studentPromotionReducer,
    standardAssignments: standardAssignmentReducer,
    sbGradebook: sbGradebookReducer,
    practiceHistory: practiceHistoryReducer,
    messages: messagesReducer,
    studentGrouping: studentGroupingReducer,
    newsletterTemplates: newsletterTemplatesReducer,
    presentations: presentationsReducer,
    gradebookConfig: gradebookConfigReducer,
    gradebookColumns: gradebookColumnsReducer,
    formulas: formulaReducer,
    reportCards: reportCardReducer,
    spreadsheet: spreadsheetReducer,
    analytics: analyticsReducer,
    worksheets: worksheetReducer,
    standardAssessment: standardAssessmentReducer
});

const hasAcademicYearChanged = (state, action) => {
    const currentAcademicYear = state?.ui?.currentAcademicYear;
    if (!currentAcademicYear) return false;

    if (action.type === 'ui/setCurrentAcademicYear') {
        return action.payload && action.payload !== currentAcademicYear;
    }

    if (action.type === fetchSchoolAcademicYear.fulfilled.type) {
        return action.payload && action.payload !== currentAcademicYear;
    }

    if (action.type === updateSchoolAcademicYear.fulfilled.type) {
        return action.payload && action.payload !== currentAcademicYear;
    }

    return false;
};

const rootReducer = (state, action) => {
    if (state && hasAcademicYearChanged(state, action)) {
        const nextState = { ...state };
        YEAR_SCOPED_SLICE_KEYS.forEach((sliceKey) => {
            delete nextState[sliceKey];
        });
        return appReducer(nextState, action);
    }

    return appReducer(state, action);
};

export const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
            }
        })
});

export default store;
