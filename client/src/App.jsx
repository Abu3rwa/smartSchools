import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectIsAuthenticated, selectAuth, selectUser, fetchCurrentUser } from './store/slices/authSlice';
import { selectTheme } from './store/slices/uiSlice';

// Layouts
import MainLayout from './components/layout/MainLayout';
import AdminLayout from './components/layout/AdminLayout';

// Pages
import LandingPage from './pages/LandingPage';
import RegisterSchoolPage from './pages/RegisterSchoolPage';
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardPage from './pages/DashboardPage';
import ClassesPage from './pages/ClassesPage';
import ClassDetailPage from './pages/ClassDetailPage';
import StudentsPage from './pages/StudentsPage';
import StudentDetailPage from './pages/StudentDetailPage';
import GradeEntryPage from './pages/GradeEntryPage';
import GradeReportPage from './pages/GradeReportPage';
import WeeklyReportPage from './pages/WeeklyReportPage';
import GradebookPage from './pages/GradebookPage';
import TeachersPage from './pages/TeachersPage';
import TeacherDetailsPage from './pages/TeacherDetailsPage';
import SubjectsPage from './pages/SubjectsPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import AdminSchedulePage from './pages/admin/AdminSchedulePage';
import AdminAttendancePage from './pages/admin/AdminAttendancePage';
import AdminSchoolCalendarPage from './pages/admin/AdminSchoolCalendarPage';
import AdminTimetablePage from './pages/admin/AdminTimetablePage';
import TeacherSchedulePage from './pages/teacher/TeacherSchedulePage';
import TeacherTimetablePage from './pages/teacher/TeacherTimetablePage';
import TeacherAttendanceNewPage from './pages/teacher/TeacherAttendanceNewPage';
import LessonPlanPage from './pages/LessonPlanPage';

// Report Pages
import AdvancedReportGenerator from './pages/reports/AdvancedReportGenerator';
import ReportAnalytics from './pages/reports/ReportAnalytics';
import ReportTemplates from './pages/reports/ReportTemplates';
import ReportHistory from './pages/reports/ReportHistory';

// Standards Practice Pages
import StandardsPage from './pages/StandardsPage';
import StandardAssignPage from './pages/StandardAssignPage';
import PracticeDashboardPage from './pages/PracticeDashboardPage';
import PracticeSessionPage from './pages/PracticeSessionPage';
import PracticeHistoryPage from './pages/PracticeHistoryPage';

// Platform Admin Pages
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminSchoolsPage from './pages/admin/AdminSchoolsPage';
import AdminSchoolDetailsPage from './pages/admin/AdminSchoolDetailsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminSubscriptionsPage from './pages/admin/AdminSubscriptionsPage';
import AdminSubscriptionDetailsPage from './pages/admin/AdminSubscriptionDetailsPage';
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage';

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

// Role Route - requires specific role(s), super_admin bypasses all
const RoleRoute = ({ roles, children }) => {
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
  if (user.role === 'super_admin') return children;
  if (!roles.includes(user.role)) return <Navigate to="/portal" replace />;

  return children;
};

