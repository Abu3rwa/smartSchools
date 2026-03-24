import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchMyAssignments,
    selectMyAssignments,
    selectPracticeLoading,
    selectPracticeStudentId
} from '../../../../../store/slices/practiceSlice';
import { selectCurrentAcademicYear } from '../../../../../store/slices/uiSlice';
import { selectUser } from '../../../../../store/slices/authSlice';
import api from '../../../../../config/api';
import { MAX_RECENT_GRADES } from '../constants';

const useStudentDashboardData = () => {
    const dispatch = useDispatch();
    const assignments = useSelector(selectMyAssignments);
    const assignmentsLoading = useSelector(selectPracticeLoading);
    const practiceStudentId = useSelector(selectPracticeStudentId);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);

    const [schedule, setSchedule] = useState([]);
    const [grades, setGrades] = useState([]);
    const [classAssignments, setClassAssignments] = useState([]);
    const [academicTasks, setAcademicTasks] = useState([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(true);

    useEffect(() => {
        dispatch(fetchMyAssignments());
    }, [dispatch]);

    useEffect(() => {
        let cancelled = false;

        const loadTasks = async () => {
            setTasksLoading(true);

            try {
                let resolvedStudentId = practiceStudentId;
                if (!resolvedStudentId) {
                    const resultAction = await dispatch(fetchMyAssignments({ academicYear }));
                    if (fetchMyAssignments.fulfilled.match(resultAction)) {
                        resolvedStudentId = resultAction.payload?.studentId || '';
                    }
                }

                if (!resolvedStudentId) {
                    if (!cancelled) {
                        setAcademicTasks([]);
                        setTasksLoading(false);
                    }
                    return;
                }

                const tasksResponse = await api.get(
                    `/students/${resolvedStudentId}/academic-excellence/tasks`,
                    { params: { limit: 5, academicYear } }
                );

                if (!cancelled) {
                    const taskList = tasksResponse.data?.data?.tasks || [];
                    setAcademicTasks(Array.isArray(taskList) ? taskList : []);
                }
            } catch {
                if (!cancelled) {
                    setAcademicTasks([]);
                }
            } finally {
                if (!cancelled) {
                    setTasksLoading(false);
                }
            }
        };

        loadTasks();

        return () => {
            cancelled = true;
        };
    }, [academicYear, dispatch, practiceStudentId]);

    useEffect(() => {
        let cancelled = false;
        setDataLoading(true);

        Promise.all([
            api.get('/timetable/my-schedule').catch(() => ({ data: { data: { schedule: [] } } })),
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
        academicTasks,
        tasksLoading,
        dataLoading
    };
};

export default useStudentDashboardData;
