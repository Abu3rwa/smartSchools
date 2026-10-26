import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSchoolAdminDashboardData } from './hooks/useSchoolAdminDashboardData.js';
import AdminDashboardHeader from './components/AdminDashboardHeader.jsx';
import AdminKpiStrip from './components/AdminKpiStrip.jsx';
import AttendanceTodayStrip from './components/AttendanceTodayStrip.jsx';
import PerformanceTrendCard from './components/PerformanceTrendCard.jsx';
import ClassDistributionCard from './components/ClassDistributionCard.jsx';
import RecentStudentsTable from './components/RecentStudentsTable.jsx';
import DashboardSkeleton from './components/DashboardSkeleton.jsx';
import ErrorState from './components/ErrorState.jsx';
import './SchoolAdminDashboard.css';

/**
 * School Admin Dashboard. Everything on this screen comes from one aggregated
 * request; the shell already supplies classes/subjects/teachers elsewhere.
 */
export default function SchoolAdminDashboard() {
    const { t } = useTranslation(['adminDashboard']);
    const {
        user,
        academicYear,
        locale,
        todayLabel,
        stats,
        attendance,
        attendanceSegments,
        classDistribution,
        performanceTrend,
        recentStudents,
        loading,
        error,
        retry,
        hasData,
        showInitialSkeleton,
    } = useSchoolAdminDashboardData();

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
                subtitle={t('adminDashboard:header.subtitle', { firstName: user?.firstName || '' })}
                todayLabel={todayLabel}
                academicYear={academicYear}
            />

            {!hasData && error ? (
                <ErrorState message={error} onRetry={retry} />
            ) : showInitialSkeleton ? (
                <DashboardSkeleton />
            ) : (
                <div className="admin-dashboard-grid" aria-busy={loading ? 'true' : undefined}>
                    <AdminKpiStrip stats={stats} />
                    <AttendanceTodayStrip
                        attendance={attendance}
                        segments={attendanceSegments}
                        locale={locale}
                    />
                    <div className="admin-charts-row">
                        <PerformanceTrendCard data={performanceTrend} />
                        <ClassDistributionCard data={classDistribution} />
                    </div>
                    <RecentStudentsTable students={recentStudents} />
                </div>
            )}
        </Box>
    );
}
