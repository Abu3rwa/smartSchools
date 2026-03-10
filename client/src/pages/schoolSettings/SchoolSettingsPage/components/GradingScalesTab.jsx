import { useTranslation } from 'react-i18next';

const GradingScalesTab = ({
  scales = [],
  loading = false,
  canManage = false,
  onOpenCreate = () => {},
  onEdit = () => {},
  onSetDefault = () => {},
  onDelete = () => {},
  formOpen = false,
  editingScaleId = null,
  formData = { name: '', description: '', isActive: true, sortOrder: 100, bands: [] },
  submitting = false,
  onFormFieldChange = () => {},
  onBandChange = () => {},
  onAddBand = () => {},
  onRemoveBand = () => {},
  onCloseForm = () => {},
  onSave = () => {}
}) => {
  const { t } = useTranslation(['schoolSettings']);

  return (
    <div className="tab-content">
      <div className="tab-header">
        <span>{t('schoolSettings:gradingScales.helpText')}</span>
        {canManage && (
          <button className="btn btn-primary" onClick={onOpenCreate}>
            {t('schoolSettings:gradingScales.actions.newScale')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <div className="grading-scales-list">
          {scales.map((scale) => (
            <div key={scale.id} className="grading-scale-card card">
              <div className="grading-scale-card-header">
                <div>
                  <h3>{scale.name}</h3>
                  <p className="grading-scale-desc">{scale.description || t('schoolSettings:gradingScales.noDescription')}</p>
                </div>
                <div className="grading-scale-meta">
                  {scale.isDefault && <span className="badge badge-success">{t('schoolSettings:gradingScales.badges.default')}</span>}
                  {scale.isSystem && <span className="badge badge-primary">{t('schoolSettings:gradingScales.badges.system')}</span>}
                  <span className={`badge ${scale.isActive ? 'badge-success' : 'badge-warning'}`}>
                    {scale.isActive ? t('schoolSettings:gradingScales.status.active') : t('schoolSettings:gradingScales.status.inactive')}
                  </span>
                </div>
              </div>

              <div className="grading-scale-bands">
                {(scale.bands || []).map((band) => (
                  <span
                    key={`${scale.id}-${band.grade}-${band.min}-${band.max}`}
                    className="grading-band-chip"
                    style={{ backgroundColor: `${band.color}22`, color: band.color }}
                  >
                    {band.grade}: {band.min}-{band.max}
                  </span>
                ))}
              </div>

              {canManage && (
                <div className="grading-scale-actions">
                  <button className="btn btn-sm btn-secondary" onClick={() => onEdit(scale)}>
                    {t('schoolSettings:gradingScales.actions.edit')}
                  </button>
                  {!scale.isDefault && (
                    <button className="btn btn-sm btn-primary" onClick={() => onSetDefault(scale.id)}>
                      {t('schoolSettings:gradingScales.actions.setDefault')}
                    </button>
                  )}
                  {!scale.isSystem && (
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(scale)}>
                      {t('schoolSettings:gradingScales.actions.delete')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {scales.length === 0 && (
            <div className="card empty-state">
              <p>{t('schoolSettings:gradingScales.empty')}</p>
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <div className="modal-overlay" onClick={onCloseForm}>
          <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingScaleId ? t('schoolSettings:gradingScales.form.editTitle') : t('schoolSettings:gradingScales.form.createTitle')}</h3>
              <button className="modal-close" onClick={onCloseForm}>&times;</button>
            </div>

            <form onSubmit={onSave}>
              <div className="modal-body">
                <div className="form-group">
                  <label>{t('schoolSettings:gradingScales.form.nameLabel')}</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(event) => onFormFieldChange('name', event.target.value)}
                    required
                    placeholder={t('schoolSettings:gradingScales.form.namePlaceholder')}
                  />
                </div>

                <div className="form-group">
                  <label>{t('schoolSettings:gradingScales.form.descriptionLabel')}</label>
                  <textarea
                    rows={2}
                    value={formData.description || ''}
                    onChange={(event) => onFormFieldChange('description', event.target.value)}
                    placeholder={t('schoolSettings:gradingScales.form.descriptionPlaceholder')}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{t('schoolSettings:gradingScales.form.sortOrderLabel')}</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.sortOrder ?? 100}
                      onChange={(event) => onFormFieldChange('sortOrder', event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('schoolSettings:gradingScales.form.statusLabel')}</label>
                    <select
                      value={formData.isActive === false ? 'inactive' : 'active'}
                      onChange={(event) => onFormFieldChange('isActive', event.target.value === 'active')}
                    >
                      <option value="active">{t('schoolSettings:gradingScales.status.active')}</option>
                      <option value="inactive">{t('schoolSettings:gradingScales.status.inactive')}</option>
                    </select>
                  </div>
                </div>

                <div className="grading-bands-editor">
                  <div className="grading-bands-header">
                    <h4>{t('schoolSettings:gradingScales.form.bandsTitle')}</h4>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={onAddBand}>
                      {t('schoolSettings:gradingScales.actions.addBand')}
                    </button>
                  </div>

                  <div className="grading-bands-table-wrap">
                    <table className="grading-bands-table">
                      <thead>
                        <tr>
                          <th>{t('schoolSettings:gradingScales.table.grade')}</th>
                          <th>{t('schoolSettings:gradingScales.table.min')}</th>
                          <th>{t('schoolSettings:gradingScales.table.max')}</th>
                          <th>{t('schoolSettings:gradingScales.table.color')}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(formData.bands || []).map((band, index) => (
                          <tr key={`band-${index}`}>
                            <td>
                              <input
                                type="text"
                                maxLength={8}
                                value={band.grade || ''}
                                onChange={(event) => onBandChange(index, 'grade', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={band.min ?? 0}
                                onChange={(event) => onBandChange(index, 'min', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={band.max ?? 0}
                                onChange={(event) => onBandChange(index, 'max', event.target.value)}
                              />
                            </td>
                            <td>
                              <div className="grading-band-color-input">
                                <input
                                  type="color"
                                  value={band.color || '#64748b'}
                                  onChange={(event) => onBandChange(index, 'color', event.target.value)}
                                />
                                <input
                                  type="text"
                                  value={band.color || '#64748b'}
                                  onChange={(event) => onBandChange(index, 'color', event.target.value)}
                                />
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                onClick={() => onRemoveBand(index)}
                                disabled={(formData.bands || []).length <= 1}
                              >
                                {t('schoolSettings:gradingScales.actions.remove')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onCloseForm}>
                  {t('schoolSettings:common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? t('schoolSettings:common.saving') : editingScaleId ? t('schoolSettings:gradingScales.actions.updateScale') : t('schoolSettings:gradingScales.actions.createScale')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GradingScalesTab;
