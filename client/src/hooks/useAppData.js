import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsAuthenticated, selectUser } from '../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { fetchClasses, selectClasses, selectClassesLoading } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects, selectSubjectsLoading } from '../store/slices/subjectSlice';
import { fetchTeachers, selectTeachers, selectTeachersLoading } from '../store/slices/teacherSlice';

/**
 * Centralized hook to fetch shared app-wide data (classes, subjects, teachers)
 * once at the layout level instead of redundantly in every page.
 *
 * Call this in MainLayout so all /portal/* pages inherit the data via Redux selectors.
 * Re-fetches automatically when the academic year changes (slices are cleared by the store).
 */
const useAppData = () => {
    const dispatch = useDispatch();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const classes = useSelector(selectClasses);
    const classesLoading = useSelector(selectClassesLoading);

    const subjects = useSelector(selectSubjects);
    const subjectsLoading = useSelector(selectSubjectsLoading);

    const teachers = useSelector(selectTeachers);
    const teachersLoading = useSelector(selectTeachersLoading);

    useEffect(() => {
        if (!isAuthenticated || !user || user.role === 'super_admin') return;

        if (classes.length === 0 && !classesLoading) {
            dispatch(fetchClasses(academicYear ? { academicYear } : undefined));
        }

        if ((!subjects || subjects.length === 0) && !subjectsLoading) {
            dispatch(fetchSubjects());
        }

        if (teachers.length === 0 && !teachersLoading) {
            dispatch(fetchTeachers());
        }
    }, [dispatch, isAuthenticated, user, academicYear]);
};

export default useAppData;
