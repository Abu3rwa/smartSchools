export const SCHOOL_PAGE_ACCESS_PAGES = [
  { key: "dashboard", label: "Dashboard", paths: ["/portal/dashboard"] },
  { key: "notifications", label: "Notifications", paths: ["/portal/notifications"] },
  { key: "messages", label: "Messages", paths: ["/portal/messages"] },
  { key: "emailComposer", label: "Email Composer", paths: ["/portal/email-composer"] },
  { key: "liveLessons", label: "Live Lessons", paths: ["/portal/live-lessons"] },
  { key: "lessons", label: "Lesson plans", paths: ["/portal/lessons"] },
  { key: "curriculumMaps", label: "Curriculum maps", paths: ["/portal/curriculum"] },
  { key: "interventions", label: "Interventions", paths: ["/portal/interventions"] },
  { key: "academicExcellence", label: "Academic excellence", paths: ["/portal/teacher-academic-excellence", "/portal/academic-excellence"] },
  { key: "reading", label: "Reading", paths: ["/portal/reading"] },
  { key: "socialStudies", label: "Social Studies", paths: ["/portal/social-studies"] },
  { key: "revisionPlans", label: "Revision plans", paths: ["/portal/revision"] },
  { key: "presentations", label: "Presentations", paths: ["/portal/presentations"] },
  { key: "worksheets", label: "Worksheet checker", paths: ["/portal/worksheets"] },
  { key: "assignments", label: "Assignments", paths: ["/portal/assignments", "/portal/my-assignments"] },
  { key: "gradebook", label: "Gradebook and grades", paths: ["/portal/gradebook", "/portal/grades", "/portal/my-grades"] },
  { key: "studentPractice", label: "Student practice", paths: ["/portal/practice"] },
  { key: "sbrReports", label: "Student report cards", paths: ["/portal/sbr"] },
  { key: "sbrConfig", label: "SBR Config", paths: ["/portal/sbr/config"] },
  { key: "promotionCenter", label: "Promotion Center", paths: ["/portal/students/promotion-center"] },
  { key: "attendance", label: "Attendance", paths: ["/portal/attendance", "/portal/my-attendance", "/portal/student-attendance"] },
  { key: "attendanceRequests", label: "Attendance requests", paths: ["/portal/attendance-requests"] },
  { key: "schoolCalendar", label: "School calendar", paths: ["/portal/school-calendar"] },
  { key: "scheduleManagement", label: "Schedule Management", paths: ["/portal/schedules"] },
  { key: "subjects", label: "Subjects", paths: ["/portal/subjects"] },
  { key: "teachers", label: "Teachers", paths: ["/portal/teachers"] },
  { key: "userManagement", label: "User Management", paths: ["/portal/user-management"] },
  { key: "subscription", label: "Subscription", paths: ["/portal/settings/subscription"] },
  { key: "apiDocumentation", label: "API Documentation", paths: ["/portal/api-docs"] },
  { key: "academicExcellenceAnalytics", label: "Academic Excellence Analytics", paths: ["/portal/admin-academic-excellence"] },
  { key: "finance", label: "Finance", paths: ["/portal/finance"] },
  { key: "attendanceReminders", label: "Attendance Reminders", paths: ["/portal/attendance-reminders"] },
  { key: "newslettersReview", label: "Newsletters Review", paths: ["/portal/newsletters/admin"] },
  { key: "schoolSettings", label: "School Settings", paths: ["/portal/school-settings"], recoveryRoles: ["admin"] },
  { key: "spelling", label: "Spelling", paths: ["/portal/spelling"] },
  { key: "vocabulary", label: "Vocabulary", paths: ["/portal/vocabulary"] },
  { key: "standardsAssessments", label: "Standards and assessments", paths: ["/portal/standards", "/portal/grammar-assessments"] },
  { key: "mapTestPrep", label: "MAP test preparation", paths: ["/portal/map-test-prep"] },
  { key: "behavior", label: "Behavior", paths: ["/portal/behavior"] },
  { key: "studentGrouping", label: "Student grouping", paths: ["/portal/student-grouping"] },
  { key: "timetable", label: "Timetable and schedule", paths: ["/portal/timetable", "/portal/my-timetable", "/portal/my-schedule"] },
  { key: "plp", label: "Personal learning plans", paths: ["/portal/plp"] },
  { key: "communication", label: "Communication", paths: ["/portal/messages", "/portal/email-composer", "/portal/notifications"] },
  { key: "newsletters", label: "Newsletters", paths: ["/portal/newsletters"] },
  { key: "classes", label: "Classes", paths: ["/portal/classes"] },
  { key: "students", label: "Students", paths: ["/portal/students"] },
  { key: "reports", label: "Reports", paths: ["/portal/reports"] },
  { key: "accountSettings", label: "Account settings", paths: ["/portal/settings"] },
];

export const getSchoolPageKeyForPath = (pathname = "") => {
  const overrides = [
    ["/portal/students/promotion-center", "promotionCenter"],
    ["/portal/sbr/config", "sbrConfig"],
    ["/portal/settings/subscription", "subscription"],
    ["/portal/admin-academic-excellence", "academicExcellenceAnalytics"],
    ["/portal/newsletters/admin", "newslettersReview"],
  ];
  const override = overrides.find(([path]) =>
    pathname === path || pathname.startsWith(`${path}/`),
  );
  if (override) return override[1];
  if (/^\/portal\/classes\/[^/]+\/gradebook(?:\/|$)/.test(pathname)) return "gradebook";
  if (/^\/portal\/students\/[^/]+\/spelling(?:\/|$)/.test(pathname)) return "spelling";
  if (pathname === "/portal/social-studies/student" || pathname.startsWith("/portal/social-studies/student/")) return "socialStudies";
  const page = SCHOOL_PAGE_ACCESS_PAGES.find(({ paths = [] }) =>
    paths.some((path) => pathname === path || pathname.startsWith(path.endsWith("/") ? path : `${path}/`)),
  );
  return page?.key || null;
};

export const isSchoolPageLocked = (pageAccess, role, pageKey) => {
  if (!["admin", "teacher", "student", "department_principal", "staff"].includes(role) || !pageKey) {
    return false;
  }
  const page = SCHOOL_PAGE_ACCESS_PAGES.find((item) => item.key === pageKey);
  if (page?.recoveryRoles?.includes(role)) return false;
  return pageAccess?.[role]?.[pageKey] === false;
};
