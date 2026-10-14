export const SCHOOL_PAGE_ACCESS_PAGES = [
    { key: 'liveLessons', label: 'Live Lessons', description: 'Live lesson sessions and lesson materials' },
    { key: 'curriculumMaps', label: 'Curriculum maps', description: 'Curriculum planning and maps' },
    { key: 'interventions', label: 'Interventions', description: 'Intervention queue and follow-up' },
    { key: 'academicExcellence', label: 'Academic excellence', description: 'Class academic-excellence insights' },
    { key: 'reading', label: 'Reading', description: 'Reading texts and assignments' },
    { key: 'socialStudies', label: 'Social Studies', description: 'Social Studies lessons and assignments' },
    { key: 'revisionPlans', label: 'Revision plans', description: 'Student and teacher revision plans' },
    { key: 'presentations', label: 'Presentations', description: 'Presentation creation and playback' },
    { key: 'assignments', label: 'Assignments', description: 'Assignments and homework' },
    { key: 'gradebook', label: 'Gradebook and grades', description: 'Grades, gradebook, and report cards' },
    { key: 'attendance', label: 'Attendance', description: 'Teacher attendance and student attendance pages' },
    { key: 'spelling', label: 'Spelling', description: 'Spelling practice and management' },
    { key: 'vocabulary', label: 'Vocabulary', description: 'Vocabulary practice and management' },
    { key: 'standardsAssessments', label: 'Standards and assessments', description: 'Standards practice, grammar assessments, and assessment assignments' },
    { key: 'mapTestPrep', label: 'MAP test preparation', description: 'MAP practice plans, quizzes, and progress' },
    { key: 'behavior', label: 'Behavior', description: 'Student behavior tracking and follow-up' },
    { key: 'studentGrouping', label: 'Student grouping', description: 'Academic student grouping and group reports' },
    { key: 'timetable', label: 'Timetable and schedule', description: 'Teacher timetables and schedules' },
    { key: 'plp', label: 'Personal learning plans', description: 'Student personal learning plans and tasks' },
    { key: 'communication', label: 'Communication', description: 'Messages, email, and notifications' },
    { key: 'newsletters', label: 'Newsletters', description: 'Teacher newsletter creation and distribution' },
    { key: 'classes', label: 'Classes', description: 'Class lists and class details' },
    { key: 'students', label: 'Students', description: 'Student lists and student learning pages' },
    { key: 'reports', label: 'Reports', description: 'Teacher reports and analytics' }
];

const API_PAGE_PREFIXES = [
    ['/api/live', 'liveLessons'],
    ['/api/curriculum-maps', 'curriculumMaps'],
    ['/api/curriculum-settings', 'curriculumMaps'],
    ['/api/interventions', 'interventions'],
    ['/api/academic-excellence', 'academicExcellence'],
    ['/api/reading', 'reading'],
    ['/api/social-studies', 'socialStudies'],
    ['/api/revision', 'revisionPlans'],
    ['/api/presentations', 'presentations'],
    ['/api/standard-assignments', 'standardsAssessments'],
    ['/api/assignments', 'assignments'],
    ['/api/homework', 'assignments'],
    ['/api/grades', 'gradebook'],
    ['/api/gradebook', 'gradebook'],
    ['/api/report-cards', 'gradebook'],
    ['/api/attendance', 'attendance'],
    ['/api/spelling', 'spelling'],
    ['/api/vocabulary', 'vocabulary'],
    ['/api/standard-assessment', 'standardsAssessments'],
    ['/api/standards', 'standardsAssessments'],
    ['/api/grammar-tests', 'standardsAssessments'],
    ['/api/map-prep', 'mapTestPrep'],
    ['/api/map-practice', 'mapTestPrep'],
    ['/api/student-behavior', 'behavior'],
    ['/api/student-grouping', 'studentGrouping'],
    ['/api/timetable', 'timetable'],
    ['/api/schedules', 'timetable'],
    ['/api/plp', 'plp'],
    ['/api/messages', 'communication'],
    ['/api/communication-email', 'communication'],
    ['/api/notifications', 'communication'],
    ['/api/newsletters', 'newsletters'],
    ['/api/students', 'students'],
    ['/api/reports', 'reports'],
    ['/api/analytics', 'reports']
];

const API_PAGE_PATH_MATCHERS = [
    [/^\/api\/students\/[^/]+\/academic-excellence(?:\/|$)/, 'academicExcellence'],
    [/^\/api\/students\/[^/]+\/(?:learning-trace|parent-learning-summary)(?:\/|$)/, 'reports'],
    [/^\/api\/classes\/[^/]+\/(?:analytics|insights|objective-performance|academic-excellence)(?:\/|$)/, 'academicExcellence']
];

export const getSchoolPageAccess = (settings = {}) => {
    const saved = settings?.userPageAccess || {};
    return {
        teacher: Object.fromEntries(SCHOOL_PAGE_ACCESS_PAGES.map(({ key }) => [key, saved.teacher?.[key] !== false])),
        student: Object.fromEntries(SCHOOL_PAGE_ACCESS_PAGES.map(({ key }) => [key, saved.student?.[key] !== false]))
    };
};

export const getSchoolPageForApiPath = (pathname) => {
    const normalizedPath = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
    const specificMatch = API_PAGE_PATH_MATCHERS.find(([pattern]) => pattern.test(normalizedPath));
    if (specificMatch) return specificMatch[1];
    const match = API_PAGE_PREFIXES.find(([prefix]) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
    return match?.[1] || null;
};

export const getSchoolPageAccessForRole = (settings, role, pageKey) => {
    if (!['teacher', 'student'].includes(role) || !pageKey) return true;
    return getSchoolPageAccess(settings)[role][pageKey] !== false;
};
