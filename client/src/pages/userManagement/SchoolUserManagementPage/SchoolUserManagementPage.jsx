import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiOutlineShieldCheck, HiOutlineUserGroup, HiOutlineUsers } from 'react-icons/hi2';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../../config/api';
import { selectUser } from '../../../store/slices/authSlice';
import { PERMISSIONS } from '../../../constants/permissions';
import UsersTab from '../../schoolSettings/SchoolSettingsPage/components/UsersTab';
import UserRoleModal from '../../schoolSettings/SchoolSettingsPage/components/UserRoleModal';
import '../../schoolSettings/SchoolSettingsPage/SchoolSettingsPage.css';
import './SchoolUserManagementPage.css';

const normalizePermissions = (value) => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
  }

  if (typeof value === 'string') {
    return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
  }

  return [];
};

const initialUserForm = {
  role: '',
  roles: [],
  department: '',
  permissions: [],
  titles: [],
};

const SchoolUserManagementPage = () => {
  const { t } = useTranslation(['schoolSettings']);
  const user = useSelector(selectUser);

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState(initialUserForm);
  const [submittingUser, setSubmittingUser] = useState(false);

  const canManageUsers = useMemo(() => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(PERMISSIONS.MANAGE_USERS);
  }, [user]);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await api.get('/schools/me/users');
      if (response.data?.success) {
        setUsers(response.data.data?.users || []);
      } else {
        toast.error(response.data?.message || 'Failed to load users');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const response = await api.get('/departments');
      if (response.data?.success) {
        setDepartments(response.data.data?.departments || []);
      }
    } catch {
      setDepartments([]);
    }
  }, []);

  useEffect(() => {
    if (!canManageUsers) return;
    fetchUsers();
    fetchDepartments();
  }, [canManageUsers, fetchUsers, fetchDepartments]);

  const handleEditUser = useCallback((targetUser) => {
    setEditingUser(targetUser);
    setUserFormData({
      role: targetUser.role,
      roles: targetUser.roles?.length ? targetUser.roles : [targetUser.role],
      department: targetUser.department?._id || targetUser.department || '',
      permissions: normalizePermissions(targetUser.permissions),
      titles: targetUser.titles || [],
    });
    setShowUserModal(true);
  }, []);

  const handlePermissionToggle = useCallback((permission) => {
    setUserFormData((prev) => {
      const current = normalizePermissions(prev.permissions);
      const next = current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission];

      return {
        ...prev,
        permissions: next,
      };
    });
  }, []);

  const handleCloseUserModal = useCallback(() => {
    setShowUserModal(false);
    setEditingUser(null);
    setUserFormData(initialUserForm);
  }, []);

  const handleUserSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!editingUser?._id) {
      toast.error('No user selected');
      return;
    }

    setSubmittingUser(true);
    try {
      const response = await api.patch(`/schools/me/users/${editingUser._id}`, {
        role: userFormData.role,
        roles: userFormData.roles || [userFormData.role],
        department: userFormData.department || null,
        permissions: normalizePermissions(userFormData.permissions),
        titles: userFormData.titles || [],
      });

      if (response.data?.success) {
        toast.success(t('schoolSettings:toast.userUpdated', { defaultValue: 'User updated successfully' }));
        handleCloseUserModal();
        fetchUsers();
      } else {
        toast.error(response.data?.message || t('schoolSettings:toast.updateUserFailed', { defaultValue: 'Failed to update user' }));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.updateUserFailed', { defaultValue: 'Failed to update user' }));
    } finally {
      setSubmittingUser(false);
    }
  }, [editingUser?._id, fetchUsers, handleCloseUserModal, t, userFormData.department, userFormData.permissions, userFormData.role, userFormData.roles, userFormData.titles]);

  const summary = useMemo(() => {
    const total = users.length;
    const active = users.filter((item) => item?.isActive !== false).length;
    const inactive = total - active;
    const withCustomPermissions = users.filter((item) => normalizePermissions(item.permissions).length > 0).length;

    return { total, active, inactive, withCustomPermissions };
  }, [users]);

  if (!canManageUsers) {
    return (
      <div className="school-user-management-page-denied card">
        <h2>User Management</h2>
        <p>You do not have permission to manage school users.</p>
      </div>
    );
  }

  return (
    <div className="school-settings-page school-user-management-page">
      <div className="page-header school-user-management-header">
        <div>
          <h1>User Management</h1>
          <p className="text-muted">
            Manage school users, assign roles, and configure granular permissions from one clear workspace.
          </p>
        </div>
      </div>

      <div className="school-user-management-summary-grid">
        <article className="school-user-management-summary-card card">
          <div className="school-user-management-summary-icon">
            <HiOutlineUsers size={18} />
          </div>
          <div>
            <div className="school-user-management-summary-value">{summary.total}</div>
            <div className="school-user-management-summary-label">Total Users</div>
          </div>
        </article>

        <article className="school-user-management-summary-card card">
          <div className="school-user-management-summary-icon success">
            <HiOutlineUserGroup size={18} />
          </div>
          <div>
            <div className="school-user-management-summary-value">{summary.active}</div>
            <div className="school-user-management-summary-label">Active Users</div>
          </div>
        </article>

        <article className="school-user-management-summary-card card">
          <div className="school-user-management-summary-icon info">
            <HiOutlineShieldCheck size={18} />
          </div>
          <div>
            <div className="school-user-management-summary-value">{summary.withCustomPermissions}</div>
            <div className="school-user-management-summary-label">Custom Permission Profiles</div>
          </div>
        </article>
      </div>

      <UsersTab
        users={users}
        loading={usersLoading}
        onEdit={handleEditUser}
        modal={(
          <UserRoleModal
            open={showUserModal}
            editingUser={editingUser}
            formData={userFormData}
            departments={departments}
            onChange={setUserFormData}
            onPermissionToggle={handlePermissionToggle}
            onSubmit={handleUserSubmit}
            onClose={handleCloseUserModal}
            submitting={submittingUser}
          />
        )}
      />
    </div>
  );
};

export default SchoolUserManagementPage;
