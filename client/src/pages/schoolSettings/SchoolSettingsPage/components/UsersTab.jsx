import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { HiOutlineUserGroup } from 'react-icons/hi';
import { HiOutlineAdjustmentsHorizontal, HiOutlineExclamationTriangle } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import TablePagination from '../../../../components/common/TablePagination';
import { impersonateUser, selectCanImpersonate, selectUser } from '../../../../store/slices/authSlice';
import { getAssignedRoles } from '../../../userManagement/userManagementUtils';

const DEFAULT_PAGE_SIZE = 10;
const ALL_FILTER = 'all';
const IMPERSONATABLE_ROLES = new Set(['teacher', 'student']);

const getUserDisplayName = (user) => {
  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  return fullName || user?.email || '';
};

const canImpersonateTargetUser = (user) => {
  const primaryRole = String(user?.role || '').toLowerCase();
  if (primaryRole === 'admin' || primaryRole === 'super_admin') {
    return false;
  }

  return getAssignedRoles(user)
    .map((role) => String(role).toLowerCase())
    .some((role) => IMPERSONATABLE_ROLES.has(role));
};

const UsersTab = ({ users, loading, error = null, onRetry, onEdit, modal, showOpenFullPageAction = false }) => {
  const { t } = useTranslation(['schoolSettings']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const canImpersonate = useSelector(selectCanImpersonate);
  const currentUser = useSelector(selectUser);
  const isReadOnlyPreview = currentUser?.role === 'admin';
  const canPreviewTarget = (user) => isReadOnlyPreview
    ? IMPERSONATABLE_ROLES.has(String(user?.role || '').toLowerCase())
    : canImpersonateTargetUser(user);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [departmentFilter, setDepartmentFilter] = useState(ALL_FILTER);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const getRoleLabel = (role = '') =>
    t(`schoolSettings:roles.${String(role).toLowerCase()}`, { defaultValue: role });

  const roleOptions = useMemo(() => {
    const uniqueRoles = new Set();
    users.forEach((user) => {
      getAssignedRoles(user).forEach((role) => uniqueRoles.add(role));
    });
    return Array.from(uniqueRoles).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const departmentOptions = useMemo(() => {
    const map = new Map();
    users.forEach((user) => {
      if (user?.department?._id) {
        map.set(String(user.department._id), user.department?.name || t('schoolSettings:common.dash'));
      }
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [users, t]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim().toLowerCase();
      const email = String(user?.email || '').toLowerCase();
      const departmentName = String(user?.department?.name || '').toLowerCase();
      const departmentId = String(user?.department?._id || '');
      const assignedRoles = getAssignedRoles(user);
      const isActive = user?.isActive !== false;

      const matchesQuery =
        !normalizedQuery ||
        fullName.includes(normalizedQuery) ||
        email.includes(normalizedQuery) ||
        departmentName.includes(normalizedQuery);

      const matchesRole = roleFilter === ALL_FILTER || assignedRoles.includes(roleFilter);
      const matchesStatus =
        statusFilter === ALL_FILTER ||
        (statusFilter === 'active' ? isActive : !isActive);
      const matchesDepartment =
        departmentFilter === ALL_FILTER ||
        (departmentFilter === 'none'
          ? !departmentId
          : departmentFilter === departmentId);

      return matchesQuery && matchesRole && matchesStatus && matchesDepartment;
    });
  }, [users, normalizedQuery, roleFilter, statusFilter, departmentFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, statusFilter, departmentFilter]);

  const hasActiveFilters =
    normalizedQuery.length > 0 ||
    roleFilter !== ALL_FILTER ||
    statusFilter !== ALL_FILTER ||
    departmentFilter !== ALL_FILTER;

  const activeFilterCount =
    (roleFilter !== ALL_FILTER ? 1 : 0) +
    (statusFilter !== ALL_FILTER ? 1 : 0) +
    (departmentFilter !== ALL_FILTER ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery('');
    setRoleFilter(ALL_FILTER);
    setStatusFilter(ALL_FILTER);
    setDepartmentFilter(ALL_FILTER);
  };

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedUsers = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredUsers.slice(startIndex, startIndex + pageSize);
  }, [filteredUsers, safeCurrentPage, pageSize]);

  const handleImpersonate = async (user) => {
    if (!canImpersonate || !canPreviewTarget(user)) {
      return;
    }

    const displayName = getUserDisplayName(user);
    const confirmed = window.confirm(
      isReadOnlyPreview
        ? t('schoolSettings:confirm.supportPreview', {
          defaultValue: 'Start a 30-minute, read-only support preview of {{name}} as {{role}}? Changes will be blocked and the preview will be recorded in the audit log.',
          name: displayName,
          role: getRoleLabel(user.role)
        })
        : t('schoolSettings:confirm.impersonateUser', {
          defaultValue: 'Are you sure you want to impersonate {{name}}?',
          name: displayName
        })
    );

    if (!confirmed) {
      return;
    }

    const toastId = toast.loading(
      t('schoolSettings:toast.impersonationStarting', {
        defaultValue: 'Starting impersonation...'
      })
    );

    try {
      await dispatch(impersonateUser(user._id)).unwrap();
      toast.success(
        t('schoolSettings:toast.impersonationStarted', {
          defaultValue: 'Impersonation started. Redirecting...'
        }),
        { id: toastId }
      );
      navigate('/portal/dashboard');
    } catch (error) {
      const message = typeof error === 'string'
        ? error
        : t('schoolSettings:toast.impersonationFailed', {
          defaultValue: 'Failed to impersonate user'
        });
      toast.error(message, { id: toastId });
    }
  };

  return (
    <div className="tab-content">
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : error ? (
        <div className="users-table-wrap card">
          <div className="empty-state users-load-error" role="alert">
            <HiOutlineExclamationTriangle size={40} />
            <p>{error.message || t('schoolSettings:toast.loadUsersFailed')}</p>
            {onRetry && (
              <button type="button" className="btn btn-primary" onClick={onRetry}>
                {t('schoolSettings:users.errors.retry', { defaultValue: 'Try again' })}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="users-table-wrap card">
          {users.length > 0 && (
            <>
              <div className="users-controls">
                {showOpenFullPageAction && (
                  <div className="users-filter-actions" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => navigate('/portal/user-management')}
                    >
                      {t('schoolSettings:users.actions.openFullPage', { defaultValue: 'Open full page' })}
                    </button>
                  </div>
                )}
                <div className="users-search-field">
                  <label htmlFor="school-settings-users-search">
                    {t('schoolSettings:users.filters.searchLabel', { defaultValue: 'Search' })}
                  </label>
                  <input
                    id="school-settings-users-search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('schoolSettings:users.filters.searchPlaceholder', {
                      defaultValue: 'Search by name, email, or department'
                    })}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-secondary users-filters-toggle"
                  aria-expanded={filtersOpen}
                  aria-controls="school-settings-users-filters"
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <HiOutlineAdjustmentsHorizontal size={16} aria-hidden="true" />
                  {t('schoolSettings:users.filters.toggle', { defaultValue: 'Filters' })}
                  {activeFilterCount > 0 && (
                    <span className="users-filters-count" aria-hidden="true">{activeFilterCount}</span>
                  )}
                </button>

                <div
                  id="school-settings-users-filters"
                  className={`users-filters-grid${filtersOpen ? '' : ' is-collapsed'}`}
                >
                  <div className="users-filter-field">
                    <label htmlFor="school-settings-users-role-filter">
                      {t('schoolSettings:users.filters.role', { defaultValue: 'Role' })}
                    </label>
                    <select
                      id="school-settings-users-role-filter"
                      value={roleFilter}
                      onChange={(event) => setRoleFilter(event.target.value)}
                    >
                      <option value={ALL_FILTER}>
                        {t('schoolSettings:users.filters.allRoles', { defaultValue: 'All roles' })}
                      </option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="users-filter-field">
                    <label htmlFor="school-settings-users-status-filter">
                      {t('schoolSettings:users.filters.status', { defaultValue: 'Status' })}
                    </label>
                    <select
                      id="school-settings-users-status-filter"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                    >
                      <option value={ALL_FILTER}>
                        {t('schoolSettings:users.filters.allStatuses', { defaultValue: 'All statuses' })}
                      </option>
                      <option value="active">
                        {t('schoolSettings:users.filters.active', { defaultValue: 'Active' })}
                      </option>
                      <option value="inactive">
                        {t('schoolSettings:users.filters.inactive', { defaultValue: 'Inactive' })}
                      </option>
                    </select>
                  </div>

                  <div className="users-filter-field">
                    <label htmlFor="school-settings-users-department-filter">
                      {t('schoolSettings:users.filters.department', { defaultValue: 'Department' })}
                    </label>
                    <select
                      id="school-settings-users-department-filter"
                      value={departmentFilter}
                      onChange={(event) => setDepartmentFilter(event.target.value)}
                    >
                      <option value={ALL_FILTER}>
                        {t('schoolSettings:users.filters.allDepartments', { defaultValue: 'All departments' })}
                      </option>
                      <option value="none">
                        {t('schoolSettings:users.filters.noDepartment', { defaultValue: 'No department' })}
                      </option>
                      {departmentOptions.map((department) => (
                        <option key={department.value} value={department.value}>
                          {department.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="users-filter-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={clearFilters}
                      disabled={!hasActiveFilters}
                    >
                      {t('schoolSettings:users.filters.clear', { defaultValue: 'Clear filters' })}
                    </button>
                  </div>
                </div>

                <p className="users-filter-summary">
                  {t('schoolSettings:users.filters.resultCount', {
                    defaultValue: 'Showing {{shown}} of {{total}} users',
                    shown: filteredUsers.length,
                    total: users.length
                  })}
                </p>
              </div>

              {filteredUsers.length > 0 ? (
                <>
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>{t('schoolSettings:users.table.name')}</th>
                        <th>{t('schoolSettings:users.table.role')}</th>
                        <th>{t('schoolSettings:users.table.department')}</th>
                        <th>{t('schoolSettings:users.table.status', { defaultValue: 'Status' })}</th>
                        <th className="users-actions-header">
                          {t('schoolSettings:users.table.actions', { defaultValue: 'Actions' })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => {
                        const assignedRoles = getAssignedRoles(user);
                        const isActive = user?.isActive !== false;
                        const canImpersonateThisUser = canImpersonate && canPreviewTarget(user);
                        return (
                          <tr key={user._id}>
                            <td>
                              <div className="users-name-cell">
                                <span className="users-name-primary">{user.firstName} {user.lastName}</span>
                                <span className="users-email-sub">{user.email}</span>
                              </div>
                            </td>
                            <td>
                              <div className="users-role-cell">
                                {assignedRoles.map((role) => (
                                  <span
                                    key={`${user._id}-${role}`}
                                    className={`badge users-role-chip ${role === user.role ? 'badge-primary users-role-chip--active' : 'users-role-chip--assigned'}`}
                                    title={role === user.role
                                      ? t('schoolSettings:users.table.activeRoleTitle', { defaultValue: 'Active role' })
                                      : undefined}
                                  >
                                    {getRoleLabel(role)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>{user.department?.name ?? t('schoolSettings:common.dash')}</td>
                            <td>
                              <span className={`users-status-badge ${isActive ? 'active' : 'inactive'}`}>
                                {isActive
                                  ? t('schoolSettings:users.filters.active', { defaultValue: 'Active' })
                                  : t('schoolSettings:users.filters.inactive', { defaultValue: 'Inactive' })}
                              </span>
                            </td>
                            <td>
                              <div className="users-actions-cell">
                                <button className="btn btn-sm btn-secondary" onClick={() => onEdit(user)}>
                                  {t('schoolSettings:users.actions.editRole')}
                                </button>
                                {canImpersonateThisUser && (
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => handleImpersonate(user)}
                                  >
                                    {isReadOnlyPreview
                                      ? t('schoolSettings:users.actions.previewAs', { defaultValue: 'Preview as' })
                                      : t('schoolSettings:users.actions.impersonate', { defaultValue: 'Impersonate' })}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="users-mobile-list">
                    {paginatedUsers.map((user) => {
                      const assignedRoles = getAssignedRoles(user);
                      const isActive = user?.isActive !== false;
                      const canImpersonateThisUser = canImpersonate && canPreviewTarget(user);
                      return (
                        <article className="users-mobile-card" key={`${user._id}-mobile`}>
                          <div className="users-mobile-card-header">
                            <h4>{user.firstName} {user.lastName}</h4>
                            <span className={`users-status-badge ${isActive ? 'active' : 'inactive'}`}>
                              {isActive
                                ? t('schoolSettings:users.filters.active', { defaultValue: 'Active' })
                                : t('schoolSettings:users.filters.inactive', { defaultValue: 'Inactive' })}
                            </span>
                          </div>
                          <p className="users-mobile-email">{user.email}</p>
                          <div className="users-mobile-row">
                            <strong>{t('schoolSettings:users.table.role')}:</strong>
                            <div className="users-role-cell">
                              {assignedRoles.map((role) => (
                                <span
                                  key={`${user._id}-${role}-mobile`}
                                  className={`badge users-role-chip ${role === user.role ? 'badge-primary users-role-chip--active' : 'users-role-chip--assigned'}`}
                                >
                                  {getRoleLabel(role)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="users-mobile-row">
                            <strong>{t('schoolSettings:users.table.department')}:</strong>
                            <span>{user.department?.name ?? t('schoolSettings:common.dash')}</span>
                          </div>
                          <div className="users-mobile-actions">
                            <button className="btn btn-primary" onClick={() => onEdit(user)}>
                              {t('schoolSettings:users.actions.editRole')}
                            </button>
                            {canImpersonateThisUser && (
                              <button className="btn btn-secondary" onClick={() => handleImpersonate(user)}>
                                {isReadOnlyPreview
                                  ? t('schoolSettings:users.actions.previewAs', { defaultValue: 'Preview as' })
                                  : t('schoolSettings:users.actions.impersonate', { defaultValue: 'Impersonate' })}
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <TablePagination
                    page={safeCurrentPage}
                    pageSize={pageSize}
                    totalItems={filteredUsers.length}
                    totalPages={totalPages}
                    onPageChange={(nextPage) => setCurrentPage(Math.max(1, Math.min(nextPage, totalPages)))}
                    onPageSizeChange={(nextSize) => {
                      setPageSize(nextSize);
                      setCurrentPage(1);
                    }}
                  />
                </>
              ) : (
                <div className="empty-state users-filter-empty-state">
                  <HiOutlineUserGroup size={48} />
                  <p>
                    {t('schoolSettings:users.filters.noMatches', {
                      defaultValue: 'No users match the selected filters.'
                    })}
                  </p>
                </div>
              )}
            </>
          )}

          {users.length === 0 && (
            <div className="empty-state">
              <HiOutlineUserGroup size={48} />
              <p>{t('schoolSettings:users.empty')}</p>
            </div>
          )}
        </div>
      )}
      {modal}
    </div>
  );
};

export default UsersTab;
