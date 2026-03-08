import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
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
    getProgressStatusDisplay,
    getScopedClassSubjects,
    getStandardDescription,
    getStandardOptionLabel,
    parseNullablePositiveInt
} from '../utils/standardAssignPagePresentation';

const useStandardAssignPageData = () => {
    const dispatch = useDispatch();
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
    const [releasingAssessmentResults, setReleasingAssessmentResults] = useState(false);
    const [classes, setClasses] = useState([]);
    const [students, setStudents] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [editingAssignmentId, setEditingAssignmentId] = useState(null);
    const [formData, setFormData] = useState(createInitialFormData(selectedSemester));
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [poolActionLoadingId, setPoolActionLoadingId] = useState(null);

    const isAdmin = user?.role === 'admin';
    const isTeacher = user?.role === 'teacher';
    const isDepartmentPrincipal = user?.role === 'department_principal';
    const canApproveQuestionPool =
        isAdmin ||
        isDepartmentPrincipal ||
        (Array.isArray(user?.permissions) && user.permissions.includes('review_standards_questions'));

    const selectedClass = classes.find((schoolClass) => schoolClass._id === formData.classId);
    const classSubjects = getScopedClassSubjects(selectedClass, isTeacher, user?._id);
    const subjectOptions = selectedClass
        ? classSubjects.length > 0
            ? classSubjects
            : isTeacher
              ? []
              : subjects
        : isTeacher
          ? []
          : subjects;

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
            const response = await api.get('/students', { params: { classId, academicYear } });
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
        const autoSubjectId = scopedSubjects.length === 1 ? getEntityId(scopedSubjects[0]) : '';

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
            toast.error('Select a subject before assigning.');
            setSubmitting(false);
            return;
        }

        if (!title) {
            toast.error('Assignment name is required.');
            setSubmitting(false);
            return;
        }

        if (isTeacher && formData.classId && subjectOptions.length === 0) {
            toast.error(
                'No subject mapping found for this class. Contact admin to update class subjects.'
            );
            setSubmitting(false);
            return;
        }

        const isSubjectAllowed = subjectOptions.some(
            (subject) => getEntityId(subject) === getEntityId(formData.subjectId)
        );
        if (!isSubjectAllowed) {
            toast.error('Selected subject is not available for this class.');
            setSubmitting(false);
            return;
        }

        const startAtRaw = formData.practiceConfig.availability?.startAt || '';
        const endAtRaw = formData.practiceConfig.availability?.endAt || '';
        const startAt = startAtRaw ? new Date(startAtRaw) : null;
        const endAt = endAtRaw ? new Date(endAtRaw) : null;

        if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
            toast.error('End time must be after start time.');
            setSubmitting(false);
            return;
        }

        const maxMarks = parseNullablePositiveInt(formData.assessmentConfig.maxMarks) || 100;
        const passMarks = parseNullablePositiveInt(formData.assessmentConfig.passMarks) || 40;
        if (passMarks > maxMarks) {
            toast.error('Pass marks cannot be greater than max marks.');
            setSubmitting(false);
            return;
        }

        const payload = {
            ...formData,
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
                        ? 'Assignment updated successfully!'
                        : 'Standard assigned successfully!'
                );
                setShowAssignModal(false);
                resetAssignModalState();
                dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
            } else {
                toast.error(
                    result.payload ||
                        (editingAssignmentId ? 'Failed to update assignment' : 'Failed to assign')
                );
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Remove this assignment?')) {
            const result = await dispatch(deleteAssignment(id));
            if (deleteAssignment.fulfilled.match(result)) {
                toast.success('Assignment removed');
            } else {
                toast.error(result.payload || 'Failed to remove');
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

    const loadAssessmentGradebook = async (assignmentId) => {
        setAssessmentGradebookLoading(true);
        setAssessmentGradebookError('');
        setAssessmentGradebookData(null);
        try {
            const response = await api.get(`/practice/assessment/${assignmentId}/gradebook`);
            setAssessmentGradebookData(response.data.data || null);
        } catch (error) {
            setAssessmentGradebookError(
                error?.response?.data?.message || 'Unable to load SB gradebook.'
            );
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
    };

    const retryAssessmentGradebookLoad = () => {
        if (!assessmentGradebookAssignmentId) return;
        loadAssessmentGradebook(assessmentGradebookAssignmentId);
    };

    const handleReleaseAssessmentResults = async () => {
        if (!assessmentGradebookAssignmentId) return;
        setReleasingAssessmentResults(true);
        try {
            const response = await api.post(
                `/practice/assessment/${assessmentGradebookAssignmentId}/release`
            );
            toast.success(response?.data?.message || 'Assessment results released');
            await loadAssessmentGradebook(assessmentGradebookAssignmentId);
        } catch (error) {
            toast.error(
                error?.response?.data?.message || 'Failed to release assessment results'
            );
        } finally {
            setReleasingAssessmentResults(false);
        }
    };

    const runQuestionPoolAction = async (assignmentId, action) => {
        setPoolActionLoadingId(assignmentId);
        try {
            const response = await api.post(
                `/standard-assignments/${assignmentId}/question-pool/${action}`
            );
            toast.success(response?.data?.message || 'Question pool updated');
            dispatch(fetchAssignments({ academicYear, semester: selectedSemester }));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to update question pool');
        } finally {
            setPoolActionLoadingId(null);
        }
    };

    const handleReviewQuestionPool = async (assignmentId) =>
        runQuestionPoolAction(assignmentId, 'review');
    const handleApproveQuestionPool = async (assignmentId) =>
        runQuestionPoolAction(assignmentId, 'approve');
    const handlePublishQuestionPool = async (assignmentId) =>
        runQuestionPoolAction(assignmentId, 'publish');

    return {
        standards,
        assignments,
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
        releasingAssessmentResults,
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
