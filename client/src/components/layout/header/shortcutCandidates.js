import { PERMISSIONS } from '../../../constants/permissions';

export const MAX_SHORTCUTS = 10;

export const SHORTCUT_CANDIDATES = [
    { path: '/portal/dashboard', labelKey: 'dashboard' },
    { path: '/portal/classes', labelKey: 'classes', roles: ['admin', 'department_principal', 'teacher'] },
    { path: '/portal/students', labelKey: 'students', roles: ['admin', 'department_principal', 'teacher'] },
    { path: '/portal/students/promotion-center', labelKey: 'promotionCenter', roles: ['admin'] },
    { path: '/portal/lessons', labelKey: 'lessonPlans', roles: ['admin', 'department_principal', 'teacher'], permissions: [PERMISSIONS.EDIT_LESSON_PLANS, PERMISSIONS.REVIEW_LESSON_PLANS] },
    { path: '/portal/assignments', labelKey: 'assignments', roles: ['admin', 'department_principal', 'teacher'] },
    { path: '/portal/grades/entry', labelKey: 'gradeEntry', roles: ['admin', 'teacher'] },
    { path: '/portal/gradebook', labelKey: 'gradebook', roles: ['admin', 'teacher', 'department_principal'] },
    { path: '/portal/map-test-prep', labelKey: 'mapTestPrep', roles: ['admin', 'teacher'], feature: 'mapTestPrep' },
    { path: '/portal/map-test-prep/student', labelKey: 'mapTestPrep', roles: ['student'], feature: 'mapTestPrep' },
    { path: '/portal/spelling', labelKey: 'spelling', roles: ['admin', 'department_principal', 'teacher'] },
    { path: '/portal/spelling/student', labelKey: 'spelling', roles: ['student'] },
    { path: '/portal/vocabulary', labelKey: 'vocabulary', roles: ['admin', 'department_principal', 'teacher'] },
    { path: '/portal/vocabulary/student', labelKey: 'vocabulary', roles: ['student'] },
    { path: '/portal/standards', labelKey: 'standards', roles: ['admin', 'teacher', 'department_principal'], feature: 'standardsPractice' },
    {
        path: '/portal/standards/gradebook',
        labelKey: 'standardsGradebook',
        roles: ['admin', 'teacher', 'department_principal'],
        feature: 'standardsPractice'
    },
    { path: '/portal/grammar-assessments', labelKey: 'grammarAssessments', roles: ['admin', 'teacher', 'department_principal'], feature: 'standardsPractice' },
    { path: '/portal/student-grouping', labelKey: 'studentGrouping', roles: ['admin', 'teacher', 'department_principal'], feature: 'academicIntelligence' },
    { path: '/portal/admin-academic-excellence', labelKey: 'academicExcellenceAnalytics', roles: ['admin', 'department_principal'], feature: 'academicIntelligence' },
    { path: '/portal/newsletters', labelKey: 'newsletters', roles: ['teacher'], feature: 'newsletterCommunication' },
    {
        path: '/portal/presentations',
        labelKey: 'presentations',
        roles: ['admin'],
        permissions: [PERMISSIONS.MANAGE_PRESENTATIONS],
        feature: 'presentationBuilder'
    },
    {
        path: '/portal/live-lessons',
        labelKey: 'liveLessons',
        roles: ['admin', 'department_principal', 'teacher'],
        liveLessons: true
    },
    { path: '/portal/live-lessons/join', labelKey: 'liveLessons', roles: ['student'], liveLessons: true },
    { path: '/portal/worksheets', labelKey: 'worksheetChecker', roles: ['admin'], feature: 'worksheetChecker' },
    { path: '/portal/newsletters/admin', labelKey: 'newslettersReview', roles: ['admin'], feature: 'newsletterCommunication' },
    { path: '/portal/newsletters/history', labelKey: 'newsletters', roles: ['parent'], feature: 'newsletterCommunication' },
    { path: '/portal/sbr/config', labelKey: 'sbrConfig', roles: ['admin'], permissions: [PERMISSIONS.MANAGE_SBR_SCALES] },
    { path: '/portal/timetable', labelKey: 'timetable', roles: ['admin', 'teacher', 'department_principal'] },
    {
        path: '/portal/behavior',
        labelKey: 'behaviorManagement',
        roles: ['admin', 'department_principal', 'teacher'],
        permissions: [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR]
    },
    { path: '/portal/teachers', labelKey: 'teachers', roles: ['admin', 'department_principal'] },
    { path: '/portal/subjects', labelKey: 'subjects', roles: ['admin'] },
    { path: '/portal/reading/texts', labelKey: 'reading', roles: ['admin'], feature: 'readingAssistant' },
    { path: '/portal/school-settings', labelKey: 'schoolSettings', roles: ['admin'] },
    { path: '/portal/user-management', labelKey: 'userManagement', roles: ['admin'] },
    { path: '/portal/settings/subscription', labelKey: 'subscription', roles: ['admin'] },
    { path: '/portal/api-docs', labelKey: 'apiDocumentation', roles: ['admin'], feature: 'apiAccess' },
    { path: '/portal/my-grades', labelKey: 'myGrades', roles: ['student'] },
    { path: '/portal/social-studies/student', labelKey: 'socialStudiesStudent', roles: ['student'], feature: 'socialStudies' },
    { path: '/portal/my-assignments', labelKey: 'assignments', roles: ['student'] },
    { path: '/portal/student-attendance', labelKey: 'myAttendance', roles: ['student'] },
    { path: '/portal/practice/sb-results', labelKey: 'sbResults', roles: ['student'] },
    { path: '/portal/reading', labelKey: 'reading', roles: ['student'], feature: 'readingAssistant' },
    { path: '/portal/revision', labelKey: 'revisionPlans', roles: ['admin'], feature: 'revisionPlanning' },
    { path: '/portal/plp', labelKey: 'plp', roles: ['admin', 'teacher', 'department_principal', 'student'] },
    { path: '/portal/plp/my-tasks', labelKey: 'plpMyTasks', roles: ['student'] },
    { path: '/portal/attendance', labelKey: 'attendance', roles: ['admin', 'department_principal'] },
    { path: '/portal/notifications', labelKey: 'notifications', roles: ['admin', 'teacher', 'department_principal', 'staff'] },
    {
        path: '/portal/messages',
        labelKey: 'messages',
        roles: ['admin', 'teacher', 'department_principal', 'staff']
    },
    {
        path: '/portal/email-composer',
        labelKey: 'emailComposer',
        roles: ['admin', 'teacher', 'department_principal', 'staff'],
        permissions: [PERMISSIONS.SEND_COMMUNICATION_EMAILS, PERMISSIONS.SEND_NOTIFICATIONS]
    },
    {
        path: '/portal/sbr/generate',
        labelKey: 'sbrGenerate',
        roles: ['admin', 'teacher'],
        permissions: [PERMISSIONS.GENERATE_SBR_REPORTS]
    },
    { path: '/portal/practice', labelKey: 'practice', roles: ['student'] },
    {
        path: '/portal/academic-excellence',
        labelKey: 'academicExcellence',
        roles: ['student'],
        feature: 'academicIntelligence'
    },
    { path: '/portal/settings', labelKey: 'settings', roles: ['admin', 'teacher', 'department_principal'] }
];
