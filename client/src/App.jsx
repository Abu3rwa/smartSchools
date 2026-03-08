import { useEffect, useMemo } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { getTheme } from "./theme";
import {
  selectIsAuthenticated,
  selectAuth,
  selectUser,
  fetchCurrentUser,
} from "./store/slices/authSlice";
import {
  fetchSchoolAcademicYear,
  selectTheme,
  setCurrentAcademicYear,
} from "./store/slices/uiSlice";
import { fetchSchoolFeatures } from "./store/slices/schoolFeaturesSlice";

// Layouts
import MainLayout from "./components/layout/MainLayout";
import AdminLayout from "./components/layout/AdminLayout";
import FeatureGate from "./components/FeatureGate";

// Pages
import LandingPage from "./pages/landing/LandingPage";
import RegisterSchoolPage from "./pages/auth/RegisterSchoolPage";
import LoginPage from "./pages/auth/LoginPage";
import AuthCallbackPage from "./pages/auth/AuthCallbackPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import ClassesPage from "./pages/classes/ClassesPage";
import ClassDetailPage from "./pages/classes/ClassDetailPage";
import StudentsPage from "./pages/students/StudentsPage";
import StudentDetailPage from "./pages/students/StudentDetailPage";
import GradeEntryPage from "./pages/grades/GradeEntryPage";
import GradeReportPage from "./pages/grades/GradeReportPage";
import WeeklyReportPage from "./pages/reports/WeeklyReportPage";
import GradebookPage from "./pages/gradebook/GradebookPage";
import GradebookRedirectPage from "./pages/gradebook/GradebookRedirectPage";
import TeachersPage from "./pages/teachers/TeachersPage";
import TeacherDetailsPage from "./pages/teachers/TeacherDetailsPage";
import SubjectsPage from "./pages/subjects/SubjectsPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import MessagesPage from "./pages/messages/MessagesPage";
import EmailComposerPage from "./pages/communication/EmailComposerPage";
import SettingsPage from "./pages/settings/SettingsPage";
import SchoolSettingsPage from "./pages/schoolSettings/SchoolSettingsPage";
import AdminSchedulePage from "./pages/admin/schedule/AdminSchedulePage";
import AdminAttendancePage from "./pages/admin/attendance/AdminAttendancePage";
import AdminAttendanceRequestsPage from "./pages/admin/attendanceRequests/AdminAttendanceRequestsPage";
import AdminAttendanceRequestTypesPage from "./pages/admin/attendanceRequestTypes/AdminAttendanceRequestTypesPage";
import AdminSchoolCalendarPage from "./pages/admin/calendar/AdminSchoolCalendarPage";
import AdminTimetablePage from "./pages/admin/timetable/AdminTimetablePage";
import TeacherSchedulePage from "./pages/teacher/schedule/TeacherSchedulePage";
import TeacherTimetablePage from "./pages/teacher/timetable/TeacherTimetablePage";
import TeacherAttendanceNewPage from "./pages/teacher/attendance/TeacherAttendanceNewPage";
import TeacherNewslettersPage from "./pages/teacher/newsletters/TeacherNewslettersPage";
import LessonPlanPage from "./pages/lessonPlan/LessonPlanPage";
import LessonPlanDetailPage from "./pages/lessonPlan/LessonPlanDetailPage";
import AssignmentsPage from "./pages/assignments/AssignmentsPage";
import AdminNewslettersPage from "./pages/admin/newsletters/AdminNewslettersPage";
import ParentNewslettersPage from "./pages/parent/newsletters/ParentNewslettersPage";
import AttendanceRemindersPage from "./pages/admin/attendanceReminders/AttendanceRemindersPage";
import BehaviorManagementPage from "./pages/behavior/BehaviorManagementPage";
import BehaviorTrackingDashboardPage from "./pages/behavior/BehaviorTrackingDashboardPage";
import BehaviorAutoTracker from "./components/behavior/BehaviorAutoTracker";

// Report Pages
import AdvancedReportGenerator from "./pages/reports/AdvancedReportGenerator";
import ReportAnalytics from "./pages/reports/ReportAnalytics";
import ReportTemplates from "./pages/reports/ReportTemplates";
import ReportHistory from "./pages/reports/ReportHistory";

