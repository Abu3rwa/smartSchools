export const SCHOOL_PAGE_ACCESS_PAGES = [
  { key: "liveLessons", label: "Live Lessons", paths: ["/portal/live-lessons"] },
  { key: "curriculumMaps", label: "Curriculum maps", paths: ["/portal/curriculum"] },
  { key: "interventions", label: "Interventions", paths: ["/portal/interventions"] },
  { key: "academicExcellence", label: "Academic excellence", paths: ["/portal/teacher-academic-excellence", "/portal/academic-excellence"] },
  { key: "reading", label: "Reading", paths: ["/portal/reading"] },
  { key: "socialStudies", label: "Social Studies", paths: ["/portal/social-studies"] },
  { key: "revisionPlans", label: "Revision plans", paths: ["/portal/revision"] },
  { key: "presentations", label: "Presentations", paths: ["/portal/presentations"] },
  { key: "assignments", label: "Assignments", paths: ["/portal/assignments", "/portal/my-assignments"] },
  { key: "gradebook", label: "Gradebook and grades", paths: ["/portal/gradebook", "/portal/grades"] },
  { key: "attendance", label: "Attendance", paths: ["/portal/attendance", "/portal/my-attendance", "/portal/student-attendance"] },
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
];

export const getSchoolPageKeyForPath = (pathname = "") => {
  if (/^\/portal\/classes\/[^/]+\/gradebook(?:\/|$)/.test(pathname)) return "gradebook";
  if (/^\/portal\/students\/[^/]+\/spelling(?:\/|$)/.test(pathname)) return "spelling";
  const page = SCHOOL_PAGE_ACCESS_PAGES.find(({ paths }) =>
    paths.some((path) => pathname === path || pathname.startsWith(path.endsWith("/") ? path : `${path}/`)),
  );
  return page?.key || null;
};
