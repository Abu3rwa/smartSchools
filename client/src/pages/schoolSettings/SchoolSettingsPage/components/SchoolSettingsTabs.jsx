import {
  HiOutlineOfficeBuilding,
  HiOutlineUserGroup,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlinePhotograph,
  HiOutlineColorSwatch,
  HiOutlineMail,
  HiOutlineClipboardCheck,
  HiOutlineAcademicCap
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
    <nav className="settings-nav" aria-label={t('schoolSettings:header.title')}>
      <div className="settings-nav-header">
        <h3>{t('schoolSettings:header.title')}</h3>
        <p>{t('schoolSettings:header.subtitle')}</p>
      </div>

      <div className="settings-nav-list">
        {canManageSchoolSettings && (
          <button
            className={`settings-nav-btn ${activeTab === 'departments' ? 'active' : ''}`}
            onClick={() => onTabChange('departments')}
          >
            <HiOutlineOfficeBuilding size={18} />
            {t('schoolSettings:tabs.departments')}
          </button>
        )}
        {canManageUsers && (
          <button
            className={`settings-nav-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => onTabChange('users')}
          >
            <HiOutlineUserGroup size={18} />
            {t('schoolSettings:tabs.usersAndRoles')}
          </button>
        )}
        {canManageSchoolSettings && (
          <button
            className={`settings-nav-btn ${activeTab === 'lessonplancriteria' ? 'active' : ''}`}
            onClick={() => onTabChange('lessonplancriteria')}
          >
            <HiOutlineDocumentText size={18} />
            {t('schoolSettings:tabs.lessonPlanCriteria')}
          </button>
        )}
        {canManageGradeScaling && (
          <button
            className={`settings-nav-btn ${activeTab === 'gradingscales' ? 'active' : ''}`}
            onClick={() => onTabChange('gradingscales')}
          >
            <HiOutlineColorSwatch size={18} />
            {t('schoolSettings:tabs.gradingScales')}
          </button>
        )}
        {canManageSchoolSettings && (
          <button
            className={`settings-nav-btn ${activeTab === 'branding' ? 'active' : ''}`}
            onClick={() => onTabChange('branding')}
          >
            <HiOutlinePhotograph size={18} />
            {t('schoolSettings:tabs.branding')}
          </button>
        )}
        {canManageCommunicationSettings && (
          <button
            className={`settings-nav-btn ${activeTab === 'communication' ? 'active' : ''}`}
            onClick={() => onTabChange('communication')}
          >
            <HiOutlineMail size={18} />
            {t('schoolSettings:tabs.communication')}
          </button>
        )}
        {canManageSchoolSettings && (
          <button
            className={`settings-nav-btn ${activeTab === 'admissionspromotion' ? 'active' : ''}`}
            onClick={() => onTabChange('admissionspromotion')}
          >
            <HiOutlineClipboardCheck size={18} />
            {t('schoolSettings:tabs.admissionsPromotion')}
          </button>
        )}
        {canManageSchoolSettings && (
          <button
            className={`settings-nav-btn ${activeTab === 'standardsgradebook' ? 'active' : ''}`}
            onClick={() => onTabChange('standardsgradebook')}
          >
            <HiOutlineAcademicCap size={18} />
            Standards Gradebook
          </button>
        )}
        {canManageSchoolSettings && (
          <button
            className={`settings-nav-btn ${activeTab === 'schoolyear' ? 'active' : ''}`}
            onClick={() => onTabChange('schoolyear')}
          >
            <HiOutlineCalendar size={18} />
            {t('schoolSettings:tabs.schoolYear')}
          </button>
        )}
      </div>
    </nav>
  );
};

export default SchoolSettingsTabs;
