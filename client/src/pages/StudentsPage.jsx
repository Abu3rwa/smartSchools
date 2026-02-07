import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchStudents, selectStudents, selectStudentsLoading, createStudent, updateStudent, importStudents } from '../store/slices/studentSlice';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { selectIsAdmin } from '../store/slices/authSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash, HiOutlineUpload, HiOutlineDownload, HiOutlineExclamationCircle, HiOutlineCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './StudentsPage.css';

const StudentsPage = () => {
    const dispatch = useDispatch();
    const students = useSelector(selectStudents);
    const classes = useSelector(selectClasses);
    const loading = useSelector(selectStudentsLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = useSelector(selectIsAdmin);

    const [searchTerm, setSearchTerm] = useState('');
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

    // CSV Import state
    const [showImportModal, setShowImportModal] = useState(false);
    const [importClassId, setImportClassId] = useState('');
    const [csvData, setCsvData] = useState([]);
    const [csvErrors, setCsvErrors] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);

    useEffect(() => {
        dispatch(fetchStudents());
        dispatch(fetchClasses());
    }, [dispatch]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        let result;
        
        if (isEditing) {
            result = await dispatch(updateStudent({ id: editingStudentId, data: formData }));
        } else {
            result = await dispatch(createStudent(formData));
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
                                    <th>Student</th>
                                    <th>ID</th>
                                    <th>Class</th>
                                    <th>Gender</th>
                                    <th>Status</th>
                                    {isAdmin && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map(student => (
                                    <tr key={student._id}>
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
                                        <td className="text-capitalize">{student.gender}</td>
                                        <td>
                                            <span className={`badge badge-${student.status === 'active' ? 'success' : 'warning'}`}>
                                                {student.status}
                                            </span>
                                        </td>
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
                                                                // TODO: Add delete functionality
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
                                        <td colSpan={isAdmin ? 6 : 5} className="empty-row">
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
        </div>
    );
};

export default StudentsPage;
