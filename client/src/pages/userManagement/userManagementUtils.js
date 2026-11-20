import { PERMISSIONS } from '../../constants/permissions.js';

export const normalizePermissions = (value) => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
  }
  if (typeof value === 'string') {
    return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
  }
  return [];
};

export const getAssignedRoles = (user) => {
  const fromArray = Array.isArray(user?.roles) ? user.roles : [];
  const fallback = user?.role ? [user.role] : [];
  return Array.from(new Set((fromArray.length > 0 ? fromArray : fallback).filter(Boolean)));
};

export const isAuthorizationActor = (user) =>
  user?.role === 'admin' ||
  user?.role === 'super_admin' ||
  (Array.isArray(user?.roles) && user.roles.includes('admin'));

export const canViewUserManagement = (user) => {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return (
    isAuthorizationActor(user) ||
    permissions.includes(PERMISSIONS.MANAGE_USERS) ||
    permissions.includes(PERMISSIONS.MANAGE_SCHOOL_SETTINGS)
  );
};

export const emptyDraft = () => ({ role: '', roles: [], department: '', permissions: [], titles: [] });

export const buildInitialDraft = (user) => ({
  role: user?.role || '',
  roles: getAssignedRoles(user),
  department: user?.department?._id || user?.department || '',
  permissions: normalizePermissions(user?.permissions),
  titles: Array.from(new Set((user?.titles || []).map((title) => String(title || '').trim()).filter(Boolean)))
});

export const validateDraft = (draft) => {
  const errors = {};
  if (!draft.roles || draft.roles.length === 0) errors.roles = 'rolesRequired';
  else if (!draft.roles.includes(draft.role)) errors.role = 'roleNotAssigned';
  if ((draft.titles || []).some((title) => title.length > 100)) errors.titles = 'titleTooLong';
  return errors;
};

export const draftsEqual = (a, b) => {
  if (!a || !b) return false;
  return (
    a.role === b.role &&
    a.department === b.department &&
    JSON.stringify([...a.roles].sort()) === JSON.stringify([...b.roles].sort()) &&
    JSON.stringify([...a.permissions].sort()) === JSON.stringify([...b.permissions].sort()) &&
    JSON.stringify(a.titles) === JSON.stringify(b.titles)
  );
};

export const authorizationChanged = (initial, draft) =>
  !draftsEqual(
    { ...initial, titles: [] },
    { ...draft, titles: [] }
  );

export const permissionDeltas = (initial, draft) => {
  const before = new Set(initial?.permissions || []);
  const after = new Set(draft?.permissions || []);
  return {
    added: [...after].filter((key) => !before.has(key)),
    removed: [...before].filter((key) => !after.has(key))
  };
};

export const filterPermissionGroups = (groups, { query = '', selectedOnly = false, selected = [] }) => {
  const term = query.trim().toLowerCase();
  const selectedSet = new Set(selected);
  return Object.entries(groups)
    .map(([category, permissions]) => [
      category,
      permissions.filter((permission) => {
        if (selectedOnly && !selectedSet.has(permission.key)) return false;
        if (!term) return true;
        return (
          permission.key.toLowerCase().includes(term) ||
          String(permission.label || '').toLowerCase().includes(term) ||
          String(permission.description || '').toLowerCase().includes(term)
        );
      })
    ])
    .filter(([, permissions]) => permissions.length > 0);
};