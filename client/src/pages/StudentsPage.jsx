import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchStudents, selectStudents, selectStudentsLoading, createStudent, updateStudent, deleteStudent, importStudents, createStudentLogin, bulkCreateStudentLogin, resetStudentPassword } from '../store/slices/studentSlice';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { fetchDepartments, selectDepartments } from '../store/slices/departmentSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { selectIsAdmin } from '../store/slices/authSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash, HiOutlineUpload, HiOutlineDownload, HiOutlineExclamationCircle, HiOutlineCheckCircle, HiOutlineKey, HiOutlineUserAdd, HiOutlineClipboardCopy } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './StudentsPage.css';

const StudentsPage = () => {
    const dispatch = useDispatch();
    const [searchParams, setSearchParams] = useSearchParams();
    const searchFromUrl = searchParams.get('search') || '';
    const students = useSelector(selectStudents);
    const classes = useSelector(selectClasses);
    const departments = useSelector(selectDepartments);
    const loading = useSelector(selectStudentsLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = useSelector(selectIsAdmin);

    const [searchTerm, setSearchTerm] = useState(searchFromUrl);
    const [filterClass, setFilterClass] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingStudentId, setEditingStudentId] = useState(null);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        studentId: '',
        email: '',
        dateOfBirth: '',
        gender: '',
        currentClass: '',
        department: '',
        academicYear: '2025-2026',
        parentInfo: {
            fatherName: '',
            fatherPhone: '',
            fatherEmail: '',
            motherName: '',
            motherPhone: '',
            motherEmail: '',
            primaryContact: 'father'
        },
        address: {
            street: '',
            city: '',
            state: '',
            zipCode: '',
            country: 'South Africa'
        }
    });

    // Credentials modal state
    const [showCredentials, setShowCredentials] = useState(false);
    const [credentials, setCredentials] = useState(null); // { email, tempPassword, studentName }
    const [loginEmail, setLoginEmail] = useState('');
    const [showLoginEmailPrompt, setShowLoginEmailPrompt] = useState(false);
    const [loginTargetStudent, setLoginTargetStudent] = useState(null);

    // Bulk login state
    const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
    const [showBulkCredentials, setShowBulkCredentials] = useState(false);
    const [bulkCredentials, setBulkCredentials] = useState(null); // { created: [], errors: [] }
    const [bulkLoginLoading, setBulkLoginLoading] = useState(false);

    // CSV Import state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importClassId, setImportClassId] = useState('');
    const [csvData, setCsvData] = useState([]);
    const [csvErrors, setCsvErrors] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);

    useEffect(() => {
        setSearchTerm(searchFromUrl);
    }, [searchFromUrl]);

    useEffect(() => {
        dispatch(fetchStudents({ search: searchFromUrl || undefined }));
        dispatch(fetchClasses());
        dispatch(fetchDepartments());
    }, [dispatch, searchFromUrl]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        let result;
        
        const payload = { ...formData, department: formData.department || null };
        if (isEditing) {
            result = await dispatch(updateStudent({ id: editingStudentId, data: payload }));
        } else {
            result = await dispatch(createStudent(payload));
        }
        
        if ((isEditing ? updateStudent : createStudent).fulfilled.match(result)) {
            toast.success(isEditing ? 'Student updated successfully!' : 'Student created successfully!');
            setShowModal(false);
            resetForm();
        } else {
            toast.error(result.payload || `Failed to ${isEditing ? 'update' : 'create'} student`);
        }
    };

    const handleEdit = (student) => {
        setIsEditing(true);
        setEditingStudentId(student._id);
        setFormData({
            firstName: student.firstName || '',
            lastName: student.lastName || '',
            studentId: student.studentId || '',
            email: student.email || '',
            dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
            gender: student.gender || '',
            currentClass: student.currentClass?._id || '',
            department: student.department?._id || student.department || '',
            academicYear: student.academicYear || '2025-2026',
            parentInfo: {
                fatherName: student.parentInfo?.fatherName || '',
                fatherPhone: student.parentInfo?.fatherPhone || '',
                fatherEmail: student.parentInfo?.fatherEmail || '',
                motherName: student.parentInfo?.motherName || '',
                motherPhone: student.parentInfo?.motherPhone || '',
                motherEmail: student.parentInfo?.motherEmail || '',
                primaryContact: student.parentInfo?.primaryContact || 'father'
            },
            address: {
                street: student.address?.street || '',
                city: student.address?.city || '',
                state: student.address?.state || '',
                zipCode: student.address?.zipCode || '',
                country: student.address?.country || 'South Africa'
            }
        });
        setShowModal(true);
    };

    const resetForm = () => {
        setIsEditing(false);
        setEditingStudentId(null);
        setFormData({
            firstName: '',
            lastName: '',
            studentId: '',
            email: '',
            dateOfBirth: '',
            gender: '',
            currentClass: '',
            department: '',
            academicYear: '2025-2026',
            parentInfo: {
                fatherName: '',
                fatherPhone: '',
                fatherEmail: '',
                motherName: '',
                motherPhone: '',
                motherEmail: '',
                primaryContact: 'father'
            },
            address: {
                street: '',
                city: '',
                state: '',
                zipCode: '',
                country: 'South Africa'
            }
        });
    };

    // ── Student Login Management ──────────────────────────────
    const handleCreateLogin = (student) => {
        const email = student.email || student.studentEmail || '';
        if (!email) {
            // Need to ask admin for an email
            setLoginTargetStudent(student);
            setLoginEmail('');
            setShowLoginEmailPrompt(true);
            return;
        }
        doCreateLogin(student, email);
    };

    const doCreateLogin = async (student, email) => {
        setShowLoginEmailPrompt(false);
        const result = await dispatch(createStudentLogin({ studentId: student._id, email }));
        if (createStudentLogin.fulfilled.match(result)) {
            setCredentials({
                email: result.payload.data.email,
                tempPassword: result.payload.data.tempPassword,
                studentName: `${student.firstName} ${student.lastName}`
            });
            setShowCredentials(true);
            dispatch(fetchStudents()); // refresh list to show linked user
            toast.success('Login account created!');
        } else {
            toast.error(result.payload || 'Failed to create login');
        }
    };

    const handleResetPassword = async (student) => {
        if (!window.confirm(`Reset password for ${student.firstName} ${student.lastName}?`)) return;
        const result = await dispatch(resetStudentPassword(student._id));
        if (resetStudentPassword.fulfilled.match(result)) {
            setCredentials({
                email: result.payload.data.email,
                tempPassword: result.payload.data.tempPassword,
                studentName: `${student.firstName} ${student.lastName}`
            });
            setShowCredentials(true);
            toast.success('Password reset successfully!');
        } else {
            toast.error(result.payload || 'Failed to reset password');
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success('Copied to clipboard!');
        }).catch(() => {
            toast.error('Failed to copy');
        });
    };

    // ── Bulk login (admin only) ───────────────────────────────
    const toggleSelectStudent = (id, hasLogin) => {
        if (hasLogin) return;
        setSelectedStudentIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAllWithoutLogin = (studentsWithoutLogin, isAllSelected) => {
        if (isAllSelected) {
            setSelectedStudentIds(prev => {
                const next = new Set(prev);
                studentsWithoutLogin.forEach(s => next.delete(s._id));
                return next;
            });
        } else {
            setSelectedStudentIds(prev => {
                const next = new Set(prev);
                studentsWithoutLogin.forEach(s => next.add(s._id));
                return next;
            });
        }
    };

    const handleBulkCreateLogin = async () => {
        const ids = Array.from(selectedStudentIds);
        if (ids.length === 0) return;
        setBulkLoginLoading(true);
        const result = await dispatch(bulkCreateStudentLogin(ids));
        setBulkLoginLoading(false);
        if (bulkCreateStudentLogin.fulfilled.match(result)) {
            setBulkCredentials(result.payload.data);
            setShowBulkCredentials(true);
            setSelectedStudentIds(new Set());
            dispatch(fetchStudents());
            toast.success(result.payload.message || 'Logins created');
        } else {
            toast.error(result.payload || 'Failed to create logins');
        }
    };

    const downloadBulkCredentialsCSV = () => {
        if (!bulkCredentials?.created?.length) return;
        const header = 'Student Name,Email,Password';
        const rows = bulkCredentials.created.map(c =>
            [c.name, c.email, c.tempPassword].map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')
        );
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'student_login_credentials.csv';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV downloaded');
    };

    const copyAllBulkCredentials = () => {
        if (!bulkCredentials?.created?.length) return;
        const block = bulkCredentials.created
            .map(c => `${c.name}\t${c.email}\t${c.tempPassword}`)
            .join('\n');
        copyToClipboard(block);
    };

    // CSV Import functions
    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            setCsvErrors(['CSV must have a header row and at least one data row']);
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const requiredHeaders = ['firstName', 'lastName', 'dateOfBirth', 'gender'];
        const missing = requiredHeaders.filter(h => !headers.includes(h));
        if (missing.length > 0) {
            setCsvErrors([`Missing required columns: ${missing.join(', ')}`]);
            return;
        }

        const rows = [];
        const parseErrors = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length !== headers.length) {
                parseErrors.push(`Row ${i}: Expected ${headers.length} columns, got ${values.length}`);
                continue;
            }
            const row = {};
            headers.forEach((h, idx) => { row[h] = values[idx]; });
            rows.push(row);
        }

        setCsvData(rows);
        setCsvErrors(parseErrors);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            setCsvErrors(['Please select a .csv file']);
            return;
        }

        setImportResult(null);
        const reader = new FileReader();
        reader.onload = (evt) => parseCSV(evt.target.result);
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!importClassId) {
            toast.error('Please select a class');
            return;
        }
        if (csvData.length === 0) {
            toast.error('No valid data to import');
            return;
        }

        setImporting(true);
        const result = await dispatch(importStudents({ students: csvData, classId: importClassId }));

        if (importStudents.fulfilled.match(result)) {
            setImportResult(result.payload);
            if (result.payload.data.imported > 0) {
                toast.success(result.payload.message);
                dispatch(fetchStudents());
            }
            if (result.payload.data.failed > 0) {
                toast.error(`${result.payload.data.failed} rows failed`);
            }
        } else {
            toast.error(result.payload?.message || 'Import failed');
        }
        setImporting(false);
    };

    const downloadTemplate = () => {
        const headers = 'firstName,lastName,dateOfBirth,gender,email,studentId,fatherName,fatherPhone,fatherEmail,motherName,motherPhone,motherEmail';
        const example = 'John,Doe,2010-03-15,male,,,Ahmed Doe,0812345678,,Fatima Doe,0823456789,';
        const blob = new Blob([headers + '\n' + example], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'students_import_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const resetImportModal = () => {
        setShowImportModal(false);
        setImportClassId('');
        setCsvData([]);
        setCsvErrors([]);
        setImportResult(null);
    };

    const filteredStudents = students.filter(student => {
        const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
        const matchesSearch = fullName.includes(searchTerm.toLowerCase()) ||
            student.studentId?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesClass = filterClass === '' || 
            (filterClass === 'unassigned' && !student.currentClass) ||
            student.currentClass?._id === filterClass;
        
        return matchesSearch && matchesClass;
    });

    const studentsWithoutLogin = filteredStudents.filter(s => !s.user);
    const isAllWithoutLoginSelected = studentsWithoutLogin.length > 0 &&
        studentsWithoutLogin.every(s => selectedStudentIds.has(s._id));

    return (
        <div className="students-page">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1>Students</h1>
                    <p className="text-muted">Manage student records and view performance</p>
                </div>
                {isAdmin && (
                    <div className="header-actions">
                        <button
                            className="btn btn-outline"
                            onClick={handleBulkCreateLogin}
                            disabled={selectedStudentIds.size === 0 || bulkLoginLoading}
                            title={selectedStudentIds.size === 0 ? 'Select students without a login first' : ''}
                        >
                            <HiOutlineUserAdd size={20} />
                            Create logins for selected ({selectedStudentIds.size})
                        </button>
                        <button className="btn btn-outline" onClick={() => setShowImportModal(true)}>
                            <HiOutlineUpload size={20} />
                            Import CSV
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <HiOutlinePlus size={20} />
                            Add Student
                        </button>
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-bar">
                    <HiOutlineSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search students..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
                    <option value="">All Classes</option>
                    <option value="unassigned">Unassigned Students</option>
                    {classes.map(cls => (
                        <option key={cls._id} value={cls._id}>{cls.name}</option>
                    ))}
                </select>
            </div>

            {/* Students Table */}
            {loading ? (
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            ) : (
                <div className="card">
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    {isAdmin && (
                                        <th className="th-checkbox">
                                            {studentsWithoutLogin.length > 0 && (
                                                <input
                                                    type="checkbox"
                                                    checked={isAllWithoutLoginSelected}
                                                    onChange={() => toggleSelectAllWithoutLogin(studentsWithoutLogin, isAllWithoutLoginSelected)}
                                                    title="Select all without login"
                                                />
                                            )}
                                        </th>
                                    )}
                                    <th>Student</th>
                                    <th>ID</th>
                                    <th>Class</th>
                                    <th>Department</th>
                                    <th>Gender</th>
                                    <th>Status</th>
                                    {isAdmin && <th>Login</th>}
                                    {isAdmin && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map(student => (
                                    <tr key={student._id}>
                                        {isAdmin && (
                                            <td className="td-checkbox">
                                                {student.user ? (
                                                    <span className="checkbox-placeholder" title="Has login">—</span>
                                                ) : (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedStudentIds.has(student._id)}
                                                        onChange={() => toggleSelectStudent(student._id, !!student.user)}
                                                        title="Select for bulk login"
                                                    />
                                                )}
                                            </td>
                                        )}
                                        <td>
                                            <div className="student-cell">
                                                <div className="avatar-sm">
                                                    {student.firstName?.charAt(0)}{student.lastName?.charAt(0)}
                                                </div>
                                                <div>
                                                    <span className="student-name">{student.firstName} {student.lastName}</span>
                                                    <span className="student-email">{student.email || student.parentInfo?.fatherEmail || 'No email'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-muted font-mono">{student.studentId}</td>
                                        <td>{student.currentClass?.name || 'Unassigned'}</td>
                                        <td>{student.department?.name ?? '—'}</td>
                                        <td className="text-capitalize">{student.gender}</td>
                                        <td>
                                            <span className={`badge badge-${student.status === 'active' ? 'success' : 'warning'}`}>
                                                {student.status}
                                            </span>
                                        </td>
                                        {isAdmin && (
                                            <td>
                                                {student.user ? (
                                                    <div className="login-status">
                                                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Has Login</span>
                                                        <button
                                                            className="btn-icon"
                                                            onClick={() => handleResetPassword(student)}
                                                            title="Reset password"
                                                        >
                                                            <HiOutlineKey size={16} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        className="btn btn-xs btn-outline"
                                                        onClick={() => handleCreateLogin(student)}
                                                        title="Create login account"
                                                    >
                                                        <HiOutlineUserAdd size={14} />
                                                        <span>Create Login</span>
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                        {isAdmin && (
                                            <td>
                                                <div className="student-actions">
                                                    <button 
                                                        className="btn-icon"
                                                        onClick={() => handleEdit(student)}
                                                        title="Edit student"
                                                    >
                                                        <HiOutlinePencil size={16} />
                                                    </button>
                                                    <button 
                                                        className="btn-icon text-danger"
                                                        onClick={() => {
                                                            if (window.confirm(`Delete ${student.firstName} ${student.lastName}?`)) {
                                                                dispatch(deleteStudent(student._id)).then(result => {
                                                                    if (deleteStudent.fulfilled.match(result)) {
                                                                        toast.success('Student deleted');
                                                                    } else {
                                                                        toast.error(result.payload || 'Failed to delete');
                                                                    }
                                                                });
                                                            }
                                                        }}
                                                        title="Delete student"
                                                    >
                                                        <HiOutlineTrash size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {filteredStudents.length === 0 && (
                                    <tr>
                                        <td colSpan={isAdmin ? 8 : 5} className="empty-row">
                                            No students found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{isEditing ? 'Edit Student' : 'Add New Student'}</h3>
                            <button className="modal-close" onClick={() => { setShowModal(false); resetForm(); }}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <h4 className="section-title">Student Information</h4>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>First Name *</label>
                                        <input
                                            type="text"
                                            value={formData.firstName}
                                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Last Name *</label>
                                        <input
                                            type="text"
                                            value={formData.lastName}
                                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Student ID *</label>
                                        <input
                                            type="text"
                                            value={formData.studentId}
                                            onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Date of Birth *</label>
                                        <input
                                            type="date"
                                            value={formData.dateOfBirth}
                                            onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Gender *</label>
                                        <select
                                            value={formData.gender}
                                            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Gender *</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Assign to Class</label>
                                        <select
                                            value={formData.currentClass}
                                            onChange={(e) => setFormData({ ...formData, currentClass: e.target.value })}
                                        >
                                            <option value="">Select Class</option>
                                            {classes.map(cls => (
                                                <option key={cls._id} value={cls._id}>{cls.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Department</label>
                                        <select
                                            value={formData.department}
                                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        >
                                            <option value="">— No department —</option>
                                            {departments.map((d) => (
                                                <option key={d._id} value={d._id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <h4 className="section-title mt-lg">Parent/Guardian Information</h4>
                                
                                <div className="form-group">
                                    <label>Mother's Name</label>
                                    <input
                                        type="text"
                                        value={formData.parentInfo.motherName}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            parentInfo: { ...formData.parentInfo, motherName: e.target.value }
                                        })}
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Mother's Phone</label>
                                        <input
                                            type="tel"
                                            value={formData.parentInfo.motherPhone}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                parentInfo: { ...formData.parentInfo, motherPhone: e.target.value }
                                            })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Mother's Email</label>
                                        <input
                                            type="email"
                                            value={formData.parentInfo.motherEmail}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                parentInfo: { ...formData.parentInfo, motherEmail: e.target.value }
                                            })}
                                        />
                                    </div>
                                </div>
                                
                                <div className="form-group">
                                    <label>Father's Name</label>
                                    <input
                                        type="text"
                                        value={formData.parentInfo.fatherName}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            parentInfo: { ...formData.parentInfo, fatherName: e.target.value }
                                        })}
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Phone</label>
                                        <input
                                            type="tel"
                                            value={formData.parentInfo.fatherPhone}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                parentInfo: { ...formData.parentInfo, fatherPhone: e.target.value }
                                            })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input
                                            type="email"
                                            value={formData.parentInfo.fatherEmail}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                parentInfo: { ...formData.parentInfo, fatherEmail: e.target.value }
                                            })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {isEditing ? 'Update Student' : 'Add Student'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* CSV Import Modal */}
            {showImportModal && (
                <div className="modal-overlay" onClick={resetImportModal}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Import Students from CSV</h3>
                            <button className="modal-close" onClick={resetImportModal}>&times;</button>
                        </div>
                        <div className="modal-body">
                            {/* Step 1: Select class */}
                            <div className="form-group">
                                <label>Assign to Class *</label>
                                <select
                                    value={importClassId}
                                    onChange={(e) => setImportClassId(e.target.value)}
                                    required
                                >
                                    <option value="">Select Class</option>
                                    {classes.map(cls => (
                                        <option key={cls._id} value={cls._id}>{cls.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Step 2: Upload CSV */}
                            <div className="form-group">
                                <label>CSV File *</label>
                                <div className="csv-upload-area">
                                    <input
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileSelect}
                                        id="csv-file-input"
                                        className="csv-file-input"
                                    />
                                    <label htmlFor="csv-file-input" className="csv-upload-label">
                                        <HiOutlineUpload size={24} />
                                        <span>Click to select CSV file</span>
                                    </label>
                                </div>
                                <button type="button" className="btn btn-sm btn-ghost mt-sm" onClick={downloadTemplate}>
                                    <HiOutlineDownload size={16} />
                                    Download Template
                                </button>
                            </div>

                            {/* Parse errors */}
                            {csvErrors.length > 0 && (
                                <div className="import-errors">
                                    <h4><HiOutlineExclamationCircle /> Parse Errors</h4>
                                    <ul>
                                        {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
                                    </ul>
                                </div>
                            )}

                            {/* Preview */}
                            {csvData.length > 0 && !importResult && (
                                <div className="csv-preview">
                                    <h4>{csvData.length} student{csvData.length !== 1 ? 's' : ''} ready to import</h4>
                                    <div className="table-container" style={{ maxHeight: '250px', overflow: 'auto' }}>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>First Name</th>
                                                    <th>Last Name</th>
                                                    <th>DOB</th>
                                                    <th>Gender</th>
                                                    <th>Email</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {csvData.slice(0, 50).map((row, i) => (
                                                    <tr key={i}>
                                                        <td>{i + 1}</td>
                                                        <td>{row.firstName}</td>
                                                        <td>{row.lastName}</td>
                                                        <td>{row.dateOfBirth}</td>
                                                        <td>{row.gender}</td>
                                                        <td>{row.email || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {csvData.length > 50 && (
                                            <p className="text-muted text-sm mt-sm">Showing first 50 of {csvData.length} rows</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Import result */}
                            {importResult && (
                                <div className="import-result">
                                    <div className={`import-result-summary ${importResult.data.failed === 0 ? 'success' : 'partial'}`}>
                                        <HiOutlineCheckCircle size={20} />
                                        <span>{importResult.message}</span>
                                    </div>
                                    {importResult.data.errors && (
                                        <div className="import-errors mt-sm">
                                            <h4>Failed Rows</h4>
                                            <ul>
                                                {importResult.data.errors.map((err, i) => (
                                                    <li key={i}>Row {err.row}: {err.message}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={resetImportModal}>
                                {importResult ? 'Close' : 'Cancel'}
                            </button>
                            {!importResult && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleImport}
                                    disabled={importing || csvData.length === 0 || !importClassId}
                                >
                                    {importing ? 'Importing...' : `Import ${csvData.length} Student${csvData.length !== 1 ? 's' : ''}`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* ── Credentials Modal (shown once after create-login / reset-password) ── */}
            {showCredentials && credentials && (
                <div className="modal-overlay" onClick={() => setShowCredentials(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <h3>Student Login Credentials</h3>
                            <button className="modal-close" onClick={() => setShowCredentials(false)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="credentials-card">
                                <p className="credentials-warning">
                                    <HiOutlineExclamationCircle size={18} />
                                    <strong>Copy these credentials now!</strong> The password cannot be viewed again.
                                </p>
                                <div className="credentials-row">
                                    <label>Student</label>
                                    <span>{credentials.studentName}</span>
                                </div>
                                <div className="credentials-row">
                                    <label>Email</label>
                                    <div className="credentials-value">
                                        <code>{credentials.email}</code>
                                        <button className="btn-icon" onClick={() => copyToClipboard(credentials.email)} title="Copy email">
                                            <HiOutlineClipboardCopy size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="credentials-row">
                                    <label>Password</label>
                                    <div className="credentials-value">
                                        <code className="password-display">{credentials.tempPassword}</code>
                                        <button className="btn-icon" onClick={() => copyToClipboard(credentials.tempPassword)} title="Copy password">
                                            <HiOutlineClipboardCopy size={16} />
                                        </button>
                                    </div>
                                </div>
                                <button
                                    className="btn btn-outline btn-sm mt-md"
                                    onClick={() => {
                                        const text = `Student: ${credentials.studentName}\nEmail: ${credentials.email}\nPassword: ${credentials.tempPassword}`;
                                        copyToClipboard(text);
                                    }}
                                >
                                    <HiOutlineClipboardCopy size={16} />
                                    Copy All
                                </button>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={() => setShowCredentials(false)}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bulk credentials modal ── */}
            {showBulkCredentials && bulkCredentials && (
                <div className="modal-overlay" onClick={() => { setShowBulkCredentials(false); setBulkCredentials(null); }}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <div className="modal-header">
                            <h3>Bulk Login Credentials</h3>
                            <button className="modal-close" onClick={() => { setShowBulkCredentials(false); setBulkCredentials(null); }}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="credentials-card">
                                <p className="credentials-warning">
                                    <HiOutlineExclamationCircle size={18} />
                                    <strong>Copy or download these credentials now!</strong> Passwords cannot be viewed again.
                                </p>
                                {bulkCredentials.created?.length > 0 && (
                                    <>
                                        <div className="table-container" style={{ maxHeight: 280, overflow: 'auto', marginBottom: '1rem' }}>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Student Name</th>
                                                        <th>Email</th>
                                                        <th>Password</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bulkCredentials.created.map((c, i) => (
                                                        <tr key={c.studentId || i}>
                                                            <td>{c.name}</td>
                                                            <td><code className="font-mono text-sm">{c.email}</code></td>
                                                            <td><code className="password-display font-mono text-sm">{c.tempPassword}</code></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="bulk-credentials-actions">
                                            <button type="button" className="btn btn-outline btn-sm" onClick={downloadBulkCredentialsCSV}>
                                                <HiOutlineDownload size={16} />
                                                Download CSV
                                            </button>
                                            <button type="button" className="btn btn-outline btn-sm" onClick={copyAllBulkCredentials}>
                                                <HiOutlineClipboardCopy size={16} />
                                                Copy All
                                            </button>
                                        </div>
                                    </>
                                )}
                                {bulkCredentials.errors?.length > 0 && (
                                    <div className="import-errors mt-md">
                                        <h4><HiOutlineExclamationCircle /> Issues</h4>
                                        <ul>
                                            {bulkCredentials.errors.map((err, i) => (
                                                <li key={i}>
                                                    {err.name ? `${err.name}: ` : ''}{err.error}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={() => { setShowBulkCredentials(false); setBulkCredentials(null); }}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Email Prompt Modal (when student has no email) ── */}
            {showLoginEmailPrompt && loginTargetStudent && (
                <div className="modal-overlay" onClick={() => setShowLoginEmailPrompt(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3>Enter Email for Login</h3>
                            <button className="modal-close" onClick={() => setShowLoginEmailPrompt(false)}>&times;</button>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); doCreateLogin(loginTargetStudent, loginEmail); }}>
                            <div className="modal-body">
                                <p className="text-muted">
                                    <strong>{loginTargetStudent.firstName} {loginTargetStudent.lastName}</strong> doesn't have an email on file. Enter one to create their login account.
                                </p>
                                <div className="form-group">
                                    <label>Email Address *</label>
                                    <input
                                        type="email"
                                        value={loginEmail}
                                        onChange={(e) => setLoginEmail(e.target.value)}
                                        placeholder="student@example.com"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowLoginEmailPrompt(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={!loginEmail}>
                                    Create Login
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentsPage;