function App() {
  const dispatch = useDispatch();
  const theme = useSelector(selectTheme);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && isAuthenticated) {
      dispatch(fetchCurrentUser());
    }
  }, [dispatch, isAuthenticated]);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/:schoolSlug" element={<LoginPage />} />
      <Route path="/register-school" element={<RegisterSchoolPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Protected Routes */}
      <Route
        path="/portal/*"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {/* All authenticated users */}
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />

        {/* Admin + Teacher */}
        <Route path="classes" element={<RoleRoute roles={['admin', 'teacher']}><ClassesPage /></RoleRoute>} />
        <Route path="classes/:id" element={<RoleRoute roles={['admin', 'teacher']}><ClassDetailPage /></RoleRoute>} />
        <Route path="classes/:classId/gradebook" element={<RoleRoute roles={['admin', 'teacher']}><GradebookPage /></RoleRoute>} />
        <Route path="students" element={<RoleRoute roles={['admin', 'teacher']}><StudentsPage /></RoleRoute>} />
        <Route path="students/:id" element={<RoleRoute roles={['admin', 'teacher']}><StudentDetailPage /></RoleRoute>} />
        <Route path="grades/entry" element={<RoleRoute roles={['admin', 'teacher']}><GradeEntryPage /></RoleRoute>} />
        <Route path="grades/report/:studentId" element={<RoleRoute roles={['admin', 'teacher']}><GradeReportPage /></RoleRoute>} />
        <Route path="grades/weekly/class/:classId" element={<RoleRoute roles={['admin', 'teacher']}><WeeklyReportPage /></RoleRoute>} />
        <Route path="lessons" element={<RoleRoute roles={['admin', 'teacher']}><LessonPlanPage /></RoleRoute>} />
        <Route path="subjects" element={<RoleRoute roles={['admin', 'teacher']}><SubjectsPage /></RoleRoute>} />
        <Route path="notifications" element={<RoleRoute roles={['admin', 'teacher']}><NotificationsPage /></RoleRoute>} />
        <Route path="schedules" element={<RoleRoute roles={['admin']}><AdminSchedulePage /></RoleRoute>} />
        <Route path="school-calendar" element={<RoleRoute roles={['admin']}><AdminSchoolCalendarPage /></RoleRoute>} />
        <Route path="timetable" element={<RoleRoute roles={['admin']}><AdminTimetablePage /></RoleRoute>} />
        <Route path="attendance" element={<RoleRoute roles={['admin']}><AdminAttendancePage /></RoleRoute>} />
        <Route path="my-schedule" element={<RoleRoute roles={['teacher']}><TeacherSchedulePage /></RoleRoute>} />
        <Route path="my-timetable" element={<RoleRoute roles={['teacher', 'admin']}><TeacherTimetablePage /></RoleRoute>} />
        <Route path="my-attendance" element={<RoleRoute roles={['teacher']}><TeacherAttendanceNewPage /></RoleRoute>} />
        
        {/* Admin only */}
        <Route path="teachers" element={<RoleRoute roles={['admin']}><TeachersPage /></RoleRoute>} />
        <Route path="teachers/:id" element={<RoleRoute roles={['admin']}><TeacherDetailsPage /></RoleRoute>} />
        
        {/* Reports Routes */}
        <Route path="reports/generator" element={<RoleRoute roles={['admin', 'teacher']}><AdvancedReportGenerator /></RoleRoute>} />
        <Route path="reports/analytics" element={<RoleRoute roles={['admin', 'teacher']}><ReportAnalytics /></RoleRoute>} />
        <Route path="reports/templates" element={<RoleRoute roles={['admin', 'teacher']}><ReportTemplates /></RoleRoute>} />
        <Route path="reports/history" element={<RoleRoute roles={['admin', 'teacher']}><ReportHistory /></RoleRoute>} />

        {/* Standards Practice Routes */}
        <Route path="standards" element={<RoleRoute roles={['admin']}><StandardsPage /></RoleRoute>} />
        <Route path="standards/assign" element={<RoleRoute roles={['admin', 'teacher']}><StandardAssignPage /></RoleRoute>} />
        <Route path="practice" element={<RoleRoute roles={['student']}><PracticeDashboardPage /></RoleRoute>} />
        <Route path="practice/:assignmentId" element={<RoleRoute roles={['student']}><PracticeSessionPage /></RoleRoute>} />
        <Route path="practice/:assignmentId/history" element={<RoleRoute roles={['student']}><PracticeHistoryPage /></RoleRoute>} />
        
      </Route>

      {/* Platform Admin Routes (super_admin only) */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['super_admin']}>
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
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
        <Route path="subscriptions/:id" element={<AdminSubscriptionDetailsPage />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
