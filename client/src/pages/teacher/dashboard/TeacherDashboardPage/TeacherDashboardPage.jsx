import { useSelector } from 'react-redux';
import { Alert, Box, Button, Grid, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { HiOutlineCalendar, HiOutlineClipboardList, HiOutlineClock } from 'react-icons/hi';
import { selectUser } from '../../../../store/slices/authSlice';
import { selectPendingCount } from '../../../../store/slices/substitutionsSlice';
import TeacherDashboardHeader from './components/TeacherDashboardHeader';
import SummaryStat from './components/SummaryStat';
import TodayScheduleCard from './components/TodayScheduleCard';
import SubRequestsCard from './components/SubRequestsCard';
import QuickActionsCard from './components/QuickActionsCard';
import TeacherAnalyticsSection from './components/TeacherAnalyticsSection';
import useTeacherDashboardData from './hooks/useTeacherDashboardData';
import { QUICK_ACTIONS } from './constants';
import { getTodayLabel } from './utils/teacherDashboardPresentation';
import './TeacherDashboardPage.css';

const TeacherDashboardPage = () => {
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['dashboard']);

    const user = useSelector(selectUser);
    const pendingCount = useSelector(selectPendingCount);

    const {
        timetableLoading,
        timetableError,
        todaySchedule,
        analyticsData,
        analyticsLoading,
        analyticsError
    } = useTeacherDashboardData();

    const firstName = user?.firstName ?? t('dashboard:teacherDashboard.fallbacks.teacherName');
    const todayLabel = getTodayLabel(i18n.resolvedLanguage || i18n.language);
    const todayClassesCount = todaySchedule.length;
    const pendingSubsCount = pendingCount?.count ?? 0;

    return (
        <Box className="teacher-dashboard" sx={{ p: { xs: 2, sm: 3 } }}>
            <TeacherDashboardHeader firstName={firstName} isSm={isSm} />

            <Grid container spacing={2} className="summary-row">
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineCalendar} label={t('dashboard:teacherDashboard.summary.today')} value={todayLabel} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineClock} label={t('dashboard:teacherDashboard.summary.classesToday')} value={todayClassesCount || '—'} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineClipboardList} label={t('dashboard:teacherDashboard.summary.pendingSubRequests')} value={pendingSubsCount || '0'} />
                </Grid>
            </Grid>

            {pendingSubsCount > 0 && (
                <Alert
                    severity="warning"
                    sx={{ mb: 2 }}
                    action={(
                        <Button color="inherit" size="small" onClick={() => navigate('/portal/substitutions')}>
                            {t('dashboard:teacherDashboard.subRequests.bannerAction')}
                        </Button>
                    )}
                >
                    {t('dashboard:teacherDashboard.subRequests.bannerMessage', { count: pendingSubsCount })}
                </Alert>
            )}

            {timetableLoading ? (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 200,
                        gap: 2
                    }}
                >
                    <div className="spinner" />
                    <Typography variant="body2" color="text.secondary">
                        {t('dashboard:teacherDashboard.loading.message')}
                    </Typography>
                </Box>
            ) : (
                <Grid container spacing={2}>
                    <Grid item xs={12} lg={6}>
                        <TodayScheduleCard todaySchedule={todaySchedule} timetableError={timetableError} />
                    </Grid>

                    <Grid item xs={12} lg={6}>
                        <SubRequestsCard pendingCount={pendingCount} pendingSubsCount={pendingSubsCount} />
                    </Grid>

                    <Grid item xs={12}>
                        <QuickActionsCard actions={QUICK_ACTIONS} />
                    </Grid>

                    <Grid item xs={12}>
                        {analyticsLoading ? (
                            <div className="teacher-card analytics-card">
                                <div className="card-header">
                                    <h3 className="card-title">{t('dashboard:teacherDashboard.analytics.title')}</h3>
                                </div>
                                <p className="empty-text">{t('dashboard:teacherDashboard.loading.message')}</p>
                            </div>
                        ) : (
                            <TeacherAnalyticsSection analyticsData={analyticsData} analyticsError={analyticsError} />
                        )}
                    </Grid>
                </Grid>
            )}
        </Box>
    );
};

export default TeacherDashboardPage;
