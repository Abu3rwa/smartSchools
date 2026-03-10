import {
  HiOutlineOfficeBuilding,
  HiOutlineUserGroup,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlinePhotograph,
  HiOutlineColorSwatch,
  HiOutlineMail
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const SchoolSettingsTabs = ({
  activeTab,
  onTabChange,
  canManageUsers,
  canManageSchoolSettings,
  canManageCommunicationSettings,
  canManageGradeScaling
}) => {
  const { t } = useTranslation(['schoolSettings']);

  return (
    <div className="tabs">
      {canManageSchoolSettings && (
        <button
          className={`tab-btn ${activeTab === 'departments' ? 'active' : ''}`}
          onClick={() => onTabChange('departments')}
        >
          <HiOutlineOfficeBuilding size={18} />
          {t('schoolSettings:tabs.departments')}
        </button>
      )}
      {canManageUsers && (
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => onTabChange('users')}
        >
          <HiOutlineUserGroup size={18} />
          {t('schoolSettings:tabs.usersAndRoles')}
        </button>
      )}
      {canManageSchoolSettings && (
        <button
          className={`tab-btn ${activeTab === 'lessonplancriteria' ? 'active' : ''}`}
          onClick={() => onTabChange('lessonplancriteria')}
        >
          <HiOutlineDocumentText size={18} />
          {t('schoolSettings:tabs.lessonPlanCriteria')}
        </button>
      )}
      {canManageGradeScaling && (
        <button
          className={`tab-btn ${activeTab === 'gradingscales' ? 'active' : ''}`}
          onClick={() => onTabChange('gradingscales')}
        >
          <HiOutlineColorSwatch size={18} />
          {t('schoolSettings:tabs.gradingScales')}
        </button>
      )}
      {canManageSchoolSettings && (
        <button
          className={`tab-btn ${activeTab === 'branding' ? 'active' : ''}`}
          onClick={() => onTabChange('branding')}
        >
          <HiOutlinePhotograph size={18} />
          {t('schoolSettings:tabs.branding')}
        </button>
      )}
      {canManageCommunicationSettings && (
        <button
          className={`tab-btn ${activeTab === 'communication' ? 'active' : ''}`}
          onClick={() => onTabChange('communication')}
        >
          <HiOutlineMail size={18} />
          {t('schoolSettings:tabs.communication')}
        </button>
      )}
      {canManageSchoolSettings && (
        <button
          className={`tab-btn ${activeTab === 'schoolyear' ? 'active' : ''}`}
          onClick={() => onTabChange('schoolyear')}
        >
          <HiOutlineCalendar size={18} />
          {t('schoolSettings:tabs.schoolYear')}
        </button>
      )}
    </div>
  );
};

export default SchoolSettingsTabs;
