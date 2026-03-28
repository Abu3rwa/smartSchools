import { useEffect, useMemo, useState } from 'react';
import { ROLES } from '../constants';
import { useTranslation } from 'react-i18next';
import { PERMISSION_CATEGORIES, getPermissionsByCategory } from '../../../../constants/permissions';

const UserRoleModal = ({ open, editingUser, formData, departments, onChange, onPermissionToggle, onSubmit, onClose, submitting }) => {
  const { t } = useTranslation(['schoolSettings']);
  const [titleInput, setTitleInput] = useState('');

  useEffect(() => {
    if (open) {
      setTitleInput('');
    }
  }, [open, editingUser?._id]);

  if (!open || !editingUser) return null;

  const titleItems = useMemo(() => {
    const raw = Array.isArray(formData.titles) ? formData.titles : [];
    return Array.from(new Set(raw.map((item) => String(item || '').trim()).filter(Boolean)));
  }, [formData.titles]);

  const handleRolesToggle = (roleValue) => {
    const currentRoles = formData.roles || [];
    const updated = currentRoles.includes(roleValue)
      ? currentRoles.filter((r) => r !== roleValue)
      : [...currentRoles, roleValue];
    // If active role got removed, switch to first remaining role
    const activeRole = updated.includes(formData.role) ? formData.role : (updated[0] || formData.role);
    onChange({ ...formData, roles: updated, role: activeRole });
  };

  const handleAddTitle = () => {
    const normalized = titleInput.trim();
    if (!normalized) return;

    const exists = titleItems.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setTitleInput('');
      return;
    }

    onChange({ ...formData, titles: [...titleItems, normalized] });
    setTitleInput('');
  };

  const handleRemoveTitle = (titleToRemove) => {
    onChange({
      ...formData,
      titles: titleItems.filter((item) => item !== titleToRemove)
    });
  };

  const handleTitleInputKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleAddTitle();
  };

  return (
    <div className="school-settings-modal-overlay" onClick={onClose}>
      <div
        className="school-settings-modal school-settings-modal--wide"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="school-settings-modal-header">
          <h3>{t('schoolSettings:users.modal.editRoleTitle', { name: `${editingUser.firstName} ${editingUser.lastName}` })}</h3>
          <button type="button" className="school-settings-modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="school-settings-modal-body">
            <div className="form-group">
              <label>{t('schoolSettings:users.modal.activeRoleLabel', { defaultValue: 'Active Role' })}</label>
              <select value={formData.role} onChange={(event) => onChange({ ...formData, role: event.target.value })}>
                {(formData.roles?.length ? ROLES.filter((r) => formData.roles.includes(r.value)) : ROLES).map((role) => (
                  <option key={role.value} value={role.value}>
                    {t(`schoolSettings:roles.${role.value}`, { defaultValue: role.label })}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{t('schoolSettings:users.modal.rolesLabel', { defaultValue: 'Assigned Roles' })}</label>
              <p className="form-hint school-settings-modal-field-hint">
                {t('schoolSettings:users.modal.rolesHint', { defaultValue: 'Select all roles this user should have. They can switch between them.' })}
              </p>
              <div className="school-settings-select-list">
                {ROLES.map((role) => (
                  <label
                    key={role.value}
                    className="school-settings-select-list-item"
                  >
                    <input
                      type="checkbox"
                      checked={(formData.roles || []).includes(role.value)}
                      onChange={() => handleRolesToggle(role.value)}
                    />
                    <span>
                      {t(`schoolSettings:roles.${role.value}`, { defaultValue: role.label })}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>{t('schoolSettings:users.modal.titlesLabel', { defaultValue: 'Titles' })}</label>
              <div className="school-settings-title-editor">
                <div className="school-settings-title-input-row">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                    onKeyDown={handleTitleInputKeyDown}
                    placeholder={t('schoolSettings:users.modal.titlesPlaceholder', { defaultValue: 'e.g. Humanities Teacher' })}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm school-settings-title-add-btn"
                    onClick={handleAddTitle}
                    disabled={!titleInput.trim()}
                  >
                    {t('schoolSettings:users.modal.addTitle', { defaultValue: 'Add' })}
                  </button>
                </div>

                <div className="school-settings-title-chip-list">
                  {titleItems.length === 0 && (
                    <span className="school-settings-title-empty">
                      {t('schoolSettings:users.modal.noTitles', { defaultValue: 'No titles added yet' })}
                    </span>
                  )}

                  {titleItems.map((title) => (
                    <span key={title} className="school-settings-title-chip">
                      {title}
                      <button
                        type="button"
                        onClick={() => handleRemoveTitle(title)}
                        aria-label={t('schoolSettings:users.modal.removeTitleAria', {
                          defaultValue: 'Remove title {{title}}',
                          title
                        })}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <span className="form-hint">
                {t('schoolSettings:users.modal.titlesHint', { defaultValue: 'Add each title with the Add button for a cleaner list.' })}
              </span>
            </div>

            <div className="form-group">
              <label>
                {t('schoolSettings:users.modal.departmentLabel')} {formData.role === 'department_principal' && t('schoolSettings:users.modal.optional')}
              </label>
              <select
                value={formData.department}
                onChange={(event) => onChange({ ...formData, department: event.target.value })}
                disabled={formData.role !== 'department_principal' && !(formData.roles || []).includes('department_principal')}
              >
                <option value="">{t('schoolSettings:users.modal.noneWholeSchoolPrincipal')}</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>{dept.name}</option>
                ))}
              </select>
              {(formData.role === 'department_principal' || (formData.roles || []).includes('department_principal')) && (
                <span className="form-hint">{t('schoolSettings:users.modal.departmentHint')}</span>
              )}
            </div>

            {['staff', 'teacher', 'department_principal'].includes(formData.role) && (
              <div className="form-group">
                <label>{t('schoolSettings:users.modal.permissionsLabel')}</label>
                <p className="form-hint school-settings-modal-field-hint">
                  {t('schoolSettings:users.modal.permissionsHint')}
                </p>
                <div className="school-settings-select-list school-settings-select-list--permissions">
                  {Object.entries(getPermissionsByCategory()).map(([category, permissions]) => (
                    <div key={category} className="school-settings-permissions-group">
                      <h4 className="school-settings-permissions-title">
                        {t(`schoolSettings:permissionCategories.${category}`, {
                          defaultValue: PERMISSION_CATEGORIES[category]?.label || category
                        })}
                      </h4>
                      {permissions.map((permission) => (
                        <label
                          key={permission.key}
                          className="school-settings-permission-item"
                        >
                          <input
                            type="checkbox"
                            checked={formData.permissions.includes(permission.key)}
                            onChange={() => onPermissionToggle(permission.key)}
                          />
                          <div>
                            <div className="school-settings-permission-label">{permission.label}</div>
                            <div className="school-settings-permission-desc">{permission.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                {formData.permissions.length > 0 && (
                  <div className="school-settings-permissions-selected">
                    {t('schoolSettings:users.modal.permissionsSelected', { count: formData.permissions.length })}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="school-settings-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('schoolSettings:common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? t('schoolSettings:common.saving') : t('schoolSettings:common.update')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserRoleModal;
