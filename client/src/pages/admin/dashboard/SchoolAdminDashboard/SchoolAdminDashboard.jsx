import { Box, Grid, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineArrowRight,
    HiOutlineCheckCircle,
    HiOutlineClock,
    HiOutlineAcademicCap,
} from 'react-icons/hi';
import { useSchoolAdminDashboardData } from './hooks/useSchoolAdminDashboardData.js';
import AdminDashboardHeader from './components/AdminDashboardHeader.jsx';
import AdminStatsGrid from './components/AdminStatsGrid.jsx';
import ClassDistributionCard from './components/ClassDistributionCard.jsx';
import PerformanceTrendCard from './components/PerformanceTrendCard.jsx';
import QuickActionsCard from './components/QuickActionsCard.jsx';
import RecentStudentsCard from './components/RecentStudentsCard.jsx';
import ClassesOverviewCard from './components/ClassesOverviewCard.jsx';
import LoadingState from './components/LoadingState.jsx';
import ErrorState from './components/ErrorState.jsx';
import { CARD_SX, CARD_HEADER_SX, CARD_TITLE_SX } from './constants.js';
import './SchoolAdminDashboard.css';

/**
 * School Admin Dashboard page. Composes data from useSchoolAdminDashboardData
 * and presentational components. Preserves routes, API calls, Redux, and UI behavior.
 */
export default function SchoolAdminDashboard() {
    const { t, i18n } = useTranslation(['adminDashboard', 'common']);
    const isRtl = i18n.dir() === 'rtl';

    const {
        user,
        todayLabel,
        stats,
        classDistributionData,
        performanceTrendData,
        students,
        classes,
        attendanceSummary,
        loading,
        error,
        retry,
    } = useSchoolAdminDashboardData();

    if (loading) {
        return <LoadingState />;
    }

    if (error) {
        return <ErrorState message={error} onRetry={retry} />;
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
            <AdminDashboardHeader
                title={t('adminDashboard:header.title')}
                subtitle={t('adminDashboard:header.subtitle', { firstName: user?.firstName || '', todayLabel })}
            />

            <AdminStatsGrid stats={stats} />

            <Grid container spacing={2} sx={{ mb: { xs: 2, md: 3 } }}>
                {classDistributionData.length > 0 && (
                    <Grid item xs={12} md={4}>
                        <ClassDistributionCard data={classDistributionData} />
                    </Grid>
                )}
                <Grid item xs={12} md={8} flexGrow={1}>
                    <PerformanceTrendCard data={performanceTrendData} />
                </Grid>
            </Grid>

            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <QuickActionsCard />
                </Grid>

                {attendanceSummary && (
                    <Grid item xs={12} md={6}>
                        <Box sx={CARD_SX}>
                            <Box sx={CARD_HEADER_SX}>
                                <Typography component="h3" sx={CARD_TITLE_SX}>
                                    {t('adminDashboard:attendanceCard.title')}
                                </Typography>
                                <Link to="/portal/attendance/admin" className="btn-link">
                                    {t('adminDashboard:common.viewDetails')} <HiOutlineArrowRight size={16} style={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
                                </Link>
                            </Box>
                            <div className="admin-attendance-summary">
                                <div className="admin-summary-item">
                                    <HiOutlineCheckCircle className="summary-icon success" size={20} />
                                    <div>
                                        <div className="summary-value">{attendanceSummary.totalPresent}</div>
                                        <div className="summary-label">{t('adminDashboard:attendanceCard.present')}</div>
                                    </div>
                                </div>
                                <div className="admin-summary-item">
                                    <HiOutlineClock className="summary-icon warning" size={20} />
                                    <div>
                                        <div className="summary-value">{attendanceSummary.totalAbsent}</div>
                                        <div className="summary-label">{t('adminDashboard:attendanceCard.absent')}</div>
                                    </div>
                                </div>
                                <div className="admin-summary-item">
                                    <HiOutlineAcademicCap className="summary-icon primary" size={20} />
                                    <div>
                                        <div className="summary-value">{attendanceSummary.totalClasses}</div>
                                        <div className="summary-label">{t('adminDashboard:attendanceCard.classes')}</div>
                                    </div>
                                </div>
                            </div>
                        </Box>
                    </Grid>
                )}

                <Grid item xs={12} md={6}>
                    <RecentStudentsCard students={students} />
                </Grid>

                <Grid item xs={12} md={6}>
                    <ClassesOverviewCard classes={classes} />
                </Grid>
            </Grid>
        </Box>
    );
}
