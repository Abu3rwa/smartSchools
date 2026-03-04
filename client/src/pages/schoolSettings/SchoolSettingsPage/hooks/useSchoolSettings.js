import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
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
import { isConsecutiveAcademicYear, isValidAcademicYear, normalizePermissions } from '../utils/schoolSettingsUtils';

const useSchoolSettings = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const userPermissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const canManageUsers = user?.role === 'admin' || userPermissions.includes(PERMISSIONS.MANAGE_USERS);
  const canManageSchoolSettings =
    user?.role === 'admin' || userPermissions.includes(PERMISSIONS.MANAGE_SCHOOL_SETTINGS);
  const canAccessSchoolSettings = canManageUsers || canManageSchoolSettings;

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
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [brandingLoading, setBrandingLoading] = useState(false);

  useEffect(() => {
    if (!canAccessSchoolSettings) {
      navigate('/portal/dashboard');
      return;
    }
    dispatch(fetchDepartments());
  }, [canAccessSchoolSettings, dispatch, navigate]);

  const fetchSchoolUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await api.get('/schools/me/users');
      if (response.data.success) {
        setUsers(response.data.data.users);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

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
      toast.error(error.response?.data?.message || 'Failed to load school profile');
    }
  }, []);

  useEffect(() => {
    if (canManageSchoolSettings) {
      loadSchoolProfile();
    }
  }, [canManageSchoolSettings, loadSchoolProfile]);

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
        toast.success('School logo updated');
      } else {
        toast.error(response.data?.message || 'Failed to update school logo');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update school logo');
    } finally {
      setBrandingLoading(false);
    }
  }, []);

  const handleRemoveSchoolLogo = useCallback(async () => {
    setBrandingLoading(true);
    try {
      const response = await api.delete('/schools/me/logo');
      if (response.data?.success) {
        setSchoolInfo((prev) => response.data.data?.school || prev);
        toast.success('School logo removed');
      } else {
        toast.error(response.data?.message || 'Failed to remove school logo');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove school logo');
    } finally {
      setBrandingLoading(false);
    }
  }, []);

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
            const [s, e] = last.split('-').map(Number);
            setToYear(`${e}-${e + 1}`);
          }
        }
      }
    } catch (error) {
      toast.error('Failed to load academic years');
    }

    try {
      const res = await api.get('/schools/me/academic-year-dates');
      if (res.data.success && res.data.data) {
        const start = res.data.data.startDate ? new Date(res.data.data.startDate) : null;
        const end = res.data.data.endDate ? new Date(res.data.data.endDate) : null;
        setSchoolYearStartDate(start ? start.toISOString().slice(0, 10) : '');
        setSchoolYearEndDate(end ? end.toISOString().slice(0, 10) : '');
      }
    } catch (error) {
      toast.error('Failed to load school year dates');
    }
  }, [fromYear, toYear]);

  useEffect(() => {
    if (canManageSchoolSettings && activeTab === 'schoolyear') {
      loadAcademicYearData();
    }
  }, [activeTab, canManageSchoolSettings, loadAcademicYearData]);

  const handleCopyClasses = useCallback(async () => {
    if (!fromYear || !toYear) {
      toast.error('Select from and to years');
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
        toast.success(res.data.message);
        setClassesCreated(res.data.data.count);
        setAcademicYears((prev) => (prev.includes(toYear) ? prev : [...prev, toYear].sort()));
      } else {
        toast.error(res.data.message || 'Failed to create classes');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create classes');
    } finally {
      setRolloverLoading(false);
    }
  }, [fromYear, toYear]);

  const handleDeactivateYear = useCallback(async () => {
    if (!fromYear) {
      toast.error('Select the year to deactivate');
      return;
    }
    setRolloverLoading(true);
    setDeactivateCount(null);
    try {
      const res = await api.post('/schools/me/rollover/deactivate-year', { academicYear: fromYear });
      if (res.data.success) {
        toast.success(res.data.message);
        setDeactivateCount(res.data.data.modifiedCount);
      } else {
        toast.error(res.data.message || 'Failed to deactivate');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate');
    } finally {
      setRolloverLoading(false);
    }
  }, [fromYear]);

  const handlePromoteStudents = useCallback(async () => {
    if (!fromYear || !toYear) {
      toast.error('Select from and to years');
      return;
    }
    if (!window.confirm(`Promote students from ${fromYear} to ${toYear}? This will update all active students.`)) {
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
        toast.success(res.data.message);
        setPromoteResult(res.data.data);
      } else {
        toast.error(res.data.message || 'Failed to promote');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to promote');
    } finally {
      setRolloverLoading(false);
    }
  }, [fromYear, toYear]);

  const handleSwitchToNewYear = useCallback(async () => {
    if (!toYear || !isConsecutiveAcademicYear(toYear)) {
      toast.error('Enter a valid academic year like 2026-2027');
      return;
    }

    const result = await dispatch(updateSchoolAcademicYear(toYear));
    if (updateSchoolAcademicYear.fulfilled.match(result)) {
      toast.success(`School academic year set to ${result.payload}`);
      setAcademicYears((prev) => (prev.includes(result.payload) ? prev : [...prev, result.payload].sort()));
    } else {
      toast.error(result.payload || 'Failed to update school academic year');
    }
  }, [dispatch, toYear]);

  const handleSaveSchoolYearDates = useCallback(async () => {
    if (!schoolYearStartDate || !schoolYearEndDate) {
      toast.error('Start and end dates are required');
      return;
    }
    if (schoolYearEndDate < schoolYearStartDate) {
      toast.error('End date must be on or after start date');
      return;
    }

    setSchoolYearDatesSaving(true);
    try {
      const res = await api.put('/schools/me/academic-year-dates', {
        startDate: schoolYearStartDate,
        endDate: schoolYearEndDate
      });
      if (res.data.success) {
        toast.success(res.data.message || 'School year dates updated');
      } else {
        toast.error(res.data.message || 'Failed to update school year dates');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update school year dates');
    } finally {
      setSchoolYearDatesSaving(false);
    }
  }, [schoolYearEndDate, schoolYearStartDate]);

  const handleDeptSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setSubmittingDept(true);
      try {
        const result = editingDeptId
          ? await dispatch(updateDepartment({ id: editingDeptId, data: deptFormData }))
          : await dispatch(createDepartment(deptFormData));
        if (createDepartment.fulfilled.match(result) || updateDepartment.fulfilled.match(result)) {
          toast.success(editingDeptId ? 'Department updated' : 'Department created');
          handleCloseDeptModal();
        } else {
          toast.error(result.payload || 'Failed to save department');
        }
      } finally {
        setSubmittingDept(false);
      }
    },
    [deptFormData, dispatch, editingDeptId]
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
    if (!window.confirm('Are you sure you want to delete this department?')) return;
    const result = await dispatch(deleteDepartment(id));
    if (deleteDepartment.fulfilled.match(result)) {
      toast.success('Department deleted');
    } else {
      toast.error(result.payload || 'Failed to delete department');
    }
  }, [dispatch]);

  const handleCloseDeptModal = useCallback(() => {
    setShowDeptModal(false);
    setEditingDeptId(null);
    setDeptFormData({ name: '', type: 'academic', description: '' });
  }, []);

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
        toast.error('You do not have permission to manage users');
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
          toast.success('User updated');
          setShowUserModal(false);
          setEditingUser(null);
          fetchSchoolUsers();
        } else {
          toast.error(response.data.message || 'Failed to update user');
        }
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to update user');
      } finally {
        setSubmittingUser(false);
      }
    },
    [canManageUsers, editingUser?._id, fetchSchoolUsers, userFormData.department, userFormData.permissions, userFormData.role]
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

  return {
    user,
    canManageUsers,
    canManageSchoolSettings,
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
    schoolInfo,
    brandingLoading,
    handleUploadSchoolLogo,
    handleRemoveSchoolLogo,
    handleCopyClasses,
    handleDeactivateYear,
    handlePromoteStudents,
    handleSwitchToNewYear,
    handleSaveSchoolYearDates,
    navigate
  };
};

export default useSchoolSettings;
