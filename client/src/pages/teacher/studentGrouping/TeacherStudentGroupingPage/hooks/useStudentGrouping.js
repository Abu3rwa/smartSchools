import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectClasses } from '../../../../../store/slices/classSlice';
import { selectSubjects } from '../../../../../store/slices/subjectSlice';
import { selectCurrentAcademicYear } from '../../../../../store/slices/uiSlice';
import {
    fetchStudentGroups,
    fetchGroupingOverview,
    saveGroupingOverride,
    refreshGroupActivities,
    clearGroupingData,
    selectGroupingGroups,
    selectGroupingNotStarted,
    selectGroupingOverview,
    selectGroupingLoading,
    selectOverviewLoading,
    selectOverrideSaving,
    selectActivitiesRefreshing,
    selectGroupingError
} from '../../../../../store/slices/studentGroupingSlice';

const useStudentGrouping = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const groups = useSelector(selectGroupingGroups);
    const notStarted = useSelector(selectGroupingNotStarted);
    const overview = useSelector(selectGroupingOverview);
    const loading = useSelector(selectGroupingLoading);
    const overviewLoading = useSelector(selectOverviewLoading);
    const overrideSaving = useSelector(selectOverrideSaving);
    const activitiesRefreshing = useSelector(selectActivitiesRefreshing);
    const error = useSelector(selectGroupingError);

    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [selectedStandardId, setSelectedStandardId] = useState('');
    const [view, setView] = useState('overview'); // 'overview' | 'detail'

    const selectedClass = useMemo(
        () => classes.find((item) => item._id === selectedClassId) || null,
        [classes, selectedClassId]
    );

    const subjectOptions = useMemo(() => {
        if (!selectedClass?.subjects?.length) return [];

        const ids = selectedClass.subjects
            .map((entry) => {
                if (entry?.subject?._id) return String(entry.subject._id);
                if (entry?.subject) return String(entry.subject);
                return '';
            })
            .filter(Boolean);

        const uniqueIds = Array.from(new Set(ids));
        return uniqueIds.map((id) => {
            const subject = subjects.find((s) => String(s._id) === id);
            return {
                _id: id,
                name: subject?.name || subject?.subjectName || id
            };
        });
    }, [selectedClass, subjects]);

    // Load overview when class is selected
    useEffect(() => {
        if (selectedClassId && academicYear) {
            dispatch(fetchGroupingOverview({
                classId: selectedClassId,
                academicYear,
                subjectId: selectedSubjectId || undefined
            }));
        }
    }, [selectedClassId, selectedSubjectId, academicYear, dispatch]);

    // Load detailed groups when standard selected
    useEffect(() => {
        if (selectedClassId && selectedStandardId && academicYear) {
            dispatch(fetchStudentGroups({
                classId: selectedClassId,
                standardId: selectedStandardId,
                academicYear
            }));
        }
    }, [selectedClassId, selectedStandardId, academicYear, dispatch]);

    const handleClassChange = useCallback((classId) => {
        setSelectedClassId(classId);
        setSelectedSubjectId('');
        setSelectedStandardId('');
        setView('overview');
        dispatch(clearGroupingData());
    }, [dispatch]);

    const handleSubjectChange = useCallback((subjectId) => {
        setSelectedSubjectId(subjectId);
        setSelectedStandardId('');
        setView('overview');
        dispatch(clearGroupingData());
    }, [dispatch]);

    const handleStandardClick = useCallback((standardId) => {
        setSelectedStandardId(standardId);
        setView('detail');
    }, []);

    const handleBackToOverview = useCallback(() => {
        setSelectedStandardId('');
        setView('overview');
        dispatch(clearGroupingData());
    }, [dispatch]);

    const handleOverride = useCallback(async ({ studentId, newLevel, reason }) => {
        if (!selectedClassId || !selectedStandardId) return;
        await dispatch(saveGroupingOverride({
            classId: selectedClassId,
            standardId: selectedStandardId,
            studentId,
            newLevel,
            reason,
            academicYear
        })).unwrap();

        // Refresh groups after override
        dispatch(fetchStudentGroups({
            classId: selectedClassId,
            standardId: selectedStandardId,
            academicYear
        }));
    }, [selectedClassId, selectedStandardId, academicYear, dispatch]);

    const handleRefreshActivities = useCallback(async (level) => {
        if (!selectedClassId || !selectedStandardId) return;
        await dispatch(refreshGroupActivities({
            classId: selectedClassId,
            standardId: selectedStandardId,
            level
        })).unwrap();
    }, [selectedClassId, selectedStandardId, dispatch]);

    return {
        classes,
        subjectOptions,
        academicYear,
        groups,
        notStarted,
        overview,
        loading,
        overviewLoading,
        overrideSaving,
        activitiesRefreshing,
        error,
        selectedClassId,
        selectedSubjectId,
        selectedStandardId,
        view,
        handleClassChange,
        handleSubjectChange,
        handleStandardClick,
        handleBackToOverview,
        handleOverride,
        handleRefreshActivities
    };
};

export default useStudentGrouping;
