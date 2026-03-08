import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMyAssignments, selectMyAssignments, selectPracticeLoading } from '../../../../../store/slices/practiceSlice';
import { selectUser } from '../../../../../store/slices/authSlice';
import api from '../../../../../config/api';
import { MAX_RECENT_GRADES } from '../constants';

const useStudentDashboardData = () => {
    const dispatch = useDispatch();
    const assignments = useSelector(selectMyAssignments);
    const assignmentsLoading = useSelector(selectPracticeLoading);
    const user = useSelector(selectUser);

    const [schedule, setSchedule] = useState([]);
    const [grades, setGrades] = useState([]);
    const [classAssignments, setClassAssignments] = useState([]);
    const [dataLoading, setDataLoading] = useState(true);

    useEffect(() => {
        dispatch(fetchMyAssignments());
    }, [dispatch]);

    useEffect(() => {
        let cancelled = false;
        setDataLoading(true);

        Promise.all([
            api.get('/timetable/my-schedule'),
            api.get('/grades/my-grades').catch(() => ({ data: { data: { grades: [] } } })),
            api.get('/assignments/my').catch(() => ({ data: { data: { items: [] } } }))
        ])
            .then(([scheduleResponse, gradesResponse, assignmentResponse]) => {
                if (cancelled) return;

                setSchedule(scheduleResponse.data?.data?.schedule || []);
                const gradeList = gradesResponse.data?.data?.grades || [];
                setGrades(Array.isArray(gradeList) ? gradeList.slice(0, MAX_RECENT_GRADES) : []);
                const assignmentList = assignmentResponse.data?.data?.items || [];
                setClassAssignments(Array.isArray(assignmentList) ? assignmentList : []);
            })
            .catch(() => {
                if (!cancelled) {
                    setGrades([]);
                    setClassAssignments([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setDataLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return {
        assignments,
        assignmentsLoading,
        user,
        schedule,
        grades,
        classAssignments,
        dataLoading
    };
};

export default useStudentDashboardData;
