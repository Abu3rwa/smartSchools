import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../../../config/api';
import { PERMISSIONS } from '../../../../constants/permissions';
import {
  fetchDepartments,
  selectDepartments,
  selectDepartmentsLoading,
  selectDepartmentsError,
  createDepartment,
  updateDepartment,
  deleteDepartment
} from '../../../../store/slices/departmentSlice';
import { selectUser } from '../../../../store/slices/authSlice';
import {
  selectCurrentAcademicYear,
  updateSchoolAcademicYear,
  selectAcademicYearLoading
} from '../../../../store/slices/uiSlice';
import { isConsecutiveAcademicYear, normalizePermissions } from '../utils/schoolSettingsUtils';

const DEFAULT_WEEK_WORKING_DAYS = [1, 2, 3, 4, 5];
const ALL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

const normalizeWeekWorkingDays = (candidate) => {
  if (!Array.isArray(candidate)) return [...DEFAULT_WEEK_WORKING_DAYS];

  const normalized = Array.from(
    new Set(
      candidate
        .map((value) => Number.parseInt(value, 10))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((left, right) => left - right);

  return normalized.length > 0 ? normalized : [...DEFAULT_WEEK_WORKING_DAYS];
};

const useSchoolSettings = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation(['schoolSettings']);
  const user = useSelector(selectUser);
  const userPermissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const canManageUsers = user?.role === 'admin' || userPermissions.includes(PERMISSIONS.MANAGE_USERS);
  const canManageSchoolSettings =
    user?.role === 'admin' || userPermissions.includes(PERMISSIONS.MANAGE_SCHOOL_SETTINGS);
  const canManageCommunicationSettings = user?.role === 'admin';
  const canManageGradeScaling =
    user?.role === 'admin' || userPermissions.includes(PERMISSIONS.MANAGE_GRADE_SCALING);
  const canAccessSchoolSettings = canManageUsers || canManageSchoolSettings || canManageGradeScaling;

  const departments = useSelector(selectDepartments);
  const departmentsLoading = useSelector(selectDepartmentsLoading);
  const departmentsError = useSelector(selectDepartmentsError);
  const currentAcademicYear = useSelector(selectCurrentAcademicYear);
  const academicYearSaving = useSelector(selectAcademicYearLoading);

  const [activeTab, setActiveTab] = useState('departments');
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [deptFormData, setDeptFormData] = useState({
    name: '',
    type: 'academic',
    description: ''
  });
  const [submittingDept, setSubmittingDept] = useState(false);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ role: '', department: '', permissions: [] });
  const [submittingUser, setSubmittingUser] = useState(false);

  const [academicYears, setAcademicYears] = useState([]);
  const [fromYear, setFromYear] = useState('');
  const [toYear, setToYear] = useState('');
  const [rolloverLoading, setRolloverLoading] = useState(false);
  const [classesCreated, setClassesCreated] = useState(null);
  const [deactivateCount, setDeactivateCount] = useState(null);
  const [promoteResult, setPromoteResult] = useState(null);
  const [schoolYearStartDate, setSchoolYearStartDate] = useState('');
  const [schoolYearEndDate, setSchoolYearEndDate] = useState('');
  const [schoolYearDatesSaving, setSchoolYearDatesSaving] = useState(false);
  const [schoolWeekConfigLoading, setSchoolWeekConfigLoading] = useState(false);
  const [schoolWeekConfigSaving, setSchoolWeekConfigSaving] = useState(false);
  const [weekWorkingDays, setWeekWorkingDays] = useState(DEFAULT_WEEK_WORKING_DAYS);
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [communicationSettings, setCommunicationSettings] = useState({
    loading: false,
    saving: false,
    featureAvailable: false,
    aiEmailDraftEnabled: true,
    attendanceRemindersEnabled: true,
    attendanceReminderDelayMinutes: 60
  });
  const [gradingScales, setGradingScales] = useState([]);
  const [gradingScalesLoading, setGradingScalesLoading] = useState(false);
  const [gradingScaleSubmitting, setGradingScaleSubmitting] = useState(false);
  const [showGradingScaleForm, setShowGradingScaleForm] = useState(false);
  const [editingGradingScaleId, setEditingGradingScaleId] = useState(null);
  const [gradingScaleFormData, setGradingScaleFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    sortOrder: 100,
    bands: [
      { grade: 'A+', min: 97, max: 100, color: '#14532d' },
      { grade: 'A', min: 93, max: 96, color: '#166534' },
      { grade: 'A-', min: 90, max: 92, color: '#15803d' },
      { grade: 'B+', min: 87, max: 89, color: '#059669' },
      { grade: 'B', min: 83, max: 86, color: '#0d9488' },
      { grade: 'B-', min: 80, max: 82, color: '#0284c7' },
      { grade: 'C+', min: 77, max: 79, color: '#2563eb' },
      { grade: 'C', min: 73, max: 76, color: '#4f46e5' },
      { grade: 'C-', min: 70, max: 72, color: '#7c3aed' },
      { grade: 'D+', min: 67, max: 69, color: '#c2410c' },
      { grade: 'D', min: 50, max: 66, color: '#ea580c' },
      { grade: 'F', min: 0, max: 49, color: '#dc2626' }
    ]
  });

  useEffect(() => {
    if (!canAccessSchoolSettings) {
      navigate('/portal/dashboard');
      return;
    }
    dispatch(fetchDepartments());
  }, [canAccessSchoolSettings, dispatch, navigate]);

  useEffect(() => {
    const allowedTabs = [
      canManageSchoolSettings ? 'departments' : null,
      canManageUsers ? 'users' : null,
      canManageSchoolSettings ? 'lessonplancriteria' : null,
      canManageGradeScaling ? 'gradingscales' : null,
      canManageSchoolSettings ? 'branding' : null,
      canManageCommunicationSettings ? 'communication' : null,
      canManageSchoolSettings ? 'schoolyear' : null
    ].filter(Boolean);

    if (allowedTabs.length === 0) {
      return;
    }

    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [activeTab, canManageCommunicationSettings, canManageGradeScaling, canManageSchoolSettings, canManageUsers]);

  const fetchSchoolUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await api.get('/schools/me/users');
      if (response.data.success) {
        setUsers(response.data.data.users);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.loadUsersFailed'));
    } finally {
      setUsersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canManageUsers && activeTab === 'users') {
      fetchSchoolUsers();
    }
  }, [activeTab, canManageUsers, fetchSchoolUsers]);

  const loadSchoolProfile = useCallback(async () => {
    try {
      const response = await api.get('/schools/me');
      if (response.data?.success) {
        setSchoolInfo(response.data.data?.school || null);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.loadSchoolProfileFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (canManageSchoolSettings) {
      loadSchoolProfile();
    }
  }, [canManageSchoolSettings, loadSchoolProfile]);

  const fetchCommunicationSettings = useCallback(async () => {
    if (!canManageCommunicationSettings) return;
    setCommunicationSettings((prev) => ({ ...prev, loading: true }));
    try {
      const [communicationResponse, attendanceReminderResponse] = await Promise.all([
        api.get('/schools/me/communication-settings'),
        api.get('/schools/me/attendance-reminder-settings')
      ]);

      if (communicationResponse.data?.success && attendanceReminderResponse.data?.success) {
        setCommunicationSettings((prev) => ({
          ...prev,
          loading: false,
          featureAvailable: Boolean(communicationResponse.data.data?.featureAvailable),
          aiEmailDraftEnabled: communicationResponse.data.data?.aiEmailDraftEnabled !== false,
          attendanceRemindersEnabled: attendanceReminderResponse.data.data?.enabled !== false,
          attendanceReminderDelayMinutes: Number(attendanceReminderResponse.data.data?.delayMinutes || 60)
        }));
      } else {
        setCommunicationSettings((prev) => ({ ...prev, loading: false }));
        toast.error(
          communicationResponse.data?.message ||
          attendanceReminderResponse.data?.message ||
          t('schoolSettings:toast.loadCommunicationSettingsFailed')
        );
      }
    } catch (error) {
      setCommunicationSettings((prev) => ({ ...prev, loading: false }));
      toast.error(error.response?.data?.message || t('schoolSettings:toast.loadCommunicationSettingsFailed'));
    }
  }, [canManageCommunicationSettings, t]);

  useEffect(() => {
    if (activeTab === 'communication' && canManageCommunicationSettings) {
      fetchCommunicationSettings();
    }
  }, [activeTab, canManageCommunicationSettings, fetchCommunicationSettings]);

  const fetchGradingScales = useCallback(async () => {
    if (!canManageGradeScaling) return;
    setGradingScalesLoading(true);
    try {
      const response = await api.get('/grading-scales');
      if (response.data?.success) {
        setGradingScales(response.data?.data?.items || []);
      } else {
        toast.error(response.data?.message || t('schoolSettings:toast.loadGradingScalesFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.loadGradingScalesFailed'));
    } finally {
      setGradingScalesLoading(false);
    }
  }, [canManageGradeScaling, t]);

  useEffect(() => {
    if (activeTab === 'gradingscales' && canManageGradeScaling) {
      fetchGradingScales();
    }
  }, [activeTab, canManageGradeScaling, fetchGradingScales]);

  const handleUploadSchoolLogo = useCallback(async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('logo', file);

    setBrandingLoading(true);
    try {
      const response = await api.put('/schools/me/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (response.data?.success) {
        setSchoolInfo((prev) => response.data.data?.school || prev);
        toast.success(t('schoolSettings:toast.schoolLogoUpdated'));
      } else {
        toast.error(response.data?.message || t('schoolSettings:toast.schoolLogoUpdateFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.schoolLogoUpdateFailed'));
    } finally {
      setBrandingLoading(false);
    }
  }, [t]);

  const handleRemoveSchoolLogo = useCallback(async () => {
    setBrandingLoading(true);
    try {
      const response = await api.delete('/schools/me/logo');
      if (response.data?.success) {
        setSchoolInfo((prev) => response.data.data?.school || prev);
        toast.success(t('schoolSettings:toast.schoolLogoRemoved'));
      } else {
        toast.error(response.data?.message || t('schoolSettings:toast.schoolLogoRemoveFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.schoolLogoRemoveFailed'));
    } finally {
      setBrandingLoading(false);
    }
  }, [t]);

  const handleToggleAiEmailDraft = useCallback(async (enabled) => {
    if (!canManageCommunicationSettings) return;
    setCommunicationSettings((prev) => ({ ...prev, saving: true }));
    try {
      const response = await api.patch('/schools/me/communication-settings', {
        aiEmailDraftEnabled: Boolean(enabled)
      });
      if (response.data?.success) {
        setCommunicationSettings((prev) => ({
          ...prev,
          saving: false,
          aiEmailDraftEnabled: response.data.data?.aiEmailDraftEnabled !== false,
          featureAvailable: Boolean(response.data.data?.featureAvailable)
        }));
        toast.success(t('schoolSettings:toast.communicationSettingsUpdated'));
      } else {
        setCommunicationSettings((prev) => ({ ...prev, saving: false }));
        toast.error(response.data?.message || t('schoolSettings:toast.communicationSettingsUpdateFailed'));
      }
    } catch (error) {
      setCommunicationSettings((prev) => ({ ...prev, saving: false }));
      toast.error(error.response?.data?.message || t('schoolSettings:toast.communicationSettingsUpdateFailed'));
    }
  }, [canManageCommunicationSettings, t]);

  const handleAttendanceReminderSettingsChange = useCallback((patch) => {
    setCommunicationSettings((prev) => ({
      ...prev,
      ...patch
    }));
  }, []);

  const handleSaveAttendanceReminderSettings = useCallback(async () => {
    if (!canManageCommunicationSettings) return;

    const enabled = Boolean(communicationSettings.attendanceRemindersEnabled);
    const delayMinutes = Number.parseInt(communicationSettings.attendanceReminderDelayMinutes, 10);
    if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 1440) {
      toast.error(t('schoolSettings:toast.attendanceReminderDelayInvalid'));
      return;
    }

    setCommunicationSettings((prev) => ({ ...prev, saving: true }));
    try {
      const response = await api.patch('/schools/me/attendance-reminder-settings', {
        enabled,
        delayMinutes
      });
      if (response.data?.success) {
        setCommunicationSettings((prev) => ({
          ...prev,
          saving: false,
          attendanceRemindersEnabled: response.data.data?.enabled !== false,
          attendanceReminderDelayMinutes: Number(response.data.data?.delayMinutes || 60)
        }));
        toast.success(t('schoolSettings:toast.attendanceReminderSettingsUpdated'));
      } else {
        setCommunicationSettings((prev) => ({ ...prev, saving: false }));
        toast.error(response.data?.message || t('schoolSettings:toast.attendanceReminderSettingsUpdateFailed'));
      }
    } catch (error) {
      setCommunicationSettings((prev) => ({ ...prev, saving: false }));
      toast.error(error.response?.data?.message || t('schoolSettings:toast.attendanceReminderSettingsUpdateFailed'));
    }
  }, [canManageCommunicationSettings, communicationSettings.attendanceReminderDelayMinutes, communicationSettings.attendanceRemindersEnabled, t]);

  const loadSchoolWeekConfig = useCallback(async () => {
    setSchoolWeekConfigLoading(true);
    try {
      const res = await api.get('/school-calendar');
      if (res.data?.success) {
        const nextWorkingDays = normalizeWeekWorkingDays(res.data?.data?.config?.weekWorkingDays);
        setWeekWorkingDays(nextWorkingDays);
      } else {
        toast.error(res.data?.message || t('schoolSettings:toast.loadSchoolWeekConfigFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.loadSchoolWeekConfigFailed'));
    } finally {
      setSchoolWeekConfigLoading(false);
    }
  }, [t]);

  const loadAcademicYearData = useCallback(async () => {
    try {
      const res = await api.get('/schools/me/academic-years');
      if (res.data.success && res.data.data.academicYears) {
        const years = res.data.data.academicYears;
        setAcademicYears(years);
        if (!fromYear && years.length) setFromYear(years[years.length - 1]);
        if (!toYear) {
          const last = years[years.length - 1];
          if (last) {
            const [, e] = last.split('-').map(Number);
            setToYear(`${e}-${e + 1}`);
          }
        }
      }
    } catch {
      toast.error(t('schoolSettings:toast.loadAcademicYearsFailed'));
    }

    try {
      const res = await api.get('/schools/me/academic-year-dates');
      if (res.data.success && res.data.data) {
        const start = res.data.data.startDate ? new Date(res.data.data.startDate) : null;
        const end = res.data.data.endDate ? new Date(res.data.data.endDate) : null;
        setSchoolYearStartDate(start ? start.toISOString().slice(0, 10) : '');
        setSchoolYearEndDate(end ? end.toISOString().slice(0, 10) : '');
      }
    } catch {
      toast.error(t('schoolSettings:toast.loadSchoolYearDatesFailed'));
    }
  }, [fromYear, t, toYear]);

  useEffect(() => {
    if (canManageSchoolSettings && activeTab === 'schoolyear') {
      loadAcademicYearData();
      loadSchoolWeekConfig();
    }
  }, [activeTab, canManageSchoolSettings, loadAcademicYearData, loadSchoolWeekConfig]);

  const handleCopyClasses = useCallback(async () => {
    if (!fromYear || !toYear) {
      toast.error(t('schoolSettings:toast.selectFromAndToYears'));
      return;
    }
    setRolloverLoading(true);
    setClassesCreated(null);
    try {
      const res = await api.post('/schools/me/rollover/classes', {
        fromAcademicYear: fromYear,
        toAcademicYear: toYear
      });
      if (res.data.success) {
        toast.success(res.data.message || t('schoolSettings:toast.classesCreated'));
        setClassesCreated(res.data.data.count);
        setAcademicYears((prev) => (prev.includes(toYear) ? prev : [...prev, toYear].sort()));
      } else {
        toast.error(res.data.message || t('schoolSettings:toast.createClassesFailed'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('schoolSettings:toast.createClassesFailed'));
    } finally {
      setRolloverLoading(false);
    }
  }, [fromYear, t, toYear]);

  const handleDeactivateYear = useCallback(async () => {
    if (!fromYear) {
      toast.error(t('schoolSettings:toast.selectYearToDeactivate'));
      return;
    }
    setRolloverLoading(true);
    setDeactivateCount(null);
    try {
      const res = await api.post('/schools/me/rollover/deactivate-year', { academicYear: fromYear });
      if (res.data.success) {
        toast.success(res.data.message || t('schoolSettings:toast.deactivateYearSuccess'));
        setDeactivateCount(res.data.data.modifiedCount);
      } else {
        toast.error(res.data.message || t('schoolSettings:toast.deactivateYearFailed'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('schoolSettings:toast.deactivateYearFailed'));
    } finally {
      setRolloverLoading(false);
    }
  }, [fromYear, t]);

  const handlePromoteStudents = useCallback(async () => {
    if (!fromYear || !toYear) {
      toast.error(t('schoolSettings:toast.selectFromAndToYears'));
      return;
    }
    if (!window.confirm(t('schoolSettings:confirm.promoteStudents', { fromYear, toYear }))) {
      return;
    }
    setRolloverLoading(true);
    setPromoteResult(null);
    try {
      const res = await api.post('/schools/me/rollover/promote-students', {
        fromAcademicYear: fromYear,
        toAcademicYear: toYear,
        options: { graduateGrade: 12, defaultSection: 'A' }
      });
      if (res.data.success) {
        toast.success(res.data.message || t('schoolSettings:toast.promoteSuccess'));
        setPromoteResult(res.data.data);
      } else {
        toast.error(res.data.message || t('schoolSettings:toast.promoteFailed'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('schoolSettings:toast.promoteFailed'));
    } finally {
      setRolloverLoading(false);
    }
  }, [fromYear, t, toYear]);

  const handleSwitchToNewYear = useCallback(async () => {
    if (!toYear || !isConsecutiveAcademicYear(toYear)) {
      toast.error(t('schoolSettings:toast.invalidAcademicYear'));
      return;
    }

    const result = await dispatch(updateSchoolAcademicYear(toYear));
    if (updateSchoolAcademicYear.fulfilled.match(result)) {
      toast.success(t('schoolSettings:toast.academicYearSet', { year: result.payload }));
      setAcademicYears((prev) => (prev.includes(result.payload) ? prev : [...prev, result.payload].sort()));
    } else {
      toast.error(result.payload || t('schoolSettings:toast.updateAcademicYearFailed'));
    }
  }, [dispatch, t, toYear]);

  const handleSaveSchoolYearDates = useCallback(async () => {
    if (!schoolYearStartDate || !schoolYearEndDate) {
      toast.error(t('schoolSettings:toast.schoolYearDatesRequired'));
      return;
    }
    if (schoolYearEndDate < schoolYearStartDate) {
      toast.error(t('schoolSettings:toast.schoolYearEndDateInvalid'));
      return;
    }

    setSchoolYearDatesSaving(true);
    try {
      const res = await api.put('/schools/me/academic-year-dates', {
        startDate: schoolYearStartDate,
        endDate: schoolYearEndDate
      });
      if (res.data.success) {
        toast.success(res.data.message || t('schoolSettings:toast.schoolYearDatesUpdated'));
      } else {
        toast.error(res.data.message || t('schoolSettings:toast.schoolYearDatesUpdateFailed'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('schoolSettings:toast.schoolYearDatesUpdateFailed'));
    } finally {
      setSchoolYearDatesSaving(false);
    }
  }, [schoolYearEndDate, schoolYearStartDate, t]);

  const handleToggleWeekWorkingDay = useCallback((dayValue) => {
    const day = Number.parseInt(dayValue, 10);
    if (!Number.isInteger(day) || day < 0 || day > 6) return;

    setWeekWorkingDays((previous) => {
      if (previous.includes(day)) {
        if (previous.length === 1) return previous;
        return previous.filter((value) => value !== day);
      }

      return [...previous, day].sort((left, right) => left - right);
    });
  }, []);

  const handleSaveWeekWorkingDays = useCallback(async () => {
    const normalized = normalizeWeekWorkingDays(weekWorkingDays);
    if (normalized.length === 0) {
      toast.error(t('schoolSettings:toast.weekWorkingDaysRequired'));
      return;
    }

    setSchoolWeekConfigSaving(true);
    try {
      const response = await api.put('/school-calendar/config', { weekWorkingDays: normalized });
      if (response.data?.success) {
        setWeekWorkingDays(normalizeWeekWorkingDays(response.data?.data?.config?.weekWorkingDays));
        toast.success(t('schoolSettings:toast.schoolWeekConfigUpdated'));
      } else {
        toast.error(response.data?.message || t('schoolSettings:toast.schoolWeekConfigUpdateFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.schoolWeekConfigUpdateFailed'));
    } finally {
      setSchoolWeekConfigSaving(false);
    }
  }, [t, weekWorkingDays]);

  const handleCloseDeptModal = useCallback(() => {
    setShowDeptModal(false);
    setEditingDeptId(null);
    setDeptFormData({ name: '', type: 'academic', description: '' });
  }, []);

  const handleDeptSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setSubmittingDept(true);
      try {
        const result = editingDeptId
          ? await dispatch(updateDepartment({ id: editingDeptId, data: deptFormData }))
          : await dispatch(createDepartment(deptFormData));
        if (createDepartment.fulfilled.match(result) || updateDepartment.fulfilled.match(result)) {
          toast.success(editingDeptId ? t('schoolSettings:toast.departmentUpdated') : t('schoolSettings:toast.departmentCreated'));
          handleCloseDeptModal();
        } else {
          toast.error(result.payload || t('schoolSettings:toast.saveDepartmentFailed'));
        }
      } finally {
        setSubmittingDept(false);
      }
    },
    [deptFormData, dispatch, editingDeptId, handleCloseDeptModal, t]
  );

  const handleEditDept = useCallback((dept) => {
    setEditingDeptId(dept._id);
    setDeptFormData({
      name: dept.name,
      type: dept.type || 'academic',
      description: dept.description || ''
    });
    setShowDeptModal(true);
  }, []);

  const handleDeleteDept = useCallback(async (id) => {
    if (!window.confirm(t('schoolSettings:confirm.deleteDepartment'))) return;
    const result = await dispatch(deleteDepartment(id));
    if (deleteDepartment.fulfilled.match(result)) {
      toast.success(t('schoolSettings:toast.departmentDeleted'));
    } else {
      toast.error(result.payload || t('schoolSettings:toast.deleteDepartmentFailed'));
    }
  }, [dispatch, t]);

  const openDeptModal = useCallback(() => {
    setEditingDeptId(null);
    setDeptFormData({ name: '', type: 'academic', description: '' });
    setShowDeptModal(true);
  }, []);

  const handleEditUser = useCallback((targetUser) => {
    setEditingUser(targetUser);
    setUserFormData({
      role: targetUser.role,
      department: targetUser.department?._id || targetUser.department || '',
      permissions: normalizePermissions(targetUser.permissions)
    });
    setShowUserModal(true);
  }, []);

  const handleUserSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!canManageUsers) {
        toast.error(t('schoolSettings:toast.noPermissionManageUsers'));
        return;
      }
      setSubmittingUser(true);
      const normalizedPermissions = Array.from(new Set(normalizePermissions(userFormData.permissions)));
      try {
        const response = await api.patch(`/schools/me/users/${editingUser._id}`, {
          role: userFormData.role,
          department: userFormData.department || null,
          permissions: normalizedPermissions
        });
        if (response.data.success) {
          toast.success(t('schoolSettings:toast.userUpdated'));
          setShowUserModal(false);
          setEditingUser(null);
          fetchSchoolUsers();
        } else {
          toast.error(response.data.message || t('schoolSettings:toast.updateUserFailed'));
        }
      } catch (error) {
        toast.error(error.response?.data?.message || t('schoolSettings:toast.updateUserFailed'));
      } finally {
        setSubmittingUser(false);
      }
    },
    [canManageUsers, editingUser?._id, fetchSchoolUsers, t, userFormData.department, userFormData.permissions, userFormData.role]
  );

  const handleCloseUserModal = useCallback(() => {
    setShowUserModal(false);
    setEditingUser(null);
    setUserFormData({ role: '', department: '', permissions: [] });
  }, []);

  const handlePermissionToggle = useCallback((permission) => {
    setUserFormData((prev) => ({
      ...prev,
      permissions: normalizePermissions(prev.permissions).includes(permission)
        ? normalizePermissions(prev.permissions).filter((p) => p !== permission)
        : [...normalizePermissions(prev.permissions), permission]
    }));
  }, []);

  const getDefaultGradingScaleForm = useCallback(() => ({
    name: '',
    description: '',
    isActive: true,
    sortOrder: 100,
    bands: [
      { grade: 'A+', min: 97, max: 100, color: '#14532d' },
      { grade: 'A', min: 93, max: 96, color: '#166534' },
      { grade: 'A-', min: 90, max: 92, color: '#15803d' },
      { grade: 'B+', min: 87, max: 89, color: '#059669' },
      { grade: 'B', min: 83, max: 86, color: '#0d9488' },
      { grade: 'B-', min: 80, max: 82, color: '#0284c7' },
      { grade: 'C+', min: 77, max: 79, color: '#2563eb' },
      { grade: 'C', min: 73, max: 76, color: '#4f46e5' },
      { grade: 'C-', min: 70, max: 72, color: '#7c3aed' },
      { grade: 'D+', min: 67, max: 69, color: '#c2410c' },
      { grade: 'D', min: 50, max: 66, color: '#ea580c' },
      { grade: 'F', min: 0, max: 49, color: '#dc2626' }
    ]
  }), []);

  const openCreateGradingScale = useCallback(() => {
    setEditingGradingScaleId(null);
    setGradingScaleFormData(getDefaultGradingScaleForm());
    setShowGradingScaleForm(true);
  }, [getDefaultGradingScaleForm]);

  const openEditGradingScale = useCallback((scale) => {
    if (!scale) return;
    setEditingGradingScaleId(scale.id);
    setGradingScaleFormData({
      name: scale.name || '',
      description: scale.description || '',
      isActive: scale.isActive !== false,
      sortOrder: Number.isFinite(Number(scale.sortOrder)) ? Number(scale.sortOrder) : 100,
      bands: Array.isArray(scale.bands) && scale.bands.length
        ? scale.bands.map((band) => ({
          grade: band.grade || '',
          min: Number.isFinite(Number(band.min)) ? Number(band.min) : 0,
          max: Number.isFinite(Number(band.max)) ? Number(band.max) : 100,
          color: band.color || '#64748b'
        }))
        : getDefaultGradingScaleForm().bands
    });
    setShowGradingScaleForm(true);
  }, [getDefaultGradingScaleForm]);

  const closeGradingScaleForm = useCallback(() => {
    setEditingGradingScaleId(null);
    setGradingScaleFormData(getDefaultGradingScaleForm());
    setShowGradingScaleForm(false);
  }, [getDefaultGradingScaleForm]);

  const updateGradingScaleFormField = useCallback((field, value) => {
    setGradingScaleFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateGradingScaleBand = useCallback((index, field, value) => {
    setGradingScaleFormData((prev) => ({
      ...prev,
      bands: (prev.bands || []).map((band, bandIndex) => {
        if (bandIndex !== index) return band;
        return {
          ...band,
          [field]: field === 'min' || field === 'max' ? Number(value) : value
        };
      })
    }));
  }, []);

  const addGradingScaleBand = useCallback(() => {
    setGradingScaleFormData((prev) => ({
      ...prev,
      bands: [...(prev.bands || []), { grade: '', min: 0, max: 0, color: '#64748b' }]
    }));
  }, []);

  const removeGradingScaleBand = useCallback((index) => {
    setGradingScaleFormData((prev) => ({
      ...prev,
      bands: (prev.bands || []).filter((_, bandIndex) => bandIndex !== index)
    }));
  }, []);

  const handleSaveGradingScale = useCallback(async (event) => {
    event.preventDefault();
    if (!canManageGradeScaling) {
      toast.error(t('schoolSettings:toast.noPermissionManageGradingScales'));
      return;
    }

    const payload = {
      name: String(gradingScaleFormData.name || '').trim(),
      description: String(gradingScaleFormData.description || '').trim(),
      isActive: gradingScaleFormData.isActive !== false,
      sortOrder: Number.isFinite(Number(gradingScaleFormData.sortOrder))
        ? Number(gradingScaleFormData.sortOrder)
        : 100,
      bands: (gradingScaleFormData.bands || []).map((band) => ({
        grade: String(band.grade || '').trim().toUpperCase(),
        min: Number(band.min),
        max: Number(band.max),
        color: String(band.color || '').trim()
      }))
    };

    if (!payload.name) {
      toast.error(t('schoolSettings:toast.scaleNameRequired'));
      return;
    }
    if (!Array.isArray(payload.bands) || payload.bands.length === 0) {
      toast.error(t('schoolSettings:toast.gradingBandRequired'));
      return;
    }

    setGradingScaleSubmitting(true);
    try {
      const response = editingGradingScaleId
        ? await api.put(`/grading-scales/${editingGradingScaleId}`, payload)
        : await api.post('/grading-scales', payload);

      if (response.data?.success) {
        toast.success(editingGradingScaleId ? t('schoolSettings:toast.gradingScaleUpdated') : t('schoolSettings:toast.gradingScaleCreated'));
        closeGradingScaleForm();
        fetchGradingScales();
      } else {
        toast.error(response.data?.message || t('schoolSettings:toast.saveGradingScaleFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.saveGradingScaleFailed'));
    } finally {
      setGradingScaleSubmitting(false);
    }
  }, [
    canManageGradeScaling,
    closeGradingScaleForm,
    editingGradingScaleId,
    fetchGradingScales,
    gradingScaleFormData.bands,
    gradingScaleFormData.description,
    gradingScaleFormData.isActive,
    gradingScaleFormData.name,
    gradingScaleFormData.sortOrder,
    t
  ]);

  const handleSetDefaultGradingScale = useCallback(async (scaleId) => {
    if (!canManageGradeScaling) return;
    try {
      const response = await api.patch(`/grading-scales/${scaleId}/default`);
      if (response.data?.success) {
        toast.success(t('schoolSettings:toast.defaultGradingScaleUpdated'));
        fetchGradingScales();
      } else {
        toast.error(response.data?.message || t('schoolSettings:toast.setDefaultGradingScaleFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.setDefaultGradingScaleFailed'));
    }
  }, [canManageGradeScaling, fetchGradingScales, t]);

  const handleDeleteGradingScale = useCallback(async (scale) => {
    if (!canManageGradeScaling || !scale?.id) return;
    if (!window.confirm(t('schoolSettings:confirm.deleteGradingScale', { name: scale.name }))) return;

    try {
      const response = await api.delete(`/grading-scales/${scale.id}`);
      if (response.data?.success) {
        toast.success(t('schoolSettings:toast.gradingScaleDeleted'));
        fetchGradingScales();
      } else {
        toast.error(response.data?.message || t('schoolSettings:toast.deleteGradingScaleFailed'));
      }
    } catch (error) {
      toast.error(error.response?.data?.message || t('schoolSettings:toast.deleteGradingScaleFailed'));
    }
  }, [canManageGradeScaling, fetchGradingScales, t]);

  const departmentModalState = useMemo(() => ({
    open: showDeptModal,
    editingDeptId,
    deptFormData,
    submittingDept
  }), [showDeptModal, editingDeptId, deptFormData, submittingDept]);

  const userModalState = useMemo(() => ({
    open: showUserModal,
    editingUser,
    userFormData,
    submittingUser
  }), [showUserModal, editingUser, userFormData, submittingUser]);

  const weekendDays = useMemo(
    () => ALL_WEEK_DAYS.filter((day) => !weekWorkingDays.includes(day)),
    [weekWorkingDays]
  );

  return {
    user,
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
    reloadDepartments: () => dispatch(fetchDepartments()),
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
    fetchGradingScales,
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
  };
};

export default useSchoolSettings;
