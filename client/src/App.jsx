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

// Layouts
import MainLayout from "./components/layout/MainLayout";
import AdminLayout from "./components/layout/AdminLayout";

// Pages
import LandingPage from "./pages/LandingPage";
import RegisterSchoolPage from "./pages/RegisterSchoolPage";
import LoginPage from "./pages/LoginPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ClassesPage from "./pages/ClassesPage";
import ClassDetailPage from "./pages/ClassDetailPage";
import StudentsPage from "./pages/StudentsPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import GradeEntryPage from "./pages/GradeEntryPage";
import GradeReportPage from "./pages/GradeReportPage";
import WeeklyReportPage from "./pages/WeeklyReportPage";
import GradebookPage from "./pages/GradebookPage";
import TeachersPage from "./pages/TeachersPage";
import TeacherDetailsPage from "./pages/TeacherDetailsPage";
import SubjectsPage from "./pages/SubjectsPage";
import NotificationsPage from "./pages/NotificationsPage";
import MessagesPage from "./pages/MessagesPage";
import SettingsPage from "./pages/SettingsPage";
import SchoolSettingsPage from "./pages/SchoolSettingsPage";
import AdminSchedulePage from "./pages/admin/AdminSchedulePage";
import AdminAttendancePage from "./pages/admin/AdminAttendancePage";
import AdminAttendanceRequestsPage from "./pages/admin/AdminAttendanceRequestsPage";
import AdminAttendanceRequestTypesPage from "./pages/admin/AdminAttendanceRequestTypesPage";
import AdminSchoolCalendarPage from "./pages/admin/AdminSchoolCalendarPage";
import AdminTimetablePage from "./pages/admin/AdminTimetablePage";
import TeacherSchedulePage from "./pages/teacher/TeacherSchedulePage";
import TeacherTimetablePage from "./pages/teacher/TeacherTimetablePage";
import TeacherAttendanceNewPage from "./pages/teacher/TeacherAttendanceNewPage";
import TeacherNewslettersPage from "./pages/teacher/TeacherNewslettersPage";
import LessonPlanPage from "./pages/LessonPlanPage";
import AdminNewslettersPage from "./pages/admin/AdminNewslettersPage";
import AttendanceRemindersPage from "./pages/admin/AttendanceRemindersPage";
import BehaviorManagementPage from "./pages/BehaviorManagementPage";
import BehaviorTrackingDashboardPage from "./pages/BehaviorTrackingDashboardPage";
import BehaviorAutoTracker from "./components/behavior/BehaviorAutoTracker";

// Report Pages
import AdvancedReportGenerator from "./pages/reports/AdvancedReportGenerator";
import ReportAnalytics from "./pages/reports/ReportAnalytics";
import ReportTemplates from "./pages/reports/ReportTemplates";
import ReportHistory from "./pages/reports/ReportHistory";

// Standards Practice Pages
import StandardsPage from "./pages/StandardsPage";
import StandardAssignPage from "./pages/StandardAssignPage";
import PracticeDashboardPage from "./pages/PracticeDashboardPage";
import PracticeSessionPage from "./pages/PracticeSessionPage";
import PracticeHistoryPage from "./pages/PracticeHistoryPage";
import InterventionQueuePage from "./pages/InterventionQueuePage";
import StudentGradesPage from "./pages/StudentGradesPage";
import StudentAttendancePage from "./pages/StudentAttendancePage";
import AttendanceRequestFormPage from "./pages/AttendanceRequestFormPage";
import MyAttendanceRequestsPage from "./pages/MyAttendanceRequestsPage";
import RevisionPlansListPage from "./pages/RevisionPlansListPage";
import RevisionPlanCreatePage from "./pages/RevisionPlanCreatePage";
import RevisionPlanViewPage from "./pages/RevisionPlanViewPage";
import ReadingMyAssignmentsPage from "./pages/ReadingMyAssignmentsPage";
import ReadingTextsListPage from "./pages/ReadingTextsListPage";
import ReadingUploadPage from "./pages/ReadingUploadPage";
import ReadingViewPage from "./pages/ReadingViewPage";

// Substitution pages
import CreateSubRequest from "./pages/substitutions/CreateSubRequest";
import SubRequestsList from "./pages/substitutions/SubRequestsList";
import SubRequestDetail from "./pages/substitutions/SubRequestDetail";
import SubstitutionRespond from "./pages/substitutions/SubstitutionRespond";

// Platform Admin Pages
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminSchoolsPage from "./pages/admin/AdminSchoolsPage";
import AdminSchoolDetailsPage from "./pages/admin/AdminSchoolDetailsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminSubscriptionsPage from "./pages/admin/AdminSubscriptionsPage";
import AdminSubscriptionDetailsPage from "./pages/admin/AdminSubscriptionDetailsPage";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage";
import AdminLandingPageEditor from "./pages/admin/AdminLandingPageEditor";
import ApiDocsPage from "./pages/ApiDocsPage";

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
              <ApiDocsPage />
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
            <RoleRoute roles={["admin"]}>
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
              <AdvancedReportGenerator />
            </RoleRoute>
          }
        />
        <Route
          path="reports/analytics"
          element={
            <RoleRoute roles={["admin", "teacher"]}>
              <ReportAnalytics />
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
          path="my-attendance"
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
        <Route index element={<AdminDashboardPage />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="schools" element={<AdminSchoolsPage />} />
        <Route path="schools/new" element={<AdminSchoolsPage />} />
        <Route path="schools/:id" element={<AdminSchoolDetailsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="landing" element={<AdminLandingPageEditor />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
        <Route
                    path="subscriptions/:id"
                    element={<AdminSubscriptionDetailsPage />}
                  />
                  <Route path="analytics" element={<AdminAnalyticsPage />} />
                </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
