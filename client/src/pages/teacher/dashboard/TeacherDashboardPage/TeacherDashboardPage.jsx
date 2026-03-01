import { useSelector } from 'react-redux';
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@mui/material';
import { HiOutlineCalendar, HiOutlineClipboardList, HiOutlineClock } from 'react-icons/hi';
import { selectUser } from '../../../../store/slices/authSlice';
import { selectPendingCount } from '../../../../store/slices/substitutionsSlice';
import TeacherDashboardHeader from './components/TeacherDashboardHeader';
import SummaryStat from './components/SummaryStat';
import TodayScheduleCard from './components/TodayScheduleCard';
import SubRequestsCard from './components/SubRequestsCard';
import QuickActionsCard from './components/QuickActionsCard';
import useTeacherDashboardData from './hooks/useTeacherDashboardData';
import { QUICK_ACTIONS } from './constants';
import { getTodayLabel } from './utils/teacherDashboardPresentation';
import './TeacherDashboardPage.css';

const TeacherDashboardPage = () => {
    const theme = useTheme();
    const isSm = useMediaQuery(theme.breakpoints.down('sm'));

    const user = useSelector(selectUser);
    const pendingCount = useSelector(selectPendingCount);

    const {
        timetableLoading,
        timetableError,
        todaySchedule
    } = useTeacherDashboardData();

    const firstName = user?.firstName ?? 'Teacher';
    const todayLabel = getTodayLabel();
    const todayClassesCount = todaySchedule.length;
    const pendingSubsCount = pendingCount?.count ?? 0;

    return (
        <Box className="teacher-dashboard" sx={{ p: { xs: 2, sm: 3 } }}>
            <TeacherDashboardHeader firstName={firstName} isSm={isSm} />

            <Grid container spacing={2} className="summary-row">
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineCalendar} label="Today" value={todayLabel} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineClock} label="Classes today" value={todayClassesCount || '—'} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <SummaryStat icon={HiOutlineClipboardList} label="Pending sub requests" value={pendingSubsCount || '0'} />
                </Grid>
            </Grid>

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
                        Loading your dashboard...
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
                </Grid>
            )}
        </Box>
    );
};

export default TeacherDashboardPage;
