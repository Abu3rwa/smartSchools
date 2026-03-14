import { useMemo, useState } from 'react';
import { HiOutlineUserGroup } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import TablePagination from '../../../../components/common/TablePagination';

const DEFAULT_PAGE_SIZE = 10;

const UsersTab = ({ users, loading, onEdit, modal }) => {
  const { t } = useTranslation(['schoolSettings']);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const getRoleLabel = (role = '') =>
    t(`schoolSettings:roles.${String(role).toLowerCase()}`, { defaultValue: role });

  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedUsers = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return users.slice(startIndex, startIndex + pageSize);
  }, [users, safeCurrentPage, pageSize]);

  return (
    <div className="tab-content">
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : (
        <div className="users-table-wrap card">
          <table className="users-table">
            <thead>
              <tr>
                <th>{t('schoolSettings:users.table.name')}</th>
                <th>{t('schoolSettings:users.table.email')}</th>
                <th>{t('schoolSettings:users.table.role')}</th>
                <th>{t('schoolSettings:users.table.department')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr key={user._id}>
                  <td>{user.firstName} {user.lastName}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className="badge badge-primary">{getRoleLabel(user.role)}</span>
                  </td>
                  <td>{user.department?.name ?? t('schoolSettings:common.dash')}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => onEdit(user)}>
                      {t('schoolSettings:users.actions.editRole')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination
            page={safeCurrentPage}
            pageSize={pageSize}
            totalItems={users.length}
            totalPages={totalPages}
            onPageChange={(nextPage) => setCurrentPage(Math.max(1, Math.min(nextPage, totalPages)))}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setCurrentPage(1);
            }}
          />
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
