import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import { PERMISSION_DEFINITIONS, PERMISSION_CATEGORIES, getPermissionsByCategory } from '../constants/permissions';
import {
    fetchDepartments,
    selectDepartments,
    selectDepartmentsLoading,
    selectDepartmentsError,
    createDepartment,
    updateDepartment,
    deleteDepartment
} from '../store/slices/departmentSlice';
import { selectIsAdmin } from '../store/slices/authSlice';
import { setCurrentAcademicYear } from '../store/slices/uiSlice';
import {
    HiOutlineOfficeBuilding,
    HiOutlinePlus,
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineUserGroup,
    HiOutlineCalendar,
    HiOutlineDocumentText
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import LessonPlanCriteria from '../components/LessonPlanCriteria';
import './SchoolSettingsPage.css';

const ROLES = [
    { value: 'admin', label: 'Admin', description: 'Full school access' },
    { value: 'staff', label: 'Staff', description: 'School employee (assign specific permissions)' },
    { value: 'teacher', label: 'Teacher', description: 'Teaching staff' },
    { value: 'department_principal', label: 'Department Principal', description: 'Department head' },
    { value: 'parent', label: 'Parent', description: 'Parent/Guardian' },
    { value: 'student', label: 'Student', description: 'Enrolled student' },
    // Legacy staff roles (kept for backward compatibility)
    { value: 'attendance_manager', label: 'Attendance Manager (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'lesson_plan_reviewer', label: 'Lesson Plan Reviewer (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'report_viewer', label: 'Report Viewer (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'event_coordinator', label: 'Event Coordinator (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'behavior_manager', label: 'Behavior Manager (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'transportation_coordinator', label: 'Transportation Coordinator (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'cafeteria_manager', label: 'Cafeteria Manager (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'library_manager', label: 'Library Manager (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'it_support', label: 'IT Support (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'counselor', label: 'Counselor (Legacy)', description: 'Use Staff + Permissions instead' },
    { value: 'nurse', label: 'Nurse (Legacy)', description: 'Use Staff + Permissions instead' }
];

const SchoolSettingsPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const isAdmin = useSelector(selectIsAdmin);
    const departments = useSelector(selectDepartments);
    const departmentsLoading = useSelector(selectDepartmentsLoading);
    const departmentsError = useSelector(selectDepartmentsError);

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

    // School year / rollover
    const [academicYears, setAcademicYears] = useState([]);
    const [fromYear, setFromYear] = useState('');
    const [toYear, setToYear] = useState('');
    const [rolloverLoading, setRolloverLoading] = useState(false);
    const [classesCreated, setClassesCreated] = useState(null);
    const [deactivateCount, setDeactivateCount] = useState(null);
    const [promoteResult, setPromoteResult] = useState(null);
    const currentAcademicYear = useSelector((state) => state.ui.currentAcademicYear);

    useEffect(() => {
        if (!isAdmin) {
            navigate('/portal/dashboard');
            return;
        }
        dispatch(fetchDepartments());
    }, [dispatch, isAdmin, navigate]);

    useEffect(() => {
        if (isAdmin && activeTab === 'users') {
            fetchSchoolUsers();
        }
    }, [isAdmin, activeTab]);

    useEffect(() => {
        if (isAdmin && activeTab === 'schoolyear') {
            api.get('/schools/me/academic-years')
                .then((res) => {
                    if (res.data.success && res.data.data.academicYears) {
                        setAcademicYears(res.data.data.academicYears);
                        if (!fromYear && res.data.data.academicYears.length) setFromYear(res.data.data.academicYears[res.data.data.academicYears.length - 1]);
                        if (!toYear) {
                            const last = res.data.data.academicYears[res.data.data.academicYears.length - 1];
                            if (last) {
                                const [s, e] = last.split('-').map(Number);
                                setToYear(`${e}-${e + 1}`);
                            }
                        }
                    }
                })
                .catch(() => toast.error('Failed to load academic years'));
        }
    }, [isAdmin, activeTab]);

    const handleCopyClasses = async () => {
        if (!fromYear || !toYear) {
            toast.error('Select from and to years');
            return;
        }
        setRolloverLoading(true);
        setClassesCreated(null);
        try {
            const res = await api.post('/schools/me/rollover/classes', { fromAcademicYear: fromYear, toAcademicYear: toYear });
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
    };

    const handleDeactivateYear = async () => {
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
    };

    const handlePromoteStudents = async () => {
        if (!fromYear || !toYear) {
            toast.error('Select from and to years');
            return;
        }
        if (!window.confirm(`Promote students from ${fromYear} to ${toYear}? This will update all active students.`)) return;
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
    };

    const handleSwitchToNewYear = () => {
        if (toYear) {
            dispatch(setCurrentAcademicYear(toYear));
            toast.success(`Switched to ${toYear}`);
        }
    };

    const fetchSchoolUsers = async () => {
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
    };

    const handleDeptSubmit = async (e) => {
        e.preventDefault();
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
    };

    const handleEditDept = (dept) => {
        setEditingDeptId(dept._id);
        setDeptFormData({
            name: dept.name,
            type: dept.type || 'academic',
            description: dept.description || ''
        });
        setShowDeptModal(true);
    };

    const handleDeleteDept = async (id) => {
        if (!window.confirm('Are you sure you want to delete this department?')) return;
        const result = await dispatch(deleteDepartment(id));
        if (deleteDepartment.fulfilled.match(result)) {
            toast.success('Department deleted');
        } else {
            toast.error(result.payload || 'Failed to delete department');
        }
    };

    const handleCloseDeptModal = () => {
        setShowDeptModal(false);
        setEditingDeptId(null);
        setDeptFormData({ name: '', type: 'academic', description: '' });
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setUserFormData({
            role: user.role,
            department: user.department?._id || user.department || '',
            permissions: user.permissions || []
        });
        setShowUserModal(true);
    };

    const handleUserSubmit = async (e) => {
        e.preventDefault();
        setSubmittingUser(true);
        try {
            const response = await api.patch(`/schools/me/users/${editingUser._id}`, {
                role: userFormData.role,
                department: userFormData.department || null,
                permissions: userFormData.permissions
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
    };

    const handleCloseUserModal = () => {
        setShowUserModal(false);
        setEditingUser(null);
        setUserFormData({ role: '', department: '', permissions: [] });
    };
    
    const handlePermissionToggle = (permission) => {
        setUserFormData(prev => ({
            ...prev,
            permissions: prev.permissions.includes(permission)
                ? prev.permissions.filter(p => p !== permission)
                : [...prev.permissions, permission]
        }));
    };

    if (!isAdmin) {
        return null;
    }

    return (
        <div className="school-settings-page">
            <div className="page-header">
                <div>
                    <h1>School Settings</h1>
                    <p className="text-muted">Manage departments and user roles</p>
                </div>
            </div>

            <div className="tabs">
                <button
                    className={`tab-btn ${activeTab === 'departments' ? 'active' : ''}`}
                    onClick={() => setActiveTab('departments')}
                >
                    <HiOutlineOfficeBuilding size={18} />
                    Departments
                </button>
                <button
                    className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    <HiOutlineUserGroup size={18} />
                    Users & roles
                </button>
                <button
                    className={`tab-btn ${activeTab === 'lessonplancriteria' ? 'active' : ''}`}
                    onClick={() => setActiveTab('lessonplancriteria')}
                >
                    <HiOutlineDocumentText size={18} />
                    Lesson Plan Criteria
                </button>
                <button
                    className={`tab-btn ${activeTab === 'schoolyear' ? 'active' : ''}`}
                    onClick={() => setActiveTab('schoolyear')}
                >
                    <HiOutlineCalendar size={18} />
                    School year
                </button>
            </div>

            {activeTab === 'departments' && (
                <div className="tab-content">
                    <div className="tab-header">
                        <span>Create and manage departments (e.g. Middle School, IT, HR).</span>
                        <button className="btn btn-primary" onClick={() => setShowDeptModal(true)}>
                            <HiOutlinePlus size={20} />
                            Add department
                        </button>
                    </div>
                    {departmentsLoading ? (
                        <div className="loading-container">
                            <div className="spinner"></div>
                        </div>
                    ) : departmentsError ? (
                        <div className="error-container">
                            <p className="error-message">{departmentsError}</p>
                            <button className="btn btn-primary" onClick={() => dispatch(fetchDepartments())}>
                                Retry
                            </button>
                        </div>
                    ) : (
                        <div className="departments-list">
                            {departments.map((dept) => (
                                <div key={dept._id} className="department-card card">
                                    <div className="department-main">
                                        <div className="department-icon">
                                            <HiOutlineOfficeBuilding size={22} />
                                        </div>
                                        <div>
                                            <h3>{dept.name}</h3>
                                            <p className="department-desc">{dept.description || '—'}</p>
                                            <span className={`badge badge-${dept.type === 'support' ? 'info' : 'primary'}`}>
                                                {dept.type}
                                            </span>
                                            {!dept.isActive && <span className="badge badge-secondary">Inactive</span>}
                                        </div>
                                    </div>
                                    <div className="department-actions">
                                        <button className="btn-icon" onClick={() => handleEditDept(dept)} title="Edit">
                                            <HiOutlinePencil />
                                        </button>
                                        <button className="btn-icon text-danger" onClick={() => handleDeleteDept(dept._id)} title="Delete">
                                            <HiOutlineTrash />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {departments.length === 0 && (
                                <div className="empty-state">
                                    <HiOutlineOfficeBuilding size={48} />
                                    <p>No departments yet. Add one to get started.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'users' && (
                <div className="tab-content">
                    <div className="tab-header">
                        <span>Assign roles and departments to users. Department optional for Department Principal — if empty, user is whole-school principal.</span>
                    </div>
                    {usersLoading ? (
                        <div className="loading-container">
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <div className="users-table-wrap card">
                            <table className="users-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Department</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user._id}>
                                            <td>{user.firstName} {user.lastName}</td>
                                            <td>{user.email}</td>
                                            <td>
                                                <span className="badge badge-primary">{user.role}</span>
                                            </td>
                                            <td>{user.department?.name ?? '—'}</td>
                                            <td>
                                                <button className="btn btn-sm btn-secondary" onClick={() => handleEditUser(user)}>
                                                    Edit role
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {users.length === 0 && (
                                <div className="empty-state">
                                    <HiOutlineUserGroup size={48} />
                                    <p>No users in this school.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'lessonplancriteria' && (
                <div className="tab-content">
                    <LessonPlanCriteria />
                </div>
            )}

            {activeTab === 'schoolyear' && (
                <div className="tab-content">
                    <div className="tab-header">
                        <span>Set up a new school year: create classes from the previous year, deactivate old classes, and promote students. Then assign teachers and principals for the new year.</span>
                    </div>
                    <div className="rollover-wizard card">
                        <div className="wizard-step">
                            <h4>1. Choose years</h4>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>From (previous year)</label>
                                    <select value={fromYear} onChange={(e) => setFromYear(e.target.value)}>
                                        <option value="">— Select —</option>
                                        {academicYears.map((y) => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>To (new year)</label>
                                    <input
                                        type="text"
                                        value={toYear}
                                        onChange={(e) => setToYear(e.target.value)}
                                        placeholder="e.g. 2026-2027"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="wizard-step">
                            <h4>2. Create classes for new year</h4>
                            <p className="text-muted">Creates classes with the same grade/section structure. Teachers are not copied — assign them after.</p>
                            <button className="btn btn-primary" onClick={handleCopyClasses} disabled={rolloverLoading || !fromYear || !toYear}>
                                {rolloverLoading ? 'Creating...' : 'Create classes from previous year'}
                            </button>
                            {classesCreated !== null && <p className="result-msg">Created {classesCreated} classes.</p>}
                        </div>
                        <div className="wizard-step">
                            <h4>3. Deactivate previous year classes (optional)</h4>
                            <p className="text-muted">Marks all classes for the selected year as inactive. Past data is kept.</p>
                            <button className="btn btn-secondary" onClick={handleDeactivateYear} disabled={rolloverLoading || !fromYear}>
                                {rolloverLoading ? 'Updating...' : `Deactivate all classes for ${fromYear || '…'}`}
                            </button>
                            {deactivateCount !== null && <p className="result-msg">Deactivated {deactivateCount} classes.</p>}
                        </div>
                        <div className="wizard-step">
                            <h4>4. Promote students</h4>
                            <p className="text-muted">Moves active students to the next grade in the new year. Grade 12 students are marked graduated. Enrollment history is preserved.</p>
                            <button className="btn btn-primary" onClick={handlePromoteStudents} disabled={rolloverLoading || !fromYear || !toYear}>
                                {rolloverLoading ? 'Promoting...' : 'Promote students to next grade'}
                            </button>
                            {promoteResult && (
                                <div className="result-msg">
                                    <p>Promoted: {promoteResult.promoted} · Graduated: {promoteResult.graduated} · Skipped: {promoteResult.skipped}</p>
                                    {promoteResult.errors?.length > 0 && (
                                        <details><summary>Errors</summary><ul>{promoteResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></details>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="wizard-step">
                            <h4>5. Switch to new year</h4>
                            <p className="text-muted">Current academic year in the app: <strong>{currentAcademicYear}</strong></p>
                            <button className="btn btn-primary" onClick={handleSwitchToNewYear} disabled={!toYear}>
                                Switch to {toYear || 'new year'}
                            </button>
                        </div>
                        <div className="wizard-step">
                            <h4>6. Assign teachers and principals</h4>
                            <p className="text-muted">Edit the new year&apos;s classes and user roles.</p>
                            <button className="btn btn-secondary" onClick={() => navigate('/portal/classes')}>Edit classes</button>
                            <span style={{ marginLeft: 8 }} />
                            <button className="btn btn-secondary" onClick={() => setActiveTab('users')}>Edit users & roles</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Department Create/Edit Modal */}
            {showDeptModal && (
                <div className="modal-overlay" onClick={handleCloseDeptModal}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingDeptId ? 'Edit department' : 'Add department'}</h3>
                            <button className="modal-close" onClick={handleCloseDeptModal}>&times;</button>
                        </div>
                        <form onSubmit={handleDeptSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Name *</label>
                                    <input
                                        type="text"
                                        value={deptFormData.name}
                                        onChange={(e) => setDeptFormData({ ...deptFormData, name: e.target.value })}
                                        required
                                        placeholder="e.g. Middle School, IT Department"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Type</label>
                                    <select
                                        value={deptFormData.type}
                                        onChange={(e) => setDeptFormData({ ...deptFormData, type: e.target.value })}
                                    >
                                        <option value="academic">Academic</option>
                                        <option value="support">Support</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={deptFormData.description}
                                        onChange={(e) => setDeptFormData({ ...deptFormData, description: e.target.value })}
                                        rows={2}
                                        placeholder="Optional description"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleCloseDeptModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submittingDept}>
                                    {submittingDept ? 'Saving...' : (editingDeptId ? 'Update' : 'Add department')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* User role Edit Modal */}
            {showUserModal && editingUser && (
                <div className="modal-overlay" onClick={handleCloseUserModal}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit role — {editingUser.firstName} {editingUser.lastName}</h3>
                            <button className="modal-close" onClick={handleCloseUserModal}>&times;</button>
                        </div>
                        <form onSubmit={handleUserSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Role</label>
                                    <select
                                        value={userFormData.role}
                                        onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                                    >
                                        {ROLES.map((r) => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Department {userFormData.role === 'department_principal' && '(optional)'}</label>
                                    <select
                                        value={userFormData.department}
                                        onChange={(e) => setUserFormData({ ...userFormData, department: e.target.value })}
                                        disabled={userFormData.role !== 'department_principal'}
                                    >
                                        <option value="">— None (whole-school principal) —</option>
                                        {departments.map((d) => (
                                            <option key={d._id} value={d._id}>{d.name}</option>
                                        ))}
                                    </select>
                                    {userFormData.role === 'department_principal' && (
                                        <span className="form-hint">If empty, user sees all school data (whole-school principal).</span>
                                    )}
                                </div>
                                
                                {/* Permissions Section - Show for staff, teacher, and department_principal roles */}
                                {['staff', 'teacher', 'department_principal'].includes(userFormData.role) && (
                                    <div className="form-group">
                                        <label>Permissions</label>
                                        <p className="form-hint" style={{ marginBottom: '0.5rem' }}>
                                            Select specific permissions for this user. Admins have all permissions by default.
                                        </p>
                                        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-sm)' }}>
                                            {Object.entries(getPermissionsByCategory()).map(([category, perms]) => (
                                                <div key={category} style={{ marginBottom: 'var(--spacing-md)' }}>
                                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                        {PERMISSION_CATEGORIES[category]?.label || category}
                                                    </h4>
                                                    {perms.map((perm) => (
                                                        <label key={perm.key} style={{ display: 'flex', alignItems: 'flex-start', padding: '0.4rem 0', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={userFormData.permissions.includes(perm.key)}
                                                                onChange={() => handlePermissionToggle(perm.key)}
                                                                style={{ marginRight: '0.5rem', marginTop: '0.2rem' }}
                                                            />
                                                            <div>
                                                                <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{perm.label}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{perm.description}</div>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                        {userFormData.permissions.length > 0 && (
                                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {userFormData.permissions.length} permission{userFormData.permissions.length !== 1 ? 's' : ''} selected
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleCloseUserModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submittingUser}>
                                    {submittingUser ? 'Saving...' : 'Update'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchoolSettingsPage;
