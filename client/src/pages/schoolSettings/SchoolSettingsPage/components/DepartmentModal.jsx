import { useTranslation } from 'react-i18next';

const DepartmentModal = ({ open, editingDeptId, formData, onChange, onSubmit, onClose, submitting }) => {
  const { t } = useTranslation(['schoolSettings']);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{editingDeptId ? t('schoolSettings:departments.modal.editTitle') : t('schoolSettings:departments.modal.addTitle')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>{t('schoolSettings:departments.modal.nameLabel')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => onChange({ ...formData, name: event.target.value })}
                required
                placeholder={t('schoolSettings:departments.modal.namePlaceholder')}
              />
            </div>
            <div className="form-group">
              <label>{t('schoolSettings:departments.modal.typeLabel')}</label>
              <select
                value={formData.type}
                onChange={(event) => onChange({ ...formData, type: event.target.value })}
              >
                <option value="academic">{t('schoolSettings:departments.type.academic')}</option>
                <option value="support">{t('schoolSettings:departments.type.support')}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('schoolSettings:departments.modal.descriptionLabel')}</label>
              <textarea
                value={formData.description}
                onChange={(event) => onChange({ ...formData, description: event.target.value })}
                rows={2}
                placeholder={t('schoolSettings:departments.modal.descriptionPlaceholder')}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('schoolSettings:common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? t('schoolSettings:common.saving') : editingDeptId ? t('schoolSettings:common.update') : t('schoolSettings:departments.actions.addDepartment')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DepartmentModal;
