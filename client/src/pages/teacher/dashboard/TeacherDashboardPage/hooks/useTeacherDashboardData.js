import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchMyClasses } from '../../../../../store/slices/teacherSlice';
import { fetchSubPendingCountThunk } from '../../../../../store/slices/substitutionsSlice';
import timetableService from '../../../../../services/timetableService';
import { buildTodaySchedule } from '../utils/teacherDashboardPresentation';

const useTeacherDashboardData = () => {
    const dispatch = useDispatch();
    const [timetable, setTimetable] = useState({ periods: [], assignments: [] });
    const [timetableLoading, setTimetableLoading] = useState(true);
    const [timetableError, setTimetableError] = useState(null);

    useEffect(() => {
        dispatch(fetchMyClasses());
        dispatch(fetchSubPendingCountThunk());
    }, [dispatch]);

    useEffect(() => {
        let cancelled = false;
        setTimetableLoading(true);
        setTimetableError(null);

        timetableService
            .getMyTimetable()
            .then((response) => {
                if (cancelled) return;
                const body = response?.data || response;
                const payload = body?.data || body;
                setTimetable({
                    periods: payload.periods || [],
                    assignments: payload.assignments || []
                });
            })
            .catch((error) => {
                if (!cancelled) {
                    setTimetableError(error?.message || 'Failed to load timetable');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setTimetableLoading(false);
                }
            });

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
        todaySchedule
    };
};

export default useTeacherDashboardData;
