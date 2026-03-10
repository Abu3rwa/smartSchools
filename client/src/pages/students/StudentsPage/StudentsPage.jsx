import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchStudents, selectStudents, selectStudentsLoading, createStudent, updateStudent, deleteStudent, importStudents, createStudentLogin, bulkCreateStudentLogin, resetStudentPassword, sendParentCredentials } from '../../../store/slices/studentSlice';
import { fetchClasses, selectClasses } from '../../../store/slices/classSlice';
import { fetchDepartments, selectDepartments } from '../../../store/slices/departmentSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectIsAdmin } from '../../../store/slices/authSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash, HiOutlineUpload, HiOutlineDownload, HiOutlineExclamationCircle, HiOutlineCheckCircle, HiOutlineKey, HiOutlineUserAdd, HiOutlineClipboardCopy, HiOutlineMail } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './StudentsPage.css';
import StudentsTable from './components/StudentsTable';
import StudentFormModal from './components/StudentFormModal';
import ImportStudentsModal from './components/ImportStudentsModal';
import {
    CredentialsModal,
    BulkCredentialsModal,
    ParentCredentialsModal,
    EmailPromptModal
} from './components/StudentLoginModals';

const StudentsPage = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation(['students']);
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
        academicYear,
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
    const [sendingParentCredentialsFor, setSendingParentCredentialsFor] = useState(null);
    const [showParentCredentialsResult, setShowParentCredentialsResult] = useState(false);
    const [parentCredentialsResult, setParentCredentialsResult] = useState(null); // { studentName, sent: [], errors: [] }

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
            toast.success(isEditing ? t('students:toast.updated') : t('students:toast.created'));
            setShowModal(false);
            resetForm();
        } else {
            toast.error(result.payload || (isEditing ? t('students:toast.updateFailed') : t('students:toast.createFailed')));
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
            academicYear: student.academicYear || academicYear,
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
            academicYear,
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
            toast.success(t('students:toast.loginCreated'));
        } else {
            toast.error(result.payload || t('students:toast.loginCreateFailed'));
        }
    };

    const handleResetPassword = async (student) => {
        if (!window.confirm(t('students:confirm.resetPassword', { name: `${student.firstName} ${student.lastName}` }))) return;
        const result = await dispatch(resetStudentPassword(student._id));
        if (resetStudentPassword.fulfilled.match(result)) {
            setCredentials({
                email: result.payload.data.email,
                tempPassword: result.payload.data.tempPassword,
                studentName: `${student.firstName} ${student.lastName}`
            });
            setShowCredentials(true);
            toast.success(t('students:toast.passwordReset'));
        } else {
            toast.error(result.payload || t('students:toast.passwordResetFailed'));
        }
    };

    const handleSendParentCredentials = async (student) => {
        const parentEmailCount = [
            student.parentInfo?.fatherEmail,
            student.parentInfo?.motherEmail,
            student.parentInfo?.guardianEmail
        ].filter(Boolean).length;

        if (parentEmailCount === 0) {
            toast.error(t('students:toast.noParentEmail'));
            return;
        }

        const confirmed = window.confirm(
            t('students:confirm.sendParentCredentials', {
                count: parentEmailCount,
                name: `${student.firstName} ${student.lastName}`
            })
        );
        if (!confirmed) return;

        setSendingParentCredentialsFor(student._id);
        const result = await dispatch(sendParentCredentials(student._id));
        setSendingParentCredentialsFor(null);

        if (sendParentCredentials.fulfilled.match(result)) {
            setParentCredentialsResult(result.payload.data);
            setShowParentCredentialsResult(true);
            toast.success(result.payload.message || t('students:toast.parentCredentialsSent'));
        } else {
            toast.error(result.payload || t('students:toast.parentCredentialsFailed'));
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success(t('students:toast.copied'));
        }).catch(() => {
            toast.error(t('students:toast.copyFailed'));
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
            toast.success(result.payload.message || t('students:toast.loginsCreated'));
        } else {
            toast.error(result.payload || t('students:toast.loginsCreateFailed'));
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
        toast.success(t('students:toast.csvDownloaded'));
    };

    const copyAllBulkCredentials = () => {
        if (!bulkCredentials?.created?.length) return;
        const block = bulkCredentials.created
            .map(c => `${c.name}\t${c.email}\t${c.tempPassword}`)
            .join('\n');
        copyToClipboard(block);
    };

    const copyAllParentCredentials = () => {
        if (!parentCredentialsResult?.sent?.length) return;
        const block = parentCredentialsResult.sent
            .map((item) => `${item.relation}\t${item.name}\t${item.email}\t${item.tempPassword}`)
            .join('\n');
        copyToClipboard(block);
    };

    // CSV Import functions
    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            setCsvErrors([t('students:import.csvMustHaveHeader')]);
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const requiredHeaders = ['firstName', 'lastName', 'dateOfBirth', 'gender'];
        const missing = requiredHeaders.filter(h => !headers.includes(h));
        if (missing.length > 0) {
            setCsvErrors([t('students:import.missingRequiredColumns', { columns: missing.join(', ') })]);
            return;
        }

        const rows = [];
        const parseErrors = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.length !== headers.length) {
                parseErrors.push(t('students:import.invalidColumnCount', { row: i, expected: headers.length, actual: values.length }));
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
            setCsvErrors([t('students:toast.selectCsv')]);
            return;
        }

        setImportResult(null);
        const reader = new FileReader();
        reader.onload = (evt) => parseCSV(evt.target.result);
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!importClassId) {
            toast.error(t('students:toast.selectClass'));
            return;
        }
        if (csvData.length === 0) {
            toast.error(t('students:toast.noValidData'));
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
                toast.error(t('students:toast.rowsFailed', { count: result.payload.data.failed }));
            }
        } else {
            toast.error(result.payload?.message || t('students:toast.importFailed'));
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
                    <h1>{t('students:page.title')}</h1>
                    <p className="text-muted">{t('students:page.subtitle')}</p>
                </div>
                {isAdmin && (
                    <div className="header-actions">
                        <button
                            className="btn btn-outline"
                            onClick={handleBulkCreateLogin}
                            disabled={selectedStudentIds.size === 0 || bulkLoginLoading}
                            title={selectedStudentIds.size === 0 ? t('students:actions.selectWithoutLoginFirst') : ''}
                        >
                            <HiOutlineUserAdd size={20} />
                            {t('students:actions.createLoginsForSelected', { count: selectedStudentIds.size })}
                        </button>
                        <button className="btn btn-outline" onClick={() => setShowImportModal(true)}>
                            <HiOutlineUpload size={20} />
                            {t('students:actions.importCsv')}
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <HiOutlinePlus size={20} />
                            {t('students:actions.addStudent')}
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
                        placeholder={t('students:filters.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
                    <option value="">{t('students:filters.allClasses')}</option>
                    <option value="unassigned">{t('students:filters.unassignedStudents')}</option>
                    {classes.map(cls => (
                        <option key={cls._id} value={cls._id}>{cls.name}</option>
                    ))}
                </select>
            </div>

            {/* Students Table */}
            <StudentsTable
                students={filteredStudents}
                isAdmin={isAdmin}
                loading={loading}
                studentsWithoutLogin={studentsWithoutLogin}
                isAllWithoutLoginSelected={isAllWithoutLoginSelected}
                selectedStudentIds={selectedStudentIds}
                toggleSelectAllWithoutLogin={toggleSelectAllWithoutLogin}
                toggleSelectStudent={toggleSelectStudent}
                handleResetPassword={handleResetPassword}
                handleCreateLogin={handleCreateLogin}
                handleSendParentCredentials={handleSendParentCredentials}
                sendingParentCredentialsFor={sendingParentCredentialsFor}
                handleEdit={handleEdit}
            />

            {/* Create Modal */}
            <StudentFormModal
                showModal={showModal}
                setShowModal={setShowModal}
                isEditing={isEditing}
                formData={formData}
                setFormData={setFormData}
                classes={classes}
                departments={departments}
                resetForm={resetForm}
                handleSubmit={handleSubmit}
            />

            {/* CSV Import Modal */}
            <ImportStudentsModal
                showImportModal={showImportModal}
                resetImportModal={resetImportModal}
                importClassId={importClassId}
                setImportClassId={setImportClassId}
                classes={classes}
                handleFileSelect={handleFileSelect}
                downloadTemplate={downloadTemplate}
                csvErrors={csvErrors}
                csvData={csvData}
                importResult={importResult}
                handleImport={handleImport}
                importing={importing}
            />
            {/* ── Credentials Modal (shown once after create-login / reset-password) ── */}
            <CredentialsModal
                showCredentials={showCredentials}
                setShowCredentials={setShowCredentials}
                credentials={credentials}
                copyToClipboard={copyToClipboard}
            />

            {/* ── Bulk credentials modal ── */}
            <BulkCredentialsModal
                showBulkCredentials={showBulkCredentials}
                setShowBulkCredentials={setShowBulkCredentials}
                bulkCredentials={bulkCredentials}
                setBulkCredentials={setBulkCredentials}
                downloadBulkCredentialsCSV={downloadBulkCredentialsCSV}
                copyAllBulkCredentials={copyAllBulkCredentials}
            />

            {/* ── Parent credentials result modal ── */}
            <ParentCredentialsModal
                showParentCredentialsResult={showParentCredentialsResult}
                setShowParentCredentialsResult={setShowParentCredentialsResult}
                parentCredentialsResult={parentCredentialsResult}
                setParentCredentialsResult={setParentCredentialsResult}
                copyAllParentCredentials={copyAllParentCredentials}
            />

            {/* ── Email Prompt Modal (when student has no email) ── */}
            <EmailPromptModal
                showLoginEmailPrompt={showLoginEmailPrompt}
                setShowLoginEmailPrompt={setShowLoginEmailPrompt}
                loginTargetStudent={loginTargetStudent}
                loginEmail={loginEmail}
                setLoginEmail={setLoginEmail}
                doCreateLogin={doCreateLogin}
            />
        </div >
    );
};

export default StudentsPage;
