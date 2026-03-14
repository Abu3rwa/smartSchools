import SchoolSettingsHeader from './components/SchoolSettingsHeader';
import SchoolSettingsTabs from './components/SchoolSettingsTabs';
import DepartmentsTab from './components/DepartmentsTab';
import DepartmentModal from './components/DepartmentModal';
import UsersTab from './components/UsersTab';
import UserRoleModal from './components/UserRoleModal';
import LessonPlanCriteriaTab from './components/LessonPlanCriteriaTab';
import SchoolYearTab from './components/SchoolYearTab';
import BrandingTab from './components/BrandingTab';
import GradingScalesTab from './components/GradingScalesTab';
import CommunicationTab from './components/CommunicationTab';
import { useTranslation } from 'react-i18next';
import useSchoolSettings from './hooks/useSchoolSettings';
import './SchoolSettingsPage.css';

const SchoolSettingsPage = () => {
  useTranslation(['schoolSettings']);

  const {
    canManageUsers,
    canManageSchoolSettings,
    canManageCommunicationSettings,
    canManageGradeScaling,
    canAccessSchoolSettings,
    activeTab,
    setActiveTab,
    departments,
    departmentsLoading,
    departmentsError,
    reloadDepartments,
    departmentModalState,
    handleDeptSubmit,
    handleEditDept,
    handleDeleteDept,
    handleCloseDeptModal,
    openDeptModal,
    setDeptFormData,
    users,
    usersLoading,
    userModalState,
    handleEditUser,
    handleUserSubmit,
    handleCloseUserModal,
    handlePermissionToggle,
    setUserFormData,
    currentAcademicYear,
    academicYearSaving,
    academicYears,
    fromYear,
    setFromYear,
    toYear,
    setToYear,
    rolloverLoading,
    classesCreated,
    deactivateCount,
    promoteResult,
    schoolYearStartDate,
    setSchoolYearStartDate,
    schoolYearEndDate,
    setSchoolYearEndDate,
    schoolYearDatesSaving,
    schoolWeekConfigLoading,
    schoolWeekConfigSaving,
    weekWorkingDays,
    weekendDays,
    schoolInfo,
    brandingLoading,
    communicationSettings,
    handleUploadSchoolLogo,
    handleRemoveSchoolLogo,
    handleToggleAiEmailDraft,
    handleAttendanceReminderSettingsChange,
    handleSaveAttendanceReminderSettings,
    handleCopyClasses,
    handleDeactivateYear,
    handlePromoteStudents,
    handleSwitchToNewYear,
    handleSaveSchoolYearDates,
    handleToggleWeekWorkingDay,
    handleSaveWeekWorkingDays,
    gradingScales,
    gradingScalesLoading,
    gradingScaleSubmitting,
    showGradingScaleForm,
    editingGradingScaleId,
    gradingScaleFormData,
    openCreateGradingScale,
    openEditGradingScale,
    closeGradingScaleForm,
    updateGradingScaleFormField,
    updateGradingScaleBand,
    addGradingScaleBand,
    removeGradingScaleBand,
    handleSaveGradingScale,
    handleSetDefaultGradingScale,
    handleDeleteGradingScale,
    navigate
  } = useSchoolSettings();

  if (!canAccessSchoolSettings) return null;

  return (
    <div className="school-settings-page">
      <SchoolSettingsHeader />

      <SchoolSettingsTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        canManageUsers={canManageUsers}
        canManageSchoolSettings={canManageSchoolSettings}
        canManageCommunicationSettings={canManageCommunicationSettings}
        canManageGradeScaling={canManageGradeScaling}
      />

      {activeTab === 'departments' && canManageSchoolSettings && (
        <DepartmentsTab
          departments={departments}
          loading={departmentsLoading}
          error={departmentsError}
          onRetry={reloadDepartments}
          onOpenModal={openDeptModal}
          onEdit={handleEditDept}
          onDelete={handleDeleteDept}
          modal={(
            <DepartmentModal
              open={departmentModalState.open}
              editingDeptId={departmentModalState.editingDeptId}
              formData={departmentModalState.deptFormData}
              onChange={setDeptFormData}
              onSubmit={handleDeptSubmit}
              onClose={handleCloseDeptModal}
              submitting={departmentModalState.submittingDept}
            />
          )}
        />
      )}

      {activeTab === 'users' && canManageUsers && (
        <UsersTab
          users={users}
          loading={usersLoading}
          onEdit={handleEditUser}
          modal={(
            <UserRoleModal
              open={userModalState.open}
              editingUser={userModalState.editingUser}
              formData={userModalState.userFormData}
              departments={departments}
              onChange={setUserFormData}
              onPermissionToggle={handlePermissionToggle}
              onSubmit={handleUserSubmit}
              onClose={handleCloseUserModal}
              submitting={userModalState.submittingUser}
            />
          )}
        />
      )}

      {activeTab === 'lessonplancriteria' && canManageSchoolSettings && <LessonPlanCriteriaTab />}

      {activeTab === 'gradingscales' && canManageGradeScaling && (
        <GradingScalesTab
          scales={gradingScales}
          loading={gradingScalesLoading}
          canManage={canManageGradeScaling}
          onOpenCreate={openCreateGradingScale}
          onEdit={openEditGradingScale}
          onSetDefault={handleSetDefaultGradingScale}
          onDelete={handleDeleteGradingScale}
          formOpen={showGradingScaleForm}
          editingScaleId={editingGradingScaleId}
          formData={gradingScaleFormData}
          submitting={gradingScaleSubmitting}
          onFormFieldChange={updateGradingScaleFormField}
          onBandChange={updateGradingScaleBand}
          onAddBand={addGradingScaleBand}
          onRemoveBand={removeGradingScaleBand}
          onCloseForm={closeGradingScaleForm}
          onSave={handleSaveGradingScale}
        />
      )}

      {activeTab === 'branding' && canManageSchoolSettings && (
        <BrandingTab
          schoolName={schoolInfo?.name}
          logoUrl={schoolInfo?.settings?.branding?.logoUrl}
          loading={brandingLoading}
          onUploadLogo={handleUploadSchoolLogo}
          onRemoveLogo={handleRemoveSchoolLogo}
        />
      )}

      {activeTab === 'communication' && canManageCommunicationSettings && (
        <CommunicationTab
          loading={communicationSettings.loading}
          saving={communicationSettings.saving}
        featureAvailable={communicationSettings.featureAvailable}
        aiEmailDraftEnabled={communicationSettings.aiEmailDraftEnabled}
        attendanceRemindersEnabled={communicationSettings.attendanceRemindersEnabled}
        attendanceReminderDelayMinutes={communicationSettings.attendanceReminderDelayMinutes}
        onToggleAiEmailDraft={handleToggleAiEmailDraft}
        onAttendanceReminderSettingsChange={handleAttendanceReminderSettingsChange}
        onSaveAttendanceReminderSettings={handleSaveAttendanceReminderSettings}
      />
      )}

      {activeTab === 'schoolyear' && canManageSchoolSettings && (
        <SchoolYearTab
          academicYears={academicYears}
          fromYear={fromYear}
          toYear={toYear}
          setFromYear={setFromYear}
          setToYear={setToYear}
          rolloverLoading={rolloverLoading}
          classesCreated={classesCreated}
          deactivateCount={deactivateCount}
          promoteResult={promoteResult}
          currentAcademicYear={currentAcademicYear}
          onCopyClasses={handleCopyClasses}
          onDeactivateYear={handleDeactivateYear}
          onPromoteStudents={handlePromoteStudents}
          onSwitchToNewYear={handleSwitchToNewYear}
          schoolYearStartDate={schoolYearStartDate}
          schoolYearEndDate={schoolYearEndDate}
          setSchoolYearStartDate={setSchoolYearStartDate}
          setSchoolYearEndDate={setSchoolYearEndDate}
          schoolYearDatesSaving={schoolYearDatesSaving}
          schoolWeekConfigLoading={schoolWeekConfigLoading}
          schoolWeekConfigSaving={schoolWeekConfigSaving}
          weekWorkingDays={weekWorkingDays}
          weekendDays={weekendDays}
          academicYearSaving={academicYearSaving}
          onSaveSchoolYearDates={handleSaveSchoolYearDates}
          onToggleWeekWorkingDay={handleToggleWeekWorkingDay}
          onSaveWeekWorkingDays={handleSaveWeekWorkingDays}
          onNavigateClasses={() => navigate('/portal/classes')}
          onEditUsersTab={() => setActiveTab('users')}
        />
      )}
    </div>
  );
};

export default SchoolSettingsPage;
