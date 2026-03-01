import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { fetchClass } from '../../../../store/slices/classSlice';
import { fetchLessons } from '../../../../store/slices/lessonSlice';
import { format } from 'date-fns';
import { DATE_INPUT_FORMAT } from '../constants';
import { getWeekRange, getWeeklyLessons } from '../utils/weeklyReportPresentation';

const useWeeklyReportPageData = ({ classId, academicYear, lessons }) => {
    const dispatch = useDispatch();
    const [selectedWeek, setSelectedWeek] = useState(new Date());

    const { weekStart, weekEnd } = useMemo(() => getWeekRange(selectedWeek), [selectedWeek]);

    useEffect(() => {
        if (!classId) {
            return;
        }

        dispatch(fetchClass(classId));
        dispatch(fetchLessons({
            classId,
            startDate: format(weekStart, DATE_INPUT_FORMAT),
            endDate: format(weekEnd, DATE_INPUT_FORMAT)
        }));
    }, [academicYear, classId, dispatch, weekEnd, weekStart]);

    const weeklyLessons = useMemo(() => {
        return getWeeklyLessons({ lessons, weekStart, weekEnd });
    }, [lessons, weekEnd, weekStart]);

    return {
        selectedWeek,
        setSelectedWeek,
        weekStart,
        weekEnd,
        weeklyLessons
    };
};

export default useWeeklyReportPageData;
