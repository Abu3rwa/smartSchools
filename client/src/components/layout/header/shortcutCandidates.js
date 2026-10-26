import { PERMISSIONS } from '../../../constants/permissions';

export const MAX_SHORTCUTS = 10;

// Sections mirror the sidebar grouping (staff) and the student nav (learning)
// so the header can show a breadcrumb and group the shortcut picker.
export const SHORTCUT_CANDIDATES = [
    { path: '/portal/dashboard', labelKey: 'dashboard', section: 'overview' },
    { path: '/portal/classes', labelKey: 'classes', roles: ['admin', 'department_principal', 'teacher'], section: 'teaching' },
    { path: '/portal/students', labelKey: 'students', roles: ['admin', 'department_principal', 'teacher'], section: 'teaching' },
    { path: '/portal/students/promotion-center', labelKey: 'promotionCenter', roles: ['admin'], section: 'assessment' },
    { path: '/portal/lessons', labelKey: 'lessonPlans', roles: ['admin', 'department_principal', 'teacher'], permissions: [PERMISSIONS.EDIT_LESSON_PLANS, PERMISSIONS.REVIEW_LESSON_PLANS], section: 'teaching' },
    { path: '/portal/assignments', labelKey: 'assignments', roles: ['admin', 'department_principal', 'teacher'], section: 'teaching' },
    { path: '/portal/grades/entry', labelKey: 'gradeEntry', roles: ['admin', 'teacher'], section: 'assessment' },
    { path: '/portal/gradebook', labelKey: 'gradebook', roles: ['admin', 'teacher', 'department_principal'], section: 'assessment' },
    { path: '/portal/map-test-prep', labelKey: 'mapTestPrep', roles: ['admin', 'teacher'], feature: 'mapTestPrep', section: 'assessment' },
    { path: '/portal/map-test-prep/student', labelKey: 'mapTestPrep', roles: ['student'], feature: 'mapTestPrep', section: 'learning' },
    { path: '/portal/spelling', labelKey: 'spelling', roles: ['admin', 'department_principal', 'teacher'], section: 'assessment' },
    { path: '/portal/spelling/student', labelKey: 'spelling', roles: ['student'], section: 'learning' },
    { path: '/portal/vocabulary', labelKey: 'vocabulary', roles: ['admin', 'department_principal', 'teacher'], section: 'assessment' },
    { path: '/portal/vocabulary/student', labelKey: 'vocabulary', roles: ['student'], section: 'learning' },
    { path: '/portal/standards', labelKey: 'standards', roles: ['admin', 'teacher', 'department_principal'], feature: 'standardsPractice', section: 'assessment' },
    {
        path: '/portal/standards/gradebook',
        labelKey: 'standardsGradebook',
        roles: ['admin', 'teacher', 'department_principal'],
        feature: 'standardsPractice',
        section: 'assessment'
    },
    { path: '/portal/grammar-assessments', labelKey: 'grammarAssessments', roles: ['admin', 'teacher', 'department_principal'], feature: 'standardsPractice', section: 'assessment' },
    { path: '/portal/student-grouping', labelKey: 'studentGrouping', roles: ['admin', 'teacher', 'department_principal'], feature: 'academicIntelligence', section: 'insights' },
    { path: '/portal/admin-academic-excellence', labelKey: 'academicExcellenceAnalytics', roles: ['admin', 'department_principal'], feature: 'academicIntelligence', section: 'insights' },
    { path: '/portal/newsletters', labelKey: 'newsletters', roles: ['teacher'], feature: 'newsletterCommunication', section: 'communication' },
    {
        path: '/portal/live-lessons',
        labelKey: 'liveLessons',
        roles: ['admin', 'department_principal', 'teacher'],
        liveLessons: true,
        section: 'teaching'
    },
    { path: '/portal/live-lessons/join', labelKey: 'liveLessons', roles: ['student'], liveLessons: true, section: 'learning' },
    { path: '/portal/worksheets', labelKey: 'worksheetChecker', roles: ['admin'], feature: 'worksheetChecker', section: 'teaching' },
    { path: '/portal/newsletters/admin', labelKey: 'newslettersReview', roles: ['admin'], feature: 'newsletterCommunication', section: 'communication' },
    { path: '/portal/newsletters/history', labelKey: 'newsletters', roles: ['parent'], feature: 'newsletterCommunication', section: 'communication' },
    { path: '/portal/sbr/config', labelKey: 'sbrConfig', roles: ['admin'], permissions: [PERMISSIONS.MANAGE_SBR_SCALES], section: 'admin' },
    { path: '/portal/timetable', labelKey: 'timetable', roles: ['admin', 'teacher', 'department_principal'], section: 'operations' },
    {
        path: '/portal/behavior',
        labelKey: 'behaviorManagement',
        roles: ['admin', 'department_principal', 'teacher'],
        permissions: [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR],
        section: 'support'
    },
    { path: '/portal/teachers', labelKey: 'teachers', roles: ['admin', 'department_principal'], section: 'admin' },
    { path: '/portal/subjects', labelKey: 'subjects', roles: ['admin'], section: 'teaching' },
    { path: '/portal/reading/texts', labelKey: 'reading', roles: ['admin'], feature: 'readingAssistant', section: 'teaching' },
    { path: '/portal/school-settings', labelKey: 'schoolSettings', roles: ['admin'], section: 'admin' },
    { path: '/portal/user-management', labelKey: 'userManagement', roles: ['admin'], section: 'admin' },
    { path: '/portal/settings/subscription', labelKey: 'subscription', roles: ['admin'], section: 'admin' },
    { path: '/portal/api-docs', labelKey: 'apiDocumentation', roles: ['admin'], feature: 'apiAccess', section: 'admin' },
    { path: '/portal/my-grades', labelKey: 'myGrades', roles: ['student'], section: 'learning' },
    { path: '/portal/social-studies/student', labelKey: 'socialStudiesStudent', roles: ['student'], feature: 'socialStudies', section: 'learning' },
    { path: '/portal/my-assignments', labelKey: 'assignments', roles: ['student'], section: 'learning' },
    { path: '/portal/student-attendance', labelKey: 'myAttendance', roles: ['student'], section: 'learning' },
    { path: '/portal/practice/sb-results', labelKey: 'sbResults', roles: ['student'], section: 'learning' },
    { path: '/portal/reading', labelKey: 'reading', roles: ['student'], feature: 'readingAssistant', section: 'learning' },
    { path: '/portal/revision', labelKey: 'revisionPlans', roles: ['admin'], feature: 'revisionPlanning', section: 'support' },
    { path: '/portal/plp', labelKey: 'plp', roles: ['admin', 'teacher', 'department_principal', 'student'], section: 'support' },
    { path: '/portal/plp/my-tasks', labelKey: 'plpMyTasks', roles: ['student'], section: 'learning' },
    { path: '/portal/attendance', labelKey: 'attendance', roles: ['admin', 'department_principal'], section: 'operations' },
    { path: '/portal/notifications', labelKey: 'notifications', roles: ['admin', 'teacher', 'department_principal', 'staff'], section: 'overview' },
    {
        path: '/portal/messages',
        labelKey: 'messages',
        roles: ['admin', 'teacher', 'department_principal', 'staff'],
        section: 'communication'
    },
    {
        path: '/portal/email-composer',
        labelKey: 'emailComposer',
        roles: ['admin', 'teacher', 'department_principal', 'staff'],
        permissions: [PERMISSIONS.SEND_COMMUNICATION_EMAILS, PERMISSIONS.SEND_NOTIFICATIONS],
        section: 'communication'
    },
    {
        path: '/portal/sbr/generate',
        labelKey: 'sbrGenerate',
        roles: ['admin', 'teacher'],
        permissions: [PERMISSIONS.GENERATE_SBR_REPORTS],
        section: 'admin'
    },
    { path: '/portal/practice', labelKey: 'practice', roles: ['student'], section: 'learning' },
    {
        path: '/portal/academic-excellence',
        labelKey: 'academicExcellence',
        roles: ['student'],
        feature: 'academicIntelligence',
        section: 'learning'
    },
    { path: '/portal/settings', labelKey: 'settings', roles: ['admin', 'teacher', 'department_principal'], section: 'account' }
];
