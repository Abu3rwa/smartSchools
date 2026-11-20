import { useMemo } from 'react';
import { HiOutlineShieldCheck, HiOutlineUserGroup, HiOutlineUsers, HiOutlineUserMinus } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import UsersTab from '../../schoolSettings/SchoolSettingsPage/components/UsersTab';
import UserRoleModal from '../../schoolSettings/SchoolSettingsPage/components/UserRoleModal';
import useUserManagement from '../useUserManagement';
import { normalizePermissions } from '../userManagementUtils';
import '../../schoolSettings/SchoolSettingsPage/SchoolSettingsPage.css';
import './SchoolUserManagementPage.css';

const SchoolUserManagementPage = () => {
  const { t } = useTranslation(['schoolSettings']);
  const {
    canView,
    users,
    usersLoading,
    usersError,
    reloadUsers,
    openEditor,
    modal
  } = useUserManagement();

  const summary = useMemo(() => {
    const total = users.length;
    const active = users.filter((item) => item?.isActive !== false).length;
    const withCustomPermissions = users.filter((item) => normalizePermissions(item.permissions).length > 0).length;
    return { total, active, inactive: total - active, withCustomPermissions };
  }, [users]);

  if (!canView) {
    return (
      <div className="school-user-management-page-denied card">
        <h2>{t('schoolSettings:users.page.title', { defaultValue: 'User Management' })}</h2>
        <p>{t('schoolSettings:users.page.denied', { defaultValue: 'You do not have permission to manage school users.' })}</p>
      </div>
    );
  }

  const stats = [
    {
      key: 'total',
      icon: <HiOutlineUsers size={16} />,
      tone: '',
      value: summary.total,
      label: t('schoolSettings:users.page.totalUsers', { defaultValue: 'Total users' })
    },
    {
      key: 'active',
      icon: <HiOutlineUserGroup size={16} />,
      tone: 'success',
      value: summary.active,
      label: t('schoolSettings:users.page.activeUsers', { defaultValue: 'Active' })
    },
    {
      key: 'inactive',
      icon: <HiOutlineUserMinus size={16} />,
      tone: 'muted',
      value: summary.inactive,
      label: t('schoolSettings:users.page.inactiveUsers', { defaultValue: 'Inactive' })
    },
    {
      key: 'custom',
      icon: <HiOutlineShieldCheck size={16} />,
      tone: 'info',
      value: summary.withCustomPermissions,
      label: t('schoolSettings:users.page.customPermissions', { defaultValue: 'Custom permission profiles' })
    }
  ];

  return (
    <div className="school-settings-page school-user-management-page">
      <div className="page-header school-user-management-header">
        <div>
          <h1>{t('schoolSettings:users.page.title', { defaultValue: 'User Management' })}</h1>
          <p className="text-muted">
            {t('schoolSettings:users.page.subtitle', {
              defaultValue: 'Manage school users, assign roles, and configure granular permissions.'
            })}
          </p>
        </div>
      </div>

      <div
        className="school-user-management-summary-strip card"
        role="group"
        aria-label={t('schoolSettings:users.page.summaryAria', { defaultValue: 'User summary' })}
      >
        {stats.map((stat) => (
          <div className="school-user-management-summary-item" key={stat.key}>
            <span className={`school-user-management-summary-icon ${stat.tone}`}>{stat.icon}</span>
            <span className="school-user-management-summary-value">{stat.value}</span>
            <span className="school-user-management-summary-label">{stat.label}</span>
          </div>
        ))}
      </div>

      <UsersTab
        users={users}
        loading={usersLoading}
        error={usersError}
        onRetry={reloadUsers}
        onEdit={openEditor}
        modal={<UserRoleModal state={modal} />}
      />
    </div>
  );
};

export default SchoolUserManagementPage;
