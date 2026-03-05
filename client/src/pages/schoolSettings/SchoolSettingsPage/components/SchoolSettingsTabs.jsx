import {
  HiOutlineOfficeBuilding,
  HiOutlineUserGroup,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlinePhotograph,
  HiOutlineColorSwatch
} from 'react-icons/hi';

const SchoolSettingsTabs = ({
  activeTab,
  onTabChange,
  canManageUsers,
  canManageSchoolSettings,
  canManageGradeScaling
}) => (
  <div className="tabs">
    {canManageSchoolSettings && (
      <button
        className={`tab-btn ${activeTab === 'departments' ? 'active' : ''}`}
        onClick={() => onTabChange('departments')}
      >
        <HiOutlineOfficeBuilding size={18} />
        Departments
      </button>
    )}
    {canManageUsers && (
      <button
        className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
        onClick={() => onTabChange('users')}
      >
        <HiOutlineUserGroup size={18} />
        Users & roles
      </button>
    )}
    {canManageSchoolSettings && (
      <button
        className={`tab-btn ${activeTab === 'lessonplancriteria' ? 'active' : ''}`}
        onClick={() => onTabChange('lessonplancriteria')}
      >
        <HiOutlineDocumentText size={18} />
        Lesson Plan Criteria
      </button>
    )}
    {canManageGradeScaling && (
      <button
        className={`tab-btn ${activeTab === 'gradingscales' ? 'active' : ''}`}
        onClick={() => onTabChange('gradingscales')}
      >
        <HiOutlineColorSwatch size={18} />
        Grading scales
      </button>
    )}
    {canManageSchoolSettings && (
      <button
        className={`tab-btn ${activeTab === 'branding' ? 'active' : ''}`}
        onClick={() => onTabChange('branding')}
      >
        <HiOutlinePhotograph size={18} />
        Branding
      </button>
    )}
    {canManageSchoolSettings && (
      <button
        className={`tab-btn ${activeTab === 'schoolyear' ? 'active' : ''}`}
        onClick={() => onTabChange('schoolyear')}
      >
        <HiOutlineCalendar size={18} />
        School year
      </button>
    )}
  </div>
);

export default SchoolSettingsTabs;
