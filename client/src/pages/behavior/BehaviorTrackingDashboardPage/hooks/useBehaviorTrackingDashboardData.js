import { useEffect, useMemo, useState } from 'react';
import behaviorTrackingService from '../../../../services/behaviorTrackingService';
import { LIVE_REFRESH_MS, LIVE_WINDOW_MINUTES } from '../constants';
import { getBehaviorDashboardErrorMessage } from '../utils/behaviorTrackingDashboardPresentation';

const useBehaviorTrackingDashboardData = () => {
    const [period, setPeriod] = useState('week');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [dashboard, setDashboard] = useState(null);
    const [liveSnapshot, setLiveSnapshot] = useState(null);
    const [events, setEvents] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [liveMode, setLiveMode] = useState(true);

    const fetchDashboard = async (nextPeriod = period) => {
        setLoading(true);
        setError('');
        try {
            const [dashboardResponse, eventsResponse, sessionsResponse, liveResponse] = await Promise.all([
                behaviorTrackingService.getDashboard({ period: nextPeriod }),
                behaviorTrackingService.getEvents({ period: 'day', limit: 20, page: 1 }),
                behaviorTrackingService.getActiveSessions(),
                behaviorTrackingService.getLiveSnapshot({ minutes: LIVE_WINDOW_MINUTES })
            ]);

            setDashboard(dashboardResponse.data.data);
            setEvents(eventsResponse.data.data || []);
            setSessions(sessionsResponse.data.data || []);
            setLiveSnapshot(liveResponse.data.data);
        } catch (requestError) {
            setError(getBehaviorDashboardErrorMessage(requestError));
        } finally {
            setLoading(false);
        }
    };

    const refreshLive = async () => {
        try {
            const [liveResponse, sessionsResponse] = await Promise.all([
                behaviorTrackingService.getLiveSnapshot({ minutes: LIVE_WINDOW_MINUTES }),
                behaviorTrackingService.getActiveSessions()
            ]);
            setLiveSnapshot(liveResponse.data.data);
            setSessions(sessionsResponse.data.data || []);
        } catch {
            // silent in live mode
        }
    };

    useEffect(() => {
        fetchDashboard(period);
    }, [period]);

    useEffect(() => {
        if (!liveMode) return undefined;
        const timerId = setInterval(() => {
            refreshLive();
        }, LIVE_REFRESH_MS);
        return () => clearInterval(timerId);
    }, [liveMode]);

    const summary = dashboard?.summary || {};
    const insights = dashboard?.insights || [];
    const timelineData = useMemo(() => dashboard?.timeline || [], [dashboard]);
    const topEventData = useMemo(() => dashboard?.topEventTypes || [], [dashboard]);

    const toggleLiveMode = () => setLiveMode((previous) => !previous);
    const refreshDashboard = () => fetchDashboard(period);

    return {
        period,
        setPeriod,
        loading,
        error,
        liveMode,
        dashboard,
        liveSnapshot,
        events,
        sessions,
        summary,
        insights,
        timelineData,
        topEventData,
        toggleLiveMode,
        refreshDashboard
    };
};

export default useBehaviorTrackingDashboardData;
