import { useEffect, useMemo, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { selectClasses } from '../../../store/slices/classSlice';
import { selectSubjects } from '../../../store/slices/subjectSlice';
import { fetchStudentsByClass, selectClassStudents } from '../../../store/slices/studentSlice';
import { bulkAddGrades, bulkUpdateGrades, fetchGradesByAssessmentGroup, selectGradesSubmitting } from '../../../store/slices/gradeSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { fetchMyClasses, selectMyClasses } from '../../../store/slices/teacherSlice';
import { selectIsTeacher, selectUser } from '../../../store/slices/authSlice';
import GradeEntryHeader from './components/GradeEntryHeader';
import GradeEntrySelectionForm from './components/GradeEntrySelectionForm';
import GradeEntryTable from './components/GradeEntryTable';
import GradeEntryEmptyState from './components/GradeEntryEmptyState';
import ClassworkBehaviorModal from '../../../components/grades/ClassworkBehaviorModal';
import EmailLanguageControl from '../../../components/shared/EmailLanguageControl';
import {
    getEmailLanguagePreference,
    saveEmailLanguagePreference
} from '../../../utils/emailLanguagePreference';
import useGradeEntryPageState from './hooks/useGradeEntryPageState';
import {
    countEnteredGrades,
    getAvailableClasses,
    getAvailableSubjects,
    mapGradesForSubmission
} from './utils/gradeEntryPresentation';
import './GradeEntryPage.css';

const GradeEntryPage = () => {
    const { t } = useTranslation(['grades']);
    const dispatch = useDispatch();
    const [searchParams] = useSearchParams();

    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const classStudents = useSelector(selectClassStudents);
    const submitting = useSelector(selectGradesSubmitting);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isTeacher = useSelector(selectIsTeacher);
    const user = useSelector(selectUser);
    const myClasses = useSelector(selectMyClasses);
    const [behaviorStudent, setBehaviorStudent] = useState(null);
    const [emailLanguage, setEmailLanguage] = useState(() => (
        getEmailLanguagePreference(user?._id || user?.id)
    ));
    const [rememberEmailLanguage, setRememberEmailLanguage] = useState(false);

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
        selectedLessonPlanIds,
        setSelectedLessonPlanIds,
        handleGradeChange,
        resetGradesForStudents,
        setGrades,
        editMode,
        editGradeMap,
        enterEditMode,
        exitEditMode
    } = useGradeEntryPageState({ initialClassId: searchParams.get('class') || '' });

    useEffect(() => {
        if (isTeacher) {
            dispatch(fetchMyClasses());
        }
    }, [academicYear, dispatch, isTeacher]);

    useEffect(() => {
        if (selectedClass && !editMode) {
            dispatch(fetchStudentsByClass(selectedClass));
            setGrades({});
        }
    }, [dispatch, editMode, selectedClass, setGrades]);

    useEffect(() => {
        if (!editMode) {
            setSelectedLessonPlanIds([]);
        }
    }, [editMode, selectedClass, selectedSubject, setSelectedLessonPlanIds]);

    useEffect(() => {
        if (!editMode) {
            resetGradesForStudents(classStudents);
        }
    }, [classStudents, editMode, resetGradesForStudents]);

    // Load grades for edit mode when navigated with ?assessmentGroupId=xxx
    useEffect(() => {
        const groupId = searchParams.get('assessmentGroupId');
        if (groupId && !editMode) {
            dispatch(fetchGradesByAssessmentGroup(groupId)).then((result) => {
                if (fetchGradesByAssessmentGroup.fulfilled.match(result)) {
                    const { grades: gradesData, metadata } = result.payload;
                    // Fetch students for the class so the table has all rows
                    if (metadata.classId) {
                        dispatch(fetchStudentsByClass(String(metadata.classId)));
                    }
                    enterEditMode({ gradesData, metadata });
                } else {
                    toast.error(result.payload || t('grades:toasts.loadFailed', { defaultValue: 'Failed to load grades for editing' }));
                }
            });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const availableClasses = useMemo(() => {
        return getAvailableClasses({ isTeacher, myClasses, classes });
    }, [classes, isTeacher, myClasses]);

    const availableSubjects = useMemo(() => {
        return getAvailableSubjects({ selectedClass, classes, subjects, isTeacher, myClasses });
    }, [classes, selectedClass, subjects, isTeacher, myClasses]);

    const enteredCount = useMemo(() => {
        return countEnteredGrades(grades);
    }, [grades]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (editMode) {
            // Build update payload: only grades that have a corresponding grade document
            const gradeUpdates = Object.entries(grades)
                .filter(([studentId, data]) => editGradeMap[studentId] && data.marks !== '' && data.marks !== null)
                .map(([studentId, data]) => ({
                    _id: editGradeMap[studentId],
                    marks: Number.parseFloat(data.marks),
                    maxMarks,
                    remarks: data.remarks || ''
                }));

            if (gradeUpdates.length === 0) {
                toast.error(t('grades:toasts.enterAtLeastOne'));
                return;
            }

            const result = await dispatch(bulkUpdateGrades({
                grades: gradeUpdates,
                metadata: {
                    classId: selectedClass,
                    subject: selectedSubject,
                    category: (selectedCategory === 'Custom' ? customCategory : selectedCategory || '').toLowerCase(),
                    date: selectedDate,
                    maxMarks
                }
            }));
            if (bulkUpdateGrades.fulfilled.match(result)) {
                toast.success(t('grades:toasts.updatedSuccess', { defaultValue: '{{count}} grades updated successfully', count: gradeUpdates.length }));
            } else {
                toast.error(result.payload || t('grades:toasts.updateFailed', { defaultValue: 'Failed to update grades' }));
            }
            return;
        }

        // Add mode
        const gradesToSubmit = mapGradesForSubmission(grades);
        if (gradesToSubmit.length === 0) {
            toast.error(t('grades:toasts.enterAtLeastOne'));
            return;
        }

        const result = await dispatch(bulkAddGrades({
            classId: selectedClass,
            subject: selectedSubject,
            category: selectedCategory === 'Custom' ? customCategory : selectedCategory,
            date: selectedDate,
            maxMarks,
            lessonPlanIds: selectedLessonPlanIds,
            academicYear,
            grades: gradesToSubmit,
            sendNotifications,
            language: emailLanguage
        }));

        if (bulkAddGrades.fulfilled.match(result)) {
            if (rememberEmailLanguage) {
                saveEmailLanguagePreference(user?._id || user?.id, emailLanguage);
            }
            toast.success(t('grades:toasts.savedSuccess', { count: gradesToSubmit.length }));
            resetGradesForStudents(classStudents);
        } else {
            toast.error(result.payload || t('grades:toasts.saveFailed'));
        }
    };

    const handleCancelEdit = useCallback(() => {
        exitEditMode();
        resetGradesForStudents(classStudents);
        // Remove assessmentGroupId from URL
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('assessmentGroupId');
        window.history.replaceState({}, '', `${window.location.pathname}${newParams.toString() ? '?' + newParams.toString() : ''}`);
    }, [classStudents, exitEditMode, resetGradesForStudents, searchParams]);

    const openBehaviorModal = (student) => setBehaviorStudent(student);

    const applyBehaviorScore = (student, result) => {
        setGrades((current) => ({
            ...current,
            [student._id]: {
                ...current[student._id],
                marks: result.marks,
                remarks: result.remarks
            }
        }));
    };

    const applyBehaviorAndNext = (result) => {
        if (!behaviorStudent) return;
        applyBehaviorScore(behaviorStudent, result);
        const currentIndex = classStudents.findIndex((student) => student._id === behaviorStudent._id);
        setBehaviorStudent(classStudents[currentIndex + 1] || null);
    };

    return (
        <div className="grade-entry-page">
            <GradeEntryHeader editMode={editMode} />

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
                selectedLessonPlanIds={selectedLessonPlanIds}
                onSelectedLessonPlanIdsChange={setSelectedLessonPlanIds}
                disabled={false}
            />

            {selectedClass && selectedSubject && classStudents.length > 0 && (
                <GradeEntryTable
                    classStudents={classStudents}
                    grades={grades}
                    maxMarks={maxMarks}
                    sendNotifications={sendNotifications}
                    onSendNotificationsChange={setSendNotifications}
                    emailLanguageControl={(
                        <EmailLanguageControl
                            language={emailLanguage}
                            onLanguageChange={setEmailLanguage}
                            rememberLanguage={rememberEmailLanguage}
                            onRememberLanguageChange={setRememberEmailLanguage}
                            name="grade-entry-email-language"
                        />
                    )}
                    onGradeChange={handleGradeChange}
                    enteredCount={enteredCount}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    editMode={editMode}
                    onCancelEdit={handleCancelEdit}
                    showBehaviorAction={selectedCategory?.toLowerCase() === 'classwork'}
                    onOpenBehavior={openBehaviorModal}
                />
            )}

            {selectedClass && selectedSubject && classStudents.length === 0 && (
                <GradeEntryEmptyState message={t('grades:entry.empty.noStudents')} />
            )}

            {(!selectedClass || !selectedSubject) && (
                <GradeEntryEmptyState message={t('grades:entry.empty.selectClassSubject')} />
            )}

            {behaviorStudent && selectedCategory?.toLowerCase() === 'classwork' && (
                <ClassworkBehaviorModal
                    key={behaviorStudent._id}
                    student={behaviorStudent}
                    currentRow={grades[behaviorStudent._id]}
                    maxMarks={maxMarks}
                    onClose={() => setBehaviorStudent(null)}
                    onApply={(result) => {
                        applyBehaviorScore(behaviorStudent, result);
                        setBehaviorStudent(null);
                    }}
                    onApplyNext={applyBehaviorAndNext}
                    hasNext={classStudents.findIndex((student) => student._id === behaviorStudent._id) < classStudents.length - 1}
                />
            )}
        </div>
    );
};

export default GradeEntryPage;
