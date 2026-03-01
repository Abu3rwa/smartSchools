import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchTeachers,
    selectTeachers,
    fetchTeacher,
    selectCurrentTeacher
} from '../../../../store/slices/teacherSlice';
import { fetchClasses } from '../../../../store/slices/classSlice';
import { fetchSubjects } from '../../../../store/slices/subjectSlice';
import toast from 'react-hot-toast';
import { TEACHER_DETAILS_MESSAGES } from '../constants';

const useTeacherDetailsState = (teacherId) => {
    const dispatch = useDispatch();
    const teachers = useSelector(selectTeachers);
    const currentTeacher = useSelector(selectCurrentTeacher);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                if (isMounted) setLoading(true);

                await dispatch(fetchTeachers()).unwrap();

                if (teacherId) {
                    await dispatch(fetchTeacher(teacherId)).unwrap();
                }

                await Promise.all([
                    dispatch(fetchClasses()).unwrap(),
                    dispatch(fetchSubjects()).unwrap()
                ]);
            } catch (error) {
                toast.error(TEACHER_DETAILS_MESSAGES.LOAD_ERROR);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadData();

        return () => {
            isMounted = false;
        };
    }, [dispatch, teacherId]);

    return {
        teachers,
        currentTeacher,
        loading
    };
};

export default useTeacherDetailsState;
