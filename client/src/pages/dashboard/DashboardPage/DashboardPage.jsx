import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Box, Grid, useMediaQuery, useTheme } from '@mui/material';
import { selectUser } from '../../../store/slices/authSlice';
import { selectClasses } from '../../../store/slices/classSlice';
import { selectStudents } from '../../../store/slices/studentSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import {
    selectDashboardError,
    selectDashboardLoading,
    selectDashboardStats
} from '../../../store/slices/dashboardSlice';
import StudentDashboardPage from '../../student/dashboard/StudentDashboardPage';
import TeacherDashboardPage from '../../teacher/dashboard/TeacherDashboardPage';
import ParentDashboardPage from '../../ParentDashboardPage';
import SchoolAdminDashboard from '../../admin/dashboard/SchoolAdminDashboard';
import DashboardHeader from './components/DashboardHeader';
import DashboardStatsGrid from './components/DashboardStatsGrid';
import QuickActionsCard from './components/QuickActionsCard';
import RecentStudentsCard from './components/RecentStudentsCard';
import ClassesOverviewCard from './components/ClassesOverviewCard';
import PerformanceCard from './components/PerformanceCard';
import DashboardLoadingState from './components/DashboardLoadingState';
import DashboardErrorState from './components/DashboardErrorState';
import useDashboardData from './hooks/useDashboardData';
import { DASHBOARD_QUICK_ACTIONS } from './constants';
import { buildDashboardStats } from './utils/dashboardPresentation';
import './DashboardPage.css';

const DashboardPage = () => {
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));

    const user = useSelector(selectUser);
    const classes = useSelector(selectClasses);
    const students = useSelector(selectStudents);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const dashboardStats = useSelector(selectDashboardStats);
    const loading = useSelector(selectDashboardLoading);
    const error = useSelector(selectDashboardError);

    const { retryDashboardStats } = useDashboardData({ academicYear });

    const stats = useMemo(() => {
        return buildDashboardStats({ dashboardStats, classes, students });
    }, [classes, dashboardStats, students]);

    if (user?.role === 'student') {
        return <StudentDashboardPage />;
    }
    if (user?.role === 'teacher') {
        return <TeacherDashboardPage />;
    }
    if (user?.role === 'parent') {
        return <ParentDashboardPage />;
    }
    if (user?.role === 'admin' || user?.role === 'department_principal') {
        return <SchoolAdminDashboard />;
    }

    if (loading) {
        return <DashboardLoadingState />;
    }

    if (error) {
        return <DashboardErrorState error={error} onRetry={retryDashboardStats} />;
    }

    return (
        <Box
            className="dashboard-page"
            sx={{
                p: { xs: 1.5, sm: 2, md: 3 },
                maxWidth: 1,
                overflowX: 'hidden'
            }}
        >
            <DashboardHeader firstName={user?.firstName} isSm={isSm} />

            <DashboardStatsGrid stats={stats} />

            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <QuickActionsCard actions={DASHBOARD_QUICK_ACTIONS} />
                </Grid>

                <Grid item xs={12} md={6}>
                    <RecentStudentsCard students={students} />
                </Grid>

                <Grid item xs={12} md={6}>
                    <ClassesOverviewCard classes={classes} />
                </Grid>

                <Grid item xs={12} md={6}>
                    <PerformanceCard />
                </Grid>
            </Grid>
        </Box>
    );
};

export default DashboardPage;
