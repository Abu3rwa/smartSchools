import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationTriangle, HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import { ROLES } from '../constants';
import { PERMISSION_CATEGORIES, getPermissionsByCategory } from '../../../../constants/permissions';
import useFocusTrap from '../../../../hooks/useFocusTrap';
import { filterPermissionGroups } from '../../../userManagement/userManagementUtils';

const CORE_ROLE_VALUES = new Set(['admin', 'staff', 'department_principal', 'teacher', 'parent', 'student']);
const CORE_ROLES = ROLES.filter((role) => CORE_ROLE_VALUES.has(role.value));
const LEGACY_ROLES = ROLES.filter((role) => !CORE_ROLE_VALUES.has(role.value));
const LEGACY_ROLE_VALUES = new Set(LEGACY_ROLES.map((role) => role.value));
const PERMISSION_ELIGIBLE_ROLES = ['staff', 'teacher', 'department_principal'];

const ERROR_COPY = {
  AUTH_FIELDS_ADMIN_ONLY: 'Only school administrators can change roles, permissions or department. You can edit titles.',
  USER_NOT_IN_SCHOOL: 'This user does not belong to your school.',
  SUPER_ADMIN_PROTECTED: 'Super admin accounts cannot be changed here.',
  STALE_USER: 'This user was changed by someone else. Load the latest version and try again.',
  ROLES_REQUIRED: 'Keep at least one assigned role.',
  INVALID_ROLES: 'One of the selected roles is not valid.',
  INVALID_ROLE: 'The active role is not valid.',
  ROLE_NOT_ASSIGNED: 'The active role must be one of the assigned roles.',
  SELF_DEMOTION: 'You cannot remove your own administrator role.',
  LAST_ADMIN: 'This is the last active administrator in the school. Assign another administrator first.',
  TITLE_TOO_LONG: 'Each title must be 100 characters or fewer.',
  INVALID_TITLES: 'Titles could not be saved. Check the list and try again.',
  INVALID_DEPARTMENT: 'The selected department is not valid.',
  DEPARTMENT_NOT_IN_SCHOOL: 'The selected department does not belong to your school.',
  INVALID_PERMISSIONS: 'One of the selected permissions is not valid.',
  INVALID_SCOPES: 'Permission scopes are not valid.',
  INVALID_SCOPE_KEY: 'Permission scopes reference an unknown permission.',
  SCOPE_NOT_IN_SCHOOL: 'Permission scopes must reference departments and classes in your school.',
  USER_NOT_FOUND: 'This user no longer exists.'
};

