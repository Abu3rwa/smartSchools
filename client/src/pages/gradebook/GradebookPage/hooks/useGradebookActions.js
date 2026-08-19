import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../../../../config/api';
import { sendGradebookSummaryUpdate } from '../../../../store/slices/notificationSlice';
import { MONTHS } from '../constants';
import {
    buildPeriodLabel,
    getReportDateForAcademicMonth
} from '../utils/gradebookPresentation';
import { buildRequestedLanguages, toLegacyLanguageValue } from '../../../../constants/aiLanguages';

const useGradebookActions = ({
    classId,
    academicYear,
    selectedSubject,
    selectedMonth,
    selectedCategoryFilter,
    students,
    formData,
    setFormData,
    resetForm,
    setShowAddModal,
    fetchGrades,
    setSelectedStudentForAI,
    setAiReportContent,
    setEditedReportContent,
    setIsEditingReport,
    setShowAIModal,
    setGeneratingAI,
    aiPrimaryLanguage,
    aiSecondaryLanguage,
    aiSendEmail,
    aiRecipients,
    setAiRecipients,
    aiReportContent,
    editedReportContent,
    isEditingReport,
    selectedStudentForAI
}) => {
    const { t } = useTranslation(['gradebook']);
    const dispatch = useDispatch();

    const handleGradeChange = (studentId, field, value) => {
        setFormData((prev) => ({
            ...prev,
            studentGrades: {
                ...prev.studentGrades,
                [studentId]: {
                    ...prev.studentGrades[studentId],
                    [field]: value
                }
            }
        }));
    };

    const handleOpenAddModal = () => {
        resetForm();
        setShowAddModal(true);
    };

    const handleCloseAddModal = () => {
        setShowAddModal(false);
    };

    const handleAddGrades = async (event) => {
        event.preventDefault();

        const gradesToSubmit = Object.entries(formData.studentGrades)
            .filter(([, data]) => data.marks !== '' && data.marks !== null)
            .map(([studentId, data]) => ({
                student: studentId,
                marks: Number.parseFloat(data.marks),
                notes: data.notes || ''
            }));

        if (gradesToSubmit.length === 0) {
            toast.error(t('gradebook:toasts.enterAtLeastOne'));
            return;
        }

        try {
            await api.post('/grades/bulk', {
                classId,
                subject: selectedSubject,
                date: formData.date,
                maxMarks: formData.maxMarks,
                title: formData.title,
                category: formData.category === 'Custom' ? formData.customCategory : formData.category,
                lessonPlanIds: Array.isArray(formData.lessonPlanIds) ? formData.lessonPlanIds : [],
                academicYear,
                grades: gradesToSubmit
            });

            toast.success(t('gradebook:toasts.addedSuccessfully', { count: gradesToSubmit.length }));
            setShowAddModal(false);
            resetForm();
            fetchGrades();
        } catch (error) {
            toast.error(error.response?.data?.message || t('gradebook:toasts.addFailed'));
        }
    };

    const handleSendGradebookSummaryUpdate = async () => {
        if (!students.length) {
            toast.error(t('gradebook:toasts.noStudents'));
            return;
        }

        const confirmed = window.confirm(
            t('gradebook:toasts.confirmSendReports', { count: students.length })
        );

        if (!confirmed) {
            return;
        }

        const reportDate = getReportDateForAcademicMonth({ academicYear, selectedMonth });
        let successCount = 0;
        let failCount = 0;
        const normalizedCategory = (() => {
            const raw = String(selectedCategoryFilter || '').trim();
            const normalized = raw.toLowerCase();
            if (!normalized) return undefined;
            if (normalized === 'all') return undefined;
            if (normalized === 'all categories') return undefined;
            if (normalized.startsWith('all ')) return undefined;
            return normalized;
        })();

        const notifications = students.map((student) => {
            return dispatch(sendGradebookSummaryUpdate({
                studentId: student._id,
                date: reportDate.toISOString(),
                subject: selectedSubject || undefined,
                category: normalizedCategory
            })).then((result) => {
                if (sendGradebookSummaryUpdate.fulfilled.match(result)) {
                    successCount += 1;
                } else {
                    failCount += 1;
                }
            });
        });

        await Promise.all(notifications);

        if (successCount > 0) {
            toast.success(t('gradebook:toasts.sentUpdates', { success: successCount, failed: failCount }));
        } else {
            toast.error(t('gradebook:toasts.sendNotificationsFailed'));
        }
    };

    const handleOpenAIModal = (student) => {
        setSelectedStudentForAI(student);
        setAiReportContent('');
        setEditedReportContent('');
        setIsEditingReport(false);
        setShowAIModal(true);
    };

    const handleCloseAIModal = () => {
        setShowAIModal(false);
        setIsEditingReport(false);
        setGeneratingAI(false);
    };

    const handleGenerateAIReport = async () => {
        if (!selectedStudentForAI) {
            return;
        }

        setGeneratingAI(true);
        try {
            const requestedLanguages = buildRequestedLanguages(
                aiPrimaryLanguage,
                aiSecondaryLanguage
            );
            const normalizedRequestedLanguages = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
            const response = await api.post('/reports/generate-advanced', {
                studentId: selectedStudentForAI._id,
                reportType: 'monthly',
                language: toLegacyLanguageValue(normalizedRequestedLanguages),
                requestedLanguages: normalizedRequestedLanguages,
                primaryLanguage: aiPrimaryLanguage,
                secondaryLanguage: aiSecondaryLanguage,
                sendEmail: aiSendEmail,
                recipients: aiRecipients
            });

            if (response.data?.success) {
                const report = response.data?.data?.report || '';
                setAiReportContent(report);
                setEditedReportContent(report);
            }
        } catch (error) {
            console.error(error);
            toast.error(t('gradebook:toasts.generateFailed'));
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleAiRecipientChange = (recipient, checked) => {
        setAiRecipients((prev) => ({
            ...prev,
            [recipient]: checked
        }));
    };

    const handleToggleReportEdit = () => {
        if (isEditingReport) {
            setIsEditingReport(false);
            return;
        }

        if (!editedReportContent) {
            setEditedReportContent(aiReportContent);
        }
        setIsEditingReport(true);
    };

    const handleRegenerateReport = () => {
        setAiReportContent('');
        setEditedReportContent('');
        setIsEditingReport(false);
    };

    const handleEditedContentBlur = (htmlContent) => {
        if (isEditingReport) {
            setEditedReportContent(htmlContent);
        }
    };

    const handleSendAIReport = async () => {
        if (!selectedStudentForAI) {
            return;
        }

        try {
            const period = buildPeriodLabel({ months: MONTHS, selectedMonth, academicYear });
            const response = await api.post(`/notifications/send-ai-report/${selectedStudentForAI._id}`, {
                reportContent: editedReportContent || aiReportContent,
                period
            });

            if (response.data?.success) {
                toast.success(t('gradebook:toasts.aiSent'));
                setShowAIModal(false);
            } else {
                toast.error(response.data?.message || t('gradebook:toasts.sendReportFailed'));
            }
        } catch (error) {
            console.error('Error sending AI report:', error);
            toast.error(error.response?.data?.message || t('gradebook:toasts.sendReportFailed'));
        }
    };

    return {
        handleGradeChange,
        handleOpenAddModal,
        handleCloseAddModal,
        handleAddGrades,
        handleSendGradebookSummaryUpdate,
        handleOpenAIModal,
        handleCloseAIModal,
        handleGenerateAIReport,
        handleAiRecipientChange,
        handleToggleReportEdit,
        handleRegenerateReport,
        handleEditedContentBlur,
        handleSendAIReport
    };
};

export default useGradebookActions;
