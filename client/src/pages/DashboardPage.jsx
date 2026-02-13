import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { Box, Grid, Typography, useTheme, useMediaQuery } from '@mui/material';
import { selectUser } from '../store/slices/authSlice';
import StudentDashboardPage from './StudentDashboardPage';
import TeacherDashboardPage from './TeacherDashboardPage';
import ParentDashboardPage from './ParentDashboardPage';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { fetchStudents, selectStudents } from '../store/slices/studentSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { fetchDashboardStats, selectDashboardStats, selectDashboardLoading, selectDashboardError } from '../store/slices/dashboardSlice';
import {
    HiOutlineUserGroup,
    HiOutlineAcademicCap,
    HiOutlineClipboardList,
    HiOutlineTrendingUp,
    HiOutlineChartBar,
    HiOutlineArrowRight,
    HiOutlineBell
} from 'react-icons/hi';
import './DashboardPage.css';

const DashboardPage = () => {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const classes = useSelector(selectClasses);
    const students = useSelector(selectStudents);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const dashboardStats = useSelector(selectDashboardStats);
    const loading = useSelector(selectDashboardLoading);
    const error = useSelector(selectDashboardError);
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchStudents({ limit: 5 }));
        dispatch(fetchDashboardStats(academicYear));
    }, [dispatch, academicYear]);

    if (user?.role === 'student') {
        return <StudentDashboardPage />;
    }
    if (user?.role === 'teacher') {
        return <TeacherDashboardPage />;
    }
    if (user?.role === 'parent') {
        return <ParentDashboardPage />;
    }

    const stats = [
        {
            title: 'Total Students',
            value: dashboardStats.totalStudents || students.length || 0,
            icon: HiOutlineUserGroup,
            color: 'primary',
            change: dashboardStats.changes?.students || '+0%'
        },
        {
            title: 'Total Classes',
            value: dashboardStats.totalClasses || classes.length || 0,
            icon: HiOutlineAcademicCap,
            color: 'purple',
            change: dashboardStats.changes?.classes || '+0%'
        },
        {
            title: 'Grades Entered',
            value: dashboardStats.totalGrades?.toLocaleString() || '0',
            icon: HiOutlineClipboardList,
            color: 'emerald',
            change: dashboardStats.changes?.grades || '+0%'
        },
        {
            title: 'Avg. Performance',
            value: dashboardStats.avgPerformance || '0%',
            icon: HiOutlineTrendingUp,
            color: 'amber',
            change: dashboardStats.changes?.performance || '+0%'
        }
    ];

    const quickActions = [
        { label: 'Enter Grades', path: '/portal/grades/entry', icon: HiOutlineClipboardList },
        { label: 'View Classes', path: '/portal/classes', icon: HiOutlineAcademicCap },
        { label: 'Send Reports', path: '/portal/notifications', icon: HiOutlineBell },
        { label: 'View Analytics', path: '/portal/students', icon: HiOutlineChartBar }
    ];

    if (loading) {
        return (
            <div className="dashboard-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard-page">
                <div className="error-container">
                    <p className="error-message">Error loading dashboard: {error}</p>
                    <button 
                        className="btn btn-primary" 
                        onClick={() => dispatch(fetchDashboardStats(academicYear))}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Box className="dashboard-page" sx={{ p: { xs: 2, sm: 3 } }}>
            {/* Welcome Header */}
            <Box 
                sx={{ 
                    display: 'flex', 
                    flexDirection: { xs: 'column', md: 'row' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', md: 'flex-start' },
                    mb: { xs: 3, md: 4 },
                    gap: 2
                }}
            >
                <Box>
                    <Typography variant="h4" sx={{ mb: 0.5, fontWeight: 700 }}>
                        Welcome back, {user?.firstName}! 👋
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Here's what's happening with your classes today.
                    </Typography>
                </Box>
                <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
                    <Link to="/portal/grades/entry" className="btn btn-primary" style={{ width: isSm ? '100%' : 'auto' }}>
                        <HiOutlineClipboardList size={20} />
                        Enter Grades
                    </Link>
                </Box>
            </Box>

            {/* Stats Grid */}
            <Grid container spacing={2} sx={{ mb: { xs: 3, md: 4 } }}>
                {stats.map((stat, index) => (
                    <Grid item xs={12} sm={6} md={3} key={index}>
                        <Box className={`stat-card stat-${stat.color}`}>
                            <Box className="stat-icon">
                                <stat.icon size={24} />
                            </Box>
                            <Box className="stat-content">
                                <Typography variant="body2" className="stat-title">
                                    {stat.title}
                                </Typography>
                                <Typography variant="h5" className="stat-value">
                                    {stat.value}
                                </Typography>
                                <Typography variant="caption" className={`stat-change ${stat.change.startsWith('+') ? 'positive' : ''}`}>
                                    {stat.change}
                                </Typography>
                            </Box>
                        </Box>
                    </Grid>
                ))}
            </Grid>

            {/* Main Content Grid */}
            <Grid container spacing={2}>
                {/* Quick Actions */}
                <Grid item xs={12} md={6}>
                    <div className="card quick-actions-card">
                        <div className="card-header">
                            <h3 className="card-title">Quick Actions</h3>
                        </div>
                        <Grid container spacing={1.5} className="quick-actions-grid">
                            {quickActions.map((action, index) => (
                                <Grid item xs={12} sm={6} key={index}>
                                    <Link to={action.path} className="quick-action">
                                        <action.icon size={24} />
                                        <span>{action.label}</span>
                                        <HiOutlineArrowRight className="action-arrow" />
                                    </Link>
                                </Grid>
                            ))}
                        </Grid>
                    </div>
                </Grid>

                {/* Recent Students */}
                <Grid item xs={12} md={6}>
                    <div className="card recent-students-card">
                        <div className="card-header">
                            <h3 className="card-title">Recent Students</h3>
                            <Link to="/portal/students" className="btn btn-ghost btn-sm">View All</Link>
                        </div>
                        <div className="students-list">
                            {students.slice(0, 5).map((student, index) => (
                                <Link
                                    key={student._id}
                                    to={`/portal/students/${student._id}`}
                                    className="student-item animate-fadeIn"
                                    style={{ animationDelay: `${index * 0.05}s` }}
                                >
                                    <div className="student-avatar">
                                        {student.firstName?.charAt(0)}{student.lastName?.charAt(0)}
                                    </div>
                                    <div className="student-info">
                                        <span className="student-name">{student.firstName} {student.lastName}</span>
                                        <span className="student-id">{student.studentId}</span>
                                    </div>
                                    <span className="student-class">{student.currentClass?.name || 'Unassigned'}</span>
                                </Link>
                            ))}
                            {students.length === 0 && (
                                <p className="empty-message">No students found. Add some students to get started.</p>
                            )}
                        </div>
                    </div>
                </Grid>

                {/* Classes Overview */}
                <Grid item xs={12} md={6}>
                    <div className="card classes-overview-card">
                        <div className="card-header">
                            <h3 className="card-title">Classes Overview</h3>
                            <Link to="/portal/classes" className="btn btn-ghost btn-sm">View All</Link>
                        </div>
                        <div className="classes-list">
                            {classes.slice(0, 4).map((cls, index) => (
                                <Link
                                    key={cls._id}
                                    to={`/portal/classes/${cls._id}`}
                                    className="class-item animate-fadeIn"
                                    style={{ animationDelay: `${index * 0.05}s` }}
                                >
                                    <div className="class-info">
                                        <span className="class-name">{cls.name}</span>
                                        <span className="class-year">{cls.academicYear}</span>
                                    </div>
                                    <div className="class-stats">
                                        <span className="class-count">{cls.studentCount || 0} students</span>
                                    </div>
                                </Link>
                            ))}
                            {classes.length === 0 && (
                                <p className="empty-message">No classes found. Create a class to get started.</p>
                            )}
                        </div>
                    </div>
                </Grid>

                {/* Performance Chart Placeholder */}
                <Grid item xs={12} md={6}>
                    <div className="card performance-card">
                        <div className="card-header">
                            <h3 className="card-title">Performance Trends</h3>
                        </div>
                        <div className="chart-placeholder">
                            <HiOutlineChartBar size={48} />
                            <p>Performance analytics coming soon</p>
                        </div>
                    </div>
                </Grid>
            </Grid>
        </Box>
    );
};

export default DashboardPage;
