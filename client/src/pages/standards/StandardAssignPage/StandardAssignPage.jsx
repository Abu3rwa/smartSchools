import StandardAssignPageHeader from './components/StandardAssignPageHeader';
import StandardAssignFiltersBar from './components/StandardAssignFiltersBar';
import StandardAssignList from './components/StandardAssignList';
import StandardAssignModal from './components/StandardAssignModal';
import StandardAssignProgressModal from './components/StandardAssignProgressModal';
import AssessmentGradebookModal from './components/AssessmentGradebookModal';
import useStandardAssignPageData from './hooks/useStandardAssignPageData';
import './StandardAssignPage.css';

const StandardAssignPage = () => {
    const {
        assignments,
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
        releasingAssessmentResults,
        classes,
        students,
        submitting,
        editingAssignmentId,
        formData,
        setFormData,
        showAdvanced,
        setShowAdvanced,
        isAdmin,
        isTeacher,
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
        getEntityId,
        getMasteryColor,
        getProgressStatusDisplay,
        getStandardDescription,
        getStandardOptionLabel
    } = useStandardAssignPageData();

    return (
        <div className="assign-page">
            <StandardAssignPageHeader onCreate={openCreateModal} />
            <StandardAssignFiltersBar />

            <StandardAssignList
                loading={loading}
                assignments={assignments}
                academicYear={academicYear}
                selectedSemester={selectedSemester}
                isAdmin={isAdmin}
                user={user}
                onViewProgress={handleViewProgress}
                onEdit={handleEdit}
                onViewAssessmentGradebook={handleViewAssessmentGradebook}
                onDelete={handleDelete}
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
                assessmentGradebookAssignmentId={assessmentGradebookAssignmentId}
                releasingAssessmentResults={releasingAssessmentResults}
                onRetry={retryAssessmentGradebookLoad}
                onRelease={handleReleaseAssessmentResults}
            />
        </div>
    );
};

export default StandardAssignPage;
