import { Alert, Box, Grid, Stack } from '@mui/material';
import BehaviorTrackingHeader from './components/BehaviorTrackingHeader';
import BehaviorTrackingFilters from './components/BehaviorTrackingFilters';
import BehaviorTrackingSummaryCards from './components/BehaviorTrackingSummaryCards';
import BehaviorTrackingCharts from './components/BehaviorTrackingCharts';
import BehaviorTrackingLiveSection from './components/BehaviorTrackingLiveSection';
import BehaviorTrackingEventsList from './components/BehaviorTrackingEventsList';
import LoadingState from './components/LoadingState';
import ErrorState from './components/ErrorState';
import useBehaviorTrackingDashboardData from './hooks/useBehaviorTrackingDashboardData';
import { formatRatePercentage } from './utils/behaviorTrackingDashboardPresentation';

const BehaviorTrackingDashboardPage = () => {
    const {
        period,
        setPeriod,
        loading,
        error,
        liveMode,
        liveSnapshot,
        events,
        sessions,
        summary,
        insights,
        timelineData,
        topEventData,
        toggleLiveMode,
        refreshDashboard
    } = useBehaviorTrackingDashboardData();

    return (
        <Box>
            <Stack
                direction={{ xs: 'column', md: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', md: 'center' }}
                mb={2}
                spacing={2}
            >
                <BehaviorTrackingHeader />
                <BehaviorTrackingFilters
                    period={period}
                    onPeriodChange={setPeriod}
                    liveMode={liveMode}
                    onToggleLiveMode={toggleLiveMode}
                    onRefresh={refreshDashboard}
                />
            </Stack>

            <ErrorState error={error} />

            <BehaviorTrackingSummaryCards summary={summary} />

            {liveSnapshot ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Last {liveSnapshot.windowMinutes} minutes: {liveSnapshot.eventsLastWindow} events,{' '}
                    {liveSnapshot.activeSessions} active sessions, {liveSnapshot.errorsLastWindow}{' '}
                    errors ({formatRatePercentage(liveSnapshot.errorRate)}).
                </Alert>
            ) : null}

            <BehaviorTrackingCharts timelineData={timelineData} topEventData={topEventData} />

            <Grid container spacing={2}>
                <BehaviorTrackingLiveSection insights={insights} sessions={sessions} />
                <BehaviorTrackingEventsList events={events} />
            </Grid>

            <LoadingState loading={loading} />
        </Box>
    );
};

export default BehaviorTrackingDashboardPage;