const UserRoleModal = ({ state }) => {
  const {
    open,
    editingUser,
    formData,
    initialDraft,
    pendingTitle,
    submitting,
    submitError,
    fieldErrors,
    dirty,
    canEditAuthorization,
    departments,
    departmentsLoading,
    departmentsError,
    onChange,
    onPendingTitleChange,
    onPermissionToggle,
    onSubmit,
    onRequestClose,
    onRefreshStale,
    onReloadDepartments
  } = state || {};

  const { t, i18n } = useTranslation(['schoolSettings']);
  const containerRef = useRef(null);
  const uid = useId();
  const [permissionQuery, setPermissionQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);

  useFocusTrap({ active: Boolean(open && editingUser), containerRef, onEscape: onRequestClose });

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPermissionQuery('');
    setSelectedOnly(false);
    setLegacyOpen((formData?.roles || []).some((role) => LEGACY_ROLE_VALUES.has(role)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingUser?._id]);

  const assignedRoles = useMemo(() => formData?.roles || [], [formData?.roles]);
  const selectedPermissions = useMemo(() => formData?.permissions || [], [formData?.permissions]);
  const isPrincipal = assignedRoles.includes('department_principal');
  const showPermissions =
    assignedRoles.some((role) => PERMISSION_ELIGIBLE_ROLES.includes(role)) || selectedPermissions.length > 0;

  const permissionGroups = useMemo(() => {
    const groups = getPermissionsByCategory();
    const translated = {};
    Object.entries(groups).forEach(([category, permissions]) => {
      translated[category] = permissions.map((permission) => ({
        ...permission,
        label: t(`schoolSettings:permissionDefs.${permission.key}.label`, { defaultValue: permission.label }),
        description: t(`schoolSettings:permissionDefs.${permission.key}.description`, { defaultValue: permission.description })
      }));
    });
    return translated;
  }, [t]);

  const visibleGroups = useMemo(
    () => filterPermissionGroups(permissionGroups, {
      query: permissionQuery,
      selectedOnly,
      selected: selectedPermissions
    }),
    [permissionGroups, permissionQuery, selectedOnly, selectedPermissions]
  );

  const hiddenSelectedCount = useMemo(() => {
    const visible = new Set(visibleGroups.flatMap(([, permissions]) => permissions.map((p) => p.key)));
    return selectedPermissions.filter((key) => !visible.has(key)).length;
  }, [visibleGroups, selectedPermissions]);

  if (!open || !editingUser) return null;

  const roleLabel = (role) => t(`schoolSettings:roles.${role}`, { defaultValue: role });
  const fullName = `${editingUser.firstName || ''} ${editingUser.lastName || ''}`.trim() || editingUser.email;
  const scopes = editingUser.permissionScopes || {};

  const handleRolesToggle = (roleValue) => {
    const updated = assignedRoles.includes(roleValue)
      ? assignedRoles.filter((role) => role !== roleValue)
      : [...assignedRoles, roleValue];
    const activeRole = updated.includes(formData.role) ? formData.role : (updated[0] || formData.role);
    onChange({ ...formData, roles: updated, role: activeRole });
  };

  const handleAddTitle = () => {
    const normalized = (pendingTitle || '').trim();
    if (!normalized) return;
    const exists = (formData.titles || []).some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (!exists) {
      onChange({ ...formData, titles: [...(formData.titles || []), normalized] });
    }
    onPendingTitleChange('');
  };

  const handleRemoveTitle = (titleToRemove) => {
    onChange({ ...formData, titles: (formData.titles || []).filter((item) => item !== titleToRemove) });
  };

  const submitErrorMessage = submitError
    ? t(`schoolSettings:users.modal.errors.${submitError.code}`, {
      defaultValue: ERROR_COPY[submitError.code] || submitError.message
    })
    : null;

  const renderRoleItem = (role) => (
    <label key={role.value} className="school-settings-select-list-item user-editor-role-item">
      <input
        type="checkbox"
        checked={assignedRoles.includes(role.value)}
        onChange={() => handleRolesToggle(role.value)}
      />
      <span className="user-editor-role-text">
        <span className="user-editor-role-name">{roleLabel(role.value)}</span>
        <span className="user-editor-role-desc">
          {t(`schoolSettings:roleDescriptions.${role.value}`, { defaultValue: role.description })}
        </span>
      </span>
      {role.value === formData.role && (
        <span className="user-editor-active-tag">
          {t('schoolSettings:users.modal.activeTag', { defaultValue: 'Active' })}
        </span>
      )}
    </label>
  );

  const renderScopeMeta = (permissionKey) => {
    const scope = scopes[permissionKey];
    if (!scope) return null;
    const parts = [];
    if (scope.expiresAt) {
      const expires = new Date(scope.expiresAt);
      if (!Number.isNaN(expires.getTime())) {
        parts.push(t('schoolSettings:users.modal.scopeExpires', {
          defaultValue: 'Expires {{date}}',
          date: expires.toLocaleDateString(i18n.language)
        }));
      }
    }
    if (Array.isArray(scope.departmentIds) && scope.departmentIds.length > 0) {
      parts.push(t('schoolSettings:users.modal.scopeDepartments', {
        defaultValue: 'Limited to {{count}} department(s)',
        count: scope.departmentIds.length
      }));
    }
    if (Array.isArray(scope.classIds) && scope.classIds.length > 0) {
      parts.push(t('schoolSettings:users.modal.scopeClasses', {
        defaultValue: 'Limited to {{count}} class(es)',
        count: scope.classIds.length
      }));
    }
    if (parts.length === 0) return null;
    return <div className="user-editor-scope-meta">{parts.join(' · ')}</div>;
  };

  return (
    <div
      className="school-settings-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onRequestClose();
      }}
    >
      <div
        ref={containerRef}
        className="school-settings-modal school-settings-modal--wide school-settings-modal--user-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
      >
        <div className="school-settings-modal-header user-editor-header">
          <div className="user-editor-header-text">
            <h3 id={`${uid}-title`}>
              {t('schoolSettings:users.modal.editRoleTitle', { defaultValue: 'Edit roles & permissions — {{name}}', name: fullName })}
            </h3>
            <span className="user-editor-header-email">{editingUser.email}</span>
          </div>
          <button
            type="button"
            className="school-settings-modal-close"
            onClick={onRequestClose}
            disabled={submitting}
            aria-label={t('schoolSettings:users.modal.closeAria', { defaultValue: 'Close dialog' })}
          >
            <HiOutlineXMark size={18} aria-hidden="true" />
          </button>
        </div>

        <form className="user-editor-form" onSubmit={onSubmit}>
          <div className="school-settings-modal-body user-editor-body">
            {submitError && (
              <div className="user-editor-alert" role="alert">
                <HiOutlineExclamationTriangle size={18} aria-hidden="true" />
                <div className="user-editor-alert-text">
                  <span>{submitErrorMessage}</span>
                  {submitError.code === 'STALE_USER' && (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={onRefreshStale}>
                      {t('schoolSettings:users.modal.loadLatest', { defaultValue: 'Load latest version' })}
                    </button>
                  )}
                </div>
              </div>
            )}

            {!canEditAuthorization && (
              <p className="user-editor-notice" role="note">
                {t('schoolSettings:users.modal.adminOnlyNotice', {
                  defaultValue: 'Roles, department and permissions can only be changed by a school administrator. You can edit titles.'
                })}
              </p>
            )}

            <section className="user-editor-section" aria-labelledby={`${uid}-roles-heading`}>
              <h4 id={`${uid}-roles-heading`} className="user-editor-section-title">
                {t('schoolSettings:users.modal.sectionRoles', { defaultValue: 'Roles and profile' })}
              </h4>

              <fieldset className="user-editor-fieldset" disabled={!canEditAuthorization}>
                <div className="form-group">
                  <span className="user-editor-label" id={`${uid}-roles-label`}>
                    {t('schoolSettings:users.modal.rolesLabel', { defaultValue: 'Assigned roles' })}
                  </span>
                  <p className="form-hint school-settings-modal-field-hint">
                    {t('schoolSettings:users.modal.rolesHint', { defaultValue: 'Select all roles this user should have. They can switch between them.' })}
                  </p>
                  <div className="school-settings-select-list user-editor-role-list" role="group" aria-labelledby={`${uid}-roles-label`}>
                    {CORE_ROLES.map(renderRoleItem)}
                  </div>
                  {fieldErrors?.roles && (
                    <span className="user-editor-field-error" role="alert">
                      {t('schoolSettings:users.modal.errors.ROLES_REQUIRED', { defaultValue: ERROR_COPY.ROLES_REQUIRED })}
                    </span>
                  )}

                  <details
                    className="user-editor-legacy"
                    open={legacyOpen}
                    onToggle={(event) => setLegacyOpen(event.currentTarget.open)}
                  >
                    <summary>
                      {t('schoolSettings:users.modal.legacyRoles', { defaultValue: 'Legacy roles' })}
                      {assignedRoles.some((role) => LEGACY_ROLE_VALUES.has(role)) && (
                        <span className="users-filters-count" aria-hidden="true">
                          {assignedRoles.filter((role) => LEGACY_ROLE_VALUES.has(role)).length}
                        </span>
                      )}
                    </summary>
                    <p className="form-hint">
                      {t('schoolSettings:users.modal.legacyHint', {
                        defaultValue: 'Older single-purpose roles. Prefer Staff with specific permissions for new assignments.'
                      })}
                    </p>
                    <div className="school-settings-select-list user-editor-role-list" role="group">
                      {LEGACY_ROLES.map(renderRoleItem)}
                    </div>
                  </details>
                </div>

                <div className="form-group">
                  <label className="user-editor-label" htmlFor={`${uid}-active-role`}>
                    {t('schoolSettings:users.modal.activeRoleLabel', { defaultValue: 'Active role' })}
                  </label>
                  <select
                    id={`${uid}-active-role`}
                    value={formData.role}
                    onChange={(event) => onChange({ ...formData, role: event.target.value })}
                    aria-invalid={Boolean(fieldErrors?.role)}
                  >
                    {(assignedRoles.length ? assignedRoles : [formData.role]).filter(Boolean).map((role) => (
                      <option key={role} value={role}>{roleLabel(role)}</option>
                    ))}
                  </select>
                  <span className="form-hint">
                    {t('schoolSettings:users.modal.activeRoleHint', {
                      defaultValue: 'The role this user signs in with. It must be one of the assigned roles.'
                    })}
                  </span>
                  {fieldErrors?.role && (
                    <span className="user-editor-field-error" role="alert">
                      {t('schoolSettings:users.modal.errors.ROLE_NOT_ASSIGNED', { defaultValue: ERROR_COPY.ROLE_NOT_ASSIGNED })}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="user-editor-label" htmlFor={`${uid}-department`}>
                    {t('schoolSettings:users.modal.departmentLabel')} {isPrincipal && t('schoolSettings:users.modal.optional')}
                  </label>
                  <select
                    id={`${uid}-department`}
                    value={formData.department}
                    onChange={(event) => onChange({ ...formData, department: event.target.value })}
                    disabled={!canEditAuthorization || !isPrincipal || departmentsLoading}
                  >
                    <option value="">{t('schoolSettings:users.modal.noneWholeSchoolPrincipal')}</option>
                    {departments.map((dept) => (
                      <option key={dept._id} value={dept._id}>{dept.name}</option>
                    ))}
                  </select>
                  {departmentsLoading && (
                    <span className="form-hint">{t('schoolSettings:users.modal.departmentsLoading', { defaultValue: 'Loading departments…' })}</span>
                  )}
                  {departmentsError && !departmentsLoading && (
                    <span className="user-editor-field-error" role="alert">
                      {t('schoolSettings:users.modal.departmentsError', { defaultValue: 'Could not load departments.' })}
                      {' '}
                      <button type="button" className="user-editor-inline-action" onClick={onReloadDepartments}>
                        {t('schoolSettings:users.errors.retry', { defaultValue: 'Try again' })}
                      </button>
                    </span>
                  )}
                  {isPrincipal && !departmentsError && (
                    <span className="form-hint">{t('schoolSettings:users.modal.departmentHint')}</span>
                  )}
                  {!isPrincipal && (
                    <span className="form-hint">
                      {t('schoolSettings:users.modal.departmentRequiresPrincipal', {
                        defaultValue: 'Assign the Department Principal role to scope this user to a department.'
                      })}
                    </span>
                  )}
                </div>
              </fieldset>

              <div className="form-group">
                <label className="user-editor-label" htmlFor={`${uid}-title-input`}>
                  {t('schoolSettings:users.modal.titlesLabel', { defaultValue: 'Titles' })}
                </label>
                <div className="school-settings-title-editor">
                  <div className="school-settings-title-input-row">
                    <input
                      id={`${uid}-title-input`}
                      type="text"
                      value={pendingTitle || ''}
                      maxLength={120}
                      onChange={(event) => onPendingTitleChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleAddTitle();
                        }
                      }}
                      placeholder={t('schoolSettings:users.modal.titlesPlaceholder', { defaultValue: 'e.g. Humanities Teacher' })}
                      aria-invalid={Boolean(fieldErrors?.titles)}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm school-settings-title-add-btn"
                      onClick={handleAddTitle}
                      disabled={!(pendingTitle || '').trim()}
                    >
                      {t('schoolSettings:users.modal.addTitle', { defaultValue: 'Add' })}
                    </button>
                  </div>

                  <div className="school-settings-title-chip-list">
                    {(formData.titles || []).length === 0 && (
                      <span className="school-settings-title-empty">
                        {t('schoolSettings:users.modal.noTitles', { defaultValue: 'No titles added yet' })}
                      </span>
                    )}
                    {(formData.titles || []).map((title) => (
                      <span key={title} className="school-settings-title-chip">
                        {title}
                        <button
                          type="button"
                          onClick={() => handleRemoveTitle(title)}
                          aria-label={t('schoolSettings:users.modal.removeTitleAria', { defaultValue: 'Remove title {{title}}', title })}
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
                {fieldErrors?.titles && (
                  <span className="user-editor-field-error" role="alert">
                    {t('schoolSettings:users.modal.errors.TITLE_TOO_LONG', { defaultValue: ERROR_COPY.TITLE_TOO_LONG })}
                  </span>
                )}
              </div>
            </section>

            {showPermissions && (
              <section className="user-editor-section" aria-labelledby={`${uid}-permissions-heading`}>
                <h4 id={`${uid}-permissions-heading`} className="user-editor-section-title">
                  {t('schoolSettings:users.modal.sectionPermissions', { defaultValue: 'Additional permissions' })}
                </h4>
                <p className="form-hint school-settings-modal-field-hint">
                  {t('schoolSettings:users.modal.permissionsHint')}
                </p>

                <fieldset className="user-editor-fieldset" disabled={!canEditAuthorization}>
                  <div className="user-editor-permission-controls">
                    <div className="user-editor-permission-search">
                      <HiOutlineMagnifyingGlass size={16} aria-hidden="true" />
                      <input
                        type="search"
                        value={permissionQuery}
                        onChange={(event) => setPermissionQuery(event.target.value)}
                        placeholder={t('schoolSettings:users.modal.permissionSearchPlaceholder', {
                          defaultValue: 'Search permissions'
                        })}
                        aria-label={t('schoolSettings:users.modal.permissionSearchLabel', { defaultValue: 'Search permissions' })}
                      />
                    </div>
                    <label className="user-editor-selected-toggle">
                      <input
                        type="checkbox"
                        checked={selectedOnly}
                        onChange={(event) => setSelectedOnly(event.target.checked)}
                      />
                      {t('schoolSettings:users.modal.selectedOnly', { defaultValue: 'Selected only' })}
                    </label>
                  </div>

                  {hiddenSelectedCount > 0 && (
                    <p className="user-editor-hidden-selected" role="status">
                      {t('schoolSettings:users.modal.hiddenSelected', {
                        defaultValue: '{{count}} selected permission(s) hidden by the current filter.',
                        count: hiddenSelectedCount
                      })}
                      {' '}
                      <button
                        type="button"
                        className="user-editor-inline-action"
                        onClick={() => {
                          setPermissionQuery('');
                          setSelectedOnly(false);
                        }}
                      >
                        {t('schoolSettings:users.modal.showAllPermissions', { defaultValue: 'Show all' })}
                      </button>
                    </p>
                  )}

                  <div className="school-settings-select-list school-settings-select-list--permissions user-editor-permission-list">
                    {visibleGroups.length === 0 && (
                      <p className="school-settings-title-empty user-editor-permission-empty">
                        {t('schoolSettings:users.modal.noPermissionMatches', { defaultValue: 'No permissions match your search.' })}
                      </p>
                    )}
                    {visibleGroups.map(([category, permissions]) => (
                      <div key={category} className="school-settings-permissions-group">
                        <h5 className="school-settings-permissions-title">
                          {t(`schoolSettings:permissionCategories.${category}`, {
                            defaultValue: PERMISSION_CATEGORIES[category]?.label || category
                          })}
                        </h5>
                        {permissions.map((permission) => (
                          <label key={permission.key} className="school-settings-permission-item">
                            <input
                              type="checkbox"
                              checked={selectedPermissions.includes(permission.key)}
                              onChange={() => onPermissionToggle(permission.key)}
                            />
                            <div>
                              <div className="school-settings-permission-label">
                                {permission.label}
                                {(initialDraft?.permissions || []).includes(permission.key) && (
                                  <span className="user-editor-granted-tag">
                                    {t('schoolSettings:users.modal.grantedTag', { defaultValue: 'Granted' })}
                                  </span>
                                )}
                              </div>
                              <div className="school-settings-permission-desc">{permission.description}</div>
                              {selectedPermissions.includes(permission.key) && renderScopeMeta(permission.key)}
                            </div>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className="school-settings-permissions-selected" role="status">
                    {t('schoolSettings:users.modal.permissionsSelected', { count: selectedPermissions.length })}
                  </div>
                </fieldset>
              </section>
            )}
          </div>

          <div className="school-settings-modal-footer user-editor-footer">
            <span className="user-editor-dirty-hint" role="status">
              {dirty ? t('schoolSettings:users.modal.unsavedChanges', { defaultValue: 'Unsaved changes' }) : ''}
            </span>
            <div className="user-editor-footer-actions">
              <button type="button" className="btn btn-secondary" onClick={onRequestClose} disabled={submitting}>
                {t('schoolSettings:common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting || !dirty}>
                {submitting ? t('schoolSettings:common.saving') : t('schoolSettings:common.update')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserRoleModal;
