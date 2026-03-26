import StandardAssignPageHeader from './components/StandardAssignPageHeader';
import StandardAssignFiltersBar from './components/StandardAssignFiltersBar';
import StandardAssignList from './components/StandardAssignList';
import StandardAssignModal from './components/StandardAssignModal';
import StandardAssignProgressModal from './components/StandardAssignProgressModal';
import AssessmentGradebookModal from './components/AssessmentGradebookModal';
import QuestionPoolEditorModal from './components/QuestionPoolEditorModal';
import useStandardAssignPageData from './hooks/useStandardAssignPageData';
import './StandardAssignPage.css';

const StandardAssignPage = () => {
    const {
        assignments: _assignments,
        filteredAssignments,
        filters,
        handleFilterChange,
        filterOptions,
        loading,
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
        assignmentProgress,
        assignmentProgressLoading,
        standardsError,
        subjects,
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
    } = useStandardAssignPageData();

    return (
        <div className="assign-page">
            <StandardAssignPageHeader onCreate={openCreateModal} />
            <StandardAssignFiltersBar 
                filters={filters} 
                onFilterChange={handleFilterChange} 
                options={filterOptions} 
            />

            <StandardAssignList
                loading={loading}
                assignments={filteredAssignments}
                academicYear={academicYear}
                selectedSemester={selectedSemester}
                isAdmin={isAdmin}
                user={user}
                onViewProgress={handleViewProgress}
                onEdit={handleEdit}
                onManageQuestionPool={handleManageQuestionPool}
                onViewAssessmentGradebook={handleViewAssessmentGradebook}
                onDelete={handleDelete}
                onReviewQuestionPool={handleReviewQuestionPool}
                onApproveQuestionPool={handleApproveQuestionPool}
                onPublishQuestionPool={handlePublishQuestionPool}
                canApproveQuestionPool={canApproveQuestionPool}
                isTeacher={isTeacher}
                poolActionLoadingId={poolActionLoadingId}
                getStandardDescription={getStandardDescription}
            />

            <StandardAssignModal
                showAssignModal={showAssignModal}
                editingAssignmentId={editingAssignmentId}
                onClose={closeAssignModal}
                onSubmit={handleAssign}
                submitting={submitting}
                formData={formData}
                setFormData={setFormData}
                selectedClass={selectedClass}
                availableStandards={availableStandards}
                getStandardOptionLabel={getStandardOptionLabel}
                getStandardDescription={getStandardDescription}
                selectedStandard={selectedStandard}
                classes={classes}
                handleClassChange={handleClassChange}
                subjectOptions={subjectOptions}
                subjects={subjects}
                isTeacher={isTeacher}
                classSubjects={classSubjects}
                students={students}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
                getEntityId={getEntityId}
            />

            <StandardAssignProgressModal
                show={showProgressModal}
                onClose={closeProgressModal}
                assignmentProgressLoading={assignmentProgressLoading}
                assignmentProgress={assignmentProgress}
                standardsError={standardsError}
                onRetry={retryProgressLoad}
                progressAssignmentId={progressAssignmentId}
                getProgressStatusDisplay={getProgressStatusDisplay}
                getMasteryColor={getMasteryColor}
            />

            <AssessmentGradebookModal
                show={showAssessmentGradebookModal}
                onClose={closeAssessmentGradebookModal}
                assessmentGradebookLoading={assessmentGradebookLoading}
                assessmentGradebookError={assessmentGradebookError}
                assessmentGradebookData={assessmentGradebookData}
                assessmentStandardAverageLoading={assessmentStandardAverageLoading}
                assessmentStandardAverageError={assessmentStandardAverageError}
                assessmentStandardAverageData={assessmentStandardAverageData}
                assessmentGradebookAssignmentId={assessmentGradebookAssignmentId}
                releasingAssessmentResults={releasingAssessmentResults}
                onRetry={retryAssessmentGradebookLoad}
                onRelease={handleReleaseAssessmentResults}
            />

            <QuestionPoolEditorModal
                show={showQuestionPoolModal}
                onClose={closeQuestionPoolModal}
                loading={questionPoolLoading}
                error={questionPoolError}
                data={questionPoolData}
                assignmentId={questionPoolAssignmentId}
                saving={savingQuestionPool}
                onRetry={retryQuestionPoolLoad}
                onSave={handleSaveQuestionPool}
            />
        </div>
    );
};

export default StandardAssignPage;
