import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchMyClasses } from '../../../../../store/slices/teacherSlice';
import { fetchSubPendingCountThunk } from '../../../../../store/slices/substitutionsSlice';
import teacherService from '../../../../../services/teacherService';
import timetableService from '../../../../../services/timetableService';
import { buildTodaySchedule } from '../utils/teacherDashboardPresentation';

const useTeacherDashboardData = () => {
    const dispatch = useDispatch();
    const [timetable, setTimetable] = useState({ periods: [], assignments: [] });
    const [timetableLoading, setTimetableLoading] = useState(true);
    const [timetableError, setTimetableError] = useState(null);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [analyticsError, setAnalyticsError] = useState(null);

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
    }, []);

    const todaySchedule = useMemo(() => {
        return buildTodaySchedule(timetable);
    }, [timetable]);

    return {
        timetableLoading,
        timetableError,
        todaySchedule,
        analyticsData,
        analyticsLoading,
        analyticsError
    };
};

export default useTeacherDashboardData;
