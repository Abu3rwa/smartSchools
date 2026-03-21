import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../../../../config/api';
import {
    clearAssignmentProgress,
    createAssignment,
    deleteAssignment,
    fetchAssignmentProgress,
    fetchAssignments,
    fetchStandards,
    selectAssignmentProgress,
    selectAssignmentProgressLoading,
    selectAssignments,
    selectStandards,
    selectStandardsError,
    selectStandardsLoading,
    updateAssignment
} from '../../../../store/slices/standardSlice';
import { fetchSubjects, selectSubjects } from '../../../../store/slices/subjectSlice';
import { selectUser } from '../../../../store/slices/authSlice';
import {
    selectCurrentAcademicYear,
    selectSelectedSemester
} from '../../../../store/slices/uiSlice';
import { createInitialFormData } from '../constants';
import {
    buildAssignmentEditForm,
    getEntityId,
    getMasteryColor,
    getProgressStatusDisplay as getProgressStatusDisplayBase,
    getScopedClassSubjects,
    getStandardDescription as getStandardDescriptionBase,
    getStandardOptionLabel as getStandardOptionLabelBase,
    parseNullablePositiveInt
} from '../utils/standardAssignPagePresentation';

const useStandardAssignPageData = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['standardAssign']);
    const standards = useSelector(selectStandards);
    const assignments = useSelector(selectAssignments);
    const assignmentProgress = useSelector(selectAssignmentProgress);
    const assignmentProgressLoading = useSelector(selectAssignmentProgressLoading);
    const loading = useSelector(selectStandardsLoading);
    const standardsError = useSelector(selectStandardsError);
    const subjects = useSelector(selectSubjects);
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const selectedSemester = useSelector(selectSelectedSemester);

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [progressAssignmentId, setProgressAssignmentId] = useState(null);
    const [showAssessmentGradebookModal, setShowAssessmentGradebookModal] = useState(false);
    const [assessmentGradebookAssignmentId, setAssessmentGradebookAssignmentId] = useState(null);
    const [assessmentGradebookLoading, setAssessmentGradebookLoading] = useState(false);
    const [assessmentGradebookError, setAssessmentGradebookError] = useState('');
    const [assessmentGradebookData, setAssessmentGradebookData] = useState(null);
    const [assessmentStandardAverageLoading, setAssessmentStandardAverageLoading] = useState(false);
    const [assessmentStandardAverageError, setAssessmentStandardAverageError] = useState('');
    const [assessmentStandardAverageData, setAssessmentStandardAverageData] = useState(null);
    const [releasingAssessmentResults, setReleasingAssessmentResults] = useState(false);
    const [showQuestionPoolModal, setShowQuestionPoolModal] = useState(false);
    const [questionPoolAssignmentId, setQuestionPoolAssignmentId] = useState(null);
    const [questionPoolLoading, setQuestionPoolLoading] = useState(false);
    const [questionPoolError, setQuestionPoolError] = useState('');
    const [questionPoolData, setQuestionPoolData] = useState(null);
    const [savingQuestionPool, setSavingQuestionPool] = useState(false);
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [editingAssignmentId, setEditingAssignmentId] = useState(null);
    const [formData, setFormData] = useState(createInitialFormData(selectedSemester));
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [poolActionLoadingId, setPoolActionLoadingId] = useState(null);

    // Filters state
    const [filters, setFilters] = useState({
        classId: '',
        subjectId: '',
        semester: '',
        academicYear: ''
    });

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const filterOptions = useMemo(() => {
        const classesMap = new Map();
        const subjectsMap = new Map();
        const semestersSet = new Set();
        const yearsSet = new Set();

        assignments.forEach(a => {
            if (a.class?._id) classesMap.set(a.class._id, a.class.name);
            if (a.subject?._id) subjectsMap.set(a.subject._id, a.subject.name);
            if (a.semester) semestersSet.add(a.semester);
            if (a.academicYear) yearsSet.add(a.academicYear);
        });

        return {
            classes: Array.from(classesMap.entries()).map(([id, name]) => ({ id, name })),
            subjects: Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name })),
            semesters: Array.from(semestersSet).sort(),
            academicYears: Array.from(yearsSet).sort()
        };
    }, [assignments]);

    const filteredAssignments = useMemo(() => {
        return assignments.filter(a => {
            if (filters.classId && a.class?._id !== filters.classId) return false;
            if (filters.subjectId && a.subject?._id !== filters.subjectId) return false;
            if (filters.semester && String(a.semester) !== String(filters.semester)) return false;
            if (filters.academicYear && a.academicYear !== filters.academicYear) return false;
            return true;
        });
    }, [assignments, filters]);


    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';
    const isDepartmentPrincipal = user?.role === 'department_principal';
    const hasAllSubjectAccess =
        isAdmin ||
        isDepartmentPrincipal ||
        (Array.isArray(user?.permissions) && user.permissions.includes('assign_any_class_subject'));

    // Define canApproveQuestionPool: allow admins, department principals, or users with explicit permission
    const canApproveQuestionPool =
        isAdmin ||
        isDepartmentPrincipal ||
        (Array.isArray(user?.permissions) && user.permissions.includes('approve_question_pool'));

    const selectedClass = classes.find((schoolClass) => schoolClass._id === formData.classId);
    // Only allow teachers to see their own class+subjects unless they have higher privileges
    const classSubjects = getScopedClassSubjects(selectedClass, !hasAllSubjectAccess && isTeacher, user?._id || user?.id);
    const subjectOptions = selectedClass
        ? classSubjects.length > 0
            ? classSubjects
            : hasAllSubjectAccess
                ? subjects
                : []
        : hasAllSubjectAccess
            ? subjects
            : [];

    const availableStandards = standards.filter((standard) => {
        if (selectedClass?.grade && Number(standard.gradeLevel) !== Number(selectedClass.grade)) {
            return false;
        }
        const subjectId = getEntityId(standard.subject);
        if (formData.subjectId && subjectId !== getEntityId(formData.subjectId)) return false;
        return true;
    });

    const selectedStandard = standards.find(
        (standard) => getEntityId(standard._id) === getEntityId(formData.standardId)
    );
    const getStandardDescription = (standard) => getStandardDescriptionBase(standard, t);
    const getStandardOptionLabel = (standard) => getStandardOptionLabelBase(standard, t);
    const getProgressStatusDisplay = (status) => getProgressStatusDisplayBase(status, t);

    const loadClasses = async () => {
        try {
            const response = await api.get('/classes', { params: { academicYear } });
            setClasses(response.data.data?.classes || []);
        } catch (error) {
            console.error('Failed to load classes', error);
        }
    };

    useEffect(() => {
        dispatch(fetchStandards({ limit: 2000, isActive: true }));
        dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
        dispatch(fetchSubjects());
        loadClasses();
    }, [dispatch, academicYear, selectedSemester]);

    useEffect(() => {
        if (editingAssignmentId) return;
        setFormData((previous) => ({
            ...previous,
            semester: selectedSemester || previous.semester || 1
        }));
    }, [selectedSemester, editingAssignmentId]);

    const loadStudents = async (classId) => {
        if (!classId) {
            setStudents([]);
            return;
        }
        try {
            const response = await api.get('/students', { params: { classId, academicYear, status: 'active' } });
            setStudents(response.data.data?.students || []);
        } catch (error) {
            console.error('Failed to load students', error);
        }
    };

    const resetAssignModalState = () => {
        setEditingAssignmentId(null);
        setFormData(createInitialFormData(selectedSemester));
        setShowAdvanced(false);
        setStudents([]);
    };

    const openCreateModal = () => {
        resetAssignModalState();
        setShowAssignModal(true);
    };

    const closeAssignModal = () => {
        setShowAssignModal(false);
        resetAssignModalState();
    };

    const handleClassChange = (classId) => {
        const schoolClass = classes.find((item) => item._id === classId);
        const scopedSubjects = getScopedClassSubjects(schoolClass, isTeacher, user?._id);
        const fallbackSubjects = scopedSubjects.length > 0 ? scopedSubjects : subjects;
        const autoSubjectId = fallbackSubjects.length === 1 ? getEntityId(fallbackSubjects[0]) : '';

        setFormData({
            ...formData,
            classId,
            students: [],
            subjectId: autoSubjectId,
            standardId: ''
        });
        loadStudents(classId);
    };

    const handleEdit = async (assignment) => {
        const nextForm = buildAssignmentEditForm(assignment, selectedSemester);
        setEditingAssignmentId(assignment?._id || null);
        setFormData(nextForm);
        if (nextForm.classId) {
            await loadStudents(nextForm.classId);
        }
        setShowAdvanced(true);
        setShowAssignModal(true);
    };

    const handleAssign = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        const title = (formData.title || '').trim();

        if (!formData.subjectId) {
            toast.error(t('standardAssign:toasts.selectSubjectBeforeAssigning'));
            setSubmitting(false);
            return;
        }

        if (!title) {
            toast.error(t('standardAssign:toasts.assignmentNameRequired'));
            setSubmitting(false);
            return;
        }

        if (isTeacher && formData.classId && subjectOptions.length === 0) {
            toast.error(t('standardAssign:toasts.noSubjectMappingForClass'));
            setSubmitting(false);
            return;
        }

        const isSubjectAllowed = subjectOptions.some(
            (subject) => getEntityId(subject) === getEntityId(formData.subjectId)
        );
        if (!isSubjectAllowed) {
            toast.error(t('standardAssign:toasts.subjectNotAvailableForClass'));
            setSubmitting(false);
            return;
        }

        const startAtRaw = formData.practiceConfig.availability?.startAt || '';
        const endAtRaw = formData.practiceConfig.availability?.endAt || '';
        const startAt = startAtRaw ? new Date(startAtRaw) : null;
        const endAt = endAtRaw ? new Date(endAtRaw) : null;

        if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
            toast.error(t('standardAssign:toasts.endAfterStart'));
            setSubmitting(false);
            return;
        }

        const maxMarks = parseNullablePositiveInt(formData.assessmentConfig.maxMarks) || 100;
        const passMarks = parseNullablePositiveInt(formData.assessmentConfig.passMarks) || 40;
        if (passMarks > maxMarks) {
            toast.error(t('standardAssign:toasts.passMarksGreaterThanMax'));
            setSubmitting(false);
            return;
        }

        const payload = {
            ...formData,
            aiLanguages: (() => {
                const normalized = Array.from(
                    new Set(
                        (Array.isArray(formData.aiLanguages) ? formData.aiLanguages : ['en'])
                            .map((item) => String(item || '').trim().toLowerCase())
                            .filter(Boolean)
                    )
                ).slice(0, 2);
                return normalized.length > 0 ? normalized : ['en'];
            })(),
            title,
            preGeneratedQuestionCount:
                parseNullablePositiveInt(formData.preGeneratedQuestionCount) || 10,
            semester: parseNullablePositiveInt(formData.semester) || selectedSemester || 1,
            practiceConfig: {
                ...formData.practiceConfig,
                questionLimit: parseNullablePositiveInt(formData.practiceConfig.questionLimit),
                timeLimitSeconds:
                    (parseNullablePositiveInt(formData.practiceConfig.timeLimitSeconds) || 0) * 60 ||
                    null,
                availability: {
                    startAt: startAt ? startAt.toISOString() : null,
                    endAt: endAt ? endAt.toISOString() : null
                }
            },
            assessmentConfig: {
                maxMarks,
                passMarks,
                resultsVisibility: formData.assessmentConfig.resultsVisibility || 'immediate',
                resultsReleaseAt: formData.assessmentConfig.resultsReleaseAt
                    ? new Date(formData.assessmentConfig.resultsReleaseAt).toISOString()
                    : null
            }
        };

        try {
            const action = editingAssignmentId
                ? updateAssignment({ id: editingAssignmentId, data: payload })
                : createAssignment(payload);
            const result = await dispatch(action);
            const success = editingAssignmentId
                ? updateAssignment.fulfilled.match(result)
                : createAssignment.fulfilled.match(result);

            if (success) {
                toast.success(
                    editingAssignmentId
                        ? t('standardAssign:toasts.assignmentUpdated')
                        : t('standardAssign:toasts.standardAssigned')
                );
                setShowAssignModal(false);
                resetAssignModalState();
                dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
            } else {
                toast.error(
                    result.payload ||
                        (editingAssignmentId
                            ? t('standardAssign:toasts.failedToUpdateAssignment')
                            : t('standardAssign:toasts.failedToAssign'))
                );
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm(t('standardAssign:confirm.removeAssignment'))) {
            const result = await dispatch(deleteAssignment(id));
            if (deleteAssignment.fulfilled.match(result)) {
                toast.success(t('standardAssign:toasts.assignmentRemoved'));
            } else {
                toast.error(result.payload || t('standardAssign:toasts.failedToRemove'));
            }
        }
    };

    const handleViewProgress = (assignmentId) => {
        setProgressAssignmentId(assignmentId);
        dispatch(fetchAssignmentProgress(assignmentId));
        setShowProgressModal(true);
    };

    const closeProgressModal = () => {
        setShowProgressModal(false);
        setProgressAssignmentId(null);
        dispatch(clearAssignmentProgress());
    };

    const retryProgressLoad = () => {
        if (!progressAssignmentId) return;
        dispatch(fetchAssignmentProgress(progressAssignmentId));
    };

    const loadAssessmentStandardAverage = async ({ classId, subjectId, standardId }) => {
        if (!classId || !subjectId || !standardId) {
            setAssessmentStandardAverageData(null);
            setAssessmentStandardAverageError('');
            return;
        }
        setAssessmentStandardAverageLoading(true);
        setAssessmentStandardAverageError('');
        try {
            const response = await api.get('/practice/assessment/standard-average', {
                params: { classId, subjectId, standardId, academicYear, semester: selectedSemester }
            });
            setAssessmentStandardAverageData(response?.data?.data || null);
        } catch (error) {
            setAssessmentStandardAverageError(
                error?.response?.data?.message || t('standardAssign:error.unableToLoadStandardAverage')
            );
            setAssessmentStandardAverageData(null);
        } finally {
            setAssessmentStandardAverageLoading(false);
        }
    };

    const loadAssessmentGradebook = async (assignmentId) => {
        setAssessmentGradebookLoading(true);
        setAssessmentGradebookError('');
        setAssessmentGradebookData(null);
        setAssessmentStandardAverageData(null);
        setAssessmentStandardAverageError('');
        try {
            const response = await api.get(`/practice/assessment/${assignmentId}/gradebook`);
            const payload = response.data.data || null;
            setAssessmentGradebookData(payload);

            const classId = getEntityId(payload?.assignment?.class?._id || payload?.assignment?.class);
            const subjectId = getEntityId(
                payload?.assignment?.subject?._id || payload?.assignment?.subject
            );
            const standardId = getEntityId(
                payload?.assignment?.standard?._id || payload?.assignment?.standard
            );
            await loadAssessmentStandardAverage({ classId, subjectId, standardId });
        } catch (error) {
            setAssessmentGradebookError(
                error?.response?.data?.message || t('standardAssign:error.unableToLoadSbGradebook')
            );
            setAssessmentStandardAverageData(null);
            setAssessmentStandardAverageError('');
        } finally {
            setAssessmentGradebookLoading(false);
        }
    };

    const handleViewAssessmentGradebook = async (assignmentId) => {
        setAssessmentGradebookAssignmentId(assignmentId);
        setShowAssessmentGradebookModal(true);
        await loadAssessmentGradebook(assignmentId);
    };

    const closeAssessmentGradebookModal = () => {
        setShowAssessmentGradebookModal(false);
        setAssessmentGradebookAssignmentId(null);
        setAssessmentGradebookData(null);
        setAssessmentGradebookError('');
        setAssessmentStandardAverageData(null);
        setAssessmentStandardAverageError('');
    };

    const retryAssessmentGradebookLoad = () => {
        if (!assessmentGradebookAssignmentId) return;
        loadAssessmentGradebook(assessmentGradebookAssignmentId);
    };

    const handleReleaseAssessmentResults = async () => {
        if (!assessmentGradebookAssignmentId) return;
        const isManualRelease =
            assessmentGradebookData?.assignment?.assessmentConfig?.resultsVisibility ===
            'manual_release';
        if (!isManualRelease) {
            toast(t('standardAssign:toasts.resultsAlreadyVisibleImmediately'));
            return;
        }
        const submittedCount = Number(assessmentGradebookData?.summary?.submitted || 0);
        if (submittedCount <= 0) {
            toast(t('standardAssign:toasts.noSubmittedPendingRelease'));
            return;
        }
        if (
            !window.confirm(t('standardAssign:confirm.releaseSubmittedResults', { count: submittedCount }))
        ) {
            return;
        }
        setReleasingAssessmentResults(true);
        try {
            const response = await api.post(
                `/practice/assessment/${assessmentGradebookAssignmentId}/release`
            );
            toast.success(response?.data?.message || t('standardAssign:toasts.assessmentResultsReleased'));
            await loadAssessmentGradebook(assessmentGradebookAssignmentId);
        } catch (error) {
            toast.error(
                error?.response?.data?.message || t('standardAssign:toasts.failedToReleaseAssessmentResults')
            );
        } finally {
            setReleasingAssessmentResults(false);
        }
    };

    const loadQuestionPool = async (assignmentId) => {
        setQuestionPoolLoading(true);
        setQuestionPoolError('');
        setQuestionPoolData(null);
        try {
            const response = await api.get(`/standard-assignments/${assignmentId}/question-pool`);
            setQuestionPoolData(response?.data?.data || null);
        } catch (error) {
            setQuestionPoolError(
                error?.response?.data?.message || t('standardAssign:error.unableToLoadQuestionPool')
            );
        } finally {
            setQuestionPoolLoading(false);
        }
    };

    const handleManageQuestionPool = async (assignmentId) => {
        setQuestionPoolAssignmentId(assignmentId);
        setShowQuestionPoolModal(true);
        await loadQuestionPool(assignmentId);
    };

    const closeQuestionPoolModal = () => {
        setShowQuestionPoolModal(false);
        setQuestionPoolAssignmentId(null);
        setQuestionPoolData(null);
        setQuestionPoolError('');
        setSavingQuestionPool(false);
    };

    const retryQuestionPoolLoad = () => {
        if (!questionPoolAssignmentId) return;
        loadQuestionPool(questionPoolAssignmentId);
    };

    const handleSaveQuestionPool = async (questions, changeSummary = '') => {
        if (!questionPoolAssignmentId) return;
        setSavingQuestionPool(true);
        try {
            const response = await api.put(
                `/standard-assignments/${questionPoolAssignmentId}/question-pool`,
                { questions, changeSummary }
            );
            toast.success(response?.data?.message || t('standardAssign:toasts.questionPoolSaved'));
            await loadQuestionPool(questionPoolAssignmentId);
            dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
        } catch (error) {
            toast.error(error?.response?.data?.message || t('standardAssign:toasts.failedToSaveQuestionPool'));
        } finally {
            setSavingQuestionPool(false);
        }
    };

    const runQuestionPoolAction = async (assignmentId, action) => {
        setPoolActionLoadingId(assignmentId);
        try {
            const response = await api.post(
                `/standard-assignments/${assignmentId}/question-pool/${action}`
            );
            toast.success(response?.data?.message || t('standardAssign:toasts.questionPoolUpdated'));
            if (questionPoolAssignmentId === assignmentId) {
                await loadQuestionPool(assignmentId);
            }
            dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
        } catch (error) {
            toast.error(
                error?.response?.data?.message || t('standardAssign:toasts.failedToUpdateQuestionPool')
            );
        } finally {
            setPoolActionLoadingId(null);
        }
    };

    const handleReviewQuestionPool = async (assignmentId) =>
        runQuestionPoolAction(assignmentId, 'review');
    const handleApproveQuestionPool = async (assignmentId) =>
        runQuestionPoolAction(assignmentId, 'approve');
    const handlePublishQuestionPool = async (assignmentOrId) => {
        const assignmentId = typeof assignmentOrId === 'string'
            ? assignmentOrId
            : assignmentOrId?._id;
        const initialStatus = String(
            typeof assignmentOrId === 'string'
                ? ''
                : (assignmentOrId?.questionWorkflow?.status || '')
        ).toLowerCase();

        if (!assignmentId) return;

        // Fallback for call sites that only pass assignment id.
        if (!initialStatus) {
            await runQuestionPoolAction(assignmentId, 'publish');
            return;
        }

        if (initialStatus === 'published') {
            toast.success(t('standardAssign:toasts.questionPoolUpdated'));
            return;
        }

        setPoolActionLoadingId(assignmentId);
        try {
            let status = initialStatus;

            if (status === 'draft') {
                await api.post(`/standard-assignments/${assignmentId}/question-pool/review`);
                status = 'reviewed';
            }
            if (status === 'reviewed') {
                await api.post(`/standard-assignments/${assignmentId}/question-pool/approve`);
                status = 'approved';
            }
            if (status === 'approved') {
                await api.post(`/standard-assignments/${assignmentId}/question-pool/publish`);
            }

            toast.success(t('standardAssign:toasts.questionPoolUpdated'));
            if (questionPoolAssignmentId === assignmentId) {
                await loadQuestionPool(assignmentId);
            }
            dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
        } catch (error) {
            toast.error(
                error?.response?.data?.message || t('standardAssign:toasts.failedToUpdateQuestionPool')
            );
        } finally {
            setPoolActionLoadingId(null);
        }
    };

    return {
        standards,
        assignments,
        filteredAssignments,
        filters,
        handleFilterChange,
        filterOptions,
        assignmentProgress,
        assignmentProgressLoading,
        loading,
        standardsError,
        subjects,
        user,
        academicYear,
        selectedSemester,
        showAssignModal,
        showProgressModal,
        progressAssignmentId,
        showAssessmentGradebookModal,
        assessmentGradebookAssignmentId,
        assessmentGradebookLoading,
        assessmentGradebookError,
        assessmentGradebookData,
        assessmentStandardAverageLoading,
        assessmentStandardAverageError,
        assessmentStandardAverageData,
        releasingAssessmentResults,
        showQuestionPoolModal,
        questionPoolAssignmentId,
        questionPoolLoading,
        questionPoolError,
        questionPoolData,
        savingQuestionPool,
        classes,
        students,
        submitting,
        editingAssignmentId,
        formData,
        setFormData,
        showAdvanced,
        setShowAdvanced,
        poolActionLoadingId,
        isAdmin,
        isTeacher,
        canApproveQuestionPool,
        selectedClass,
        classSubjects,
        subjectOptions,
        availableStandards,
        selectedStandard,
        openCreateModal,
        closeAssignModal,
        handleClassChange,
        handleEdit,
        handleAssign,
        handleDelete,
        handleViewProgress,
        closeProgressModal,
        retryProgressLoad,
        handleViewAssessmentGradebook,
        closeAssessmentGradebookModal,
        retryAssessmentGradebookLoad,
        handleReleaseAssessmentResults,
        handleManageQuestionPool,
        closeQuestionPoolModal,
        retryQuestionPoolLoad,
        handleSaveQuestionPool,
        handleReviewQuestionPool,
        handleApproveQuestionPool,
        handlePublishQuestionPool,
        getEntityId,
        getMasteryColor,
        getProgressStatusDisplay,
        getStandardDescription,
        getStandardOptionLabel
    };
};

export default useStandardAssignPageData;
