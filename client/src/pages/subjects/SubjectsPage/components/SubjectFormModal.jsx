import { SUBJECT_TYPES } from '../constants';
import { useTranslation } from 'react-i18next';

const SubjectFormModal = ({
    open,
    editingId,
    formData,
    setFormData,
    submitting,
    onClose,
    onSubmit
}) => {
    const { t } = useTranslation(['subjects']);
    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editingId ? t('subjects:modal.editTitle') : t('subjects:modal.createTitle')}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={onSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('subjects:form.subjectName')}</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                                    required
                                    placeholder={t('subjects:form.subjectNamePlaceholder')}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('subjects:form.code')}</label>
                                <input
                                    type="text"
                                    value={formData.code}
                                    onChange={(event) => setFormData({ ...formData, code: event.target.value.toUpperCase() })}
                                    required
                                    placeholder={t('subjects:form.codePlaceholder')}
                                    maxLength={6}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>{t('subjects:form.description')}</label>
                            <textarea
                                value={formData.description}
                                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                                rows={3}
                                placeholder={t('subjects:form.descriptionPlaceholder')}
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('subjects:form.dailyMaxMarks')}</label>
                                <input
                                    type="number"
                                    value={formData.dailyMaxMarks}
                                    onChange={(event) => setFormData({ ...formData, dailyMaxMarks: parseFloat(event.target.value) || 0 })}
                                    min={0.5}
                                    max={50}
                                    step={0.5}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('subjects:form.examMaxMarks')}</label>
                                <input
                                    type="number"
                                    value={formData.maxMarks}
                                    onChange={(event) => setFormData({ ...formData, maxMarks: parseFloat(event.target.value) || 0 })}
                                    min={1}
                                    max={200}
                                    step={0.5}
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>{t('subjects:form.passingMarks')}</label>
                                <input
                                    type="number"
                                    value={formData.passingMarks}
                                    onChange={(event) => setFormData({ ...formData, passingMarks: parseFloat(event.target.value) || 0 })}
                                    min={0.5}
                                    max={formData.maxMarks}
                                    step={0.5}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('subjects:form.type')}</label>
                                <select
                                    value={formData.type}
                                    onChange={(event) => setFormData({ ...formData, type: event.target.value })}
                                >
                                    {SUBJECT_TYPES.map((typeOption) => (
                                        <option key={typeOption.value} value={typeOption.value}>
                                            {t(`subjects:${typeOption.labelKey}`)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            {t('common:actions.cancel')}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? t('subjects:actions.saving') : (editingId ? t('subjects:actions.updateSubject') : t('subjects:actions.addSubject'))}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SubjectFormModal;
