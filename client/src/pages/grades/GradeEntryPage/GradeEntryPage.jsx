import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { fetchClasses, selectClasses } from '../../../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../../../store/slices/subjectSlice';
import { fetchStudentsByClass, selectClassStudents } from '../../../store/slices/studentSlice';
import { bulkAddGrades, selectGradesSubmitting } from '../../../store/slices/gradeSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { fetchMyClasses, selectMyClasses } from '../../../store/slices/teacherSlice';
import { selectIsTeacher } from '../../../store/slices/authSlice';
import GradeEntryHeader from './components/GradeEntryHeader';
import GradeEntrySelectionForm from './components/GradeEntrySelectionForm';
import GradeEntryTable from './components/GradeEntryTable';
import GradeEntryEmptyState from './components/GradeEntryEmptyState';
import useGradeEntryPageState from './hooks/useGradeEntryPageState';
import {
    countEnteredGrades,
    getAvailableClasses,
    getAvailableSubjects,
    mapGradesForSubmission
} from './utils/gradeEntryPresentation';
import './GradeEntryPage.css';

const GradeEntryPage = () => {
    const dispatch = useDispatch();
    const [searchParams] = useSearchParams();

    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const classStudents = useSelector(selectClassStudents);
    const submitting = useSelector(selectGradesSubmitting);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isTeacher = useSelector(selectIsTeacher);
    const myClasses = useSelector(selectMyClasses);

    const {
        selectedClass,
        setSelectedClass,
        selectedSubject,
        setSelectedSubject,
        selectedCategory,
        setSelectedCategory,
        customCategory,
        setCustomCategory,
        selectedDate,
        setSelectedDate,
        maxMarks,
        setMaxMarks,
        grades,
        sendNotifications,
        setSendNotifications,
        handleGradeChange,
        resetGradesForStudents,
        setGrades
    } = useGradeEntryPageState({ initialClassId: searchParams.get('class') || '' });

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchSubjects());
        if (isTeacher) {
            dispatch(fetchMyClasses());
        }
    }, [academicYear, dispatch, isTeacher]);

    useEffect(() => {
        if (selectedClass) {
            dispatch(fetchStudentsByClass(selectedClass));
            setGrades({});
        }
    }, [dispatch, selectedClass, setGrades]);

    useEffect(() => {
        resetGradesForStudents(classStudents);
    }, [classStudents, resetGradesForStudents]);

    const availableClasses = useMemo(() => {
        return getAvailableClasses({ isTeacher, myClasses, classes });
    }, [classes, isTeacher, myClasses]);

    const availableSubjects = useMemo(() => {
        return getAvailableSubjects({ selectedClass, classes, subjects });
    }, [classes, selectedClass, subjects]);

    const enteredCount = useMemo(() => {
        return countEnteredGrades(grades);
    }, [grades]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        const gradesToSubmit = mapGradesForSubmission(grades);
        if (gradesToSubmit.length === 0) {
            toast.error('Please enter at least one grade');
            return;
        }

        const result = await dispatch(bulkAddGrades({
            classId: selectedClass,
            subject: selectedSubject,
            category: selectedCategory === 'Custom' ? customCategory : selectedCategory,
            date: selectedDate,
            maxMarks,
            academicYear,
            grades: gradesToSubmit,
            sendNotifications
        }));

        if (bulkAddGrades.fulfilled.match(result)) {
            toast.success(`${gradesToSubmit.length} grades saved successfully!`);
            resetGradesForStudents(classStudents);
        } else {
            toast.error(result.payload || 'Failed to save grades');
        }
    };

    return (
        <div className="grade-entry-page">
            <GradeEntryHeader />

            <GradeEntrySelectionForm
                selectedClass={selectedClass}
                onClassChange={setSelectedClass}
                selectedSubject={selectedSubject}
                onSubjectChange={setSelectedSubject}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                customCategory={customCategory}
                onCustomCategoryChange={setCustomCategory}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                maxMarks={maxMarks}
                onMaxMarksChange={setMaxMarks}
                availableClasses={availableClasses}
                availableSubjects={availableSubjects}
            />

            {selectedClass && selectedSubject && classStudents.length > 0 && (
                <GradeEntryTable
                    classStudents={classStudents}
                    grades={grades}
                    maxMarks={maxMarks}
                    sendNotifications={sendNotifications}
                    onSendNotificationsChange={setSendNotifications}
                    onGradeChange={handleGradeChange}
                    enteredCount={enteredCount}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                />
            )}

            {selectedClass && selectedSubject && classStudents.length === 0 && (
                <GradeEntryEmptyState message="No students found in this class" />
            )}

            {(!selectedClass || !selectedSubject) && (
                <GradeEntryEmptyState message="Select a class and subject to start entering grades" />
            )}
        </div>
    );
};

export default GradeEntryPage;
