import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../config/api';
import { fetchCurrentUser, selectUser } from '../../store/slices/authSlice';
import {
  fetchDepartments,
  selectDepartments,
  selectDepartmentsError,
  selectDepartmentsLoading
} from '../../store/slices/departmentSlice';
import { PERMISSION_DEFINITIONS } from '../../constants/permissions';
import {
  authorizationChanged,
  buildInitialDraft,
  canViewUserManagement,
  draftsEqual,
  emptyDraft,
  isAuthorizationActor,
  normalizePermissions,
  permissionDeltas,
  validateDraft
} from './userManagementUtils';

const useUserManagement = ({ active = true, manageDepartments = true } = {}) => {
  const { t } = useTranslation(['schoolSettings']);
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const departments = useSelector(selectDepartments);
  const departmentsLoading = useSelector(selectDepartmentsLoading);
  const departmentsError = useSelector(selectDepartmentsError);

  const canView = canViewUserManagement(user);
  const canEditAuthorization = isAuthorizationActor(user);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);

  const [open, setOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(emptyDraft());
  const [pendingTitle, setPendingTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const initialDraftRef = useRef(emptyDraft());
  const editingIdRef = useRef(null);

  const reloadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await api.get('/schools/me/users', { skipErrorToast: true });
      const list = response.data?.data?.users || [];
      setUsers(list);
      return list;
    } catch (error) {
      setUsersError({
        code: error.response?.data?.code || 'LOAD_FAILED',
        message: error.response?.data?.message || t('schoolSettings:toast.loadUsersFailed')
      });
      return null;
    } finally {
      setUsersLoading(false);
    }
  }, [t]);

  const reloadDepartments = useCallback(() => dispatch(fetchDepartments()), [dispatch]);

  useEffect(() => {
    if (!active || !canView) return;
    reloadUsers();
    if (manageDepartments) dispatch(fetchDepartments());
  }, [active, canView, manageDepartments, reloadUsers, dispatch]);

  const closeEditor = useCallback(() => {
    setOpen(false);
    setEditingUser(null);
    editingIdRef.current = null;
    setFormData(emptyDraft());
    initialDraftRef.current = emptyDraft();
    setPendingTitle('');
    setSubmitError(null);
    setFieldErrors({});
  }, []);

  const openEditor = useCallback((targetUser) => {
    if (!targetUser?._id) return;
    const draft = buildInitialDraft(targetUser);
    setEditingUser(targetUser);
    editingIdRef.current = targetUser._id;
    setFormData(draft);
    initialDraftRef.current = draft;
    setPendingTitle('');
    setSubmitError(null);
    setFieldErrors({});
    setOpen(true);
  }, []);

  const dirty = open && (
    !draftsEqual(formData, initialDraftRef.current) || pendingTitle.trim().length > 0
  );

  const onRequestClose = useCallback(() => {
    if (submitting) return;
    if (dirty) {
      const discard = window.confirm(t('schoolSettings:users.modal.discardConfirm', {
        defaultValue: 'Discard unsaved changes to this user?'
      }));
      if (!discard) return;
    }
    closeEditor();
  }, [submitting, dirty, t, closeEditor]);

  const onPermissionToggle = useCallback((permission) => {
    setFormData((prev) => {
      const current = normalizePermissions(prev.permissions);
      return {
        ...prev,
        permissions: current.includes(permission)
          ? current.filter((item) => item !== permission)
          : [...current, permission]
      };
    });
  }, []);

  const handleFormChange = useCallback((next) => {
    setFormData(next);
    setFieldErrors((prev) => {
      if (!prev.roles && !prev.role && !prev.titles) return prev;
      const errors = { ...prev };
      if ((next.roles || []).length > 0) delete errors.roles;
      if ((next.roles || []).includes(next.role)) delete errors.role;
      if (!(next.titles || []).some((title) => title.length > 100)) delete errors.titles;
      return errors;
    });
  }, []);

  const roleLabel = useCallback(
    (role) => t(`schoolSettings:roles.${role}`, { defaultValue: role || '' }),
    [t]
  );

  const permissionLabel = useCallback(
    (key) => t(`schoolSettings:permissionDefs.${key}.label`, {
      defaultValue: PERMISSION_DEFINITIONS[key]?.label || key
    }),
    [t]
  );

  const buildAuthorizationSummary = useCallback((initial, draft) => {
    const lines = [];
    if (initial.role !== draft.role) {
      lines.push(t('schoolSettings:users.modal.confirmActiveRole', {
        defaultValue: 'Active role: {{from}} → {{to}}',
        from: roleLabel(initial.role),
        to: roleLabel(draft.role)
      }));
    }
    const beforeRoles = new Set(initial.roles);
    const afterRoles = new Set(draft.roles);
    const addedRoles = draft.roles.filter((role) => !beforeRoles.has(role)).map(roleLabel);
    const removedRoles = initial.roles.filter((role) => !afterRoles.has(role)).map(roleLabel);
    if (addedRoles.length) {
      lines.push(t('schoolSettings:users.modal.confirmRolesAdded', {
        defaultValue: 'Roles added: {{roles}}',
        roles: addedRoles.join(', ')
      }));
    }
    if (removedRoles.length) {
      lines.push(t('schoolSettings:users.modal.confirmRolesRemoved', {
        defaultValue: 'Roles removed: {{roles}}',
        roles: removedRoles.join(', ')
      }));
    }
    if (initial.department !== draft.department) {
      const nameOf = (id) => departments.find((dept) => dept._id === id)?.name
        || t('schoolSettings:users.modal.noneWholeSchoolPrincipal', { defaultValue: 'None (whole school)' });
      lines.push(t('schoolSettings:users.modal.confirmDepartment', {
        defaultValue: 'Department: {{from}} → {{to}}',
        from: initial.department ? nameOf(initial.department) : nameOf(''),
        to: draft.department ? nameOf(draft.department) : nameOf('')
      }));
    }
    const { added, removed } = permissionDeltas(initial, draft);
    if (added.length) {
      lines.push(t('schoolSettings:users.modal.confirmPermissionsAdded', {
        defaultValue: 'Permissions granted: {{permissions}}',
        permissions: added.map(permissionLabel).join(', ')
      }));
    }
    if (removed.length) {
      lines.push(t('schoolSettings:users.modal.confirmPermissionsRemoved', {
        defaultValue: 'Permissions revoked: {{permissions}}',
        permissions: removed.map(permissionLabel).join(', ')
      }));
    }
    return lines;
  }, [t, roleLabel, permissionLabel, departments]);

  const onSubmit = useCallback(async (event) => {
    event?.preventDefault?.();
    if (submitting || !editingUser?._id) return;

    let draft = { ...formData, permissions: normalizePermissions(formData.permissions) };
    const trimmedTitle = pendingTitle.trim();
    if (trimmedTitle) {
      draft = { ...draft, titles: Array.from(new Set([...draft.titles, trimmedTitle])) };
    }

    const errors = validateDraft(draft);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    if (canEditAuthorization && authorizationChanged(initialDraftRef.current, draft)) {
      const summary = buildAuthorizationSummary(initialDraftRef.current, draft);
      const confirmed = window.confirm([
        t('schoolSettings:users.modal.confirmAuthorizationTitle', {
          defaultValue: 'Apply these access changes to {{name}}?',
          name: `${editingUser.firstName || ''} ${editingUser.lastName || ''}`.trim() || editingUser.email
        }),
        ...summary
      ].join('\n'));
      if (!confirmed) return;
    }

    const payload = { titles: draft.titles };
    if (canEditAuthorization) {
      payload.role = draft.role;
      payload.roles = draft.roles;
      payload.department = draft.department || null;
      payload.permissions = draft.permissions;
    }
    payload.expectedUpdatedAt = editingUser.updatedAt || null;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await api.patch(
        `/schools/me/users/${editingUser._id}`,
        payload,
        { skipErrorToast: true }
      );
      const updated = response.data?.data?.user;
      if (updated?._id) {
        setUsers((prev) => prev.map((item) => (item._id === updated._id ? { ...item, ...updated } : item)));
      }
      toast.success(t('schoolSettings:toast.userUpdated'));
      if (editingUser._id === user?._id) {
        dispatch(fetchCurrentUser());
      }
      closeEditor();
    } catch (error) {
      setSubmitError({
        code: error.response?.data?.code || 'UPDATE_FAILED',
        message: error.response?.data?.message || t('schoolSettings:toast.updateUserFailed')
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting, editingUser, formData, pendingTitle, canEditAuthorization,
    buildAuthorizationSummary, t, user?._id, dispatch, closeEditor
  ]);

  const onRefreshStale = useCallback(async () => {
    const targetId = editingIdRef.current;
    const list = await reloadUsers();
    if (!list) return;
    const fresh = targetId ? list.find((item) => item._id === targetId) : null;
    if (fresh) {
      openEditor(fresh);
      toast(t('schoolSettings:users.modal.staleRefreshed', {
        defaultValue: 'This user was changed elsewhere. Showing the latest version — reapply your edits.'
      }));
    } else {
      closeEditor();
    }
  }, [reloadUsers, openEditor, closeEditor, t]);

  const modal = useMemo(() => ({
    open,
    editingUser,
    formData,
    initialDraft: initialDraftRef.current,
    pendingTitle,
    submitting,
    submitError,
    fieldErrors,
    dirty,
    canEditAuthorization,
    departments,
    departmentsLoading,
    departmentsError,
    onChange: handleFormChange,
    onPendingTitleChange: setPendingTitle,
    onPermissionToggle,
    onSubmit,
    onRequestClose,
    onRefreshStale,
    onReloadDepartments: reloadDepartments
  }), [
    open, editingUser, formData, pendingTitle, submitting, submitError, fieldErrors, dirty,
    canEditAuthorization, departments, departmentsLoading, departmentsError,
    handleFormChange, onPermissionToggle, onSubmit, onRequestClose, onRefreshStale, reloadDepartments
  ]);

  return {
    canView,
    canEditAuthorization,
    users,
    usersLoading,
    usersError,
    reloadUsers,
    departments,
    departmentsLoading,
    departmentsError,
    reloadDepartments,
    openEditor,
    modal
  };
};

export default useUserManagement;