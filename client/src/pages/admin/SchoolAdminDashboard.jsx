import { useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { Box, Grid, Typography, useTheme, useMediaQuery } from '@mui/material';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    LineChart,
    Line,
} from 'recharts';
import { selectUser } from '../../store/slices/authSlice';
import { fetchClasses, selectClasses } from '../../store/slices/classSlice';
import { fetchStudents, selectStudents } from '../../store/slices/studentSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import {
    fetchDashboardStats,
    selectDashboardStats,
    selectDashboardLoading,
    selectDashboardError,
} from '../../store/slices/dashboardSlice';
import api from '../../config/api';
import {
    HiOutlineUserGroup,
    HiOutlineAcademicCap,
    HiOutlineClipboardList,
    HiOutlineTrendingUp,
    HiOutlineChartBar,
    HiOutlineArrowRight,
    HiOutlineUsers,
    HiOutlineCheckCircle,
    HiOutlineClock,
} from 'react-icons/hi';
import './SchoolAdminDashboard.css';

const StatCard = ({ icon: Icon, variant, value, label, subtitle }) => (
    <div className={`admin-stat-card stat-${variant}`}>
        <div className={`admin-stat-icon ${variant}`}>
            <Icon size={24} />
        </div>
        <div className="admin-stat-info">
            <h3>{value}</h3>
            <p>{label}</p>
            {subtitle && <span className="admin-stat-subtitle">{subtitle}</span>}
        </div>
    </div>
);

