export const SCHOOL_PAGE_ACCESS_PAGES = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "School and student dashboards",
  },
  { key: "notifications", label: "Notifications", description: "Notification center" },
  { key: "messages", label: "Messages", description: "School messages" },
  { key: "emailComposer", label: "Email Composer", description: "Send school communications" },
  {
    key: "liveLessons",
    label: "Live Lessons",
    description: "Live lesson sessions and lesson materials",
  },
  {
    key: "lessons",
    label: "Lesson plans",
    description: "Lesson planning and review",
  },
  {
    key: "curriculumMaps",
    label: "Curriculum maps",
    description: "Curriculum planning and maps",
  },
  {
    key: "interventions",
    label: "Interventions",
    description: "Intervention queue and follow-up",
  },
  {
    key: "academicExcellence",
    label: "Academic excellence",
    description: "Class academic-excellence insights",
  },
  {
    key: "reading",
    label: "Reading",
    description: "Reading texts and assignments",
  },
  {
    key: "socialStudies",
    label: "Social Studies",
    description: "Social Studies lessons and assignments",
  },
  {
    key: "revisionPlans",
    label: "Revision plans",
    description: "Student and teacher revision plans",
  },
  {
    key: "presentations",
    label: "Presentations",
    description: "Presentation creation and playback",
  },
  {
    key: "worksheets",
    label: "Worksheet checker",
    description: "Worksheet creation, checking, and results",
  },
  {
    key: "assignments",
    label: "Assignments",
    description: "Assignments and homework",
  },
  {
    key: "gradebook",
    label: "Gradebook and grades",
    description: "Grades, gradebook, and report cards",
  },
  {
    key: "studentPractice",
    label: "Student practice",
    description: "Student practice sessions and results",
  },
  {
    key: "sbrReports",
    label: "Student report cards",
    description: "Standards-based report card reports",
  },
  { key: "sbrConfig", label: "SBR Config", description: "Configure report card scales" },
  { key: "promotionCenter", label: "Promotion Center", description: "Manage student promotion" },
  {
    key: "attendance",
    label: "Attendance",
    description: "Teacher attendance and student attendance pages",
  },
  {
    key: "attendanceRequests",
    label: "Attendance requests",
    description: "Attendance request submission and review",
  },
  {
    key: "schoolCalendar",
    label: "School calendar",
    description: "School calendar and events",
  },
  { key: "scheduleManagement", label: "Schedule Management", description: "Manage school schedules" },
  {
    key: "subjects",
    label: "Subjects",
    description: "Subject list and subject details",
  },
  { key: "teachers", label: "Teachers", description: "Teacher directory and management" },
  { key: "userManagement", label: "User Management", description: "Manage school user accounts" },
  { key: "subscription", label: "Subscription", description: "School subscription and plan settings" },
  { key: "apiDocumentation", label: "API Documentation", description: "API access and documentation" },
  { key: "academicExcellenceAnalytics", label: "Academic Excellence Analytics", description: "School academic excellence analytics" },
  { key: "finance", label: "Finance", description: "School finance pages" },
  { key: "attendanceReminders", label: "Attendance Reminders", description: "Manage attendance reminders" },
  { key: "newslettersReview", label: "Newsletters Review", description: "Review school newsletters" },
  { key: "schoolSettings", label: "School Settings", description: "Page-access recovery settings", recoveryRoles: ["admin"] },
  { key: "accountSettings", label: "Account settings", description: "Personal account settings" },
  {
    key: "spelling",
    label: "Spelling",
    description: "Spelling practice and management",
  },
  {
    key: "vocabulary",
    label: "Vocabulary",
    description: "Vocabulary practice and management",
  },
  {
    key: "standardsAssessments",
    label: "Standards and assessments",
    description:
      "Standards practice, grammar assessments, and assessment assignments",
  },
  {
    key: "mapTestPrep",
    label: "MAP test preparation",
    description: "MAP practice plans, quizzes, and progress",
  },
  {
    key: "behavior",
    label: "Behavior",
    description: "Student behavior tracking and follow-up",
  },
  {
    key: "studentGrouping",
    label: "Student grouping",
    description: "Academic student grouping and group reports",
  },
  {
    key: "timetable",
    label: "Timetable and schedule",
    description: "Teacher timetables and schedules",
  },
  {
    key: "plp",
    label: "Personal learning plans",
    description: "Student personal learning plans and tasks",
  },
  {
    key: "communication",
    label: "Communication",
    description: "Messages, email, and notifications",
  },
  {
    key: "newsletters",
    label: "Newsletters",
    description: "Teacher newsletter creation and distribution",
  },
  {
    key: "classes",
    label: "Classes",
    description: "Class lists and class details",
  },
  {
    key: "students",
    label: "Students",
    description: "Student lists and student learning pages",
  },
  {
    key: "reports",
    label: "Reports",
    description: "Teacher reports and analytics",
  },
];

export const SCHOOL_PAGE_ACCESS_ROLES = [
  "admin",
  "teacher",
  "student",
  "department_principal",
  "staff",
];

