import { lazy, Suspense, useEffect, useMemo } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { getTheme } from "./theme";
import i18n from "./i18n";
import { isRtlLanguage, normalizeLanguage } from "./i18n/config";
import { ltrCache, rtlCache } from "./i18n/rtlCache";
import {
  selectIsAuthenticated,
  selectAuth,
  selectUser,
  fetchCurrentUser,
} from "./store/slices/authSlice";
import {
  fetchSchoolAcademicYear,
  fetchAppName,
  selectLanguage,
  selectTheme,
  setCurrentAcademicYear,
} from "./store/slices/uiSlice";
import { fetchSchoolFeatures } from "./store/slices/schoolFeaturesSlice";

// Layouts
import MainLayout from "./components/layout/MainLayout";
import AdminLayout from "./components/layout/AdminLayout";
import FeatureGate from "./components/FeatureGate";

import BehaviorAutoTracker from "./components/behavior/BehaviorAutoTracker";
import ErrorBoundary from "./components/ErrorBoundary";

const LandingPage = lazy(() => import("./pages/landing/LandingPage"));
const RegisterSchoolPage = lazy(() => import("./pages/auth/RegisterSchoolPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const AuthCallbackPage = lazy(() => import("./pages/auth/AuthCallbackPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const ForcePasswordChangePage = lazy(() => import("./pages/auth/ForcePasswordChangePage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const ClassesPage = lazy(() => import("./pages/classes/ClassesPage"));
const ClassDetailPage = lazy(() => import("./pages/classes/ClassDetailPage"));
const StudentsPage = lazy(() => import("./pages/students/StudentsPage"));
const PromotionCenterPage = lazy(() => import("./pages/students/PromotionCenterPage"));
const StudentDetailPage = lazy(() => import("./pages/students/StudentDetailPage"));
const GradeEntryPage = lazy(() => import("./pages/grades/GradeEntryPage"));
const GradeReportPage = lazy(() => import("./pages/grades/GradeReportPage"));
const WeeklyReportPage = lazy(() => import("./pages/reports/WeeklyReportPage"));
const WeeklyReportRedirectPage = lazy(() => import("./pages/reports/WeeklyReportPage/WeeklyReportRedirectPage"));
const GradebookPage = lazy(() => import("./pages/gradebook/GradebookPage"));
const GradebookRedirectPage = lazy(() => import("./pages/gradebook/GradebookRedirectPage"));
const ReportCardManagerPage = lazy(() => import("./pages/reportCards/ReportCardManagerPage"));
const ParentGradebookPage = lazy(() => import("./pages/parentGradebook/ParentGradebookPage"));
const ParentPlpReportPage = lazy(() => import("./pages/parentPlp/ParentPlpReportPage"));
const GradeAnalyticsDashboardPage = lazy(() => import("./pages/gradebook/GradebookPage/components/GradeAnalyticsDashboard"));
const TeachersPage = lazy(() => import("./pages/teachers/TeachersPage"));
const TeacherDetailsPage = lazy(() => import("./pages/teachers/TeacherDetailsPage"));
const SubjectsPage = lazy(() => import("./pages/subjects/SubjectsPage"));
const NotificationsPage = lazy(() => import("./pages/notifications/NotificationsPage"));
const MessagesPage = lazy(() => import("./pages/messages/MessagesPage"));
const EmailComposerPage = lazy(() => import("./pages/EmailComposerPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const SubscriptionPage = lazy(() => import("./pages/settings/SubscriptionPage/SubscriptionPage"));
const SchoolSettingsPage = lazy(() => import("./pages/schoolSettings/SchoolSettingsPage"));
const SchoolUserManagementPage = lazy(() => import("./pages/userManagement/SchoolUserManagementPage"));
const AdminSchedulePage = lazy(() => import("./pages/admin/schedule/AdminSchedulePage"));
const AdminAttendancePage = lazy(() => import("./pages/admin/attendance/AdminAttendancePage"));
const AdminAttendanceRequestsPage = lazy(() => import("./pages/admin/attendanceRequests/AdminAttendanceRequestsPage"));
const AdminAttendanceRequestTypesPage = lazy(() => import("./pages/admin/attendanceRequestTypes/AdminAttendanceRequestTypesPage"));
const AdminSchoolCalendarPage = lazy(() => import("./pages/admin/calendar/AdminSchoolCalendarPage"));
const AdminTimetablePage = lazy(() => import("./pages/admin/timetable/AdminTimetablePage"));
const TeacherSchedulePage = lazy(() => import("./pages/teacher/schedule/TeacherSchedulePage"));
const TeacherTimetablePage = lazy(() => import("./pages/teacher/timetable/TeacherTimetablePage"));
const TeacherAttendanceNewPage = lazy(() => import("./pages/teacher/attendance/TeacherAttendanceNewPage"));
const TeacherNewslettersPage = lazy(() => import("./pages/teacher/newsletters/TeacherNewslettersPage"));
const LessonPlanPage = lazy(() => import("./pages/lessonPlan/LessonPlanPage"));
const LessonPlanDetailPage = lazy(() => import("./pages/lessonPlan/LessonPlanDetailPage"));
const AssignmentsPage = lazy(() => import("./pages/assignments/AssignmentsPage"));
const AdminNewslettersPage = lazy(() => import("./pages/admin/newsletters/AdminNewslettersPage"));
const NewsletterTemplatesPage = lazy(() => import("./pages/admin/newsletters/NewsletterTemplatesPage"));
const ParentNewslettersPage = lazy(() => import("./pages/parent/newsletters/ParentNewslettersPage"));
const SBRConfigPage = lazy(() => import("./pages/sbr/SBRConfigPage"));
const SBRGenerationPage = lazy(() => import("./pages/sbr/SBRGenerationPage"));
const SBRParentReportsPage = lazy(() => import("./pages/sbr/SBRParentReportsPage"));
const SBRHubPage = lazy(() => import("./pages/sbr/SBRHubPage/SBRHubPage"));
const AttendanceRemindersPage = lazy(() => import("./pages/admin/attendanceReminders/AttendanceRemindersPage"));
const BehaviorManagementPage = lazy(() => import("./pages/behavior/BehaviorManagementPage"));
const BehaviorTrackingDashboardPage = lazy(() => import("./pages/behavior/BehaviorTrackingDashboardPage"));
const AdvancedReportGenerator = lazy(() => import("./pages/reports/AdvancedReportGenerator"));
const ReportAnalytics = lazy(() => import("./pages/reports/ReportAnalytics"));
const ReportTemplates = lazy(() => import("./pages/reports/ReportTemplates"));
const ReportHistory = lazy(() => import("./pages/reports/ReportHistory"));
const StandardsPage = lazy(() => import("./pages/standards/StandardsPage"));
const StandardAssignPage = lazy(() => import("./pages/standards/StandardAssignPage"));
const GrammarAssessmentPage = lazy(() => import("./pages/grammar"));
const StandardsGradebookPage = lazy(() => import("./pages/standards/StandardsGradebookPage"));
const AssessmentPoolPage = lazy(() => import("./pages/standards/AssessmentPoolPage/AssessmentPoolPage"));
const AssessmentProgressPage = lazy(() => import("./pages/standards/AssessmentProgressPage/AssessmentProgressPage"));
const AssessmentNarrativePage = lazy(() => import("./pages/standards/AssessmentNarrativePage/AssessmentNarrativePage"));
const AssessmentLiveEditPage = lazy(() => import("./pages/standards/AssessmentLiveEditPage/AssessmentLiveEditPage"));
const AssessmentAuditPage = lazy(() => import("./pages/standards/AssessmentAuditPage/AssessmentAuditPage"));
const CurriculumPage = lazy(() => import("./pages/curriculum/CurriculumPage"));
const PracticeDashboardPage = lazy(() => import("./pages/student/practice/PracticeDashboardPage"));
const PracticeSessionPage = lazy(() => import("./pages/student/practice/PracticeSessionPage"));
const PracticeHistoryPage = lazy(() => import("./pages/student/practice/PracticeHistoryPage"));
const PracticeAssessmentResultsPage = lazy(() => import("./pages/student/practice/PracticeAssessmentResultsPage"));
const StudentMyAssignmentsPage = lazy(() => import("./pages/student/assignments/StudentMyAssignmentsPage"));
const StudentAssignmentDetailPage = lazy(() => import("./pages/student/assignments/StudentAssignmentDetailPage"));
const StudentAcademicExcellencePage = lazy(() => import("./pages/student/academicExcellence/StudentAcademicExcellencePage"));
const TeacherAcademicExcellencePage = lazy(() => import("./pages/teacher/academicExcellence/TeacherAcademicExcellencePage"));
const TeacherStudentGroupingPage = lazy(() => import("./pages/teacher/studentGrouping/TeacherStudentGroupingPage"));
const AdminAcademicExcellenceDashboard = lazy(() => import("./pages/admin/academicExcellence/AdminAcademicExcellenceDashboard"));
const InterventionQueuePage = lazy(() => import("./pages/interventions/InterventionQueuePage"));
const StudentGradesPage = lazy(() => import("./pages/student/academics/StudentGradesPage"));
const StudentAttendancePage = lazy(() => import("./pages/student/attendance/StudentAttendancePage"));
const AttendanceRequestFormPage = lazy(() => import("./pages/attendance/AttendanceRequestFormPage"));
const MyAttendanceRequestsPage = lazy(() => import("./pages/attendance/MyAttendanceRequestsPage"));
const RevisionPlansListPage = lazy(() => import("./pages/revisionPlans/RevisionPlansListPage"));
const RevisionPlanCreatePage = lazy(() => import("./pages/revisionPlans/RevisionPlanCreatePage"));
const RevisionPlanViewPage = lazy(() => import("./pages/revisionPlans/RevisionPlanViewPage"));
const ReadingMyAssignmentsPage = lazy(() => import("./pages/student/reading/ReadingMyAssignmentsPage"));
const ReadingTextsListPage = lazy(() => import("./pages/teacher/reading/ReadingTextsListPage"));
const ReadingUploadPage = lazy(() => import("./pages/teacher/reading/ReadingUploadPage"));
const ReadingViewPage = lazy(() => import("./pages/student/reading/ReadingViewPage"));
const CreateSubRequest = lazy(() => import("./pages/substitutions/CreateSubRequest"));
const SubRequestsList = lazy(() => import("./pages/substitutions/SubRequestsList"));
const SubRequestDetail = lazy(() => import("./pages/substitutions/SubRequestDetail"));
const SubstitutionRespond = lazy(() => import("./pages/substitutions/SubstitutionRespond"));
const SuperAdminDashboardPage = lazy(() => import("./pages/superAdmin/SuperAdminDashboardPage"));
const SuperAdminSchoolsPage = lazy(() => import("./pages/superAdmin/SuperAdminSchoolsPage"));
const SuperAdminSchoolDetailsPage = lazy(() => import("./pages/superAdmin/SuperAdminSchoolDetailsPage"));
const SuperAdminUsersPage = lazy(() => import("./pages/superAdmin/SuperAdminUsersPage"));
const SuperAdminSettingsPage = lazy(() => import("./pages/superAdmin/SuperAdminSettingsPage"));
const SuperAdminSubscriptionsPage = lazy(() => import("./pages/superAdmin/SuperAdminSubscriptionsPage"));
const SuperAdminSubscriptionDetailsPage = lazy(() => import("./pages/superAdmin/SuperAdminSubscriptionDetailsPage"));
const BehaviorAnalyticsPage = lazy(() => import("./pages/superAdmin/BehaviorAnalyticsPage"));
const SuperAdminLandingPageEditor = lazy(() => import("./pages/superAdmin/SuperAdminLandingPageEditor"));
const ApiDocsPage = lazy(() => import("./pages/docs/ApiDocsPage"));
const PresentationListPage = lazy(() => import("./pages/presentations/PresentationListPage/PresentationListPage"));
const PresentationEditorPage = lazy(() => import("./pages/presentations/PresentationEditorPage/PresentationEditorPage"));
const PresenterViewPage = lazy(() => import("./pages/presentations/PresenterViewPage/PresenterViewPage"));
const WorksheetListPage = lazy(() => import("./pages/worksheets/WorksheetListPage/WorksheetListPage"));
const WorksheetCreatePage = lazy(() => import("./pages/worksheets/WorksheetCreatePage/WorksheetCreatePage"));
const WorksheetDetailPage = lazy(() => import("./pages/worksheets/WorksheetDetailPage/WorksheetDetailPage"));
const FinanceDashboardPage = lazy(() => import("./pages/finance/FinanceDashboardPage"));
const FeeStructuresPage = lazy(() => import("./pages/finance/FeeStructuresPage"));
const DiscountsPage = lazy(() => import("./pages/finance/DiscountsPage"));
const InvoiceListPage = lazy(() => import("./pages/finance/InvoiceListPage"));
const InvoiceDetailPage = lazy(() => import("./pages/finance/InvoiceDetailPage"));
const InvoiceGeneratorPage = lazy(() => import("./pages/finance/InvoiceGeneratorPage"));
const PaymentsPage = lazy(() => import("./pages/finance/PaymentsPage"));
const FinanceReportsPage = lazy(() => import("./pages/finance/FinanceReportsPage"));

const HRDashboardPage = lazy(() => import("./pages/hr/HRDashboardPage"));
const StaffDirectoryPage = lazy(() => import("./pages/hr/StaffDirectoryPage"));
const StaffProfileDetailPage = lazy(() => import("./pages/hr/StaffProfileDetailPage"));
const LeaveManagementPage = lazy(() => import("./pages/hr/LeaveManagementPage"));
const LeaveSettingsPage = lazy(() => import("./pages/hr/LeaveSettingsPage"));
const CertificationsPage = lazy(() => import("./pages/hr/CertificationsPage"));
const PerformanceReviewsPage = lazy(() => import("./pages/hr/PerformanceReviewsPage"));
const PDLogPage = lazy(() => import("./pages/hr/PDLogPage"));
const MyHRPage = lazy(() => import("./pages/hr/MyHRPage"));
const HRSettingsPage = lazy(() => import("./pages/hr/HRSettingsPage"));

// PLP – Character Development
const PlpHubPage = lazy(() => import("./pages/plp/PlpHubPage"));
const PlpAdminConfigPage = lazy(() => import("./pages/plp/PlpAdminConfigPage"));
const PlpTeacherClassboardPage = lazy(() => import("./pages/plp/PlpTeacherClassboardPage"));
const PlpRecordDetailPage = lazy(() => import("./pages/plp/PlpRecordDetailPage"));
const PlpStudentEvidencePage = lazy(() => import("./pages/plp/PlpStudentEvidencePage"));
const PlpAwardsPage = lazy(() => import("./pages/plp/PlpAwardsPage"));
const PlpSupervisorAssignmentsPage = lazy(() => import("./pages/plp/PlpSupervisorAssignmentsPage"));
const PlpSupervisorDashboard = lazy(() => import("./pages/plp/PlpSupervisorDashboard"));
const PlpMyTasksPage = lazy(() => import("./pages/plp/PlpMyTasksPage"));

// Social Studies
const SocialStudiesShell = lazy(() => import("./pages/socialStudies/teacher/SocialStudiesShell"));
const SocialStudiesCurriculumPage = lazy(() => import("./pages/socialStudies/teacher/SocialStudiesCurriculumPage"));
const SocialStudiesUnitDetailPage = lazy(() => import("./pages/socialStudies/teacher/SocialStudiesUnitDetailPage"));
const SocialStudiesLessonEditorPage = lazy(() => import("./pages/socialStudies/teacher/SocialStudiesLessonEditorPage"));
const SocialStudiesAssignmentManagerPage = lazy(() => import("./pages/socialStudies/teacher/SocialStudiesAssignmentManagerPage"));
const SocialStudiesResultsPage = lazy(() => import("./pages/socialStudies/teacher/SocialStudiesResultsPage"));
const StudentSocialStudiesPage = lazy(() => import("./pages/socialStudies/student/StudentSocialStudiesPage"));
const StudentSocialStudiesLessonPage = lazy(() => import("./pages/socialStudies/student/StudentSocialStudiesLessonPage"));
const StudentSocialStudiesAssessmentPage = lazy(() => import("./pages/socialStudies/student/StudentSocialStudiesAssessmentPage"));
const StudentSocialStudiesResultsPage = lazy(() => import("./pages/socialStudies/student/StudentSocialStudiesResultsPage"));

const RouteLoadingFallback = () => (
  <div className="loading-overlay" role="status" aria-live="polite">
    <div className="spinner"></div>
  </div>
);

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
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
      </div>
    );
  }

  if (user?.role === "super_admin" && !location.pathname.startsWith("/portal/api-docs")) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
};

const PasswordChangeRoute = ({ children }) => {
  const user = useSelector(selectUser);
  const { loading } = useSelector(selectAuth);
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const isForcePasswordRoute = location.pathname === "/force-password-change";
  if (user.mustChangePassword && !isForcePasswordRoute) {
    return <Navigate to="/force-password-change" replace />;
  }

  if (!user.mustChangePassword && isForcePasswordRoute) {
    return <Navigate to={user.role === "super_admin" ? "/admin/dashboard" : "/portal/dashboard"} replace />;
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
  const selectedLanguage = useSelector(selectLanguage);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const language = useMemo(
    () => normalizeLanguage(selectedLanguage || i18n.resolvedLanguage),
    [selectedLanguage],
  );
  const direction = useMemo(() => (isRtlLanguage(language) ? "rtl" : "ltr"), [language]);
  const emotionCache = useMemo(
    () => (direction === "rtl" ? rtlCache : ltrCache),
    [direction],
  );
  const muiTheme = useMemo(() => getTheme(themeMode, direction), [themeMode, direction]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (i18n.resolvedLanguage !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
    document.documentElement.setAttribute("dir", direction);
    document.body.setAttribute("dir", direction);
  }, [language, direction]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && isAuthenticated) {
      dispatch(fetchCurrentUser());
    }
    // Fetch generic public app config
    dispatch(fetchAppName());
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user || user.role === "super_admin") return;

    const configuredYear = user?.school?.settings?.currentAcademicYear;
    if (configuredYear) {
      dispatch(setCurrentAcademicYear(configuredYear));
    }

    dispatch(fetchSchoolAcademicYear());
    dispatch(fetchSchoolFeatures());
  }, [dispatch, isAuthenticated, user, user?.id, user?.role, user?.school?.settings?.currentAcademicYear]);

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <BehaviorAutoTracker />
        <ErrorBoundary>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
          {/* Public Routes */}
          {/* <Route path="/" element={<LandingPage />} /> */}
          <Route path="/register-school" element={<RegisterSchoolPage />} />
          <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={<LoginPage />} />

          <Route path="/login/:schoolSlug" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/force-password-change"
            element={
              <ProtectedRoute>
                <PasswordChangeRoute>
                  <ForcePasswordChangePage />
                </PasswordChangeRoute>
              </ProtectedRoute>
            }
          />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/substitutions/respond" element={<SubstitutionRespond />} />

          {/* Protected Routes */}
          <Route
            path="/portal/*"
            element={
              <ProtectedRoute>
                <PasswordChangeRoute>
                  <PortalRoute>
                    <MainLayout />
                  </PortalRoute>
                </PasswordChangeRoute>
              </ProtectedRoute>
            }
          >
            {/* All authenticated users */}
            <Route index element={<DashboardPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="settings/subscription"
              element={
                <RoleRoute roles={["admin"]}>
                  <SubscriptionPage />
                </RoleRoute>
              }
            />
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
              path="user-management"
              element={
                <RoleRoute
                  roles={["admin", "department_principal"]}
                  permissions={["manage_users"]}
                >
                  <SchoolUserManagementPage />
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
              path="report-cards"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="traditionalReportCards" showUpgradePrompt>
                    <ReportCardManagerPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="grade-analytics"
              element={
                <RoleRoute roles={["admin", "department_principal", "teacher"]}>
                  <FeatureGate feature="gradeAnalytics" showUpgradePrompt>
                    <GradeAnalyticsDashboardPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="parent-gradebook"
              element={
                <RoleRoute roles={["parent"]}>
                  <FeatureGate feature="parentGradebook" showUpgradePrompt>
                    <ParentGradebookPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="parent-plp-report/:childId"
              element={
                <RoleRoute roles={["parent"]}>
                  <ParentPlpReportPage />
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
              path="students/promotion-center"
              element={
                <RoleRoute roles={["admin"]}>
                  <PromotionCenterPage />
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
              path="grades/weekly/:studentId"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <WeeklyReportRedirectPage />
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
              path="newsletters/admin/templates"
              element={
                <RoleRoute roles={["admin"]}>
                  <FeatureGate feature="newsletterCommunication" showUpgradePrompt>
                    <NewsletterTemplatesPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="newsletters/admin"
              element={
                <RoleRoute roles={["admin"]}>
                  <FeatureGate feature="newsletterCommunication" showUpgradePrompt>
                    <AdminNewslettersPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="attendance-reminders"
              element={
                <RoleRoute roles={["admin"]}>
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
                  <FeatureGate feature="newsletterCommunication" showUpgradePrompt>
                    <TeacherNewslettersPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="newsletters/history"
              element={
                <RoleRoute roles={["parent"]}>
                  <FeatureGate feature="newsletterCommunication" showUpgradePrompt>
                    <ParentNewslettersPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="sbr/config"
              element={
                <RoleRoute
                  roles={["admin"]}
                  permissions={["sbr:manage_scales"]}
                >
                  <SBRConfigPage />
                </RoleRoute>
              }
            />
            <Route
              path="sbr"
              element={
                <RoleRoute
                  roles={["admin", "teacher", "parent"]}
                  permissions={["sbr:generate_reports", "sbr:view_reports"]}
                >
                  <SBRHubPage />
                </RoleRoute>
              }
            />
            <Route
              path="sbr/generate"
              element={
                <RoleRoute
                  roles={["admin", "teacher"]}
                  permissions={["sbr:generate_reports"]}
                >
                  <SBRGenerationPage />
                </RoleRoute>
              }
            />
            <Route
              path="sbr/reports"
              element={
                <RoleRoute
                  roles={["admin", "teacher", "parent"]}
                  permissions={["sbr:view_reports"]}
                >
                  <SBRParentReportsPage />
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
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <StandardsPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="standards/assign"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <StandardAssignPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="grammar-assessments"
              element={
                <RoleRoute roles={["admin", "teacher", "department_principal"]}>
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <GrammarAssessmentPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />

            {/* ── Social Studies (Teacher) — shell with sidebar ── */}
            <Route
              path="social-studies"
              element={
                <RoleRoute roles={["admin", "teacher", "department_principal"]}>
                  <SocialStudiesShell />
                </RoleRoute>
              }
            >
              <Route index element={<SocialStudiesCurriculumPage />} />
              <Route path="units/:unitId" element={<SocialStudiesUnitDetailPage />} />
              <Route path="lessons/:lessonId/edit" element={<SocialStudiesLessonEditorPage />} />
              <Route path="assignments/new" element={<SocialStudiesAssignmentManagerPage />} />
              <Route path="assignments/:assignmentId/results" element={<SocialStudiesResultsPage />} />
            </Route>

            {/* ── Social Studies (Student) ── */}
            <Route
              path="social-studies/student"
              element={<RoleRoute roles={["student"]}><StudentSocialStudiesPage /></RoleRoute>}
            />
            <Route
              path="social-studies/student/lessons/:lessonId"
              element={<RoleRoute roles={["student", "parent"]}><StudentSocialStudiesLessonPage /></RoleRoute>}
            />
            <Route
              path="social-studies/student/assignments/:assignmentId"
              element={<RoleRoute roles={["student"]}><StudentSocialStudiesAssessmentPage /></RoleRoute>}
            />
            <Route
              path="social-studies/student/results/:submissionId"
              element={<RoleRoute roles={["student"]}><StudentSocialStudiesResultsPage /></RoleRoute>}
            />
            <Route
              path="standards/gradebook"
              element={
                <RoleRoute roles={["admin", "teacher", "department_principal"]}>
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <StandardsGradebookPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="standards/pool"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <AssessmentPoolPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="standards/progress"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <AssessmentProgressPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="standards/narrative"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <AssessmentNarrativePage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="standards/live-edit"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <AssessmentLiveEditPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="standards/audit"
              element={
                <RoleRoute roles={["admin"]}>
                  <FeatureGate feature="standardsPractice" showUpgradePrompt>
                    <AssessmentAuditPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="curriculum"
              element={
                <RoleRoute
                  roles={["admin", "department_principal", "teacher"]}
                  permissions={[
                    "view_curriculum_maps",
                    "edit_curriculum_maps",
                    "review_curriculum_maps",
                    "publish_curriculum_maps",
                    "create_curriculum_map",
                    "edit_own_curriculum_map",
                    "edit_any_curriculum_map",
                    "review_curriculum_map",
                    "approve_curriculum_map",
                    "reject_curriculum_map",
                    "export_curriculum_map",
                    "print_curriculum_map",
                    "configure_curriculum_map_templates",
                    "view_pacing_guides",
                    "edit_pacing_guides",
                    "review_pacing_guides",
                    "publish_pacing_guides",
                    "approve_pacing_overrides",
                  ]}
                >
                  <CurriculumPage />
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
              path="my-assignments"
              element={
                <RoleRoute roles={["student"]}>
                  <StudentMyAssignmentsPage />
                </RoleRoute>
              }
            />
            <Route
              path="my-assignments/:assignmentId"
              element={
                <RoleRoute roles={["student"]}>
                  <StudentAssignmentDetailPage />
                </RoleRoute>
              }
            />
            <Route
              path="interventions"
              element={
                <RoleRoute roles={["admin", "teacher", "department_principal"]}>
                  <FeatureGate feature="interventionTracking" showUpgradePrompt>
                    <InterventionQueuePage />
                  </FeatureGate>
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
            <Route
              path="academic-excellence"
              element={
                <RoleRoute roles={["student"]}>
                  <FeatureGate feature="academicIntelligence" showUpgradePrompt>
                    <StudentAcademicExcellencePage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="teacher-academic-excellence"
              element={
                <RoleRoute
                  roles={["admin", "department_principal", "teacher"]}
                  permissions={["view_academic_excellence_class"]}
                >
                  <FeatureGate feature="academicIntelligence" showUpgradePrompt>
                    <TeacherAcademicExcellencePage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="student-grouping"
              element={
                <RoleRoute
                  roles={["admin", "department_principal", "teacher"]}
                >
                  <FeatureGate feature="academicIntelligence" showUpgradePrompt>
                    <TeacherStudentGroupingPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="admin-academic-excellence"
              element={
                <RoleRoute
                  roles={["admin", "department_principal"]}
                  permissions={["view_academic_excellence_school", "view_academic_excellence_department"]}
                >
                  <FeatureGate feature="academicIntelligence" showUpgradePrompt>
                    <AdminAcademicExcellenceDashboard />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            {/* Presentations */}
            <Route
              path="presentations"
              element={
                <RoleRoute
                  roles={["admin", "department_principal", "teacher"]}
                  permissions={["manage_presentations"]}
                >
                  <FeatureGate feature="presentationBuilder" showUpgradePrompt>
                    <PresentationListPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="presentations/:id"
              element={
                <RoleRoute
                  roles={["admin", "department_principal", "teacher"]}
                  permissions={["manage_presentations"]}
                >
                  <FeatureGate feature="presentationBuilder" showUpgradePrompt>
                    <PresentationEditorPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="presentations/:id/present"
              element={
                <RoleRoute
                  roles={["admin", "department_principal", "teacher"]}
                  permissions={["manage_presentations"]}
                >
                  <PresenterViewPage />
                </RoleRoute>
              }
            />
            {/* Worksheet Checker */}
            <Route
              path="worksheets"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="worksheetChecker" showUpgradePrompt>
                    <WorksheetListPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="worksheets/new"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="worksheetChecker" showUpgradePrompt>
                    <WorksheetCreatePage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="worksheets/:id"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <FeatureGate feature="worksheetChecker" showUpgradePrompt>
                    <WorksheetDetailPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            {/* Revision Plans */}
            <Route
              path="revision"
              element={
                <RoleRoute roles={["student", "teacher", "admin"]}>
                  <FeatureGate feature="revisionPlanning" showUpgradePrompt>
                    <RevisionPlansListPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="revision/create"
              element={
                <RoleRoute roles={["student", "teacher", "admin"]}>
                  <FeatureGate feature="revisionPlanning" showUpgradePrompt>
                    <RevisionPlanCreatePage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="revision/:planId"
              element={
                <RoleRoute roles={["student", "teacher", "admin"]}>
                  <FeatureGate feature="revisionPlanning" showUpgradePrompt>
                    <RevisionPlanViewPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            {/* Reading Assistant: student sees assignments and reader */}
            <Route
              path="reading"
              element={
                <RoleRoute roles={["student"]}>
                  <FeatureGate feature="readingAssistant" showUpgradePrompt>
                    <ReadingMyAssignmentsPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="reading/view/:textId"
              element={
                <RoleRoute roles={["student"]}>
                  <FeatureGate feature="readingAssistant" showUpgradePrompt>
                    <ReadingViewPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            {/* Reading: teacher/admin manage texts and assign */}
            <Route
              path="reading/texts"
              element={
                <RoleRoute roles={["teacher", "admin"]}>
                  <FeatureGate feature="readingAssistant" showUpgradePrompt>
                    <ReadingTextsListPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            <Route
              path="reading/upload"
              element={
                <RoleRoute roles={["teacher", "admin"]}>
                  <FeatureGate feature="readingAssistant" showUpgradePrompt>
                    <ReadingUploadPage />
                  </FeatureGate>
                </RoleRoute>
              }
            />
            {/* Finance & Fee Management */}
            <Route
              path="finance"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_fee_structures", "view_invoices", "view_finance_reports"]}>
                  <FinanceDashboardPage />
                </RoleRoute>
              }
            />
            <Route
              path="finance/fee-structures"
              element={
                <RoleRoute roles={["admin"]} permissions={["manage_fee_structures", "view_fee_structures"]}>
                  <FeeStructuresPage />
                </RoleRoute>
              }
            />
            <Route
              path="finance/discounts"
              element={
                <RoleRoute roles={["admin"]} permissions={["manage_discounts"]}>
                  <DiscountsPage />
                </RoleRoute>
              }
            />
            <Route
              path="finance/invoices"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_invoices", "create_invoices"]}>
                  <InvoiceListPage />
                </RoleRoute>
              }
            />
            <Route
              path="finance/invoices/generate"
              element={
                <RoleRoute roles={["admin"]} permissions={["create_invoices"]}>
                  <InvoiceGeneratorPage />
                </RoleRoute>
              }
            />
            <Route
              path="finance/invoices/:id"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_invoices"]}>
                  <InvoiceDetailPage />
                </RoleRoute>
              }
            />
            <Route
              path="finance/payments"
              element={
                <RoleRoute roles={["admin"]} permissions={["record_payments"]}>
                  <PaymentsPage />
                </RoleRoute>
              }
            />
            <Route
              path="finance/reports"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_finance_reports"]}>
                  <FinanceReportsPage />
                </RoleRoute>
              }
            />

            {/* ─── HR & Staff Management ─── */}
            <Route
              path="hr"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_staff_profiles"]}>
                  <HRDashboardPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/staff"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_staff_profiles"]}>
                  <StaffDirectoryPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/staff/:id"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_staff_profiles"]}>
                  <StaffProfileDetailPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/leave"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["approve_leave"]}>
                  <LeaveManagementPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/leave-settings"
              element={
                <RoleRoute roles={["admin"]} permissions={["manage_leave_types"]}>
                  <LeaveSettingsPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/certifications"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_certifications"]}>
                  <CertificationsPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/reviews"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["manage_performance_reviews"]}>
                  <PerformanceReviewsPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/pd"
              element={
                <RoleRoute roles={["admin", "department_principal"]} permissions={["view_pd_reports"]}>
                  <PDLogPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/my"
              element={
                <RoleRoute roles={["admin", "teacher", "staff", "department_principal"]} permissions={["view_own_hr_profile"]}>
                  <MyHRPage />
                </RoleRoute>
              }
            />
            <Route
              path="hr/settings"
              element={
                <RoleRoute roles={["admin"]} permissions={["manage_hr_settings"]}>
                  <HRSettingsPage />
                </RoleRoute>
              }
            />
            {/* ─── PLP – Character Development ─── */}
            <Route
              path="plp"
              element={
                <RoleRoute roles={["admin", "teacher", "department_principal", "student"]}>
                  <PlpHubPage />
                </RoleRoute>
              }
            />
            <Route
              path="plp/config"
              element={
                <RoleRoute roles={["admin"]}>
                  <Navigate to="/portal/plp?tab=config" replace />
                </RoleRoute>
              }
            />
            <Route
              path="plp/records"
              element={
                <RoleRoute roles={["admin", "teacher", "department_principal"]}>
                  <PlpTeacherClassboardPage />
                </RoleRoute>
              }
            />
            <Route
              path="plp/records/:id"
              element={
                <RoleRoute roles={["admin", "teacher", "department_principal"]}>
                  <PlpRecordDetailPage />
                </RoleRoute>
              }
            />
            <Route
              path="plp/students/:studentId/evidence"
              element={
                <RoleRoute roles={["admin", "teacher", "department_principal"]}>
                  <PlpStudentEvidencePage />
                </RoleRoute>
              }
            />
            <Route
              path="plp/awards"
              element={
                <RoleRoute roles={["admin", "teacher"]}>
                  <Navigate to="/portal/plp?tab=awards" replace />
                </RoleRoute>
              }
            />
            <Route
              path="plp/supervisor-assignments"
              element={
                <RoleRoute roles={["admin"]}>
                  <Navigate to="/portal/plp?tab=assignments" replace />
                </RoleRoute>
              }
            />
            <Route
              path="plp/supervisor"
              element={
                <RoleRoute roles={["admin", "department_principal"]}>
                  <Navigate to="/portal/plp?tab=supervisor" replace />
                </RoleRoute>
              }
            />
            <Route
              path="plp/my-tasks"
              element={
                <RoleRoute roles={["student"]}>
                  <PlpMyTasksPage />
                </RoleRoute>
              }
            />
          </Route>

          {/* Platform Admin Routes (super_admin only) */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute>
                <PasswordChangeRoute>
                  <RoleRoute roles={["super_admin"]}>
                    <AdminLayout />
                  </RoleRoute>
                </PasswordChangeRoute>
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
        </Suspense>
        </ErrorBoundary>
      </ThemeProvider>
    </CacheProvider>
  );
}

export default App;