const SchoolAdminDashboard = () => {
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

    const cardSx = {
        background: 'var(--card, white)',
        borderRadius: '12px',
        p: '1.5rem',
        boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1))',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border-color, rgba(0, 0, 0, 0.05))',
    };

    const cardHeaderSx = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: '1.5rem',
    };

    const cardTitleSx = {
        fontSize: '1.125rem',
        fontWeight: 600,
        color: 'var(--text-primary, #1e293b)',
    };

    const [teachers, setTeachers] = useState([]);
    const [attendanceSummary, setAttendanceSummary] = useState(null);
    const [loadingAdditional, setLoadingAdditional] = useState(true);

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchStudents({ limit: 10 }));
        dispatch(fetchDashboardStats(academicYear));
        fetchAdditionalData();
    }, [dispatch, academicYear]);

    const fetchAdditionalData = async () => {
        try {
            setLoadingAdditional(true);
            // Fetch teachers
            const teachersRes = await api.get('/users', { params: { role: 'teacher', limit: 100 } });
            if (teachersRes.data.success) {
                setTeachers(teachersRes.data.data?.users || []);
            }

            // Fetch today's attendance summary
            const today = new Date().toISOString().split('T')[0];
            const attendanceRes = await api.get('/attendance/admin', {
                params: { viewMode: 'today' },
            });
            if (attendanceRes.data.success) {
                const records = attendanceRes.data.data?.attendanceRecords || [];
                const totalStudents = records.reduce((sum, r) => sum + (r.totalStudents || 0), 0);
                const totalPresent = records.reduce((sum, r) => sum + (r.present || 0), 0);
                const totalAbsent = records.reduce((sum, r) => sum + (r.absent || 0), 0);
                const attendanceRate =
                    totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : 0;

                setAttendanceSummary({
                    totalClasses: records.length,
                    totalStudents,
                    totalPresent,
                    totalAbsent,
                    attendanceRate: parseFloat(attendanceRate),
                });
            }
        } catch (err) {
            console.error('Error fetching additional data:', err);
        } finally {
            setLoadingAdditional(false);
        }
    };

    const todayLabel = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(new Date());

    // Class distribution data for chart (real data from dashboard stats)
    const classDistributionData = useMemo(() => {
        const fromStats = Array.isArray(dashboardStats?.classDistribution)
            ? dashboardStats.classDistribution
            : [];

        if (fromStats.length > 0) {
            return fromStats.map((item) => ({
                name: item.name?.substring(0, 18) || 'Class',
                students: Number(item.students) || 0,
            }));
        }

        return classes
            .slice(0, 12)
            .map((cls) => ({
                name: cls.name?.substring(0, 18) || 'Class',
                students: cls.studentCount || 0,
            }))
            .filter((item) => item.students > 0);
    }, [classes, dashboardStats]);

    // Grade performance trend (real data from dashboard stats)
    const performanceTrendData = useMemo(() => {
        const fromStats = Array.isArray(dashboardStats?.performanceTrend)
            ? dashboardStats.performanceTrend
            : [];

        if (fromStats.length > 0) {
            return fromStats.map((item) => ({
                month: item.month,
                average: Number(item.average) || 0,
            }));
        }

        return [];
    }, [dashboardStats]);

    const stats = [
        {
            title: 'Total Students',
            value: dashboardStats.totalStudents || students.length || 0,
            icon: HiOutlineUserGroup,
            color: 'primary',
            change: dashboardStats.changes?.students || '+0%',
        },
        {
            title: 'Total Classes',
            value: dashboardStats.totalClasses || classes.length || 0,
            icon: HiOutlineAcademicCap,
            color: 'purple',
            change: dashboardStats.changes?.classes || '+0%',
        },
        {
            title: 'Teachers',
            value: teachers.length || 0,
            icon: HiOutlineUsers,
            color: 'blue',
            subtitle: `${teachers.filter((t) => t.status === 'active').length} active`,
        },
        {
            title: 'Attendance Rate',
            value: attendanceSummary?.attendanceRate
                ? `${attendanceSummary.attendanceRate}%`
                : 'N/A',
            icon: HiOutlineCheckCircle,
            color: 'green',
            subtitle: attendanceSummary
                ? `${attendanceSummary.totalPresent}/${attendanceSummary.totalStudents} today`
                : 'No data',
        },
    ];

    const quickActions = [
        { label: 'View Classes', path: '/portal/classes', icon: HiOutlineAcademicCap },
        { label: 'View Attendance', path: '/portal/attendance/admin', icon: HiOutlineClipboardList },
        { label: 'View Students', path: '/portal/students', icon: HiOutlineUserGroup },
        { label: 'View Analytics', path: '/portal/students', icon: HiOutlineChartBar },
    ];

    if (loading || loadingAdditional) {
        return (
            <div className="admin-dashboard-page">
                <div className="loading-container">
                    <div className="spinner"></div>
                    <p>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="admin-dashboard-page">
                <div className="error-container">
                    <p className="error-message">Error loading dashboard: {error}</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            dispatch(fetchDashboardStats(academicYear));
                            fetchAdditionalData();
                        }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Box
            className="admin-dashboard-page"
            sx={{
                p: { xs: 1.5, sm: 2, md: 3 },
                maxWidth: 1,
                overflowX: 'hidden',
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    justifyContent: 'space-between',
                    alignItems: { xs: 'stretch', sm: 'flex-start' },
                    mb: { xs: 2, md: 3 },
                    gap: 2,
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Typography
                        variant="h5"
                        component="h1"
                        className="admin-dashboard-title"
                        sx={{
                            mb: 0.5,
                            fontWeight: 700,
                            fontSize: { xs: '1.25rem', sm: '1.4rem', md: '1.5rem' },
                        }}
                    >
                        School Dashboard
                    </Typography>
                    <Typography variant="body2" className="admin-dashboard-subtitle">
                        Welcome back, {user?.firstName}. Here's your school overview for {todayLabel}.
                    </Typography>
                </Box>
            </Box>

            {/* Stats Grid */}
            <Grid container spacing={2} sx={{ mb: { xs: 2, md: 3 } }}>
                {stats.map((stat, index) => (
                    <Grid item xs={6} sm={6} md={3} key={index}>
                        <StatCard
                            icon={stat.icon}
                            variant={stat.color}
                            value={stat.value}
                            label={stat.title}
                            subtitle={stat.subtitle}
                        />
                    </Grid>
                ))}
            </Grid>

            {/* Charts Section */}
            <Grid container spacing={2} sx={{ mb: { xs: 2, md: 3 } }}>
                {/* Class Distribution */}
                {classDistributionData.length > 0 && (
                    <Grid item xs={12} md={8}>
                        <Box sx={cardSx}>
                            <Box
                                sx={{
                                    ...cardHeaderSx,
                                    flexWrap: { xs: 'wrap', sm: 'nowrap' },
                                    gap: { xs: 1, sm: 0 },
                                }}
                            >
                                <Typography component="h3" sx={cardTitleSx}>Class Distribution</Typography>
                                <Link to="/portal/classes" className="btn-link">
                                    View All <HiOutlineArrowRight size={16} />
                                </Link>
                            </Box>
                            <Box
                                sx={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minHeight: { xs: 210, sm: 230, md: 260 },
                                }}
                            >
                                <ResponsiveContainer width="100%" height={isSm ? 220 : 260}>
                                    <BarChart
                                        data={classDistributionData}
                                        margin={{ top: 8, right: isSm ? 8 : 16, left: isSm ? -16 : 0, bottom: isSm ? 8 : 24 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fontSize: isSm ? 10 : 11 }}
                                            angle={isSm ? 0 : -30}
                                            textAnchor={isSm ? 'middle' : 'end'}
                                            height={isSm ? 36 : 60}
                                            interval={0}
                                            minTickGap={isSm ? 8 : 16}
                                            tickFormatter={(value) => {
                                                if (!value) return 'Class';
                                                const max = isSm ? 10 : 18;
                                                return value.length > max ? `${value.slice(0, max - 1)}…` : value;
                                            }}
                                        />
                                        <YAxis allowDecimals={false} width={isSm ? 28 : 36} />
                                        <Tooltip />
                                        <Bar dataKey="students" fill="var(--primary, #5aaeee)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                        </Box>
                    </Grid>
                )}

                {/* Performance Trend */}
                <Grid item xs={12} md={4}>
                    <Box sx={cardSx}>
                        <Box
                            sx={{
                                ...cardHeaderSx,
                                flexWrap: { xs: 'wrap', sm: 'nowrap' },
                                gap: { xs: 1, sm: 0 },
                            }}
                        >
                            <Typography component="h3" sx={cardTitleSx}>Performance Trend</Typography>
                            <Typography sx={{ fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)' }}>
                                Average grades over time
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: { xs: 210, sm: 230, md: 260 },
                            }}
                        >
                            <ResponsiveContainer width="100%" height={isSm ? 220 : 260}>
                                <LineChart
                                    data={performanceTrendData}
                                    margin={{ top: 8, right: isSm ? 8 : 16, left: isSm ? -16 : 0, bottom: 8 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: isSm ? 10 : 11 }} minTickGap={8} />
                                    <YAxis domain={[0, 100]} width={isSm ? 28 : 36} tick={{ fontSize: isSm ? 10 : 11 }} />
                                    <Tooltip />
                                    <Line
                                        type="monotone"
                                        dataKey="average"
                                        stroke="var(--primary, #5aaeee)"
                                        strokeWidth={2}
                                        dot={{ r: isSm ? 3 : 4 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>
                    </Box>
                </Grid>
            </Grid>

            {/* Main Content Grid */}
            <Grid container spacing={2}>
                {/* Quick Actions */}
                <Grid item xs={12} md={6}>
                    <Box sx={cardSx}>
                        <Box sx={cardHeaderSx}>
                            <Typography component="h3" sx={cardTitleSx}>Quick Actions</Typography>
                        </Box>
                        <div className="admin-quick-actions-grid">
                            {quickActions.map((action, index) => (
                                <Link to={action.path} className="admin-quick-action" key={index}>
                                    <action.icon size={22} />
                                    <span>{action.label}</span>
                                    <HiOutlineArrowRight className="action-arrow" size={18} />
                                </Link>
                            ))}
                        </div>
                    </Box>
                </Grid>

                {/* Attendance Summary */}
                {attendanceSummary && (
                    <Grid item xs={12} md={6}>
                        <Box sx={cardSx}>
                            <Box sx={cardHeaderSx}>
                                <Typography component="h3" sx={cardTitleSx}>Today's Attendance</Typography>
                                <Link to="/portal/attendance/admin" className="btn-link">
                                    View Details <HiOutlineArrowRight size={16} />
                                </Link>
                            </Box>
                            <div className="admin-attendance-summary">
                                <div className="admin-summary-item">
                                    <HiOutlineCheckCircle className="summary-icon success" size={20} />
                                    <div>
                                        <div className="summary-value">{attendanceSummary.totalPresent}</div>
                                        <div className="summary-label">Present</div>
                                    </div>
                                </div>
                                <div className="admin-summary-item">
                                    <HiOutlineClock className="summary-icon warning" size={20} />
                                    <div>
                                        <div className="summary-value">{attendanceSummary.totalAbsent}</div>
                                        <div className="summary-label">Absent</div>
                                    </div>
                                </div>
                                <div className="admin-summary-item">
                                    <HiOutlineAcademicCap className="summary-icon primary" size={20} />
                                    <div>
                                        <div className="summary-value">{attendanceSummary.totalClasses}</div>
                                        <div className="summary-label">Classes</div>
                                    </div>
                                </div>
                            </div>
                        </Box>
                    </Grid>
                )}

                {/* Recent Students */}
                <Grid item xs={12} md={6}>
                    <Box sx={cardSx}>
                        <Box sx={cardHeaderSx}>
                            <Typography component="h3" sx={cardTitleSx}>Recent Students</Typography>
                            <Link to="/portal/students" className="btn-link">
                                View All <HiOutlineArrowRight size={16} />
                            </Link>
                        </Box>
                        <div className="admin-students-list">
                            {students.slice(0, 5).map((student, index) => (
                                <Link
                                    key={student._id}
                                    to={`/portal/students/${student._id}`}
                                    className="admin-student-item"
                                >
                                    <div className="admin-student-avatar">
                                        {student.firstName?.charAt(0)}
                                        {student.lastName?.charAt(0)}
                                    </div>
                                    <div className="admin-student-info">
                                        <span className="admin-student-name">
                                            {student.firstName} {student.lastName}
                                        </span>
                                        <span className="admin-student-id">{student.studentId}</span>
                                    </div>
                                    <span className="admin-student-class">
                                        {student.currentClass?.name || 'Unassigned'}
                                    </span>
                                </Link>
                            ))}
                            {students.length === 0 && (
                                <p className="admin-empty-text">No students found.</p>
                            )}
                        </div>
                    </Box>
                </Grid>

                {/* Classes Overview */}
                <Grid item xs={12} md={6}>
                    <Box sx={cardSx}>
                        <Box sx={cardHeaderSx}>
                            <Typography component="h3" sx={cardTitleSx}>Classes Overview</Typography>
                            <Link to="/portal/classes" className="btn-link">
                                View All <HiOutlineArrowRight size={16} />
                            </Link>
                        </Box>
                        <div className="admin-classes-list">
                            {classes.slice(0, 4).map((cls, index) => (
                                <Link
                                    key={cls._id}
                                    to={`/portal/classes/${cls._id}`}
                                    className="admin-class-item"
                                >
                                    <div className="admin-class-info">
                                        <span className="admin-class-name">{cls.name}</span>
                                        <span className="admin-class-year">{cls.academicYear}</span>
                                    </div>
                                    <span className="admin-class-count">
                                        {cls.studentCount || 0} students
                                    </span>
                                </Link>
                            ))}
                            {classes.length === 0 && (
                                <p className="admin-empty-text">No classes found.</p>
                            )}
                        </div>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default SchoolAdminDashboard;
