import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../../../../config/api';
import { sendDailyClassworkUpdate } from '../../../../store/slices/notificationSlice';
import { MONTHS } from '../constants';
import {
    buildPeriodLabel,
    getReportDateForAcademicMonth
} from '../utils/gradebookPresentation';

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
    aiLanguage,
    aiSendEmail,
    aiRecipients,
    setAiRecipients,
    aiReportContent,
    editedReportContent,
    isEditingReport,
    selectedStudentForAI
}) => {
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
            toast.error('Please enter at least one grade');
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
                academicYear,
                grades: gradesToSubmit
            });

            toast.success(`${gradesToSubmit.length} grades added successfully!`);
            setShowAddModal(false);
            resetForm();
            fetchGrades();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to add grades');
        }
    };

    const handleSendClassworkUpdate = async () => {
        if (!students.length) {
            toast.error('No students in this class');
            return;
        }

        const confirmed = window.confirm(
            `Send daily classwork update to all ${students.length} students' parents?\n\n` +
            'This will email them a summary of all classwork grades for this month.'
        );

        if (!confirmed) {
            return;
        }

        const reportDate = getReportDateForAcademicMonth({ academicYear, selectedMonth });
        let successCount = 0;
        let failCount = 0;

        const notifications = students.map((student) => {
            return dispatch(sendDailyClassworkUpdate({
                studentId: student._id,
                date: reportDate.toISOString(),
                subject: selectedSubject || undefined,
                category: selectedCategoryFilter === 'All' ? undefined : selectedCategoryFilter
            })).then((result) => {
                if (sendDailyClassworkUpdate.fulfilled.match(result)) {
                    successCount += 1;
                } else {
                    failCount += 1;
                }
            });
        });

        await Promise.all(notifications);

        if (successCount > 0) {
            toast.success(`Sent updates to ${successCount} parents${failCount > 0 ? ` (${failCount} failed)` : ''}`);
        } else {
            toast.error('Failed to send notifications');
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
            const response = await api.post('/reports/generate-advanced', {
                studentId: selectedStudentForAI._id,
                reportType: 'monthly',
                language: aiLanguage,
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
            toast.error('Failed to generate report');
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
                toast.success('AI report sent to parent successfully!');
                setShowAIModal(false);
            } else {
                toast.error(response.data?.message || 'Failed to send report');
            }
        } catch (error) {
            console.error('Error sending AI report:', error);
            toast.error(error.response?.data?.message || 'Failed to send report');
        }
    };

    return {
        handleGradeChange,
        handleOpenAddModal,
        handleCloseAddModal,
        handleAddGrades,
        handleSendClassworkUpdate,
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
