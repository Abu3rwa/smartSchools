import { useCallback, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { fetchClass } from '../../../../store/slices/classSlice';
import { fetchSubjects } from '../../../../store/slices/subjectSlice';
import api from '../../../../config/api';
import {
    getAvailableSubjects,
    processGradebookData
} from '../utils/gradebookPresentation';

const useGradebookData = ({
    classId,
    currentClass,
    subjects,
    userRole,
    teacherProfile,
    students,
    grades,
    selectedSubject,
    selectedMonth,
    selectedCategoryFilter,
    academicYear,
    setSelectedSubject,
    setGrades,
    setGradingScale,
    setLoading
}) => {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(fetchClass(classId));
        dispatch(fetchSubjects());
    }, [classId, dispatch]);

    useEffect(() => {
        if (currentClass?.subjects?.length > 0 && !selectedSubject) {
            setSelectedSubject(currentClass.subjects[0].subject?._id || '');
        }
    }, [currentClass, selectedSubject, setSelectedSubject]);

    const fetchGrades = useCallback(async () => {
        if (!classId || !selectedSubject || !selectedMonth) {
            return;
        }

        setLoading(true);
        try {
            const response = await api.get(`/grades/gradebook/${classId}`, {
                params: {
                    subject: selectedSubject,
                    month: selectedMonth,
                    academicYear
                }
            });
            setGrades(response.data?.data?.grades || []);
            setGradingScale(response.data?.data?.gradingScale || null);
        } catch (error) {
            console.error('Failed to fetch grades:', error);
            setGrades([]);
            setGradingScale(null);
        } finally {
            setLoading(false);
        }
    }, [academicYear, classId, selectedMonth, selectedSubject, setGrades, setGradingScale, setLoading]);

    useEffect(() => {
        fetchGrades();
    }, [fetchGrades]);

    const availableSubjects = useMemo(() => {
        return getAvailableSubjects({ currentClass, subjects, userRole, teacherProfile });
    }, [currentClass, subjects, teacherProfile, userRole]);

    const { categories: dynamicCategories, data: processedData } = useMemo(() => {
        return processGradebookData({ students, grades, selectedCategoryFilter });
    }, [grades, selectedCategoryFilter, students]);

    return {
        fetchGrades,
        availableSubjects,
        dynamicCategories,
        processedData
    };
};

export default useGradebookData;
