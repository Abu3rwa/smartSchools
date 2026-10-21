import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import assignmentService from '../../../services/assignmentService';
import { selectClasses } from '../../../store/slices/classSlice';
import { selectSubjects } from '../../../store/slices/subjectSlice';
import { fetchStudentsByClass, selectClassStudents } from '../../../store/slices/studentSlice';
import { fetchMyClasses, selectMyClasses } from '../../../store/slices/teacherSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectUser } from '../../../store/slices/authSlice';
import AssignmentsHeader from './components/AssignmentsHeader';
import AssignmentsOverview from './components/AssignmentsOverview';
import AssignmentsPanel from './components/AssignmentsPanel';
import CreateAssignmentForm from './components/CreateAssignmentForm';
import AssignmentGradePanel from './components/AssignmentGradePanel';
import ClassroomPanel from './components/ClassroomPanel';
import GoogleFormsPanel from './components/GoogleFormsPanel';
import GoogleFormResultsPanel from './components/GoogleFormResultsPanel';
import ClassworkBehaviorModal from '../../../components/grades/ClassworkBehaviorModal';
import useAssignmentsPageState from './hooks/useAssignmentsPageState';
import useGoogleClassroom from './hooks/useGoogleClassroom';
import googleFormsService from '../../../services/googleFormsService';
import { isClassworkAssignment } from '../../../components/grades/classworkBehaviorUtils';
import {
    filterAndSortAssignments,
    getAssignmentMetrics
} from './utils/assignmentListPresentation';
import {
    normalizeGradeStudentsFromClassStudents,
    sortGradeStudentsByName
} from './utils/assignmentPresentation';
import './AssignmentsPage.css';

const PAGE_SIZE = 10;

