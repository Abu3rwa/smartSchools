/* TEMPORARY render harness. Never shipped: aliased over src/config/api by vite.preview.config.mjs */

export const API_URL = 'http://127.0.0.1:5199/api';

export const stub = {
    mode: 'full',
    lang: 'en',
    subs: 2,
    inbox: true,
    delay: 120,
    role: 'admin',
    calls: []
};

/* Mirrors server authorize('admin','department_principal') on /departments and /import/templates/*. */
const PRINCIPAL_ROLES = ['admin', 'department_principal'];
const canReadAdminRoutes = () => PRINCIPAL_ROLES.includes(stub.role);

const PERIODS = [
    { _id: 'p1', name: 'Period 1', order: 1, startTime: '07:30', endTime: '08:15' },
    { _id: 'p2', name: 'Period 2', order: 2, startTime: '08:20', endTime: '09:05' },
    { _id: 'p3', name: 'Period 3', order: 3, startTime: '09:10', endTime: '09:55' },
    { _id: 'p4', name: 'Period 4', order: 4, startTime: '10:15', endTime: '11:00' },
    { _id: 'p5', name: 'Period 5', order: 5, startTime: '11:05', endTime: '11:50' },
    { _id: 'p6', name: 'Period 6', order: 6, startTime: '12:10', endTime: '12:55' }
];

const SUBJECTS = {
    math: { en: 'Mathematics', ar: 'الرياضيات' },
    home: { en: 'Homeroom', ar: 'حصة الصف' },
    sci: { en: 'Science', ar: 'العلوم' }
};

const CLASSES = { '5-R': 'c1', '5-B': 'c2' };
const ROOMS = { 12: { _id: 'r12', name: '12' }, 'Lab 2': { _id: 'rlab', name: 'Lab 2' } };

const WEEK = [
    { day: 0, items: [{ p: 1, s: 'math', c: '5-R', r: '12' }, { p: 2, s: 'math', c: '5-B', r: '12' }, { p: 3, s: 'home', c: '5-R', r: '12' }, { p: 5, s: 'math', c: '5-R', r: 'Lab 2' }] },
    { day: 1, items: [{ p: 1, s: 'math', c: '5-B', r: '12' }, { p: 2, s: 'sci', c: '5-R', r: 'Lab 2' }, { p: 3, s: 'math', c: '5-R', r: '12' }, { p: 4, s: 'home', c: '5-R', r: '12' }, { p: 6, s: 'math', c: '5-B', r: '12' }] },
    { day: 2, items: [{ p: 1, s: 'math', c: '5-R', r: '12' }, { p: 3, s: 'math', c: '5-B', r: '12' }, { p: 4, s: 'sci', c: '5-R', r: 'Lab 2' }, { p: 5, s: 'home', c: '5-R', r: '12' }] },
    { day: 3, items: [{ p: 1, s: 'math', c: '5-B', r: '12' }, { p: 2, s: 'math', c: '5-R', r: '12' }, { p: 4, s: 'sci', c: '5-B', r: 'Lab 2' }, { p: 5, s: 'math', c: '5-R', r: '12' }, { p: 6, s: 'home', c: '5-R', r: '12' }] },
    { day: 4, items: [{ p: 2, s: 'math', c: '5-R', r: '12' }, { p: 3, s: 'math', c: '5-B', r: '12' }, { p: 5, s: 'sci', c: '5-R', r: 'Lab 2' }] }
];

const className = (key) => `Grade ${key}`;

const buildAssignments = () => {
    const rows = [];
    WEEK.forEach(({ day, items }) => {
        if (stub.mode === 'quiet' && day === new Date().getDay()) return;
        items.forEach((item) => {
            rows.push({
                _id: `a${day}-${item.p}`,
                daysOfWeek: [day],
                period: PERIODS[item.p - 1],
                subject: { _id: `s-${item.s}`, name: SUBJECTS[item.s][stub.lang] || SUBJECTS[item.s].en },
                class: { _id: CLASSES[item.c], name: className(item.c) },
                room: ROOMS[item.r]
            });
        });
    });
    return rows;
};

