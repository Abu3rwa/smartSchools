import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { HiOutlineClock } from 'react-icons/hi';
import { selectClasses } from '../../../store/slices/classSlice';
import { selectSubjects } from '../../../store/slices/subjectSlice';
import { fetchStudentsByClass, selectClassStudents } from '../../../store/slices/studentSlice';
import { bulkAddGrades, bulkUpdateGrades, fetchGradesByAssessmentGroup, selectGradesSubmitting } from '../../../store/slices/gradeSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { fetchMyClasses, selectMyClasses } from '../../../store/slices/teacherSlice';
import { selectIsTeacher, selectUser } from '../../../store/slices/authSlice';
import GradeEntryHeader from './components/GradeEntryHeader';
import GradeEntryCategoryTabs from './components/GradeEntryCategoryTabs';
import GradeEntrySelectionForm from './components/GradeEntrySelectionForm';
import GradeEntryTable from './components/GradeEntryTable';
import GradeEntryEmptyState from './components/GradeEntryEmptyState';
import GradeEntryLessonPanel from './components/GradeEntryLessonPanel';
import LessonPlanLinkButton from '../../../components/grades/LessonPlanLinkButton';
import GradeEntryEmailPreviewModal from './components/GradeEntryEmailPreviewModal';
import ClassworkSelfCheckPanel from './components/ClassworkSelfCheckPanel';
import ClassworkBehaviorModal from '../../../components/grades/ClassworkBehaviorModal';
import EmailLanguageControl from '../../../components/shared/EmailLanguageControl';
import {
    getEmailLanguagePreference,
    saveEmailLanguagePreference
} from '../../../utils/emailLanguagePreference';
import useGradeEntryPageState from './hooks/useGradeEntryPageState';
import {
    countEnteredGrades,
    countInvalidGrades,
    getAvailableClasses,
    getAvailableSubjects,
    getGradeMarkState,
    mapGradesForSubmission,
    normalizeCustomCategory
} from './utils/gradeEntryPresentation';
import { createDraftStore, hasDraftContent } from './utils/gradeEntryDraft';
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
    const [selfCheckRows, setSelfCheckRows] = useState([]);
    const [previewRequest, setPreviewRequest] = useState(null);
    const [emailLanguage, setEmailLanguage] = useState(() => (
        getEmailLanguagePreference(user?._id || user?.id)
    ));
    const [rememberEmailLanguage, setRememberEmailLanguage] = useState(false);
    const [categoryValidationAttempt, setCategoryValidationAttempt] = useState(0);
    const [pendingLesson, setPendingLesson] = useState(null);
    const [draftNotice, setDraftNotice] = useState(null);
    const pendingDraftGradesRef = useRef(null);
    const discardedDraftPairsRef = useRef(new Set());
    const storageFailedRef = useRef(false);
    const suppressDraftWriteRef = useRef(null);
    const draftBaselineRef = useRef({ pair: '', signature: '' });

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
        lessonTitle,
        setLessonTitle,
        lessonSummary,
        setLessonSummary,
        handleGradeChange,
        resetGradesForStudents,
        setGrades,
        editMode,
        editGradeMap,
        enterEditMode,
        exitEditMode
    } = useGradeEntryPageState({ initialClassId: searchParams.get('class') || '' });

    const userId = user?._id || user?.id || '';
    const draftStore = useMemo(() => {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return null;
            return createDraftStore(window.localStorage);
        } catch {
            return null;
        }
    }, []);

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

    // Lesson-plan ids are cleared by the class/subject handlers now, so a
    // restored draft keeps its ids instead of being wiped on the same render.
    useEffect(() => {
        if (!editMode) {
            setSelectedLessonPlanIds([]);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (editMode) return;
        resetGradesForStudents(classStudents);
        const pendingDraftGrades = pendingDraftGradesRef.current;
        if (!pendingDraftGrades || classStudents.length === 0) return;
        pendingDraftGradesRef.current = null;
        setGrades((current) => {
            const next = { ...current };
            for (const student of classStudents) {
                const studentId = String(student?._id || student?.id || '');
                const restored = pendingDraftGrades[studentId];
                if (!restored) continue;
                next[studentId] = {
                    ...current[studentId],
                    marks: restored.marks ?? '',
                    remarks: restored.remarks ?? ''
                };
            }
            return next;
        });
    }, [classStudents, editMode, resetGradesForStudents, setGrades]);

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
        return getAvailableClasses({ isTeacher, myClasses, classes, academicYear });
    }, [academicYear, classes, isTeacher, myClasses]);

    const availableSubjects = useMemo(() => {
        return getAvailableSubjects({ selectedClass, classes, subjects, isTeacher, myClasses });
    }, [classes, selectedClass, subjects, isTeacher, myClasses]);

    const enteredCount = useMemo(() => {
        return countEnteredGrades(grades, maxMarks);
    }, [grades, maxMarks]);

    const invalidCount = useMemo(() => {
        return countInvalidGrades(grades, maxMarks);
    }, [grades, maxMarks]);

    const maxMarksValid = getGradeMarkState(0, maxMarks).status === 'valid';
    const readyCount = useMemo(() => {
        if (!editMode) return enteredCount;
        return Object.entries(grades).filter(([studentId, data]) => (
            editGradeMap[studentId]
            && getGradeMarkState(data?.marks, maxMarks).status === 'valid'
        )).length;
    }, [editGradeMap, editMode, enteredCount, grades, maxMarks]);

    const clearLessonContext = useCallback(() => {
        setLessonTitle('');
        setLessonSummary('');
        setPendingLesson(null);
    }, [setLessonTitle, setLessonSummary]);

    const handleLessonApply = useCallback(({ title, summary }) => {
        setLessonTitle(title);
        setLessonSummary(summary);
        setPendingLesson(null);
    }, [setLessonTitle, setLessonSummary]);

    // A ?class= link from a previous year no longer resolves to a listed class; clear it
    // instead of saving grades against last year's document.
    useEffect(() => {
        if (editMode || availableClasses.length === 0 || !selectedClass) return;
        const stillAvailable = availableClasses.some(
            (item) => String(item._id) === String(selectedClass)
        );
        if (!stillAvailable) {
            pendingDraftGradesRef.current = null;
            setSelectedClass('');
            setSelectedSubject('');
            setSelectedLessonPlanIds([]);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- stale-link cleanup must also drop lesson text, or it saves under the next class
            clearLessonContext();
        }
    }, [
        availableClasses, clearLessonContext, editMode, selectedClass, setSelectedClass,
        setSelectedLessonPlanIds, setSelectedSubject
    ]);

    const buildDraftPayload = useCallback(() => {
        const draftGrades = {};
        Object.entries(grades).forEach(([studentId, row]) => {
            const marks = row?.marks ?? '';
            const remarks = row?.remarks ?? '';
            if (!String(marks).trim() && !String(remarks).trim()) return;
            draftGrades[studentId] = { marks, remarks };
        });
        const classItem = availableClasses.find((item) => String(item._id) === String(selectedClass));
        const subjectItem = availableSubjects.find((item) => String(item._id) === String(selectedSubject));
        return {
            classId: selectedClass,
            subjectId: selectedSubject,
            classLabel: classItem?.name || '',
            subjectLabel: subjectItem?.name || '',
            category: selectedCategory,
            customCategory,
            date: selectedDate,
            maxMarks,
            grades: draftGrades,
            lessonTitle,
            lessonSummary,
            pendingLesson,
            lessonPlanIds: selectedLessonPlanIds,
            sendNotifications
        };
    }, [
        availableClasses, availableSubjects, customCategory, grades, lessonSummary, lessonTitle,
        maxMarks, pendingLesson, selectedCategory, selectedClass, selectedDate,
        selectedLessonPlanIds, selectedSubject, sendNotifications
    ]);

    const mergeDraftGrades = useCallback((draftGrades, students) => {
        if (!draftGrades) return;
        const rosterIds = new Set((students || []).map(
            (student) => String(student?._id || student?.id || '')
        ));
        setGrades((current) => {
            const next = { ...current };
            Object.entries(draftGrades).forEach(([studentId, row]) => {
                if (rosterIds.size > 0 && !rosterIds.has(studentId)) return;
                next[studentId] = {
                    ...current[studentId],
                    marks: row?.marks ?? '',
                    remarks: row?.remarks ?? ''
                };
            });
            return next;
        });
    }, [setGrades]);

    const tryRestoreDraft = useCallback((classId, subjectId, { deferGrades = false } = {}) => {
        if (!draftStore || !classId || !subjectId || editMode || submitting) return false;
        const pair = `${classId}|${subjectId}`;
        if (discardedDraftPairsRef.current.has(pair)) return false;
        const draft = draftStore.read(userId, classId, subjectId);
        if (!draft) return false;

        if (draft.date) setSelectedDate(draft.date);
        const restoredMaxMarks = Number(draft.maxMarks);
        if (Number.isFinite(restoredMaxMarks) && restoredMaxMarks >= 1 && restoredMaxMarks <= 100) {
            setMaxMarks(restoredMaxMarks);
        }
        if (typeof draft.category === 'string' && draft.category) setSelectedCategory(draft.category);
        setCustomCategory(typeof draft.customCategory === 'string' ? draft.customCategory : '');
        setLessonTitle(draft.lessonTitle || '');
        setLessonSummary(draft.lessonSummary || '');
        setPendingLesson(draft.pendingLesson || null);
        setSelectedLessonPlanIds(Array.isArray(draft.lessonPlanIds) ? draft.lessonPlanIds : []);
        setSendNotifications(Boolean(draft.sendNotifications));

        const draftGrades = draft.grades && typeof draft.grades === 'object' ? draft.grades : {};
        if (deferGrades) {
            pendingDraftGradesRef.current = draftGrades;
        } else {
            mergeDraftGrades(draftGrades, classStudents);
        }
        setDraftNotice({ classId, subjectId, savedAt: draft.savedAt });
        return true;
    }, [
        classStudents, draftStore, editMode, mergeDraftGrades, setCustomCategory,
        setLessonSummary, setLessonTitle, setMaxMarks, setSelectedCategory, setSelectedDate,
        setSelectedLessonPlanIds, setSendNotifications, submitting, userId
    ]);

    const handleDiscardDraft = () => {
        if (!draftNotice) return;
        if (!window.confirm(t('grades:entry.draft.discardConfirm'))) return;
        draftStore?.remove(userId, draftNotice.classId, draftNotice.subjectId);
        discardedDraftPairsRef.current.add(`${draftNotice.classId}|${draftNotice.subjectId}`);
        pendingDraftGradesRef.current = null;
        suppressDraftWriteRef.current = `${draftNotice.classId}|${draftNotice.subjectId}`;
        setDraftNotice(null);
        setSelectedLessonPlanIds([]);
        resetGradesForStudents(classStudents);
        clearLessonContext();
        toast.success(t('grades:entry.draft.discarded'));
    };

    // Drafts are written after typing settles; an untouched page stores nothing.
    useEffect(() => {
        if (!draftStore || editMode || submitting || !selectedClass || !selectedSubject) return undefined;
        const draft = buildDraftPayload();
        const pair = `${selectedClass}|${selectedSubject}`;
        const signature = JSON.stringify(draft);

        if (suppressDraftWriteRef.current === pair) {
            suppressDraftWriteRef.current = null;
            draftBaselineRef.current = { pair, signature };
            return undefined;
        }
        if (draftBaselineRef.current.pair === pair && draftBaselineRef.current.signature === signature) {
            return undefined;
        }

        const timer = setTimeout(() => {
            if (!hasDraftContent(draft)) return;
            const saved = draftStore.write(userId, draft);
            if (!saved && !storageFailedRef.current) {
                storageFailedRef.current = true;
                toast.error(t('grades:entry.draft.storageUnavailable'));
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [buildDraftPayload, draftStore, editMode, selectedClass, selectedSubject, submitting, t, userId]);

    // A scope change must never silently carry the previous lesson's text.
    const handleClassChange = (nextClass) => {
        if (nextClass === selectedClass) return;
        if ((lessonTitle || lessonSummary) && !window.confirm(t('grades:entry.lesson.scopeConfirm'))) return;
        pendingDraftGradesRef.current = null;
        clearLessonContext();
        setSelectedLessonPlanIds([]);
        setDraftNotice(null);
        setSelectedClass(nextClass);
        if (nextClass && selectedSubject) {
            tryRestoreDraft(nextClass, selectedSubject, { deferGrades: true });
        }
    };

    const handleSubjectChange = (nextSubject) => {
        if (nextSubject === selectedSubject) return;
        if ((lessonTitle || lessonSummary) && !window.confirm(t('grades:entry.lesson.scopeConfirm'))) return;
        pendingDraftGradesRef.current = null;
        clearLessonContext();
        setSelectedLessonPlanIds([]);
        setDraftNotice(null);
        setSelectedSubject(nextSubject);
        if (selectedClass && nextSubject) {
            tryRestoreDraft(selectedClass, nextSubject);
        }
    };

    const handleDateChange = (nextDate) => {
        if (nextDate !== selectedDate && (lessonTitle || lessonSummary)
            && window.confirm(t('grades:entry.lesson.dateConfirm'))) {
            clearLessonContext();
        }
        setSelectedDate(nextDate);
    };

    const openEmailPreview = (student) => setPreviewRequest({ studentId: student?._id || null });

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!maxMarksValid) {
            toast.error(t('grades:entry.validation.maxMarksInvalid'));
            document.getElementById('grade-max-marks')?.focus();
            return;
        }

        if (invalidCount > 0) {
            toast.error(t('grades:entry.validation.fixInvalid', { count: invalidCount }));
            document.querySelector('.marks-input[aria-invalid="true"]')?.focus();
            return;
        }

        const submittedCategory = selectedCategory === 'Custom'
            ? normalizeCustomCategory(customCategory)
            : selectedCategory || '';
        if (selectedCategory === 'Custom' && !submittedCategory) {
            setCategoryValidationAttempt((attempt) => attempt + 1);
            toast.error(t('grades:entry.validation.customCategoryRequired'));
            document.querySelector('.grade-category-custom')?.focus();
            return;
        }

        if (editMode) {
            // Build update payload: only grades that have a corresponding grade document
            const gradeUpdates = Object.entries(grades)
                .filter(([studentId, data]) => (
                    editGradeMap[studentId]
                    && getGradeMarkState(data?.marks, maxMarks).status === 'valid'
                ))
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
                    category: submittedCategory,
                    date: selectedDate,
                    maxMarks,
                    title: lessonTitle,
                    lessonSummary
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

        const submittedClassId = selectedClass;
        const submittedSubjectId = selectedSubject;
        const result = await dispatch(bulkAddGrades({
            classId: selectedClass,
            subject: selectedSubject,
            category: submittedCategory,
            date: selectedDate,
            maxMarks,
            title: lessonTitle,
            lessonSummary,
            lessonPlanIds: selectedLessonPlanIds,
            academicYear,
            grades: gradesToSubmit,
            sendNotifications,
            language: emailLanguage
        }));

        if (bulkAddGrades.fulfilled.match(result)) {
            draftStore?.remove(userId, submittedClassId, submittedSubjectId);
            suppressDraftWriteRef.current = `${submittedClassId}|${submittedSubjectId}`;
            setDraftNotice(null);
            setPendingLesson(null);
            if (rememberEmailLanguage) {
                saveEmailLanguagePreference(user?._id || user?.id, emailLanguage);
            }
            toast.success(t('grades:toasts.savedSuccess', { count: gradesToSubmit.length }));
            const emailFailures = Number(result.payload?.emailFailures || 0);
            if (sendNotifications && emailFailures > 0) {
                toast.error(t('grades:toasts.emailsFailed', {
                    defaultValue: 'Grades saved, but {{count}} email(s) could not be sent. Check the notifications log.',
                    count: emailFailures
                }));
            }
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

    const applySelfCheckMarks = useCallback((patch) => {
        setGrades((current) => {
            const next = { ...current };
            Object.entries(patch).forEach(([studentId, values]) => {
                next[studentId] = { ...current[studentId], ...values };
            });
            return next;
        });
    }, [setGrades]);

    const selfCheckRowFor = (student) => {
        const studentId = String(student?._id || student?.id || '');
        return selfCheckRows.find((row) => String(row.student?.id) === studentId && row.submitted) || null;
    };

    // The lesson title/summary and its plan picker share one row inside the
    // setup card instead of stacking two optional blocks above the roster.
    const lessonSlot = selectedClass && selectedSubject ? (
        <GradeEntryLessonPanel
            classId={selectedClass}
            subjectId={selectedSubject}
            gradeDate={selectedDate}
            lessonTitle={lessonTitle}
            lessonSummary={lessonSummary}
            onApply={handleLessonApply}
            pendingLesson={pendingLesson}
            onPendingLessonChange={setPendingLesson}
            linkSlot={(
                <LessonPlanLinkButton
                    classId={selectedClass}
                    subjectId={selectedSubject}
                    selectedLessonPlanIds={selectedLessonPlanIds}
                    onChange={setSelectedLessonPlanIds}
                />
            )}
        />
    ) : null;

    const draftNoticeSlot = draftNotice ? (
        <div className="grade-draft-notice" role="status">
            <HiOutlineClock aria-hidden="true" />
            <span>
                {t('grades:entry.draft.restored', {
                    time: new Date(draftNotice.savedAt).toLocaleString()
                })}
            </span>
            <button type="button" className="grade-draft-notice__discard" onClick={handleDiscardDraft}>
                {t('grades:entry.draft.discard')}
            </button>
        </div>
    ) : null;

    return (
        <div className="grade-entry-page">
            <section className="card grade-setup" aria-label={t('grades:entry.setupLabel')}>
                <GradeEntryHeader
                    editMode={editMode}
                    tabs={(
                        <GradeEntryCategoryTabs
                            value={selectedCategory}
                            customCategory={customCategory}
                            onCategoryChange={setSelectedCategory}
                            onCustomCategoryChange={setCustomCategory}
                            validationAttempt={categoryValidationAttempt}
                            disabled={false}
                        />
                    )}
                />

                <GradeEntrySelectionForm
                    selectedClass={selectedClass}
                    onClassChange={handleClassChange}
                    selectedSubject={selectedSubject}
                    onSubjectChange={handleSubjectChange}
                    selectedDate={selectedDate}
                    onDateChange={handleDateChange}
                    maxMarks={maxMarks}
                    onMaxMarksChange={setMaxMarks}
                    availableClasses={availableClasses}
                    availableSubjects={availableSubjects}
                    lessonSlot={lessonSlot}
                    noticeSlot={draftNoticeSlot}
                    disabled={false}
                />
            </section>

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
                    invalidCount={invalidCount}
                    readyCount={readyCount}
                    maxMarksValid={maxMarksValid}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    editMode={editMode}
                    onCancelEdit={handleCancelEdit}
                    showBehaviorAction={selectedCategory?.toLowerCase() === 'classwork'}
                    onOpenBehavior={openBehaviorModal}
                    onPreviewStudent={openEmailPreview}
                    onPreviewEmail={() => openEmailPreview(null)}
                />
            )}

            {selectedClass && selectedSubject && classStudents.length === 0 && (
                <GradeEntryEmptyState message={t('grades:entry.empty.noStudents')} />
            )}

            {selectedClass && selectedSubject
                && selectedCategory?.toLowerCase() === 'classwork'
                && !editMode && (
                <ClassworkSelfCheckPanel
                    classId={selectedClass}
                    subjectId={selectedSubject}
                    date={selectedDate}
                    maxMarks={maxMarks}
                    grades={grades}
                    onApplyMarks={applySelfCheckMarks}
                    onStudentsChange={setSelfCheckRows}
                />
            )}

            {(!selectedClass || !selectedSubject) && (
                <GradeEntryEmptyState message={t('grades:entry.empty.selectClassSubject')} />
            )}

            {previewRequest && selectedClass && selectedSubject && (
                <GradeEntryEmailPreviewModal
                    classStudents={classStudents}
                    grades={grades}
                    maxMarks={maxMarks}
                    classId={selectedClass}
                    subjectId={selectedSubject}
                    date={selectedDate}
                    lessonTitle={lessonTitle}
                    lessonSummary={lessonSummary}
                    initialStudentId={previewRequest.studentId}
                    defaultLanguage={emailLanguage}
                    onClose={() => setPreviewRequest(null)}
                />
            )}

            {behaviorStudent && selectedCategory?.toLowerCase() === 'classwork' && (
                <ClassworkBehaviorModal
                    key={behaviorStudent._id}
                    student={behaviorStudent}
                    currentRow={grades[behaviorStudent._id]}
                    maxMarks={maxMarks}
                    userId={user?.id || user?._id}
                    initialSelectedRuleIds={selfCheckRowFor(behaviorStudent)?.selectedRules.map((rule) => rule.id)}
                    initialRemark={selfCheckRowFor(behaviorStudent)?.remark}
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
