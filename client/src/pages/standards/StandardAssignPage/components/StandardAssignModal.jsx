import StandardAssignForm from './StandardAssignForm';
import { useTranslation } from 'react-i18next';

const StandardAssignModal = ({
    showAssignModal,
    editingAssignmentId,
    onClose,
    onSubmit,
    submitting,
    formData,
    setFormData,
    selectedClass,
    availableStandards,
    getStandardOptionLabel,
    getStandardDescription,
    selectedStandard,
    classes,
    handleClassChange,
    subjectOptions,
    subjects,
    isTeacher,
    classSubjects,
    students,
    showAdvanced,
    setShowAdvanced,
    getEntityId
}) => {
    const { t } = useTranslation(['standardAssign']);

    if (!showAssignModal) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        {editingAssignmentId
                            ? t('standardAssign:modal.editAssignmentTitle')
                            : t('standardAssign:modal.assignStandardTitle')}
                    </h3>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <form onSubmit={onSubmit}>
                    <StandardAssignForm
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
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            {t('standardAssign:actions.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting
                                ? editingAssignmentId
                                    ? t('standardAssign:actions.saving')
                                    : t('standardAssign:actions.assigning')
                                : editingAssignmentId
                                  ? t('standardAssign:actions.saveChanges')
                                  : t('standardAssign:actions.assignStandard')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StandardAssignModal;