const analytics = () => {
    if (stub.mode === 'quiet' || stub.mode === 'empty') {
        return {
            summary: { activeClasses: 0, atRiskStudents: 0, avgClassPerformance: 0 },
            workloadByWeekday: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, count: 0 })),
            classPerformance: [],
            atRiskStudents: []
        };
    }
    const counts = [4, 5, 4, 5, 3, 0, 0];
    return {
        summary: { activeClasses: 2, atRiskStudents: 2, avgClassPerformance: 74 },
        workloadByWeekday: counts.map((count, day) => ({ day, count })),
        classPerformance: [
            { classId: 'c1', className: 'Grade 5-R', avgPercentage: 78, studentCount: 24 },
            { classId: 'c2', className: 'Grade 5-B with a long section name', avgPercentage: 70, studentCount: 22 }
        ],
        atRiskStudents: [
            { studentId: 'st1', studentName: stub.lang === 'ar' ? 'ليلى عبدالله المطيري' : 'Layla Abdullah', classId: 'c1', className: 'Grade 5-R', avgPercentage: 52 },
            { studentId: 'st2', studentName: stub.lang === 'ar' ? 'عمر خالد' : 'Omar Khalid', classId: 'c2', className: 'Grade 5-B', avgPercentage: 58 }
        ]
    };
};

const myClasses = () => ([
    { class: { _id: 'c1', name: 'Grade 5-R' }, subject: { name: SUBJECTS.math[stub.lang] } },
    { class: { _id: 'c2', name: 'Grade 5-B' }, subject: { name: SUBJECTS.math[stub.lang] } },
    { class: { _id: 'c1', name: 'Grade 5-R' }, subject: { name: SUBJECTS.home[stub.lang] } },
    { class: { _id: 'c2', name: 'Grade 5-B' }, subject: { name: SUBJECTS.sci[stub.lang] } },
    { class: { _id: 'c3', name: 'Grade 6-A' }, subject: { name: SUBJECTS.math[stub.lang] } }
]);

const ok = (data) => ({ data: { success: true, data } });

const fail = (message, status = 500) => {
    const error = new Error(message);
    error.response = { status, data: { success: false, message } };
    return error;
};

const forbidden = () => {
    const error = new Error('Forbidden');
    error.response = { status: 403, data: { success: false, message: 'You do not have permission to perform this action.' } };
    return error;
};

const CLASS_ROWS = [
    { _id: 'c1', name: 'Grade 5-R', grade: 5, section: 'R', academicYear: '2026-2027', studentCount: 8 },
    { _id: 'c2', name: 'Grade 5-B', grade: 5, section: 'B', academicYear: '2026-2027', studentCount: 4 },
    { _id: 'c3', name: 'Grade 6-A', grade: 6, section: 'A', academicYear: '2026-2027', studentCount: 26 }
];

