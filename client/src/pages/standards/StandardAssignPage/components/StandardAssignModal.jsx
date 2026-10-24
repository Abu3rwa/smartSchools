import { useEffect, useRef } from 'react';
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
    getEntityId,
    grammarOnly = false,
    modalCreateTitle,
    modalEditTitle,
    submitCreateLabel,
    submitEditLabel
}) => {
    const { t } = useTranslation(['standardAssign']);
    const dialogRef = useRef(null);
    const resolvedCreateTitle =
        modalCreateTitle || t('standardAssign:modal.assignStandardTitle');
    const resolvedEditTitle =
        modalEditTitle || t('standardAssign:modal.editAssignmentTitle');
    const resolvedCreateActionLabel =
        submitCreateLabel || t('standardAssign:actions.assignStandard');
    const resolvedEditActionLabel =
        submitEditLabel || t('standardAssign:actions.saveChanges');

    useEffect(() => {
        if (!showAssignModal) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', handleKeyDown);
        dialogRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [showAssignModal, onClose]);

    if (!showAssignModal) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="standard-assign-modal-title"
                tabIndex={-1}
                ref={dialogRef}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <h3 id="standard-assign-modal-title">
                        {editingAssignmentId
                            ? resolvedEditTitle
                            : resolvedCreateTitle}
                    </h3>
                    <button
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        aria-label={t('standardAssign:actions.close')}
                    >
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
                        grammarOnly={grammarOnly}
                        isEditing={Boolean(editingAssignmentId)}
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
                                  ? resolvedEditActionLabel
                                  : resolvedCreateActionLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StandardAssignModal;
