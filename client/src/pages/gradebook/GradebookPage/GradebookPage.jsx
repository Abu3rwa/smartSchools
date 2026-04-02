import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    selectClassStudents,
    selectCurrentClass
} from '../../../store/slices/classSlice';
import { selectSubjects } from '../../../store/slices/subjectSlice';
import { selectTeacherProfile, selectUser } from '../../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectNotificationSending } from '../../../store/slices/notificationSlice';
import { selectHasFeature } from '../../../store/slices/schoolFeaturesSlice';
import GradebookHeader from './components/GradebookHeader';
import GradebookFilters from './components/GradebookFilters';
import GradebookTable from './components/GradebookTable';
import GradebookSpreadsheet from './components/GradebookSpreadsheet';
import AddGradesModal from './components/AddGradesModal';
import AIReportModal from './components/AIReportModal';
import ReteachTaskModal from './components/ReteachTaskModal';
// import ReteachTasksPanel from './components/ReteachTasksPanel';
import StudentLearningTraceModal from './components/StudentLearningTraceModal';
import useGradebookPageState from './hooks/useGradebookPageState';
import useGradebookData from './hooks/useGradebookData';
import useGradebookActions from './hooks/useGradebookActions';
import useAcademicIntelligenceData from './hooks/useAcademicIntelligenceData';
import useReteachTasks from './hooks/useReteachTasks';
import { MONTHS } from './constants';
import './GradebookPage.css';

const GradebookPage = ({ classId: classIdProp } = {}) => {
    const { classId: classIdParam } = useParams();
    const classId = classIdProp || classIdParam;
    const isEmbedded = Boolean(classIdProp);

    const currentClass = useSelector(selectCurrentClass);
    const students = useSelector(selectClassStudents);
    const subjects = useSelector(selectSubjects);
    const user = useSelector(selectUser);
    const teacherProfile = useSelector(selectTeacherProfile);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const notificationSending = useSelector(selectNotificationSending);
    const hasSpreadsheet = useSelector((state) => selectHasFeature(state, 'gradebookSpreadsheet'));

    const [viewMode, setViewMode] = useState('table');

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
        showLearningTraceModal,
        setShowLearningTraceModal,
        selectedStudentForTrace,
        setSelectedStudentForTrace,
        showReteachTaskModal,
        setShowReteachTaskModal,
        selectedObjectiveForTask,
        setSelectedObjectiveForTask,
        aiReportContent,
        setAiReportContent,
        generatingAI,
        setGeneratingAI,
        isEditingReport,
        setIsEditingReport,
        editedReportContent,
        setEditedReportContent,
        aiPrimaryLanguage,
        setAiPrimaryLanguage,
        aiSecondaryLanguage,
        setAiSecondaryLanguage,
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
        userRole: user?.role,
        teacherProfile,
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
        studentTrace,
        studentTraceLoading,
        studentTraceError,
        fetchStudentTrace,
        resetStudentTrace
    } = useAcademicIntelligenceData({
        classId,
        subjectId: selectedSubject,
        selectedMonth,
        academicYear,
        categoryFilter: selectedCategoryFilter
    });

    const {
        tasks: _reteachTasks,
        loading: _reteachTasksLoading,
        error: _reteachTasksError,
        saving: reteachTasksSaving,
        refreshTasks: _refreshTasks,
        createTask,
        updateTaskStatus: _updateTaskStatus
    } = useReteachTasks({
        classId,
        subjectId: selectedSubject
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
        aiPrimaryLanguage,
        aiSecondaryLanguage,
        aiSendEmail,
        aiRecipients,
        setAiRecipients,
        aiReportContent,
        editedReportContent,
        isEditingReport,
        selectedStudentForAI
    });

    const handleOpenLearningTrace = async (student) => {
        setSelectedStudentForTrace(student);
        setShowLearningTraceModal(true);
        await fetchStudentTrace(student?._id);
    };

    const handleCloseLearningTrace = () => {
        setShowLearningTraceModal(false);
        setSelectedStudentForTrace(null);
        resetStudentTrace();
    };

    const _handleOpenReteachTask = (objective) => {
        setSelectedObjectiveForTask(objective);
        setShowReteachTaskModal(true);
    };

    const handleCloseReteachTask = () => {
        setShowReteachTaskModal(false);
        setSelectedObjectiveForTask(null);
    };

    const handleCreateReteachTask = async (payload) => {
        await createTask(payload);
        handleCloseReteachTask();
    };

    return (
        <div className={isEmbedded ? 'gradebook-page-embedded' : 'gradebook-page'}>
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
                grades={grades}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                hasSpreadsheet={hasSpreadsheet}
                isEmbedded={isEmbedded}
            />

            {viewMode === 'spreadsheet' && hasSpreadsheet ? (
                <GradebookSpreadsheet />
            ) : (
                <>
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
                            onOpenLearningTrace={handleOpenLearningTrace}
                        />
                    </div>
                </>
            )}

            <AddGradesModal
                open={showAddModal}
                formData={formData}
                setFormData={setFormData}
                students={students}
                selectedClassId={classId}
                selectedSubjectId={selectedSubject}
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
                aiPrimaryLanguage={aiPrimaryLanguage}
                aiSecondaryLanguage={aiSecondaryLanguage}
                aiSendEmail={aiSendEmail}
                aiRecipients={aiRecipients}
                onClose={handleCloseAIModal}
                onGenerate={handleGenerateAIReport}
                onPrimaryLanguageChange={setAiPrimaryLanguage}
                onSecondaryLanguageChange={setAiSecondaryLanguage}
                onAiSendEmailChange={setAiSendEmail}
                onAiRecipientChange={handleAiRecipientChange}
                onEditToggle={handleToggleReportEdit}
                onRegenerate={handleRegenerateReport}
                onEditedContentBlur={handleEditedContentBlur}
                onSendToParents={handleSendAIReport}
            />

            <StudentLearningTraceModal
                open={showLearningTraceModal}
                onClose={handleCloseLearningTrace}
                student={selectedStudentForTrace}
                trace={studentTrace}
                loading={studentTraceLoading}
                error={studentTraceError}
            />

            <ReteachTaskModal
                open={showReteachTaskModal}
                objective={selectedObjectiveForTask}
                classId={classId}
                subjectId={selectedSubject}
                onClose={handleCloseReteachTask}
                onSubmit={handleCreateReteachTask}
                saving={reteachTasksSaving}
            />
        </div>
    );
};

export default GradebookPage;