const STUDENT_ROWS = [
    { _id: 'st1', firstName: 'Layla', lastName: 'Abdullah', studentId: 'ST-1001', email: 'layla.abdullah@example.test', gender: 'female', status: 'active', currentClass: { _id: 'c1', name: 'Grade 5-R' }, department: { _id: 'd1', name: 'Mathematics' }, academicYear: '2026-2027' },
    { _id: 'st2', firstName: 'Omar', lastName: 'Khalid', studentId: 'ST-1002', email: 'omar.khalid@example.test', gender: 'male', status: 'active', currentClass: { _id: 'c1', name: 'Grade 5-R' }, department: { _id: 'd1', name: 'Mathematics' }, academicYear: '2026-2027' },
    { _id: 'st3', firstName: 'Maryam', lastName: 'Al-Harbi', studentId: 'ST-1003', email: 'maryam.alharbi@example.test', gender: 'female', status: 'active', currentClass: { _id: 'c1', name: 'Grade 5-R' }, department: { _id: 'd2', name: 'Languages' }, academicYear: '2026-2027' },
    { _id: 'st4', firstName: 'Yusuf', lastName: 'Ibrahim', studentId: 'ST-1004', email: '', gender: 'male', status: 'active', currentClass: { _id: 'c1', name: 'Grade 5-R' }, department: null, academicYear: '2026-2027' },
    { _id: 'st5', firstName: 'Nour', lastName: 'Al-Sayed', studentId: 'ST-1005', email: 'nour.alsayed@example.test', gender: 'female', status: 'active', currentClass: { _id: 'c1', name: 'Grade 5-R' }, department: { _id: 'd2', name: 'Languages' }, academicYear: '2026-2027' },
    { _id: 'st6', firstName: 'Abdulrahman', lastName: 'Mohammed Al-Otaibi', studentId: 'ST-1006', email: 'abdulrahman.m@example.test', gender: 'male', status: 'active', currentClass: { _id: 'c1', name: 'Grade 5-R' }, department: { _id: 'd1', name: 'Mathematics' }, academicYear: '2026-2027' },
    { _id: 'st7', firstName: 'Sara', lastName: 'Hassan', studentId: 'ST-1007', email: 'sara.hassan@example.test', gender: 'female', status: 'active', currentClass: { _id: 'c1', name: 'Grade 5-R' }, department: null, academicYear: '2026-2027' },
    { _id: 'st8', firstName: 'Ibrahim', lastName: 'Al-Zahrani', studentId: 'ST-1008', email: 'ibrahim.z@example.test', gender: 'male', status: 'inactive', currentClass: { _id: 'c1', name: 'Grade 5-R' }, department: null, academicYear: '2026-2027' },
    { _id: 'st9', firstName: 'Huda', lastName: 'Saleh', studentId: 'ST-1009', email: 'huda.saleh@example.test', gender: 'female', status: 'active', currentClass: { _id: 'c2', name: 'Grade 5-B' }, department: { _id: 'd2', name: 'Languages' }, academicYear: '2026-2027' },
    { _id: 'st10', firstName: 'Tariq', lastName: 'Nasser', studentId: 'ST-1010', email: 'tariq.nasser@example.test', gender: 'male', status: 'active', currentClass: null, department: null, academicYear: '2026-2027' },
    { _id: 'st11', firstName: 'Aisha', lastName: 'Rahman', studentId: 'ST-1011', email: 'aisha.rahman@example.test', gender: 'female', status: 'active', currentClass: null, department: null, academicYear: '2026-2027' },
    { _id: 'st12', firstName: 'Zaid', lastName: 'Al-Mutairi', studentId: 'ST-1012', email: 'zaid.m@example.test', gender: 'male', status: 'active', currentClass: null, department: null, academicYear: '2026-2027' }
];

const SUBJECT_ROWS = [
    { _id: 's-math', name: 'Mathematics', code: 'MATH', grade: 5 },
    { _id: 's-sci', name: 'Science', code: 'SCI', grade: 5 },
    { _id: 's-home', name: 'Homeroom', code: 'HR', grade: 5 },
    { _id: 's-eng', name: 'English Language', code: 'ENG', grade: 5 }
];

const TEACHER_ROWS = [
    { _id: 't1', user: { firstName: 'Layla', lastName: 'Hassan' } },
    { _id: 't2', user: { firstName: 'Omar', lastName: 'Saleh' } }
];

