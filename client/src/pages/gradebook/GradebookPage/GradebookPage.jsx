import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    selectClassStudents,
    selectCurrentClass
} from '../../../store/slices/classSlice';
import { selectSubjects } from '../../../store/slices/subjectSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectNotificationSending } from '../../../store/slices/notificationSlice';
import GradebookHeader from './components/GradebookHeader';
import GradebookFilters from './components/GradebookFilters';
import GradebookTable from './components/GradebookTable';
import AddGradesModal from './components/AddGradesModal';
import AIReportModal from './components/AIReportModal';
import useGradebookPageState from './hooks/useGradebookPageState';
import useGradebookData from './hooks/useGradebookData';
import useGradebookActions from './hooks/useGradebookActions';
import { MONTHS } from './constants';
import './GradebookPage.css';

const GradebookPage = () => {
    const { classId } = useParams();

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
        gradingScale,
        setGradingScale,
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

    const { fetchGrades, availableSubjects, dynamicCategories, processedData } = useGradebookData({
        classId,
        currentClass,
        subjects,
        students,
        grades,
        selectedSubject,
        selectedMonth,
        selectedCategoryFilter,
        academicYear,
        setSelectedSubject,
        setGrades,
        setGradingScale,
        setLoading
    });

    const {
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
    } = useGradebookActions({
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
    });

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
                    gradingScale={gradingScale}
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
                onClose={handleCloseAddModal}
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
