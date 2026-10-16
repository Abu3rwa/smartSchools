import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SCHOOL_PAGE_ACCESS_PAGES,
    getSchoolPageAccess,
    getSchoolPageAccessForRole,
    getSchoolPageForApiPath
} from '../config/schoolPageAccess.js';
import {
    getSchoolPageKeyForPath,
    isSchoolPageLocked,
    SCHOOL_PAGE_ACCESS_PAGES as CLIENT_SCHOOL_PAGE_ACCESS_PAGES
} from '../client/src/constants/schoolPageAccess.js';

test('server and client page-access registries stay aligned', () => {
    assert.deepEqual(
        CLIENT_SCHOOL_PAGE_ACCESS_PAGES.map(({ key }) => key).sort(),
        SCHOOL_PAGE_ACCESS_PAGES.map(({ key }) => key).sort()
    );
});

test('school page access defaults every managed page to available', () => {
    const access = getSchoolPageAccess({});
    assert.equal(access.teacher.liveLessons, true);
    assert.equal(access.student.liveLessons, true);
    assert.equal(access.admin.liveLessons, true);
    assert.equal(access.department_principal.liveLessons, true);
    assert.equal(access.staff.liveLessons, true);
    assert.equal(access.teacher.assignments, true);
    assert.equal(access.admin.schoolSettings, true);
});

test('school page availability overrides remain scoped to the selected role', () => {
    const settings = {
        userPageAccess: {
            teacher: { liveLessons: false },
            student: { assignments: false }
        }
    };

    assert.equal(getSchoolPageAccessForRole(settings, 'teacher', 'liveLessons'), false);
    assert.equal(getSchoolPageAccessForRole(settings, 'student', 'liveLessons'), true);
    assert.equal(getSchoolPageAccessForRole(settings, 'student', 'assignments'), false);
    assert.equal(getSchoolPageAccessForRole({
        userPageAccess: { department_principal: { assignments: false } }
    }, 'department_principal', 'assignments'), false);
    assert.equal(getSchoolPageAccessForRole({
        userPageAccess: { staff: { messages: false } }
    }, 'staff', 'messages'), false);
    assert.equal(getSchoolPageAccessForRole(settings, 'admin', 'assignments'), true);
    assert.equal(getSchoolPageAccessForRole({
        userPageAccess: { admin: { schoolSettings: false } }
    }, 'admin', 'schoolSettings'), true);
    assert.equal(getSchoolPageAccessForRole(settings, 'admin', 'liveLessons'), true);
});

test('API paths map to their managed page area', () => {
    assert.equal(getSchoolPageForApiPath('/api/live/sessions/abc'), 'liveLessons');
    assert.equal(getSchoolPageForApiPath('/api/standard-assignments/abc'), 'standardsAssessments');
    assert.equal(getSchoolPageForApiPath('/api/students/abc'), 'students');
    assert.equal(getSchoolPageForApiPath('/api/students/abc/academic-excellence/tasks'), 'academicExcellence');
    assert.equal(getSchoolPageForApiPath('/api/auth/me'), null);
});

test('nested teacher pages use their own page-access group', () => {
    assert.equal(getSchoolPageKeyForPath('/portal/students/abc/spelling'), 'spelling');
    assert.equal(getSchoolPageKeyForPath('/portal/classes/abc/gradebook'), 'gradebook');
});

test('teacher and student sidebar pages are represented in page-access settings', () => {
    const sidebarPages = {
        '/portal/dashboard': 'dashboard',
        '/portal/lessons': 'lessons',
        '/portal/worksheets': 'worksheets',
        '/portal/sbr': 'sbrReports',
        '/portal/school-calendar': 'schoolCalendar',
        '/portal/attendance-requests': 'attendanceRequests',
        '/portal/subjects': 'subjects',
        '/portal/my-grades': 'gradebook',
        '/portal/practice': 'studentPractice',
        '/portal/practice/sb-results': 'studentPractice',
        '/portal/settings': 'accountSettings'
    };

    for (const [path, expectedKey] of Object.entries(sidebarPages)) {
        assert.equal(getSchoolPageKeyForPath(path), expectedKey, path);
        assert.ok(SCHOOL_PAGE_ACCESS_PAGES.some(({ key }) => key === expectedKey), expectedKey);
    }
});

test('newly lockable teacher pages also enforce their API access groups', () => {
    assert.equal(getSchoolPageForApiPath('/api/lessons'), 'lessons');
    assert.equal(getSchoolPageForApiPath('/api/worksheets/123'), 'worksheets');
    assert.equal(getSchoolPageForApiPath('/api/sbr/reports'), 'sbrReports');
    assert.equal(getSchoolPageForApiPath('/api/school-calendar'), 'schoolCalendar');
    assert.equal(getSchoolPageForApiPath('/api/attendance-requests'), 'attendanceRequests');
    assert.equal(getSchoolPageForApiPath('/api/practice/generate', 'student'), 'studentPractice');
    assert.equal(getSchoolPageForApiPath('/api/practice/assessment/standard-average', 'teacher'), 'standardsAssessments');
});

