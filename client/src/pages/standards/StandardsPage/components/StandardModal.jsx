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
    if (!showModal) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editingId ? t('standards:modal.editTitle') : t('standards:modal.addTitle')}</h3>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <form onSubmit={onSubmit}>
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
