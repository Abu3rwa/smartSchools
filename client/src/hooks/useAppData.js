import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsAuthenticated, selectUser } from '../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { fetchClasses } from '../store/slices/classSlice';
import { fetchSubjects, selectSubjects, selectSubjectsLoading } from '../store/slices/subjectSlice';
import { fetchTeachers, selectTeachers, selectTeachersLoading } from '../store/slices/teacherSlice';

/**
 * Centralized hook to fetch shared app-wide data (classes, subjects, teachers)
 * once at the layout level instead of redundantly in every page.
 *
 * Call this in MainLayout so all /portal/* pages inherit the data via Redux selectors.
 * Refreshes classes whenever the selected academic year changes.
 */
const useAppData = () => {
    const dispatch = useDispatch();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const subjects = useSelector(selectSubjects);
    const subjectsLoading = useSelector(selectSubjectsLoading);

    const teachers = useSelector(selectTeachers);
    const teachersLoading = useSelector(selectTeachersLoading);

    useEffect(() => {
        if (!isAuthenticated || !user || user.role === 'super_admin') return;

        const role = user.role;
        const canFetchClasses = ['admin', 'department_principal', 'teacher'].includes(role);

        if (canFetchClasses) {
            dispatch(fetchClasses(academicYear ? { academicYear } : undefined));
        }
    }, [dispatch, isAuthenticated, user, academicYear]);

    useEffect(() => {
        if (!isAuthenticated || !user || user.role === 'super_admin') return;

        const role = user.role;
        const canFetchSubjects = ['admin', 'department_principal', 'teacher'].includes(role);
        const canFetchTeachers = ['admin', 'department_principal'].includes(role);

        if (canFetchSubjects && (!subjects || subjects.length === 0) && !subjectsLoading) {
            dispatch(fetchSubjects());
        }

        if (canFetchTeachers && teachers.length === 0 && !teachersLoading) {
            dispatch(fetchTeachers());
        }
    }, [dispatch, isAuthenticated, user, subjects, subjectsLoading, teachers, teachersLoading]);
};

export default useAppData;
