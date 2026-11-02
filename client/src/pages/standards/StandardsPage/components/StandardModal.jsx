import { useEffect, useRef } from 'react';
import StandardForm from './StandardForm';
import { useTranslation } from 'react-i18next';

const StandardModal = ({
    showModal,
    editingId,
    formData,
    onFormDataChange,
    subjects,
    submitting,
    onSubmit,
    onClose
}) => {
    const { t } = useTranslation(['standards']);
    const dialogRef = useRef(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    });

    // onClose is re-created on every parent render; keeping it out of the deps
    // stops this effect from stealing focus back to the dialog on each keystroke.
    useEffect(() => {
        if (!showModal) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onCloseRef.current();
        };

        document.addEventListener('keydown', handleKeyDown);
        dialogRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [showModal]);

    if (!showModal) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal standards-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="standard-modal-title"
                tabIndex={-1}
                ref={dialogRef}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <h3 id="standard-modal-title">
                        {editingId ? t('standards:modal.editTitle') : t('standards:modal.addTitle')}
                    </h3>
                    <button
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        aria-label={t('standards:common.close')}
                    >
                        &times;
                    </button>
                </div>
                <form onSubmit={onSubmit} className="standards-modal__form">
                    <StandardForm
                        formData={formData}
                        onFormDataChange={onFormDataChange}
                        subjects={subjects}
                    />
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            {t('standards:common.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting
                                ? t('standards:common.saving')
                                : (editingId ? t('standards:actions.update') : t('standards:actions.add'))}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StandardModal;
