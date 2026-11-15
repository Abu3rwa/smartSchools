/* TEMPORARY render harness. Never shipped: aliased over src/config/api by vite.preview.config.mjs */

export const stub = {
    mode: 'full',
    lang: 'en',
    subs: 2,
    inbox: true,
    delay: 120,
    role: 'teacher',
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

const fail = (message) => {
    const error = new Error(message);
    error.response = { status: 500, data: { success: false, message } };
    return error;
};

const forbidden = () => {
    const error = new Error('Forbidden');
    error.response = { status: 403, data: { success: false, message: 'You do not have permission to perform this action.' } };
    return error;
};

const CLASS_ROWS = [
    { _id: 'c1', name: 'Grade 5-R', grade: 5, section: 'R', academicYear: '2026-2027', studentCount: 24 },
    { _id: 'c2', name: 'Grade 5-B', grade: 5, section: 'B', academicYear: '2026-2027', studentCount: 22 },
    { _id: 'c3', name: 'Grade 6-A', grade: 6, section: 'A', academicYear: '2026-2027', studentCount: 26 }
];

const STUDENT_ROWS = [
    { _id: 'st1', firstName: 'Layla', lastName: 'Abdullah', grade: 5, section: 'R', academicYear: '2026-2027', class: { _id: 'c1', name: 'Grade 5-R' } },
    { _id: 'st2', firstName: 'Omar', lastName: 'Khalid', grade: 5, section: 'B', academicYear: '2026-2027', class: { _id: 'c2', name: 'Grade 5-B' } }
];

const SUBJECT_ROWS = [
    { _id: 's-math', name: 'Mathematics', code: 'MATH', grade: 5 },
    { _id: 's-sci', name: 'Science', code: 'SCI', grade: 5 }
];

const route = (url) => {
    stub.calls = stub.calls || [];
    stub.calls.push(String(url).split('?')[0]);
    const path = String(url).split('?')[0];

    if (path === '/classes') {
        return ok({ classes: stub.mode === 'empty' ? [] : CLASS_ROWS, pagination: { total: CLASS_ROWS.length, page: 1, pages: 1, limit: 20 } });
    }

    if (path === '/students') {
        return ok({ students: STUDENT_ROWS, pagination: { total: STUDENT_ROWS.length, page: 1, pages: 1, limit: 20 } });
    }

    if (path === '/subjects') {
        return ok({ subjects: SUBJECT_ROWS, pagination: { total: SUBJECT_ROWS.length, page: 1, pages: 1, limit: 12 } });
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

const api = {
    get: (url) => new Promise((resolve, reject) => {
        if (stub.mode === 'loading') return;
        setTimeout(() => {
            try {
                resolve(route(url));
            } catch (error) {
                reject(error);
            }
        }, stub.delay);
    }),
    post: () => Promise.resolve(ok({})),
    put: () => Promise.resolve(ok({})),
    patch: () => Promise.resolve(ok({})),
    delete: () => Promise.resolve(ok({})),
    interceptors: {
        request: { use: () => 0, eject: () => { } },
        response: { use: () => 0, eject: () => { } }
    },
    defaults: { headers: { common: {} } }
};

export default api;