// Standards Practice Pages
import StandardsPage from "./pages/standards/StandardsPage";
import StandardAssignPage from "./pages/standards/StandardAssignPage";
import PracticeDashboardPage from "./pages/student/practice/PracticeDashboardPage";
import PracticeSessionPage from "./pages/student/practice/PracticeSessionPage";
import PracticeHistoryPage from "./pages/student/practice/PracticeHistoryPage";
import PracticeAssessmentResultsPage from "./pages/student/practice/PracticeAssessmentResultsPage";
import InterventionQueuePage from "./pages/interventions/InterventionQueuePage";
import StudentGradesPage from "./pages/student/academics/StudentGradesPage";
import StudentAttendancePage from "./pages/student/attendance/StudentAttendancePage";
import AttendanceRequestFormPage from "./pages/attendance/AttendanceRequestFormPage";
import MyAttendanceRequestsPage from "./pages/attendance/MyAttendanceRequestsPage";
import RevisionPlansListPage from "./pages/revisionPlans/RevisionPlansListPage";
import RevisionPlanCreatePage from "./pages/revisionPlans/RevisionPlanCreatePage";
import RevisionPlanViewPage from "./pages/revisionPlans/RevisionPlanViewPage";
import ReadingMyAssignmentsPage from "./pages/student/reading/ReadingMyAssignmentsPage";
import ReadingTextsListPage from "./pages/teacher/reading/ReadingTextsListPage";
import ReadingUploadPage from "./pages/teacher/reading/ReadingUploadPage";
import ReadingViewPage from "./pages/student/reading/ReadingViewPage";

// Substitution pages
import CreateSubRequest from "./pages/substitutions/CreateSubRequest";
import SubRequestsList from "./pages/substitutions/SubRequestsList";
import SubRequestDetail from "./pages/substitutions/SubRequestDetail";
import SubstitutionRespond from "./pages/substitutions/SubstitutionRespond";

// Platform Admin Pages
import SuperAdminDashboardPage from "./pages/superAdmin/SuperAdminDashboardPage";
import SuperAdminSchoolsPage from "./pages/superAdmin/SuperAdminSchoolsPage";
import SuperAdminSchoolDetailsPage from "./pages/superAdmin/SuperAdminSchoolDetailsPage";
import SuperAdminUsersPage from "./pages/superAdmin/SuperAdminUsersPage";
import SuperAdminSettingsPage from "./pages/superAdmin/SuperAdminSettingsPage";
import SuperAdminSubscriptionsPage from "./pages/superAdmin/SuperAdminSubscriptionsPage";
import SuperAdminSubscriptionDetailsPage from "./pages/superAdmin/SuperAdminSubscriptionDetailsPage";
import BehaviorAnalyticsPage from "./pages/superAdmin/BehaviorAnalyticsPage";
import SuperAdminLandingPageEditor from "./pages/superAdmin/SuperAdminLandingPageEditor";
import ApiDocsPage from "./pages/docs/ApiDocsPage";

