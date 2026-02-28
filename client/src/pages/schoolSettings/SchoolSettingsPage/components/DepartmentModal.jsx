const DepartmentModal = ({ open, editingDeptId, formData, onChange, onSubmit, onClose, submitting }) => {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{editingDeptId ? 'Edit department' : 'Add department'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => onChange({ ...formData, name: event.target.value })}
                required
                placeholder="e.g. Middle School, IT Department"
              />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select
                value={formData.type}
                onChange={(event) => onChange({ ...formData, type: event.target.value })}
              >
                <option value="academic">Academic</option>
                <option value="support">Support</option>
              </select>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={(event) => onChange({ ...formData, description: event.target.value })}
                rows={2}
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : editingDeptId ? 'Update' : 'Add department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DepartmentModal;