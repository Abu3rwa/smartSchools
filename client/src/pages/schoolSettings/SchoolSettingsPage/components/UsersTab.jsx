import { useEffect, useMemo, useState } from 'react';
import { HiOutlineUserGroup } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import TablePagination from '../../../../components/common/TablePagination';

const DEFAULT_PAGE_SIZE = 10;
const ALL_FILTER = 'all';

const getAssignedRoles = (user) => {
  const fromArray = Array.isArray(user?.roles) ? user.roles : [];
  const fallback = user?.role ? [user.role] : [];
  return Array.from(new Set((fromArray.length > 0 ? fromArray : fallback).filter(Boolean)));
};

const UsersTab = ({ users, loading, onEdit, modal }) => {
  const { t } = useTranslation(['schoolSettings']);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [departmentFilter, setDepartmentFilter] = useState(ALL_FILTER);

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

  return (
    <div className="tab-content">
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <div className="users-table-wrap card">
          {users.length > 0 && (
            <>
              <div className="users-controls">
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

                <div className="users-filters-grid">
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
                        <th>{t('schoolSettings:users.table.email')}</th>
                        <th>{t('schoolSettings:users.table.role')}</th>
                        <th>{t('schoolSettings:users.table.department')}</th>
                        <th>{t('schoolSettings:users.table.status', { defaultValue: 'Status' })}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => {
                        const assignedRoles = getAssignedRoles(user);
                        const isActive = user?.isActive !== false;
                        return (
                          <tr key={user._id}>
                            <td>{user.firstName} {user.lastName}</td>
                            <td>{user.email}</td>
                            <td>
                              <div className="users-role-cell">
                                {assignedRoles.map((role) => (
                                  <span key={`${user._id}-${role}`} className="badge badge-primary users-role-chip">
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
                              <button className="btn btn-sm btn-secondary" onClick={() => onEdit(user)}>
                                {t('schoolSettings:users.actions.editRole')}
                              </button>
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
                                <span key={`${user._id}-${role}-mobile`} className="badge badge-primary users-role-chip">
                                  {getRoleLabel(role)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="users-mobile-row">
                            <strong>{t('schoolSettings:users.table.department')}:</strong>
                            <span>{user.department?.name ?? t('schoolSettings:common.dash')}</span>
                          </div>
                          <button className="btn btn-secondary" onClick={() => onEdit(user)}>
                            {t('schoolSettings:users.actions.editRole')}
                          </button>
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