const roster = () => {
    if (stub.mode === 'empty') return [];
    if (stub.mode === 'detail-long') {
        return STUDENT_ROWS.concat(
            STUDENT_ROWS.map((row, index) => ({
                ...row,
                _id: `${row._id}-b`,
                firstName: `${row.firstName} bint Abdullah Al-Mutairi`,
                lastName: 'Al-Sudairi',
                studentId: `ST-20${index + 1}`
            }))
        );
    }
    return STUDENT_ROWS.filter((student) => ['st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'st7', 'st8'].includes(student._id));
};

const classDetail = () => ({
    _id: 'c1',
    name: 'Grade 5-R',
    grade: 5,
    section: 'R',
    academicYear: '2026-2027',
    room: 'Room 12',
    capacity: 30,
    isActive: stub.mode !== 'detail-inactive',
    department: { _id: 'd1', name: 'Mathematics' },
    subjects: [
        { _id: 'cs1', subject: { _id: 's-math', name: 'Mathematics', code: 'MATH' }, teacher: { _id: 't1', user: { firstName: 'Layla', lastName: 'Hassan' } } },
        { _id: 'cs2', subject: { _id: 's-home', name: 'Homeroom', code: 'HR' }, teacher: { _id: 't2', user: { firstName: 'Omar', lastName: 'Saleh' } } },
        { _id: 'cs3', subject: { _id: 's-sci', name: 'Science', code: 'SCI' }, teacher: null }
    ]
});

const classAnalytics = () => ({
    gradeStatsBySubject: [
        { subjectId: 's-math', subjectName: 'Mathematics', classAverage: 78 },
        { subjectId: 's-sci', subjectName: 'Science', classAverage: 71 }
    ],
    attendanceSummary: { averageRate: 94, totalSessions: 38 },
    atRiskCount: 2,
    studentsToSupport: [
        { _id: 'st4', firstName: 'Yusuf', lastName: 'Ibrahim', averagePercentage: 52, attendanceRate: 88 },
        { _id: 'st6', firstName: 'Abdulrahman', lastName: 'Mohammed Al-Otaibi', averagePercentage: 58, attendanceRate: 91 }
    ]
});

const searchStudents = (params = {}) => {
    const term = String(params.search || '').trim().toLowerCase();
    const rows = STUDENT_ROWS.filter((student) => student.status === 'active');
    const matched = term
        ? rows.filter((student) => `${student.firstName} ${student.lastName} ${student.studentId}`.toLowerCase().includes(term))
        : rows;
    return matched.slice(0, Number(params.limit) || 20);
};

const route = (url, params = {}) => {
    stub.calls = stub.calls || [];
    stub.calls.push(String(url).split('?')[0]);
    const path = String(url).split('?')[0];

    if (path === '/classes') {
        if (stub.mode === 'list-error') throw fail('Failed to load classes');
        const classes = stub.mode === 'empty' ? [] : CLASS_ROWS;
        return ok({ classes, pagination: { total: classes.length, page: 1, pages: 1, limit: 20 } });
    }

    if (path === '/classes/c1') {
        if (stub.mode === 'detail-error') throw fail('Failed to load class');
        if (stub.mode === 'detail-404') throw fail('Class not found', 404);
        if (stub.mode === 'detail-forbidden') throw forbidden();
        return ok({ class: classDetail(), students: roster() });
    }

    if (path === '/classes/c1/analytics') {
        if (stub.mode === 'analytics-error') throw fail('Failed to fetch analytics');
        return ok(stub.mode === 'analytics-empty' ? {} : classAnalytics());
    }

    if (path === '/classes/c1/insights') {
        if (stub.mode === 'insights-error') throw fail('Failed to generate insights');
        if (stub.mode === 'insights-empty') return ok({ insights: '' });
        return ok({
            insights: stub.lang === 'ar'
                ? 'يُظهر الصف أداءً قوياً في الرياضيات.\nيحتاج طالبان إلى دعم إضافي في القراءة.\nالحضور منتظم بنسبة عالية.'
                : 'The class performs strongly in Mathematics.\nTwo students need extra reading support.\nAttendance is consistently high.'
        });
    }

    if (path === '/students') {
        if (stub.mode === 'list-error') throw fail('Failed to load students');
        if (stub.mode === 'students-empty') return ok({ students: [], pagination: { total: 0, page: 1, pages: 1, limit: 20 } });
        const found = searchStudents(params);
        return ok({ students: found, pagination: { total: found.length, page: 1, pages: 1, limit: 20 } });
    }

    if (path === '/subjects') {
        return ok({ subjects: SUBJECT_ROWS, pagination: { total: SUBJECT_ROWS.length, page: 1, pages: 1, limit: 12 } });
    }

    if (path === '/teachers') {
        return ok({ teachers: TEACHER_ROWS, pagination: { total: TEACHER_ROWS.length, page: 1, pages: 1, limit: 100 } });
    }

    if (path === '/schools/me/academic-years') {
        return ok({ academicYears: ['2026-2027', '2025-2026'] });
    }

    if (path === '/departments') {
        if (!canReadAdminRoutes()) throw forbidden();
        return ok({ departments: [{ _id: 'd1', name: 'Mathematics' }, { _id: 'd2', name: 'Languages' }] });
    }

    if (/^\/import\/templates\/[^/]+$/.test(path)) {
        if (!canReadAdminRoutes()) throw forbidden();
        return ok({
            template: {
                entityType: path.split('/').pop(),
                hasActiveTemplate: true,
                activeTemplate: { version: 'v3', updatedAt: '2026-10-02T08:00:00.000Z' }
            }
        });
    }

    if (path === '/timetable/my-timetable') {
        if (stub.mode === 'error' || stub.mode === 'error-timetable') throw fail('Failed to load timetable');
        return ok({
            periods: PERIODS,
            assignments: stub.mode === 'empty' ? [] : buildAssignments(),
            academicYear: '2026-2027',
            workingDays: [0, 1, 2, 3, 4]
        });
    }

    if (path === '/teachers/my-dashboard-analytics') {
        if (stub.mode === 'error' || stub.mode === 'error-analytics') throw fail('Failed to load analytics');
        return ok(analytics());
    }

    if (path === '/teachers/my-classes') return ok({ classes: stub.mode === 'empty' ? [] : myClasses() });
    if (path === '/substitutions') return ok({ pagination: { total: stub.subs } });
    if (path === '/inbox-assistant/status') return ok({ optedIn: true, platform: { enabled: stub.inbox } });
    if (path === '/inbox-assistant/summary') return ok({ needsReply: 2, calendarAttention: 1 });

    return ok({});
};

const writeRoute = (url, body = {}) => {
    const path = String(url).split('?')[0];
    stub.calls = stub.calls || [];
    stub.calls.push(`${path}${body && Object.keys(body).length ? ' [body]' : ''}`);

    if (path === '/classes/c1/enroll-students') {
        const ids = Array.isArray(body.studentIds) ? body.studentIds : [];
        if (stub.mode === 'enroll-error') throw fail('Failed to enroll students');
        const modifiedCount = stub.mode === 'enroll-partial'
            ? Math.max(0, ids.length - 1)
            : stub.mode === 'enroll-none'
                ? 0
                : ids.length;
        return ok({ modifiedCount });
    }

    if (path === '/classes/c1/subjects') {
        return ok({
            class: {
                ...classDetail(),
                subjects: classDetail().subjects.concat({
                    _id: 'cs4',
                    subject: { _id: 's-eng', name: 'English Language', code: 'ENG' },
                    teacher: null
                })
            }
        });
    }

    if (/^\/classes\/c1\/subjects\/[^/]+$/.test(path)) {
        const subjectId = path.split('/').pop();
        const subjects = classDetail().subjects.filter((item) => (item.subject?._id || item.subject) !== subjectId);
        return ok({ class: { ...classDetail(), subjects } });
    }

    if (path === '/classes/c1') {
        return ok({ class: { ...classDetail(), ...body } });
    }

    const studentMatch = /^\/students\/([^/]+)$/.exec(path);
    if (studentMatch) {
        const existing = STUDENT_ROWS.find((student) => student._id === studentMatch[1]) || { _id: studentMatch[1] };
        return ok({ student: { ...existing, ...body } });
    }

    if (/^\/classes\/c1\/students\/[^/]+$/.test(path)) {
        return ok({});
    }

    return ok({});
};

const api = {
    get: (url, config = {}) => new Promise((resolve, reject) => {
        if (stub.mode === 'loading') return;
        if (stub.mode === 'detail-loading' && String(url).startsWith('/classes/c1')) return;
        setTimeout(() => {
            try {
                resolve(route(url, config.params || {}));
            } catch (error) {
                reject(error);
            }
        }, stub.delay);
    }),
    post: (url, body) => Promise.resolve().then(() => writeRoute(url, body)),
    put: (url, body) => Promise.resolve().then(() => writeRoute(url, body)),
    patch: (url, body) => Promise.resolve().then(() => writeRoute(url, body)),
    delete: (url) => Promise.resolve().then(() => writeRoute(url)),
    interceptors: {
        request: { use: () => 0, eject: () => { } },
        response: { use: () => 0, eject: () => { } }
    },
    defaults: { headers: { common: {} } }
};

export default api;
