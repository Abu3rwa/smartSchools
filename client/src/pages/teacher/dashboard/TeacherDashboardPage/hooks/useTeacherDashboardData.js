import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchMyClasses } from '../../../../../store/slices/teacherSlice';
import { fetchSubPendingCountThunk } from '../../../../../store/slices/substitutionsSlice';
import teacherService from '../../../../../services/teacherService';
import timetableService from '../../../../../services/timetableService';
import { buildTodaySchedule, buildWeekSchedule } from '../utils/teacherDashboardPresentation';

const useTeacherDashboardData = () => {
    const dispatch = useDispatch();
    const [timetable, setTimetable] = useState({ periods: [], assignments: [] });
    const [timetableLoading, setTimetableLoading] = useState(true);
    const [timetableError, setTimetableError] = useState(null);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [analyticsError, setAnalyticsError] = useState(null);
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
        dispatch(fetchMyClasses());
        dispatch(fetchSubPendingCountThunk());
    }, [dispatch]);

    useEffect(() => {
        let cancelled = false;

        const loadDashboard = async () => {
            setTimetableLoading(true);
            setTimetableError(null);
            setAnalyticsLoading(true);
            setAnalyticsError(null);

            const [timetableResult, analyticsResult] = await Promise.allSettled([
                timetableService.getMyTimetable(),
                teacherService.getMyDashboardAnalytics()
            ]);

            if (cancelled) {
                return;
            }

            if (timetableResult.status === 'fulfilled') {
                const body = timetableResult.value?.data || timetableResult.value;
                const payload = body?.data || body;
                setTimetable({
                    periods: payload.periods || [],
                    assignments: payload.assignments || []
                });
            } else {
                setTimetableError(timetableResult.reason?.message || 'Failed to load timetable');
            }

            if (analyticsResult.status === 'fulfilled') {
                const body = analyticsResult.value?.data || analyticsResult.value;
                const payload = body?.data || body;
                setAnalyticsData(payload || null);
            } else {
                setAnalyticsError(analyticsResult.reason?.message || 'Failed to load analytics');
            }

            setTimetableLoading(false);
            setAnalyticsLoading(false);
        };

        loadDashboard();

        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    const reload = useCallback(() => setReloadToken((token) => token + 1), []);

    const todaySchedule = useMemo(() => buildTodaySchedule(timetable), [timetable]);
    const weekSchedule = useMemo(() => buildWeekSchedule(timetable), [timetable]);

    return {
        timetableLoading,
        timetableError,
        todaySchedule,
        weekSchedule,
        analyticsData,
        analyticsLoading,
        analyticsError,
        reload
    };
};

export default useTeacherDashboardData;