test('admin sidebar pages have distinct controls and protected API groups', () => {
    const adminPages = {
        '/portal/students/promotion-center': 'promotionCenter',
        '/portal/admin-academic-excellence': 'academicExcellenceAnalytics',
        '/portal/newsletters/admin': 'newslettersReview',
        '/portal/sbr/config': 'sbrConfig',
        '/portal/schedules': 'scheduleManagement',
        '/portal/teachers': 'teachers',
        '/portal/user-management': 'userManagement',
        '/portal/settings/subscription': 'subscription',
        '/portal/api-docs': 'apiDocumentation',
        '/portal/finance': 'finance',
        '/portal/school-settings': 'schoolSettings'
    };

    for (const [path, key] of Object.entries(adminPages)) {
        assert.equal(getSchoolPageKeyForPath(path), key, path);
        assert.ok(SCHOOL_PAGE_ACCESS_PAGES.some((page) => page.key === key), key);
    }

    assert.equal(getSchoolPageForApiPath('/api/students/promotion/queue', 'admin'), 'promotionCenter');
    assert.equal(getSchoolPageForApiPath('/api/academic-excellence/analytics', 'admin'), 'academicExcellenceAnalytics');
    assert.equal(getSchoolPageForApiPath('/api/academic-excellence/analytics', 'teacher'), 'academicExcellence');
    assert.equal(getSchoolPageForApiPath('/api/teachers', 'admin'), 'teachers');
    assert.equal(getSchoolPageForApiPath('/api/users', 'admin'), 'userManagement');
    assert.equal(getSchoolPageForApiPath('/api/sbr/scales', 'admin'), 'sbrConfig');
    assert.equal(getSchoolPageForApiPath('/api/schools/me/subscription', 'admin'), 'subscription');
    assert.equal(getSchoolPageForApiPath('/api/newsletters/admin/issues/123', 'admin'), 'newslettersReview');
});

test('student Social Studies route resolves to its page-access setting', () => {
    assert.equal(getSchoolPageKeyForPath('/portal/social-studies/student'), 'socialStudies');
});

test('shared page-lock state covers header shortcuts and respects admin recovery', () => {
    const pageAccess = {
        admin: { emailComposer: false, schoolSettings: false },
        teacher: { emailComposer: false }
    };
    assert.equal(
        isSchoolPageLocked(pageAccess, 'teacher', getSchoolPageKeyForPath('/portal/email-composer')),
        true
    );
    assert.equal(
        isSchoolPageLocked(pageAccess, 'admin', getSchoolPageKeyForPath('/portal/school-settings')),
        false
    );
});

test('every active sidebar destination resolves to a lockable page', () => {
    const sidebarPaths = [
        '/portal/dashboard',
        '/portal/notifications',
        '/portal/messages',
        '/portal/email-composer',
        '/portal/classes',
        '/portal/students',
        '/portal/students/promotion-center',
        '/portal/lessons',
        '/portal/assignments',
        '/portal/grades/entry',
        '/portal/gradebook',
        '/portal/map-test-prep',
        '/portal/map-test-prep/student',
        '/portal/spelling',
        '/portal/spelling/student',
        '/portal/vocabulary',
        '/portal/vocabulary/student',
        '/portal/standards',
        '/portal/grammar-assessments',
        '/portal/student-grouping',
        '/portal/admin-academic-excellence',
        '/portal/newsletters',
        '/portal/presentations',
        '/portal/live-lessons',
        '/portal/live-lessons/join',
        '/portal/worksheets',
        '/portal/newsletters/admin',
        '/portal/newsletters/history',
        '/portal/sbr/config',
        '/portal/behavior',
        '/portal/teachers',
        '/portal/subjects',
        '/portal/reading/texts',
        '/portal/school-settings',
        '/portal/user-management',
        '/portal/settings/subscription',
        '/portal/api-docs',
        '/portal/my-grades',
        '/portal/social-studies/student',
        '/portal/my-assignments',
        '/portal/student-attendance',
        '/portal/practice',
        '/portal/practice/sb-results',
        '/portal/academic-excellence',
        '/portal/reading',
        '/portal/revision',
        '/portal/finance',
        '/portal/finance/fee-structures',
        '/portal/finance/discounts',
        '/portal/finance/invoices',
        '/portal/finance/payments',
        '/portal/finance/reports',
        '/portal/plp',
        '/portal/plp/my-tasks',
        '/portal/settings'
    ];

    for (const path of sidebarPaths) {
        const key = getSchoolPageKeyForPath(path);
        assert.ok(key, `${path} should resolve to a page-access key`);
        assert.ok(SCHOOL_PAGE_ACCESS_PAGES.some((page) => page.key === key), `${path}: ${key}`);
    }
});
