import { ROLES } from '../constants';
import { PERMISSION_CATEGORIES, getPermissionsByCategory } from '../../../../constants/permissions';

const UserRoleModal = ({ open, editingUser, formData, departments, onChange, onPermissionToggle, onSubmit, onClose, submitting }) => {
  if (!open || !editingUser) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit role — {editingUser.firstName} {editingUser.lastName}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Role</label>
              <select value={formData.role} onChange={(event) => onChange({ ...formData, role: event.target.value })}>
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Department {formData.role === 'department_principal' && '(optional)'}</label>
              <select
                value={formData.department}
                onChange={(event) => onChange({ ...formData, department: event.target.value })}
                disabled={formData.role !== 'department_principal'}
              >
                <option value="">— None (whole-school principal) —</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>{dept.name}</option>
                ))}
              </select>
              {formData.role === 'department_principal' && (
                <span className="form-hint">If empty, user sees all school data (whole-school principal).</span>
              )}
            </div>

            {['staff', 'teacher', 'department_principal'].includes(formData.role) && (
              <div className="form-group">
                <label>Permissions</label>
                <p className="form-hint" style={{ marginBottom: '0.5rem' }}>
                  Select specific permissions for this user. Admins have all permissions by default.
                </p>
                <div
                  style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-sm)'
                  }}
                >
                  {Object.entries(getPermissionsByCategory()).map(([category, permissions]) => (
                    <div key={category} style={{ marginBottom: 'var(--spacing-md)' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                        {PERMISSION_CATEGORIES[category]?.label || category}
                      </h4>
                      {permissions.map((permission) => (
                        <label
                          key={permission.key}
                          style={{ display: 'flex', alignItems: 'flex-start', padding: '0.4rem 0', cursor: 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.permissions.includes(permission.key)}
                            onChange={() => onPermissionToggle(permission.key)}
                            style={{ marginRight: '0.5rem', marginTop: '0.2rem' }}
                          />
                          <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{permission.label}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{permission.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                {formData.permissions.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {formData.permissions.length} permission{formData.permissions.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserRoleModal;