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
}) => (
  <div className="tab-content">
    <div className="tab-header">
      <span>Configure letter-grade thresholds and colors for charts and gradebook displays.</span>
      {canManage && (
        <button className="btn btn-primary" onClick={onOpenCreate}>
          New grading scale
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
                <p className="grading-scale-desc">{scale.description || 'No description'}</p>
              </div>
              <div className="grading-scale-meta">
                {scale.isDefault && <span className="badge badge-success">Default</span>}
                {scale.isSystem && <span className="badge badge-primary">System</span>}
                <span className={`badge ${scale.isActive ? 'badge-success' : 'badge-warning'}`}>
                  {scale.isActive ? 'Active' : 'Inactive'}
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
                  Edit
                </button>
                {!scale.isDefault && (
                  <button className="btn btn-sm btn-primary" onClick={() => onSetDefault(scale.id)}>
                    Set default
                  </button>
                )}
                {!scale.isSystem && (
                  <button className="btn btn-sm btn-danger" onClick={() => onDelete(scale)}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {scales.length === 0 && (
          <div className="card empty-state">
            <p>No grading scales configured.</p>
          </div>
        )}
      </div>
    )}

    {formOpen && (
      <div className="modal-overlay" onClick={onCloseForm}>
        <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <h3>{editingScaleId ? 'Edit grading scale' : 'Create grading scale'}</h3>
            <button className="modal-close" onClick={onCloseForm}>&times;</button>
          </div>

          <form onSubmit={onSave}>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(event) => onFormFieldChange('name', event.target.value)}
                  required
                  placeholder="e.g. Primary School Scale"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={(event) => onFormFieldChange('description', event.target.value)}
                  placeholder="Optional description"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Sort order</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.sortOrder ?? 100}
                    onChange={(event) => onFormFieldChange('sortOrder', event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={formData.isActive === false ? 'inactive' : 'active'}
                    onChange={(event) => onFormFieldChange('isActive', event.target.value === 'active')}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="grading-bands-editor">
                <div className="grading-bands-header">
                  <h4>Bands</h4>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={onAddBand}>
                    Add band
                  </button>
                </div>

                <div className="grading-bands-table-wrap">
                  <table className="grading-bands-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Min</th>
                        <th>Max</th>
                        <th>Color</th>
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
                              Remove
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
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : editingScaleId ? 'Update scale' : 'Create scale'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
);

export default GradingScalesTab;
