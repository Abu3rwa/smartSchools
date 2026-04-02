import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { selectClasses } from '../../store/slices/classSlice';
import { fetchMyClasses, selectMyClasses } from '../../store/slices/teacherSlice';
import { selectCurrentAcademicYear } from '../../store/slices/uiSlice';
import { selectUser } from '../../store/slices/authSlice';
import GradebookPage from './GradebookPage';
import './GradebookPage/GradebookPage.css';

const STORAGE_KEY = 'gb_gradebook_last';

const GradebookRedirectPage = () => {
    const { t } = useTranslation(['gradebook']);
    const dispatch = useDispatch();
    const [searchParams, setSearchParams] = useSearchParams();
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const classes = useSelector(selectClasses);
    const myClasses = useSelector(selectMyClasses);

    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedGrade, setSelectedGrade] = useState('');
    const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('');

    useEffect(() => {
        if (user?.role === 'teacher') {
            dispatch(fetchMyClasses());
        }
    }, [academicYear, dispatch, user?.role]);

    const availableClasses = useMemo(() => {
        if (user?.role !== 'teacher') {
            return classes;
        }
        const seen = new Set();
        return (myClasses || [])
            .map((item) => item.class)
            .filter((classItem) => classItem && !seen.has(classItem._id) && (seen.add(classItem._id), true));
    }, [classes, myClasses, user?.role]);

    // Compute filtered classes based on grade / subject filters
    const filteredClasses = useMemo(() => {
        let result = availableClasses;
        if (selectedGrade) {
            result = result.filter((c) => c.grade === Number(selectedGrade));
        }
        if (selectedSubjectFilter) {
            result = result.filter((c) =>
                (c.subjects || []).some((s) => s.subject?._id === selectedSubjectFilter)
            );
        }
        return result;
    }, [availableClasses, selectedGrade, selectedSubjectFilter]);

    // Restore from URL param → localStorage → first available class
    useEffect(() => {
        if (availableClasses.length === 0) return;
        if (selectedClassId) return; // already selected

        const urlClassId = searchParams.get('class');
        if (urlClassId && availableClasses.some((c) => c._id === urlClassId)) {
            setSelectedClassId(urlClassId);
            return;
        }

        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            if (saved.classId && availableClasses.some((c) => c._id === saved.classId)) {
                setSelectedClassId(saved.classId);
                if (saved.grade) setSelectedGrade(saved.grade);
                if (saved.subjectFilter) setSelectedSubjectFilter(saved.subjectFilter);
                return;
            }
        } catch { /* ignore */ }

        setSelectedClassId(availableClasses[0]._id);
    }, [availableClasses, searchParams, selectedClassId]);

    // When filters change and the selected class is no longer in the filtered list, auto-select the first match
    useEffect(() => {
        if (filteredClasses.length > 0 && !filteredClasses.some((c) => c._id === selectedClassId)) {
            setSelectedClassId(filteredClasses[0]._id);
        }
    }, [filteredClasses, selectedClassId]);

    // Persist selection to URL + localStorage
    const persistSelection = useCallback((classId, grade, subjectFilter) => {
        setSearchParams((prev) => {
            if (classId) prev.set('class', classId);
            else prev.delete('class');
            return prev;
        }, { replace: true });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ classId, grade, subjectFilter }));
        } catch { /* quota */ }
    }, [setSearchParams]);

    const handleClassChange = useCallback((classId) => {
        setSelectedClassId(classId);
        persistSelection(classId, selectedGrade, selectedSubjectFilter);
    }, [persistSelection, selectedGrade, selectedSubjectFilter]);

    const handleGradeChange = useCallback((grade) => {
        setSelectedGrade(grade);
        persistSelection(selectedClassId, grade, selectedSubjectFilter);
    }, [persistSelection, selectedClassId, selectedSubjectFilter]);

    const handleSubjectFilterChange = useCallback((subjectFilter) => {
        setSelectedSubjectFilter(subjectFilter);
        persistSelection(selectedClassId, selectedGrade, subjectFilter);
    }, [persistSelection, selectedClassId, selectedGrade]);

    if (availableClasses.length === 0) {
        return (
            <div className="gradebook-page">
                <div className="empty-state">{t('gradebook:redirect.noClasses')}</div>
            </div>
        );
    }

    return (
        <div className="gradebook-page">
            {selectedClassId && (
                <GradebookPage
                    key={selectedClassId}
                    classId={selectedClassId}
                    availableClasses={availableClasses}
                    selectedGrade={selectedGrade}
                    onGradeChange={handleGradeChange}
                    selectedSubjectFilter={selectedSubjectFilter}
                    onSubjectFilterChange={handleSubjectFilterChange}
                    onClassChange={handleClassChange}
                />
            )}
        </div>
    );
};

export default GradebookRedirectPage;
