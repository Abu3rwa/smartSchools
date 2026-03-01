import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    fetchClass,
    selectClassStudents,
    selectCurrentClass
} from '../../../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../../../store/slices/subjectSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import {
    selectNotificationSending,
    sendDailyClassworkUpdate
} from '../../../store/slices/notificationSlice';
import api from '../../../config/api';
import GradebookHeader from './components/GradebookHeader';
import GradebookFilters from './components/GradebookFilters';
import GradebookTable from './components/GradebookTable';
import AddGradesModal from './components/AddGradesModal';
import AIReportModal from './components/AIReportModal';
import useGradebookPageState from './hooks/useGradebookPageState';
import { MONTHS } from './constants';
import {
    buildPeriodLabel,
    getAvailableSubjects,
    getReportDateForAcademicMonth,
    processGradebookData
} from './utils/gradebookPresentation';
import './GradebookPage.css';

const GradebookPage = () => {
    const { classId } = useParams();
    const dispatch = useDispatch();

    const currentClass = useSelector(selectCurrentClass);
    const students = useSelector(selectClassStudents);
    const subjects = useSelector(selectSubjects);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const notificationSending = useSelector(selectNotificationSending);

    const {
        selectedSubject,
        setSelectedSubject,
        selectedMonth,
        setSelectedMonth,
        grades,
        setGrades,
        loading,
        setLoading,
        showAddModal,
        setShowAddModal,
        selectedCategoryFilter,
        setSelectedCategoryFilter,
        showAIModal,
        setShowAIModal,
        selectedStudentForAI,
        setSelectedStudentForAI,
        aiReportContent,
        setAiReportContent,
        generatingAI,
        setGeneratingAI,
        isEditingReport,
        setIsEditingReport,
        editedReportContent,
        setEditedReportContent,
        aiLanguage,
        setAiLanguage,
        aiRecipients,
        setAiRecipients,
        aiSendEmail,
        setAiSendEmail,
        formData,
        setFormData,
        resetForm
    } = useGradebookPageState(students);

    useEffect(() => {
        dispatch(fetchClass(classId));
        dispatch(fetchSubjects());
    }, [classId, dispatch]);

    useEffect(() => {
        if (currentClass?.subjects?.length > 0 && !selectedSubject) {
            setSelectedSubject(currentClass.subjects[0].subject?._id || '');
        }
    }, [currentClass, selectedSubject, setSelectedSubject]);

    const fetchGrades = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/grades/gradebook/${classId}`, {
                params: {
                    subject: selectedSubject,
                    month: selectedMonth,
                    academicYear
                }
            });
            setGrades(response.data?.data?.grades || []);
        } catch (error) {
            console.error('Failed to fetch grades:', error);
            setGrades([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (classId && selectedSubject && selectedMonth) {
            fetchGrades();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classId, selectedSubject, selectedMonth, academicYear]);

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

    const availableSubjects = useMemo(() => {
        return getAvailableSubjects({ currentClass, subjects });
    }, [currentClass, subjects]);

    const { categories: dynamicCategories, data: processedData } = useMemo(() => {
        return processGradebookData({ students, grades, selectedCategoryFilter });
    }, [grades, selectedCategoryFilter, students]);

    return (
        <div className="gradebook-page">
            <GradebookHeader
                classId={classId}
                className={currentClass?.name}
                academicYear={academicYear}
                selectedCategoryFilter={selectedCategoryFilter}
                onCategoryFilterChange={setSelectedCategoryFilter}
                onSendReports={handleSendClassworkUpdate}
                notificationSending={notificationSending}
                hasStudents={students.length > 0}
                onOpenAddModal={handleOpenAddModal}
            />

            <GradebookFilters
                selectedSubject={selectedSubject}
                onSubjectChange={setSelectedSubject}
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
                subjects={availableSubjects}
                months={MONTHS}
            />

            <div className="grades-content">
                <GradebookTable
                    loading={loading}
                    students={students}
                    grades={grades}
                    dynamicCategories={dynamicCategories}
                    processedData={processedData}
                    onOpenAIModal={handleOpenAIModal}
                />
            </div>

            <AddGradesModal
                open={showAddModal}
                formData={formData}
                setFormData={setFormData}
                students={students}
                onGradeChange={handleGradeChange}
                onClose={() => setShowAddModal(false)}
                onSubmit={handleAddGrades}
            />

            <AIReportModal
                open={showAIModal}
                student={selectedStudentForAI}
                aiReportContent={aiReportContent}
                editedReportContent={editedReportContent}
                isEditingReport={isEditingReport}
                generatingAI={generatingAI}
                aiLanguage={aiLanguage}
                aiSendEmail={aiSendEmail}
                aiRecipients={aiRecipients}
                onClose={handleCloseAIModal}
                onGenerate={handleGenerateAIReport}
                onLanguageChange={setAiLanguage}
                onAiSendEmailChange={setAiSendEmail}
                onAiRecipientChange={handleAiRecipientChange}
                onEditToggle={handleToggleReportEdit}
                onRegenerate={handleRegenerateReport}
                onEditedContentBlur={handleEditedContentBlur}
                onSendToParents={handleSendAIReport}
            />
        </div>
    );
};

export default GradebookPage;