const API_PAGE_PREFIXES = [
  ["/api/attendance-taking-reminders", "attendanceReminders"],
  ["/api/teachers", "teachers"],
  ["/api/users", "userManagement"],
  ["/api/subscriptions", "subscription"],
  ["/api/finance", "finance"],
  ["/api/sbr/scales", "sbrConfig"],
  ["/api/lessons", "lessons"],
  ["/api/worksheets", "worksheets"],
  ["/api/sbr", "sbrReports"],
  ["/api/school-calendar", "schoolCalendar"],
  ["/api/attendance-requests", "attendanceRequests"],
  ["/api/live", "liveLessons"],
  ["/api/curriculum-maps", "curriculumMaps"],
  ["/api/curriculum-settings", "curriculumMaps"],
  ["/api/interventions", "interventions"],
  ["/api/academic-excellence", "academicExcellence"],
  ["/api/reading", "reading"],
  ["/api/social-studies", "socialStudies"],
  ["/api/revision", "revisionPlans"],
  ["/api/presentations", "presentations"],
  ["/api/standard-assignments", "standardsAssessments"],
  ["/api/assignments", "assignments"],
  ["/api/homework", "assignments"],
  ["/api/grades", "gradebook"],
  ["/api/gradebook", "gradebook"],
  ["/api/report-cards", "gradebook"],
  ["/api/attendance", "attendance"],
  ["/api/spelling", "spelling"],
  ["/api/vocabulary", "vocabulary"],
  ["/api/standard-assessment", "standardsAssessments"],
  ["/api/standards", "standardsAssessments"],
  ["/api/grammar-tests", "standardsAssessments"],
  ["/api/map-prep", "mapTestPrep"],
  ["/api/map-practice", "mapTestPrep"],
  ["/api/student-behavior", "behavior"],
  ["/api/student-grouping", "studentGrouping"],
  ["/api/timetable", "timetable"],
  ["/api/schedules-enhanced", "scheduleManagement"],
  ["/api/schedules", "scheduleManagement"],
  ["/api/plp", "plp"],
  ["/api/messages", "messages"],
  ["/api/communication-email", "emailComposer"],
  ["/api/notifications", "notifications"],
  ["/api/newsletters", "newsletters"],
  ["/api/students", "students"],
  ["/api/reports", "reports"],
  ["/api/analytics", "reports"],
];

const API_PAGE_PATH_MATCHERS = [
  [
    /^\/api\/students\/[^/]+\/academic-excellence(?:\/|$)/,
    "academicExcellence",
  ],
  [
    /^\/api\/students\/[^/]+\/(?:learning-trace|parent-learning-summary)(?:\/|$)/,
    "reports",
  ],
  [
    /^\/api\/classes\/[^/]+\/(?:analytics|insights|objective-performance|academic-excellence)(?:\/|$)/,
    "academicExcellence",
  ],
];

export const getSchoolPageAccess = (settings = {}) => {
  const saved = settings?.userPageAccess || {};
  return Object.fromEntries(
    SCHOOL_PAGE_ACCESS_ROLES.map((role) => [
      role,
      Object.fromEntries(
        SCHOOL_PAGE_ACCESS_PAGES.map(({ key, recoveryRoles = [] }) => [
          key,
          recoveryRoles.includes(role) || saved[role]?.[key] !== false,
        ]),
      ),
    ]),
  );
};

export const getSchoolPageForApiPath = (pathname, role = null) => {
  const normalizedPath =
    String(pathname || "")
      .split("?")[0]
      .replace(/\/+$/, "") || "/";
  if (normalizedPath === "/api/sbr/scales" || normalizedPath.startsWith("/api/sbr/scales/")) return "sbrConfig";
  if (normalizedPath === "/api/schools/me/subscription") return "subscription";
  if (/^\/api\/students\/promotion(?:\/|$)/.test(normalizedPath)) return "promotionCenter";
  if (
    normalizedPath === "/api/academic-excellence" ||
    normalizedPath.startsWith("/api/academic-excellence/")
  ) {
    return role === "admin" ? "academicExcellenceAnalytics" : "academicExcellence";
  }
  if (
    normalizedPath === "/api/newsletters/admin" ||
    normalizedPath.startsWith("/api/newsletters/admin/")
  ) {
    return "newslettersReview";
  }
  if (
    normalizedPath === "/api/practice" ||
    normalizedPath.startsWith("/api/practice/")
  ) {
    return role === "student" ? "studentPractice" : "standardsAssessments";
  }
  const specificMatch = API_PAGE_PATH_MATCHERS.find(([pattern]) =>
    pattern.test(normalizedPath),
  );
  if (specificMatch) return specificMatch[1];
  const match = API_PAGE_PREFIXES.find(
    ([prefix]) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
  return match?.[1] || null;
};

export const getSchoolPageAccessForRole = (settings, role, pageKey) => {
  if (!SCHOOL_PAGE_ACCESS_ROLES.includes(role) || !pageKey) return true;
  const page = SCHOOL_PAGE_ACCESS_PAGES.find(({ key }) => key === pageKey);
  if (page?.recoveryRoles?.includes(role)) return true;
  return getSchoolPageAccess(settings)[role][pageKey] !== false;
};