const AssignmentsPage = () => {
    const { t, i18n } = useTranslation(['assignments']);
    const [searchParams] = useSearchParams();
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const classStudents = useSelector(selectClassStudents);
    const myClasses = useSelector(selectMyClasses);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const user = useSelector(selectUser);
    const [behaviorStudent, setBehaviorStudent] = useState(null);
    const [googleFormResults, setGoogleFormResults] = useState(null);
    const [loadingGoogleFormResults, setLoadingGoogleFormResults] = useState(false);
    const [createFormOpen, setCreateFormOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('assignments');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState('dueDate');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [bulkBusy, setBulkBusy] = useState('');
    const [startWithImport, setStartWithImport] = useState(false);

    useEffect(() => {
        if (searchParams.has('google_forms_connected') || searchParams.has('google_forms_error')) {
            setActiveTab('integrations');
        }
    }, [searchParams]);

    const {
        assignmentTypes,
        setAssignmentTypes,
        assignments,
        setAssignments,
        loading,
        setLoading,
        submitting,
        setSubmitting,
        submittingGrades,
        setSubmittingGrades,
        excuseBusyStudentId,
        setExcuseBusyStudentId,
        selectedClass,
        setSelectedClass,
        selectedSubject,
        setSelectedSubject,
        selectedStatus,
        setSelectedStatus,
        gradingAssignment,
        setGradingAssignment,
        editingAssignment,
        setEditingAssignment,
        gradeRows,
        setGradeRows,
        gradeStudents,
        setGradeStudents,
        form,
        setForm,
        resetForm,
        canCreateAssignments,
        availableClasses,
        availableSubjects
    } = useAssignmentsPageState({ user, classes, subjects, myClasses });

    const classroom = useGoogleClassroom({
        user,
        selectedClass,
        selectedSubject,
        academicYear,
        assignments
    });

    const classLabel = useMemo(
        () => availableClasses.find((item) => String(item._id) === String(selectedClass))?.name || '',
        [availableClasses, selectedClass]
    );

    const metrics = useMemo(() => getAssignmentMetrics(assignments), [assignments]);

    const filteredAssignments = useMemo(() => filterAndSortAssignments({
        assignments,
        status: selectedStatus,
        search: searchTerm,
        sortKey,
        language: i18n.language
    }), [assignments, i18n.language, searchTerm, selectedStatus, sortKey]);

    const pageCount = Math.max(1, Math.ceil(filteredAssignments.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, pageCount);
    const pagedAssignments = useMemo(() => (
        filteredAssignments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    ), [filteredAssignments, safePage]);

    const allVisibleSelected = pagedAssignments.length > 0
        && pagedAssignments.every((assignment) => selectedIds.has(assignment.id));
    const someVisibleSelected = pagedAssignments.some((assignment) => selectedIds.has(assignment.id));

    useEffect(() => {
        if (form.createGoogleForm && selectedClass) {
            dispatch(fetchStudentsByClass(selectedClass));
        }
    }, [dispatch, form.createGoogleForm, selectedClass]);

    const fetchAssignmentTypes = async () => {
        try {
            const response = await assignmentService.getAssignmentTypes();
            const items = response?.data?.items || [];
            setAssignmentTypes(items);
            setForm((prev) => ({
                ...prev,
                assignmentTypeId: prev.assignmentTypeId || items[0]?.id || ''
            }));
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:toasts.loadTypesFailed'));
        }
    };

    const fetchAssignments = async () => {
        if (!selectedClass) {
            setAssignments([]);
            return;
        }

        setLoading(true);
        try {
            const response = await assignmentService.getAssignments({
                classId: selectedClass,
                subjectId: selectedSubject || undefined,
                academicYear,
                limit: 100
            });
            setAssignments(response?.data?.items || []);
            setSelectedIds(new Set());
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:toasts.loadAssignmentsFailed'));
            setAssignments([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user?.role === 'teacher') dispatch(fetchMyClasses());
        fetchAssignmentTypes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [academicYear, dispatch, user?.role]);

    useEffect(() => {
        if (!selectedClass && availableClasses.length > 0) {
            setSelectedClass(availableClasses[0]._id);
        }
    }, [availableClasses, selectedClass, setSelectedClass]);

    useEffect(() => {
        const subjectIds = availableSubjects.map((subject) => (subject._id || subject).toString());
        if (selectedSubject && !subjectIds.includes(selectedSubject)) {
            setSelectedSubject('');
        }
    }, [availableSubjects, selectedSubject, setSelectedSubject]);

    useEffect(() => {
        fetchAssignments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClass, selectedSubject, academicYear]);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedIds(new Set());
    }, [selectedStatus, searchTerm, selectedClass, selectedSubject]);

    useEffect(() => {
        setCurrentPage(1);
    }, [sortKey]);

    useEffect(() => {
        if (currentPage > pageCount) setCurrentPage(pageCount);
    }, [currentPage, pageCount]);

    const handleClassChange = (classId) => {
        if (classId !== selectedClass) {
            setForm((prev) => ({ ...prev, scope: 'class', studentIds: [] }));
            setSearchTerm('');
        }
        setSelectedClass(classId);
    };

    const handleSubjectChange = (subjectId) => {
        setSearchTerm('');
        setSelectedSubject(subjectId);
    };

    const openCreateDrawer = ({ importMode = false } = {}) => {
        setActiveTab('assignments');
        setEditingAssignment(null);
        resetForm();
        setStartWithImport(importMode);
        setCreateFormOpen(true);
    };

    const onStartCreateAssignment = () => openCreateDrawer();

    const onCreateAssignment = async (event) => {
        event.preventDefault();
        if (!selectedClass || !selectedSubject) {
            toast.error(t('assignments:toasts.selectClassSubject'));
            return;
        }
        if (!form.assignmentTypeId || !form.title.trim()) {
            toast.error(t('assignments:toasts.typeTitleRequired'));
            return;
        }
        if (form.createGoogleForm
            && form.scope === 'selected_students'
            && (!Array.isArray(form.studentIds) || form.studentIds.length === 0)) {
            toast.error(t('assignments:googleForms.selectStudents'));
            return;
        }

        const submitAction = event.nativeEvent?.submitter?.value || '';
        const publishNow = editingAssignment
            ? form.publishNow
            : submitAction === 'publish';

        const existingClassroomLink = editingAssignment?.id ? classroom.links[editingAssignment.id] : null;
        const postToClassroom = classroom.ready && Boolean(form.classroomPublish) && !existingClassroomLink;
        if (postToClassroom) {
            const confirmed = window.confirm(t('assignments:classroom.confirmPost', {
                course: classroom.mapping?.courseName || '',
                email: classroom.connection.email || ''
            }));
            if (!confirmed) return;
        }

        setSubmitting(true);
        try {
            const payload = {
                classId: selectedClass,
                subjectId: selectedSubject,
                assignmentTypeId: form.assignmentTypeId,
                title: form.title.trim(),
                instructions: form.instructions.trim(),
                lessonPlanIds: Array.isArray(form.lessonPlanIds) && form.lessonPlanIds.length > 0
                    ? form.lessonPlanIds
                    : undefined,
                links: Array.isArray(form.links) && form.links.length > 0
                    ? form.links
                    : undefined,
                dueDate: form.dueDate || undefined,
                maxMarks: Number(form.maxMarks || 10),
                publishNow,
                classroomPublish: postToClassroom || undefined,
                notifyOnAssign: form.notifyOnAssign,
                notifyAudience: form.notifyAudience || 'both',
                notifyOnGrade: form.notifyOnGrade,
                createGoogleForm: Boolean(form.createGoogleForm),
                scope: form.createGoogleForm
                    ? form.scope || 'class'
                    : editingAssignment?.scope || 'class',
                studentIds: form.createGoogleForm && form.scope === 'selected_students'
                    ? form.studentIds || []
                    : (!form.createGoogleForm && editingAssignment?.scope === 'selected_students'
                        ? editingAssignment.studentIds || []
                        : []),
                ...(form.createGoogleForm && !editingAssignment?.googleForm?.responderUri
                    ? { metadata: { googleForm: { questions: form.googleFormQuestions || [] } } }
                    : {}),
                ...(!form.createGoogleForm && editingAssignment?.googleForm && !editingAssignment.googleForm.responderUri
                    ? { metadata: null }
                    : {}),
                academicYear,
                removeAttachmentIds: Array.isArray(form.removeAttachmentIds) && form.removeAttachmentIds.length > 0
                    ? form.removeAttachmentIds
                    : undefined
            };

            const files = form.attachmentFiles || [];

            let saved;
            if (editingAssignment?.id) {
                saved = await assignmentService.updateAssignment(editingAssignment.id, payload, files);
                toast.success(t('assignments:toasts.updated'));
            } else {
                saved = await assignmentService.createAssignment(payload, files);
                toast.success(t('assignments:toasts.created'));
            }
            classroom.reportOutcome(saved?.data?.classroom);

            setEditingAssignment(null);
            resetForm();
            setStartWithImport(false);
            setCreateFormOpen(false);
            await fetchAssignments();
        } catch (error) {
            toast.error(
                error.response?.data?.message
                || (editingAssignment?.id ? t('assignments:toasts.updateFailed') : t('assignments:toasts.createFailed'))
            );
        } finally {
            setSubmitting(false);
        }
    };

    const onEditAssignment = (assignment) => {
        setActiveTab('assignments');
        setStartWithImport(false);
        setCreateFormOpen(true);
        setEditingAssignment(assignment);
        setForm((prev) => ({
            ...prev,
            assignmentTypeId: assignment.assignmentType?.id || prev.assignmentTypeId,
            title: assignment.title || '',
            instructions: assignment.instructions || '',
            lessonPlanIds: Array.isArray(assignment.lessonPlanIds)
                ? assignment.lessonPlanIds
                : Array.isArray(assignment.lessonPlans)
                    ? assignment.lessonPlans.map((lesson) => lesson.id).filter(Boolean)
                    : [],
            links: Array.isArray(assignment.links) ? assignment.links : [],
            existingAttachments: Array.isArray(assignment.attachments) ? assignment.attachments : [],
            attachmentFiles: [],
            removeAttachmentIds: [],
            dueDate: assignment.dueDate ? new Date(assignment.dueDate).toISOString().slice(0, 10) : '',
            maxMarks: assignment.maxMarks || 10,
            publishNow: assignment.status === 'published',
            classroomPublish: false,
            notifyOnAssign: assignment.notifyOnAssign !== false,
            notifyAudience: assignment.notifyAudience || 'both',
            notifyOnGrade: assignment.notifyOnGrade !== false,
            googleFormQuestions: Array.isArray(assignment.googleForm?.questions)
                ? assignment.googleForm.questions
                : [],
            createGoogleForm: Boolean(assignment.googleForm),
            scope: assignment.scope || 'class',
            studentIds: Array.isArray(assignment.studentIds) ? assignment.studentIds : []
        }));
    };

    const onCancelEdit = () => {
        setEditingAssignment(null);
        resetForm();
        setStartWithImport(false);
        setCreateFormOpen(false);
    };

    const onDeleteAssignment = async (assignment) => {
        const confirmed = window.confirm(
            t('assignments:toasts.confirmDelete', { title: assignment.title })
        );
        if (!confirmed) return;

        try {
            const response = await assignmentService.deleteAssignment(assignment.id);
            const deletedGrades = response?.data?.deletedGradesCount || 0;
            toast.success(
                deletedGrades > 0
                    ? t('assignments:toasts.deletedWithGrades', { count: deletedGrades })
                    : t('assignments:toasts.deleted')
            );
            if (editingAssignment?.id === assignment.id) {
                onCancelEdit();
            }
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:toasts.deleteFailed'));
        }
    };

    const [publishingAssignment, setPublishingAssignment] = useState(null);

    const onPublishAssignment = async (assignmentId, notifyAudience = 'both') => {
        setPublishingAssignment(assignmentId);
        try {
            const published = await assignmentService.publishAssignment(assignmentId, {
                notifyOnAssign: true,
                notifyAudience
            });
            toast.success(t('assignments:toasts.published'));
            classroom.reportOutcome(published?.data?.classroom);
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:toasts.publishFailed'));
        } finally {
            setPublishingAssignment(null);
        }
    };

    const [sendingReminder, setSendingReminder] = useState(null);
    const onSendReminder = async (assignmentId, audience = 'both') => {
        setSendingReminder(assignmentId);
        try {
            const res = await assignmentService.sendReminder(assignmentId, {
                tone: 'friendly',
                audience
            });
            const studentCount = res.data?.studentCount ?? 0;
            const gradedStudentCount = res.data?.gradedStudentCount ?? 0;
            if (studentCount > 0) {
                toast.success(t('assignments:toasts.reminderSent', {
                    count: studentCount,
                    audience: t(`assignments:audience.${audience}`)
                }));
            } else {
                toast.error(t('assignments:toasts.reminderFailed'));
            }
            if (gradedStudentCount > 0) {
                toast(t('assignments:toasts.reminderSkippedGraded', {
                    count: gradedStudentCount
                }), { icon: 'ℹ️' });
            }
        } catch (error) {
            toast.error(
                error.response?.status === 409
                    ? t('assignments:toasts.allGraded')
                    : error.response?.data?.message || t('assignments:toasts.reminderFailed')
            );
        } finally {
            setSendingReminder(null);
        }
    };

    const onBulkPublish = async (selectedAssignments) => {
        const drafts = selectedAssignments.filter((assignment) => assignment.status === 'draft');
        if (drafts.length === 0 || bulkBusy) return;
        if (!window.confirm(t('assignments:bulk.confirmPublish', { count: drafts.length }))) return;

        setBulkBusy('publish');
        let publishedCount = 0;
        let failedCount = 0;
        for (const assignment of drafts) {
            try {
                const result = await assignmentService.publishAssignment(assignment.id, {
                    notifyOnAssign: true,
                    notifyAudience: assignment.notifyAudience || 'both'
                });
                classroom.reportOutcome(result?.data?.classroom);
                publishedCount += 1;
            } catch {
                failedCount += 1;
            }
        }
        setBulkBusy('');
        setSelectedIds(new Set());
        await fetchAssignments();
        if (publishedCount > 0) {
            toast.success(t('assignments:bulk.published', { count: publishedCount }));
        }
        if (failedCount > 0) {
            toast.error(t('assignments:bulk.publishFailed', { count: failedCount }));
        }
    };

    const onBulkRemind = async (selectedAssignments, audience) => {
        const publishedAssignments = selectedAssignments
            .filter((assignment) => assignment.status === 'published');
        if (publishedAssignments.length === 0 || bulkBusy) return;
        if (!window.confirm(t('assignments:bulk.confirmRemind', {
            count: publishedAssignments.length
        }))) return;

        setBulkBusy('remind');
        let recipientCount = 0;
        let skippedStudentCount = 0;
        let skippedAssignmentCount = 0;
        let failedCount = 0;
        for (const assignment of publishedAssignments) {
            try {
                const result = await assignmentService.sendReminder(assignment.id, {
                    tone: 'friendly',
                    audience
                });
                recipientCount += result.data?.studentCount || 0;
                skippedStudentCount += result.data?.gradedStudentCount || 0;
            } catch (error) {
                if (error.response?.status === 409) skippedAssignmentCount += 1;
                else failedCount += 1;
            }
        }
        setBulkBusy('');
        setSelectedIds(new Set());
        await fetchAssignments();
        if (recipientCount > 0) {
            toast.success(t('assignments:toasts.remindersSent', { count: recipientCount }));
        }
        if (skippedStudentCount > 0) {
            toast(t('assignments:toasts.reminderSkippedGraded', {
                count: skippedStudentCount
            }), { icon: 'ℹ️' });
        }
        if (skippedAssignmentCount > 0) {
            toast(t('assignments:bulk.remindSkippedAssignments', {
                count: skippedAssignmentCount
            }), { icon: 'ℹ️' });
        }
        if (failedCount > 0) {
            toast.error(t('assignments:bulk.remindFailed', { count: failedCount }));
        }
    };

    const onToggleSelected = (assignmentId, checked) => {
        setSelectedIds((previous) => {
            const next = new Set(previous);
            if (checked) next.add(assignmentId);
            else next.delete(assignmentId);
            return next;
        });
    };

    const onToggleSelectAll = (checked) => {
        setSelectedIds((previous) => {
            const next = new Set(previous);
            for (const assignment of pagedAssignments) {
                if (checked) next.add(assignment.id);
                else next.delete(assignment.id);
            }
            return next;
        });
    };

    const onReviewAttention = () => {
        if (metrics.draftCount > 0) {
            setSelectedStatus('draft');
        } else if (metrics.awaitingGrading > 0) {
            setSelectedStatus('published');
            setSortKey('needsGrading');
        } else if (metrics.overdue > 0) {
            setSelectedStatus('published');
        }
        setCurrentPage(1);
    };

    const openGoogleFormResults = async (assignment) => {
        setGoogleFormResults({ assignment, items: [] });
        setLoadingGoogleFormResults(true);
        try {
            const sync = await googleFormsService.syncResponses(assignment.id);
            const syncCounts = sync?.data || {};
            toast.success(t('assignments:googleForms.syncSummary', {
                imported: syncCounts.imported || 0,
                unmatched: syncCounts.unmatched || 0,
                grades: syncCounts.updatedGrades || 0
            }));
            const response = await googleFormsService.getResponses(assignment.id);
            setGoogleFormResults({ assignment, items: response?.data?.items || [] });
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:googleForms.errors.sync'));
        } finally {
            setLoadingGoogleFormResults(false);
        }
    };

    const openGradePanel = async (assignment) => {
        setGradingAssignment(assignment);
        setGradeRows({});
        setGradeStudents([]);

        dispatch(fetchStudentsByClass(assignment.class?.id || selectedClass));

        try {
            const response = await assignmentService.getAssignmentGradebook(assignment.id);
            const rows = response?.data?.rows || [];
            const nextRows = {};
            const nextStudents = [];

            rows.forEach((row) => {
                nextStudents.push(row.student);
                nextRows[row.student.id] = {
                    marks: row.grade?.marks ?? '',
                    remarks: row.grade?.remarks || '',
                    maxMarks: row.grade?.maxMarks ?? assignment.maxMarks,
                    excused: row.excused === true
                };
            });

            setGradeRows(nextRows);
            setGradeStudents(sortGradeStudentsByName(nextStudents));
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:toasts.loadGradesFailed'));
        }
    };

    const onGradeChange = (studentId, field, value) => {
        setGradeRows((prev) => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [field]: value
            }
        }));
    };

    const onToggleExcuse = async (student) => {
        if (!gradingAssignment || excuseBusyStudentId) return;
        const row = gradeRows[student.id] || {};
        const nextExcused = row.excused !== true;
        const hasTypedMarks = row.marks !== '' && row.marks !== null && row.marks !== undefined;
        if (nextExcused && hasTypedMarks && !window.confirm(t('assignments:gradePanel.confirmExcuse'))) return;

        setExcuseBusyStudentId(student.id);
        try {
            await assignmentService.setStudentExcuse(gradingAssignment.id, student.id, nextExcused);
            setGradeRows((prev) => ({
                ...prev,
                [student.id]: nextExcused
                    ? { ...prev[student.id], excused: true, marks: '', remarks: '' }
                    : { ...prev[student.id], excused: false }
            }));
            toast.success(t(nextExcused
                ? 'assignments:toasts.studentExcused'
                : 'assignments:toasts.excuseRemoved'));
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:toasts.excuseFailed'));
        } finally {
            setExcuseBusyStudentId(null);
        }
    };

    const onSubmitGrades = async () => {
        if (!gradingAssignment || submittingGrades) return;

        const rows = Object.entries(gradeRows)
            .filter(([, row]) => row.excused !== true
                && row.marks !== ''
                && row.marks !== null
                && row.marks !== undefined)
            .map(([studentId, row]) => ({
                studentId,
                marks: Number(row.marks),
                maxMarks: Number(row.maxMarks || gradingAssignment.maxMarks || 10),
                remarks: String(row.remarks || '').trim()
            }));

        if (rows.length === 0) {
            toast.error(t('assignments:toasts.enterGrade'));
            return;
        }

        setSubmittingGrades(true);
        try {
            await assignmentService.gradeAssignment(gradingAssignment.id, {
                rows,
                sendNotifications: true
            });
            toast.success(t('assignments:toasts.gradesSaved'));
            setGradingAssignment(null);
            await fetchAssignments();
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignments:toasts.saveGradesFailed'));
        } finally {
            setSubmittingGrades(false);
        }
    };

    const applyBehaviorScore = (student, result) => {
        onGradeChange(student.id, 'marks', result.marks);
        onGradeChange(student.id, 'remarks', result.remarks);
    };

    const applyBehaviorAndNext = (result) => {
        if (!behaviorStudent) return;
        applyBehaviorScore(behaviorStudent, result);
        const currentIndex = gradeStudents.findIndex((student) => student.id === behaviorStudent.id);
        setBehaviorStudent(gradeStudents[currentIndex + 1] || null);
    };

    useEffect(() => {
        if (!gradingAssignment || gradeStudents.length > 0) return;
        if (!Array.isArray(classStudents) || classStudents.length === 0) return;
        setGradeStudents(normalizeGradeStudentsFromClassStudents(classStudents));
    }, [classStudents, gradeStudents.length, gradingAssignment, setGradeStudents]);

    const handleTabKeyDown = (event) => {
        const tabs = canCreateAssignments ? ['assignments', 'integrations'] : ['assignments'];
        const currentIndex = tabs.indexOf(activeTab);
        let nextIndex = currentIndex;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setActiveTab(nextTab);
        document.getElementById(`${nextTab}-tab`)?.focus();
    };

    const rowActions = {
        canCreateAssignments,
        onPublishAssignment,
        onOpenGradePanel: openGradePanel,
        onEditAssignment,
        onDeleteAssignment,
        onSendReminder,
        onOpenGoogleFormResults: openGoogleFormResults,
        sendingReminder,
        publishingAssignment,
        classroom
    };

    return (
        <div className="assignments-page">
            <AssignmentsHeader
                canCreateAssignments={canCreateAssignments}
                onCreateAssignment={onStartCreateAssignment}
                onImport={() => openCreateDrawer({ importMode: true })}
            />

            <div className="assignments-page__tabs" role="tablist" aria-label={t('assignments:tabs.label')}>
                <button
                    type="button"
                    role="tab"
                    id="assignments-tab"
                    aria-controls="assignments-panel"
                    aria-selected={activeTab === 'assignments'}
                    tabIndex={activeTab === 'assignments' ? 0 : -1}
                    className={activeTab === 'assignments' ? 'is-active' : ''}
                    onClick={() => setActiveTab('assignments')}
                    onKeyDown={handleTabKeyDown}
                >
                    {t('assignments:tabs.history')}
                </button>
                {canCreateAssignments && (
                    <button
                        type="button"
                        role="tab"
                        id="integrations-tab"
                        aria-controls="integrations-panel"
                        aria-selected={activeTab === 'integrations'}
                        tabIndex={activeTab === 'integrations' ? 0 : -1}
                        className={activeTab === 'integrations' ? 'is-active' : ''}
                        onClick={() => setActiveTab('integrations')}
                        onKeyDown={handleTabKeyDown}
                    >
                        {t('assignments:tabs.integrations')}
                    </button>
                )}
            </div>

            <section
                id="assignments-panel"
                role="tabpanel"
                aria-labelledby="assignments-tab"
                hidden={activeTab !== 'assignments'}
                className="assignments-page__tab-panel"
            >
                <AssignmentsOverview
                    metrics={metrics}
                    classLabel={classLabel}
                    onReviewAttention={onReviewAttention}
                />

                <AssignmentsPanel
                    assignments={assignments}
                    rows={pagedAssignments}
                    loading={loading}
                    statusCounts={metrics.statusCounts}
                    selectedStatus={selectedStatus}
                    onStatusChange={setSelectedStatus}
                    sortKey={sortKey}
                    onSortChange={setSortKey}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    selectedClass={selectedClass}
                    onClassChange={handleClassChange}
                    availableClasses={availableClasses}
                    selectedSubject={selectedSubject}
                    onSubjectChange={handleSubjectChange}
                    availableSubjects={availableSubjects}
                    filteredCount={filteredAssignments.length}
                    totalCount={assignments.length}
                    page={safePage}
                    pageCount={pageCount}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                    selectedIds={selectedIds}
                    onToggleSelected={onToggleSelected}
                    onToggleSelectAll={onToggleSelectAll}
                    allVisibleSelected={allVisibleSelected}
                    someVisibleSelected={someVisibleSelected}
                    onClearSelection={() => setSelectedIds(new Set())}
                    onBulkPublish={onBulkPublish}
                    onBulkRemind={onBulkRemind}
                    bulkBusy={bulkBusy}
                    canCreateAssignments={canCreateAssignments}
                    onStartCreate={onStartCreateAssignment}
                    actions={rowActions}
                />

                <CreateAssignmentForm
                    open={canCreateAssignments && createFormOpen}
                    submitting={submitting}
                    form={form}
                    setForm={setForm}
                    assignmentTypes={assignmentTypes}
                    classStudents={classStudents}
                    selectedClass={selectedClass}
                    selectedSubject={selectedSubject}
                    availableClasses={availableClasses}
                    availableSubjects={availableSubjects}
                    onClassChange={handleClassChange}
                    onSubjectChange={handleSubjectChange}
                    isEditing={Boolean(editingAssignment)}
                    onCancelEdit={onCancelEdit}
                    onClose={onCancelEdit}
                    onSubmit={onCreateAssignment}
                    classroom={classroom}
                    existingClassroomLink={editingAssignment?.id ? classroom.links[editingAssignment.id] : null}
                    googleFormPublished={Boolean(editingAssignment?.googleForm?.responderUri)}
                    startWithImport={startWithImport}
                />

                <GoogleFormResultsPanel
                    results={googleFormResults}
                    loading={loadingGoogleFormResults}
                    onClose={() => setGoogleFormResults(null)}
                    onSync={openGoogleFormResults}
                />

                <AssignmentGradePanel
                    gradingAssignment={gradingAssignment}
                    gradeStudents={gradeStudents}
                    gradeRows={gradeRows}
                    onGradeChange={onGradeChange}
                    onClose={() => setGradingAssignment(null)}
                    onSubmitGrades={onSubmitGrades}
                    submitting={submittingGrades}
                    showBehaviorAction={isClassworkAssignment(gradingAssignment)}
                    onOpenBehavior={setBehaviorStudent}
                />
            </section>

            {canCreateAssignments && (
                <section
                    id="integrations-panel"
                    role="tabpanel"
                    aria-labelledby="integrations-tab"
                    hidden={activeTab !== 'integrations'}
                    className="assignments-page__tab-panel"
                >
                    <p className="text-muted">{t('assignments:integrations.help')}</p>
                    <ClassroomPanel
                        classroom={classroom}
                        selectedClass={selectedClass}
                        availableSubjects={availableSubjects}
                    />
                    <GoogleFormsPanel user={user} />
                </section>
            )}

            {behaviorStudent && isClassworkAssignment(gradingAssignment) && (
                <ClassworkBehaviorModal
                    key={behaviorStudent.id}
                    student={behaviorStudent}
                    currentRow={gradeRows[behaviorStudent.id]}
                    maxMarks={gradingAssignment.maxMarks}
                    userId={user?.id || user?._id}
                    onClose={() => setBehaviorStudent(null)}
                    onApply={(result) => {
                        applyBehaviorScore(behaviorStudent, result);
                        setBehaviorStudent(null);
                    }}
                    onApplyNext={applyBehaviorAndNext}
                    hasNext={gradeStudents.findIndex((student) => student.id === behaviorStudent.id) < gradeStudents.length - 1}
                />
            )}
        </div>
    );
};

export default AssignmentsPage;
