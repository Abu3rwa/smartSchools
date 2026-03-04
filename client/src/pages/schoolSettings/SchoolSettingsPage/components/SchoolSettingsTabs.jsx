import {
  HiOutlineOfficeBuilding,
  HiOutlineUserGroup,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlinePhotograph
} from 'react-icons/hi';

const SchoolSettingsTabs = ({ activeTab, onTabChange, canManageUsers, canManageSchoolSettings }) => (
  <div className="tabs">
    <button
      className={`tab-btn ${activeTab === 'departments' ? 'active' : ''}`}
      onClick={() => onTabChange('departments')}
    >
      <HiOutlineOfficeBuilding size={18} />
      Departments
    </button>
    {canManageUsers && (
      <button
        className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
        onClick={() => onTabChange('users')}
      >
        <HiOutlineUserGroup size={18} />
        Users & roles
      </button>
    )}
    <button
      className={`tab-btn ${activeTab === 'lessonplancriteria' ? 'active' : ''}`}
      onClick={() => onTabChange('lessonplancriteria')}
    >
      <HiOutlineDocumentText size={18} />
      Lesson Plan Criteria
    </button>
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