// Protected Route - requires authentication
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const { loading } = useSelector(selectAuth);

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Portal Route - super_admin must use /admin/*
const PortalRoute = ({ children }) => {
  const user = useSelector(selectUser);
  const { loading } = useSelector(selectAuth);

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
      </div>
    );
  }

  if (user?.role === "super_admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
};

// Role Route - requires specific role(s)
const RoleRoute = ({ roles = [], permissions = [], children }) => {
  const user = useSelector(selectUser);
  const { loading } = useSelector(selectAuth);

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  // super_admin should only access routes that explicitly allow it
  if (user.role === "super_admin") {
    return roles.includes("super_admin") ? (
      children
    ) : (
      <Navigate to="/admin/dashboard" replace />
    );
  }

  const hasRoleAccess = roles.includes(user.role);
  const userPermissions = Array.isArray(user.permissions) ? user.permissions : [];
  const hasPermissionAccess =
    permissions.length > 0 && permissions.some((permission) => userPermissions.includes(permission));

  if (!hasRoleAccess && !hasPermissionAccess) return <Navigate to="/portal" replace />;

  return children;
};

function App() {
  const dispatch = useDispatch();
  const themeMode = useSelector(selectTheme);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const muiTheme = useMemo(() => getTheme(themeMode), [themeMode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && isAuthenticated) {
      dispatch(fetchCurrentUser());
    }
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user || user.role === "super_admin") return;

    const configuredYear = user?.school?.settings?.currentAcademicYear;
    if (configuredYear) {
      dispatch(setCurrentAcademicYear(configuredYear));
    }

    dispatch(fetchSchoolAcademicYear());
    dispatch(fetchSchoolFeatures());
  }, [dispatch, isAuthenticated, user?.id, user?.role, user?.school?.settings?.currentAcademicYear]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <BehaviorAutoTracker />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/register-school" element={<RegisterSchoolPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/:schoolSlug" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/substitutions/respond" element={<SubstitutionRespond />} />

        {/* Protected Routes */}
        <Route
          path="/portal/*"
          element={
            <ProtectedRoute>
              <PortalRoute>
                <MainLayout />
              </PortalRoute>
            </ProtectedRoute>
          }
        >
          {/* All authenticated users */}
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="school-settings"
            element={
              <RoleRoute
                roles={["admin"]}
                permissions={["manage_users", "manage_school_settings"]}
              >
                <SchoolSettingsPage />
              </RoleRoute>
            }
          />
          <Route
            path="api-docs"
            element={
              <RoleRoute roles={["admin", "super_admin"]}>
                <FeatureGate feature="apiAccess" showUpgradePrompt>
                  <ApiDocsPage />
                </FeatureGate>
              </RoleRoute>
            }
          />

          {/* Admin + Department Principal + Teacher */}
          <Route
            path="classes"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <ClassesPage />
              </RoleRoute>
            }
          />
          <Route
            path="classes/:id"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <ClassDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="gradebook"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <GradebookRedirectPage />
              </RoleRoute>
            }
          />
          <Route
            path="classes/:classId/gradebook"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <GradebookPage />
              </RoleRoute>
            }
          />
          <Route
            path="students"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <StudentsPage />
              </RoleRoute>
            }
          />
          <Route
            path="students/:id"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <StudentDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="grades/entry"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <GradeEntryPage />
              </RoleRoute>
            }
          />
          <Route
            path="grades/report/:studentId"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <GradeReportPage />
              </RoleRoute>
            }
          />
          <Route
            path="grades/student/:studentId"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <StudentGradesPage />
              </RoleRoute>
            }
          />
          <Route
            path="grades/weekly/class/:classId"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <WeeklyReportPage />
              </RoleRoute>
            }
          />
          <Route
            path="lessons"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <LessonPlanPage />
              </RoleRoute>
            }
          />
          <Route
            path="lessons/:id"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <LessonPlanDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="assignments"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <AssignmentsPage />
              </RoleRoute>
            }
          />
          <Route path="homework" element={<Navigate to="/portal/assignments" replace />} />
          <Route
            path="subjects"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <SubjectsPage />
              </RoleRoute>
            }
          />
          <Route
            path="notifications"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <NotificationsPage />
              </RoleRoute>
            }
          />
          <Route
            path="messages"
            element={
              <RoleRoute roles={["admin", "teacher", "department_principal", "staff"]}>
                <MessagesPage />
              </RoleRoute>
            }
          />
          <Route
            path="email-composer"
            element={
              <RoleRoute
                roles={["admin", "teacher", "department_principal", "staff"]}
                permissions={["send_communication_emails", "send_notifications"]}
              >
                <EmailComposerPage />
              </RoleRoute>
            }
          />
          <Route
            path="schedules"
            element={
              <RoleRoute roles={["admin"]}>
                <AdminSchedulePage />
              </RoleRoute>
            }
          />
          <Route
            path="school-calendar"
            element={
              <RoleRoute
                roles={["admin", "department_principal", "teacher"]}
                permissions={["manage_events"]}
              >
                <AdminSchoolCalendarPage />
              </RoleRoute>
            }
          />
          <Route
            path="timetable"
            element={
              <RoleRoute roles={["admin", "department_principal"]}>
                <AdminTimetablePage />
              </RoleRoute>
            }
          />
          <Route
            path="attendance"
            element={
              <RoleRoute roles={["admin", "department_principal"]}>
                <AdminAttendancePage />
              </RoleRoute>
            }
          />
          <Route
            path="newsletters/admin"
            element={
              <RoleRoute roles={["admin"]}>
                <AdminNewslettersPage />
              </RoleRoute>
            }
          />
          <Route
            path="attendance-reminders"
            element={
              <RoleRoute roles={["admin", "department_principal"]}>
                <AttendanceRemindersPage />
              </RoleRoute>
            }
          />
          <Route
            path="behavior"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <BehaviorManagementPage />
              </RoleRoute>
            }
          />
          <Route
            path="behavior-analytics"
            element={
              <RoleRoute roles={["admin", "department_principal", "super_admin"]}>
                <BehaviorTrackingDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="my-schedule"
            element={
              <RoleRoute roles={["teacher"]}>
                <TeacherSchedulePage />
              </RoleRoute>
            }
          />
          <Route
            path="my-timetable"
            element={
              <RoleRoute roles={["teacher", "admin"]}>
                <TeacherTimetablePage />
              </RoleRoute>
            }
          />
          <Route
            path="my-attendance"
            element={
              <RoleRoute roles={["teacher"]}>
                <TeacherAttendanceNewPage />
              </RoleRoute>
            }
          />
          <Route
            path="newsletters"
            element={
              <RoleRoute roles={["teacher"]}>
                <TeacherNewslettersPage />
              </RoleRoute>
            }
          />
          <Route
            path="newsletters/history"
            element={
              <RoleRoute roles={["parent"]}>
                <ParentNewslettersPage />
              </RoleRoute>
            }
          />

          {/* Admin + Department Principal */}
          <Route
            path="teachers"
            element={
              <RoleRoute roles={["admin", "department_principal"]}>
                <TeachersPage />
              </RoleRoute>
            }
          />
          <Route
            path="teachers/:id"
            element={
              <RoleRoute roles={["admin", "department_principal"]}>
                <TeacherDetailsPage />
              </RoleRoute>
            }
          />

          {/* Attendance Requests: submit form + my list (all requesters) */}
          <Route
            path="attendance-request"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher", "parent", "student"]}>
                <AttendanceRequestFormPage />
              </RoleRoute>
            }
          />
          <Route
            path="attendance-requests"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher", "parent", "student"]}>
                <MyAttendanceRequestsPage />
              </RoleRoute>
            }
          />
          {/* Principal: review queue */}
          <Route
            path="review-attendance-requests"
            element={
              <RoleRoute roles={["admin", "department_principal"]}>
                <AdminAttendanceRequestsPage />
              </RoleRoute>
            }
          />
          <Route
            path="substitutions/create"
            element={
              <RoleRoute roles={["admin", "department_principal"]}>
                <CreateSubRequest />
              </RoleRoute>
            }
          />
          <Route
            path="substitutions/:id"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <SubRequestDetail />
              </RoleRoute>
            }
          />
          <Route
            path="substitutions"
            element={
              <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                <SubRequestsList />
              </RoleRoute>
            }
          />
          <Route
            path="attendance-request-types"
            element={
              <RoleRoute roles={["admin"]}>
                <AdminAttendanceRequestTypesPage />
              </RoleRoute>
            }
          />

          {/* Reports Routes */}
          <Route
            path="reports/generator"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <FeatureGate feature="customReports" showUpgradePrompt>
                  <AdvancedReportGenerator />
                </FeatureGate>
              </RoleRoute>
            }
          />
          <Route
            path="reports/analytics"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <FeatureGate feature="advancedAnalytics" showUpgradePrompt>
                  <ReportAnalytics />
                </FeatureGate>
              </RoleRoute>
            }
          />
          <Route
            path="reports/templates"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <ReportTemplates />
              </RoleRoute>
            }
          />
          <Route
            path="reports/history"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <ReportHistory />
              </RoleRoute>
            }
          />

          {/* Standards Practice Routes */}
          <Route
            path="standards"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <StandardsPage />
              </RoleRoute>
            }
          />
          <Route
            path="standards/assign"
            element={
              <RoleRoute roles={["admin", "teacher"]}>
                <StandardAssignPage />
              </RoleRoute>
            }
          />
          <Route
            path="practice"
            element={
              <RoleRoute roles={["student"]}>
                <PracticeDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="practice/:assignmentId"
            element={
              <RoleRoute roles={["student"]}>
                <PracticeSessionPage />
              </RoleRoute>
            }
          />
          <Route
            path="practice/:assignmentId/history"
            element={
              <RoleRoute roles={["student"]}>
                <PracticeHistoryPage />
              </RoleRoute>
            }
          />
          <Route
            path="practice/sb-results"
            element={
              <RoleRoute roles={["student"]}>
                <PracticeAssessmentResultsPage />
              </RoleRoute>
            }
          />
          <Route
            path="interventions"
            element={
              <RoleRoute roles={["admin", "teacher", "department_principal"]}>
                <InterventionQueuePage />
              </RoleRoute>
            }
          />
          <Route
            path="my-grades"
            element={
              <RoleRoute roles={["student"]}>
                <StudentGradesPage />
              </RoleRoute>
            }
          />
          <Route
            path="student-attendance"
            element={
              <RoleRoute roles={["student"]}>
                <StudentAttendancePage />
              </RoleRoute>
            }
          />
          {/* Revision Plans */}
          <Route
            path="revision"
            element={
              <RoleRoute roles={["student", "teacher", "admin"]}>
                <RevisionPlansListPage />
              </RoleRoute>
            }
          />
          <Route
            path="revision/create"
            element={
              <RoleRoute roles={["student", "teacher", "admin"]}>
                <RevisionPlanCreatePage />
              </RoleRoute>
            }
          />
          <Route
            path="revision/:planId"
            element={
              <RoleRoute roles={["student", "teacher", "admin"]}>
                <RevisionPlanViewPage />
              </RoleRoute>
            }
          />
          {/* Reading Assistant: student sees assignments and reader */}
          <Route
            path="reading"
            element={
              <RoleRoute roles={["student"]}>
                <ReadingMyAssignmentsPage />
              </RoleRoute>
            }
          />
          <Route
            path="reading/view/:textId"
            element={
              <RoleRoute roles={["student"]}>
                <ReadingViewPage />
              </RoleRoute>
            }
          />
          {/* Reading: teacher/admin manage texts and assign */}
          <Route
            path="reading/texts"
            element={
              <RoleRoute roles={["teacher", "admin"]}>
                <ReadingTextsListPage />
              </RoleRoute>
            }
          />
          <Route
            path="reading/upload"
            element={
              <RoleRoute roles={["teacher", "admin"]}>
                <ReadingUploadPage />
              </RoleRoute>
            }
          />
        </Route>

        {/* Platform Admin Routes (super_admin only) */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute>
              <RoleRoute roles={["super_admin"]}>
                <AdminLayout />
              </RoleRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<SuperAdminDashboardPage />} />
          <Route path="dashboard" element={<SuperAdminDashboardPage />} />
          <Route path="schools" element={<SuperAdminSchoolsPage />} />
          <Route path="schools/new" element={<SuperAdminSchoolsPage />} />
          <Route path="schools/:id" element={<SuperAdminSchoolDetailsPage />} />
          <Route path="users" element={<SuperAdminUsersPage />} />
          <Route path="analytics" element={<BehaviorAnalyticsPage />} />
          <Route path="behavior-analytics" element={<BehaviorAnalyticsPage />} />
          <Route path="landing" element={<SuperAdminLandingPageEditor />} />
          <Route path="settings" element={<SuperAdminSettingsPage />} />
          <Route path="subscriptions" element={<SuperAdminSubscriptionsPage />} />
          <Route
            path="subscriptions/:id"
            element={<SuperAdminSubscriptionDetailsPage />}
          />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
