import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    bulkSendParentLoginInvites,
    bulkSendStudentLoginInvites,
    bulkDeleteStudents,
    createStudent,
    fetchStudents,
    importStudents,
    selectStudentsPagination,
    selectStudents,
    selectStudentsLoading,
    sendParentLoginInvite,
    sendStudentLoginInvite,
    updateStudent
} from '../../../store/slices/studentSlice';
import { fetchClasses, selectClasses } from '../../../store/slices/classSlice';
import { fetchDepartments, selectDepartments } from '../../../store/slices/departmentSlice';
import {
    fetchSchoolFeatures,
    selectSchoolFeatureLimits,
    selectSchoolFeatureUsage
} from '../../../store/slices/schoolFeaturesSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import { selectIsAdmin } from '../../../store/slices/authSlice';
import {
    HiOutlineClipboardCheck,
    HiOutlineMail,
    HiOutlinePlus,
    HiOutlineSearch,
    HiOutlineTrash,
    HiOutlineUpload,
    HiOutlineUserAdd
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../../config/api';
import './StudentsPage.css';
import StudentsTable from './components/StudentsTable';
import StudentFormModal from './components/StudentFormModal';
import ImportStudentsModal from './components/ImportStudentsModal';
import importTemplateService from '../../../services/importTemplateService';
import {
    CredentialsModal,
    BulkCredentialsModal,
    ParentCredentialsModal,
    EmailPromptModal
} from './components/StudentLoginModals';
import BulkDeleteModal from './components/BulkDeleteModal';
import { parseCsvText } from '../../../utils/csvImport';
import TablePagination from '../../../components/common/TablePagination';

const DEFAULT_PAGE_SIZE = 10;

const buildSelectedStudentsSummary = (studentNames, t) => {
    if (!Array.isArray(studentNames) || studentNames.length === 0) {
        return t('students:credentials.selectedStudentsFallback');
    }

    if (studentNames.length <= 3) {
        return studentNames.join(', ');
    }

    return t('students:credentials.selectedStudentsSummary', { count: studentNames.length });
};

const StudentsPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation(['students']);
    const [searchParams] = useSearchParams();
    const searchFromUrl = searchParams.get('search') || '';
    const students = useSelector(selectStudents);
    const classes = useSelector(selectClasses);
    const departments = useSelector(selectDepartments);
    const loading = useSelector(selectStudentsLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = useSelector(selectIsAdmin);
    const schoolLimits = useSelector(selectSchoolFeatureLimits);
    const schoolUsage = useSelector(selectSchoolFeatureUsage);

    const [searchTerm, setSearchTerm] = useState(searchFromUrl);
    const [filterClass, setFilterClass] = useState('');
    const [studentAcademicYears, setStudentAcademicYears] = useState([]);
    const [selectedAcademicYear, setSelectedAcademicYear] = useState(academicYear || '');
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

    const [showCredentials, setShowCredentials] = useState(false);
    const [credentials, setCredentials] = useState(null);
    const [loginEmail, setLoginEmail] = useState('');
    const [showLoginEmailPrompt, setShowLoginEmailPrompt] = useState(false);
    const [loginTargetStudent, setLoginTargetStudent] = useState(null);
    const [sendingStudentInviteFor, setSendingStudentInviteFor] = useState(null);
    const [sendingParentInviteFor, setSendingParentInviteFor] = useState(null);
    const [showParentCredentialsResult, setShowParentCredentialsResult] = useState(false);
    const [parentCredentialsResult, setParentCredentialsResult] = useState(null);

    const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
    const [showBulkCredentials, setShowBulkCredentials] = useState(false);
    const [bulkCredentials, setBulkCredentials] = useState(null);
    const [bulkStudentInviteLoading, setBulkStudentInviteLoading] = useState(false);
    const [bulkParentInviteLoading, setBulkParentInviteLoading] = useState(false);
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [bulkDeleteMode, setBulkDeleteMode] = useState('selected'); // 'selected' | 'class' | 'year'
    const [bulkDeleteClassId, setBulkDeleteClassId] = useState('');
    const [bulkDeleteYear, setBulkDeleteYear] = useState('');
    const [bulkDeletePermanent, setBulkDeletePermanent] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

    const [showImportModal, setShowImportModal] = useState(false);
    const [importClassId, setImportClassId] = useState('');
    const [csvData, setCsvData] = useState([]);
    const [csvErrors, setCsvErrors] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [importTemplateMeta, setImportTemplateMeta] = useState(null);
    const pagination = useSelector(selectStudentsPagination);

    const studentsQueryParams = useMemo(() => ({
        page: currentPage,
        limit: pageSize,
        search: searchTerm.trim() || undefined,
        classId: filterClass || undefined,
        academicYear: selectedAcademicYear || undefined
    }), [currentPage, pageSize, searchTerm, filterClass, selectedAcademicYear]);

    const totalItems = Number.isFinite(Number(pagination?.total))
        ? Number(pagination.total)
        : students.length;
    const totalPages = Math.max(1, Number(pagination?.totalPages ?? pagination?.pages) || 1);

    useEffect(() => {
        setSearchTerm(searchFromUrl);
    }, [searchFromUrl]);

    useEffect(() => {
        setSelectedAcademicYear(academicYear || '');
    }, [academicYear]);

    useEffect(() => {
        let cancelled = false;

        const loadAcademicYears = async () => {
            try {
                const response = await api.get('/schools/me/academic-years');
                if (!cancelled && response.data?.success) {
                    setStudentAcademicYears(response.data?.data?.academicYears || []);
                }
            } catch {
                if (!cancelled) setStudentAcademicYears([]);
            }
        };

        loadAcademicYears();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        dispatch(fetchClasses({ limit: 'all', academicYear: selectedAcademicYear || undefined }));
        dispatch(fetchDepartments());
        dispatch(fetchSchoolFeatures());
    }, [dispatch, selectedAcademicYear]);

    useEffect(() => {
        dispatch(fetchStudents(studentsQueryParams));
    }, [dispatch, studentsQueryParams]);

    useEffect(() => {
        if (!showImportModal) return;
        let mounted = true;
        importTemplateService.getEntityTemplate('students')
            .then((template) => {
                if (mounted) setImportTemplateMeta(template);
            })
            .catch(() => {
                if (mounted) setImportTemplateMeta(null);
            });
        return () => {
            mounted = false;
        };
    }, [showImportModal]);

    const refreshStudents = () => {
        dispatch(fetchStudents(studentsQueryParams));
        dispatch(fetchSchoolFeatures());
    };

    const studentCapacity = useMemo(() => {
        const maxStudents = Number(schoolLimits?.maxStudents);
        const currentStudents = Number(schoolUsage?.currentStudents || 0);

        if (!Number.isFinite(maxStudents) || maxStudents < 0) {
            return {
                isLimited: false,
                maxStudents: null,
                currentStudents,
                remainingSeats: null,
                isFull: false
            };
        }

        const remainingSeats = Math.max(0, maxStudents - currentStudents);
        return {
            isLimited: true,
            maxStudents,
            currentStudents,
            remainingSeats,
            isFull: remainingSeats <= 0
        };
    }, [schoolLimits, schoolUsage]);

    const showCapacityBanner = isAdmin && (studentCapacity.isLimited || studentCapacity.currentStudents > 0);

    const handleSubmit = async (event) => {
        event.preventDefault();
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
            refreshStudents();
            if (!isEditing) dispatch(fetchSchoolFeatures());
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

    const doSendStudentInvite = async (student, email) => {
        setShowLoginEmailPrompt(false);
        setSendingStudentInviteFor(student._id);
        const result = await dispatch(sendStudentLoginInvite({ studentId: student._id, email }));
        setSendingStudentInviteFor(null);

        if (sendStudentLoginInvite.fulfilled.match(result)) {
            setCredentials({
                email: result.payload.data.email,
                tempPassword: result.payload.data.tempPassword,
                studentName: `${student.firstName} ${student.lastName}`,
                emailSent: result.payload.data.emailSent,
                error: result.payload.data.error || null
            });
            setShowCredentials(true);
            refreshStudents();

            if (result.payload.data.emailSent) {
                toast.success(t('students:toast.inviteSent'));
            } else {
                toast.error(result.payload.message || t('students:toast.invitePreparedWithIssues'));
            }
        } else {
            toast.error(result.payload || t('students:toast.inviteFailed'));
        }
    };

    const handleSendStudentInvite = (student) => {
        const email = student.email || student.studentEmail || student.user?.email || '';
        if (!email) {
            setLoginTargetStudent(student);
            setLoginEmail('');
            setShowLoginEmailPrompt(true);
            return;
        }
        doSendStudentInvite(student, email);
    };

    const handleSendParentInvite = async (student) => {
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
            t('students:confirm.sendParentInvite', {
                count: parentEmailCount,
                name: `${student.firstName} ${student.lastName}`
            })
        );
        if (!confirmed) return;

        setSendingParentInviteFor(student._id);
        const result = await dispatch(sendParentLoginInvite(student._id));
        setSendingParentInviteFor(null);

        if (sendParentLoginInvite.fulfilled.match(result)) {
            setParentCredentialsResult(result.payload.data);
            setShowParentCredentialsResult(true);
            toast.success(result.payload.message || t('students:toast.parentInvitesSent'));
        } else {
            toast.error(result.payload || t('students:toast.parentInvitesFailed'));
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success(t('students:toast.copied'));
        }).catch(() => {
            toast.error(t('students:toast.copyFailed'));
        });
    };

    const openBulkDeleteModal = () => {
        setBulkDeleteMode(selectedStudentIds.size > 0 ? 'selected' : 'class');
        setBulkDeleteClassId(filterClass && filterClass !== 'unassigned' ? filterClass : '');
        setBulkDeleteYear(selectedAcademicYear || '');
        setBulkDeletePermanent(false);
        setShowBulkDeleteModal(true);
    };

    const handleBulkDelete = async () => {
        const payload = { permanent: bulkDeletePermanent };
        if (bulkDeleteMode === 'selected') {
            payload.ids = Array.from(selectedStudentIds);
        } else if (bulkDeleteMode === 'class') {
            payload.classId = bulkDeleteClassId;
        } else {
            payload.academicYear = bulkDeleteYear;
        }

        setBulkDeleting(true);
        const result = await dispatch(bulkDeleteStudents(payload));
        setBulkDeleting(false);

        if (bulkDeleteStudents.fulfilled.match(result)) {
            toast.success(result.payload.message);
            setShowBulkDeleteModal(false);
            setSelectedStudentIds(new Set());
            refreshStudents();
            dispatch(fetchSchoolFeatures());
        } else {
            toast.error(result.payload || 'Bulk delete failed.');
        }
    };

    const toggleSelectStudent = (id) => {
        setSelectedStudentIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAllStudents = () => {
        setSelectedStudentIds((previous) => {
            const allSelected = students.length > 0
                && students.every((student) => previous.has(student._id));

            if (allSelected) {
                const next = new Set(previous);
                students.forEach((student) => next.delete(student._id));
                return next;
            }

            const next = new Set(previous);
            students.forEach((student) => next.add(student._id));
            return next;
        });
    };

    const handleBulkSendStudentInvites = async () => {
        const ids = Array.from(selectedStudentIds);
        if (ids.length === 0) {
            toast.error(t('students:actions.selectStudentsFirst'));
            return;
        }

        setBulkStudentInviteLoading(true);
        const result = await dispatch(bulkSendStudentLoginInvites(ids));
        setBulkStudentInviteLoading(false);

        if (bulkSendStudentLoginInvites.fulfilled.match(result)) {
            setBulkCredentials(result.payload.data);
            setShowBulkCredentials(true);
            setSelectedStudentIds(new Set());
            refreshStudents();

            if (result.payload.data.errors?.length) {
                toast.error(result.payload.message || t('students:toast.invitesCompletedWithIssues'));
            } else {
                toast.success(t('students:toast.invitesSent'));
            }
        } else {
            toast.error(result.payload || t('students:toast.invitesFailed'));
        }
    };

    const handleBulkSendParentInvites = async () => {
        const ids = Array.from(selectedStudentIds);
        if (ids.length === 0) {
            toast.error(t('students:actions.selectStudentsFirst'));
            return;
        }

        setBulkParentInviteLoading(true);
        const result = await dispatch(bulkSendParentLoginInvites(ids));
        setBulkParentInviteLoading(false);

        if (bulkSendParentLoginInvites.fulfilled.match(result)) {
            setParentCredentialsResult({
                ...result.payload.data,
                studentName: buildSelectedStudentsSummary(result.payload.data.studentNames, t)
            });
            setShowParentCredentialsResult(true);
            setSelectedStudentIds(new Set());
            toast.success(result.payload.message || t('students:toast.parentInvitesSent'));
        } else {
            toast.error(result.payload || t('students:toast.parentInvitesFailed'));
        }
    };

    const downloadBulkCredentialsCSV = () => {
        if (!bulkCredentials?.created?.length) return;
        const header = 'Student Name,Email,Password,Email Sent';
        const rows = bulkCredentials.created.map((credential) =>
            [
                credential.name,
                credential.email,
                credential.tempPassword,
                credential.emailSent ? 'Yes' : 'No'
            ].map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')
        );
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'student_login_invites.csv';
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success(t('students:toast.csvDownloaded'));
    };

    const copyAllBulkCredentials = () => {
        if (!bulkCredentials?.created?.length) return;
        const block = bulkCredentials.created
            .map((credential) => `${credential.name}\t${credential.email}\t${credential.tempPassword}\t${credential.emailSent ? 'sent' : 'failed'}`)
            .join('\n');
        copyToClipboard(block);
    };

    const copyAllParentCredentials = () => {
        if (!parentCredentialsResult?.sent?.length) return;
        const block = parentCredentialsResult.sent
            .map((item) => `${item.relation}\t${item.name}\t${item.email}\t${item.tempPassword}\t${item.linkedStudents?.join(', ') || ''}`)
            .join('\n');
        copyToClipboard(block);
    };

    const parseCSV = (text) => {
        const { headers, rows, errors } = parseCsvText(text);
        if (headers.length === 0 && rows.length === 0) {
            setCsvErrors([t('students:import.csvMustHaveHeader')]);
            return;
        }

        const requiredHeaders = ['firstName', 'lastName', 'dateOfBirth', 'gender'];
        const missing = requiredHeaders.filter((header) => !headers.includes(header));
        if (missing.length > 0) {
            setCsvErrors([t('students:import.missingRequiredColumns', { columns: missing.join(', ') })]);
            return;
        }

        setCsvData(rows);
        setCsvErrors(errors);
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            setCsvErrors([t('students:toast.selectCsv')]);
            return;
        }

        setImportResult(null);
        const reader = new FileReader();
        reader.onload = (loadEvent) => parseCSV(loadEvent.target.result);
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
        const result = await dispatch(importStudents({
            students: csvData,
            classId: importClassId,
            duplicatePolicy: 'update'
        }));

        if (importStudents.fulfilled.match(result)) {
            setImportResult(result.payload);
            if (result.payload.data.imported > 0) {
                toast.success(result.payload.message);
                const importedClass = classes.find((currentClass) => currentClass._id === importClassId);
                const importedAcademicYear = importedClass?.academicYear || selectedAcademicYear;
                setSearchTerm('');
                setSelectedAcademicYear(importedAcademicYear);
                setFilterClass(importClassId);
                setCurrentPage(1);
                setSelectedStudentIds(new Set());
                dispatch(fetchStudents({
                    page: 1,
                    limit: pageSize,
                    classId: importClassId,
                    academicYear: importedAcademicYear || undefined
                }));
                dispatch(fetchSchoolFeatures());
            }
            if (result.payload.data.failed > 0) {
                toast.error(t('students:toast.rowsFailed', { count: result.payload.data.failed }));
            }
        } else {
            toast.error(result.payload?.message || t('students:toast.importFailed'));
        }
        setImporting(false);
    };

    const downloadTemplate = async () => {
        try {
            await importTemplateService.downloadEntityTemplate('students');
        } catch (error) {
            toast.error(error?.response?.data?.message || t('students:toast.importFailed'));
        }
    };

    const resetImportModal = () => {
        setShowImportModal(false);
        setImportClassId('');
        setCsvData([]);
        setCsvErrors([]);
        setImportResult(null);
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterClass, searchFromUrl]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    useEffect(() => {
        setSelectedStudentIds((previous) => {
            const visibleStudentIds = new Set(students.map((student) => student._id));
            const next = new Set();
            previous.forEach((studentId) => {
                if (visibleStudentIds.has(studentId)) {
                    next.add(studentId);
                }
            });
            return next;
        });
    }, [students]);

    const isAllSelected = students.length > 0
        && students.every((student) => selectedStudentIds.has(student._id));

    return (
        <div className="students-page">
            <div className="page-header">
                <div>
                    <h1>{t('students:page.title')}</h1>
                    <p className="text-muted">{t('students:page.subtitle')}</p>
                </div>
                {isAdmin && (
                    <div className="header-actions">
                        <button
                            className="btn btn-outline"
                            onClick={() => navigate('/portal/students/promotion-center')}
                        >
                            <HiOutlineClipboardCheck size={20} />
                            {t('students:actions.openPromotionCenter')}
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={handleBulkSendStudentInvites}
                            disabled={selectedStudentIds.size === 0 || bulkStudentInviteLoading}
                            title={selectedStudentIds.size === 0 ? t('students:actions.selectStudentsFirst') : ''}
                        >
                            <HiOutlineUserAdd size={20} />
                            {bulkStudentInviteLoading
                                ? t('students:actions.sendingInvites')
                                : t('students:actions.sendInvitesForSelected', { count: selectedStudentIds.size })}
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={handleBulkSendParentInvites}
                            disabled={selectedStudentIds.size === 0 || bulkParentInviteLoading}
                            title={selectedStudentIds.size === 0 ? t('students:actions.selectStudentsFirst') : ''}
                        >
                            <HiOutlineMail size={20} />
                            {bulkParentInviteLoading
                                ? t('students:actions.sendingParentInvites')
                                : t('students:actions.sendParentInvitesForSelected', { count: selectedStudentIds.size })}
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={() => setShowImportModal(true)}
                            disabled={studentCapacity.isFull}
                            title={studentCapacity.isFull ? t('students:capacity.planFull') : ''}
                        >
                            <HiOutlineUpload size={20} />
                            {t('students:actions.importCsv')}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowModal(true)}
                            disabled={studentCapacity.isFull}
                            title={studentCapacity.isFull ? t('students:capacity.planFull') : ''}
                        >
                            <HiOutlinePlus size={20} />
                            {t('students:actions.addStudent')}
                        </button>
                        <button
                            className="btn btn-danger"
                            onClick={openBulkDeleteModal}
                            title="Delete students by selection, class, or academic year"
                        >
                            <HiOutlineTrash size={20} />
                            Delete Students
                        </button>
                    </div>
                )}
            </div>

            {showCapacityBanner && (
                <div className={`students-capacity-banner ${studentCapacity.isFull ? 'full' : ''}`}>
                    {studentCapacity.isLimited ? (
                        <>
                            <strong>{t('students:capacity.title')}</strong>
                            <span>
                                {t('students:capacity.summary', {
                                    current: studentCapacity.currentStudents,
                                    max: studentCapacity.maxStudents,
                                    remaining: studentCapacity.remainingSeats
                                })}
                            </span>
                        </>
                    ) : (
                        <span>
                            {t('students:capacity.unlimitedSummary', {
                                current: studentCapacity.currentStudents
                            })}
                        </span>
                    )}
                </div>
            )}

            <div className="filters-bar">
                <div className="search-bar">
                    <HiOutlineSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder={t('students:filters.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                </div>
                <select
                    value={selectedAcademicYear}
                    onChange={(event) => {
                        setSelectedAcademicYear(event.target.value);
                        setFilterClass('');
                        setCurrentPage(1);
                        setSelectedStudentIds(new Set());
                    }}
                    aria-label="Academic year"
                >
                    {[...new Set([academicYear, ...studentAcademicYears].filter(Boolean))]
                        .sort()
                        .map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
                <select value={filterClass} onChange={(event) => setFilterClass(event.target.value)}>
                    <option value="">{t('students:filters.allClasses')}</option>
                    <option value="unassigned">{t('students:filters.unassignedStudents')}</option>
                    {classes.map((currentClass) => (
                        <option key={currentClass._id} value={currentClass._id}>{currentClass.name}</option>
                    ))}
                </select>
            </div>

            <StudentsTable
                students={students}
                isAdmin={isAdmin}
                loading={loading}
                isAllSelected={isAllSelected}
                selectedStudentIds={selectedStudentIds}
                toggleSelectAllStudents={toggleSelectAllStudents}
                toggleSelectStudent={toggleSelectStudent}
                handleSendStudentInvite={handleSendStudentInvite}
                sendingStudentInviteFor={sendingStudentInviteFor}
                handleSendParentInvite={handleSendParentInvite}
                sendingParentInviteFor={sendingParentInviteFor}
                handleEdit={handleEdit}
                onStudentDeleted={refreshStudents}
            />
            <TablePagination
                page={currentPage}
                pageSize={pageSize}
                totalItems={totalItems}
                totalPages={totalPages}
                onPageChange={(nextPage) => setCurrentPage(Math.max(1, Math.min(nextPage, totalPages)))}
                onPageSizeChange={(nextSize) => {
                    setPageSize(Math.max(Number(nextSize) || DEFAULT_PAGE_SIZE, 1));
                    setCurrentPage(1);
                }}
            />

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

            <ImportStudentsModal
                showImportModal={showImportModal}
                resetImportModal={resetImportModal}
                importClassId={importClassId}
                setImportClassId={setImportClassId}
                classes={classes}
                handleFileSelect={handleFileSelect}
                downloadTemplate={downloadTemplate}
                importTemplateMeta={importTemplateMeta}
                csvErrors={csvErrors}
                csvData={csvData}
                importResult={importResult}
                handleImport={handleImport}
                importing={importing}
            />

            <CredentialsModal
                showCredentials={showCredentials}
                setShowCredentials={setShowCredentials}
                credentials={credentials}
                copyToClipboard={copyToClipboard}
            />

            <BulkCredentialsModal
                showBulkCredentials={showBulkCredentials}
                setShowBulkCredentials={setShowBulkCredentials}
                bulkCredentials={bulkCredentials}
                setBulkCredentials={setBulkCredentials}
                downloadBulkCredentialsCSV={downloadBulkCredentialsCSV}
                copyAllBulkCredentials={copyAllBulkCredentials}
            />

            <ParentCredentialsModal
                showParentCredentialsResult={showParentCredentialsResult}
                setShowParentCredentialsResult={setShowParentCredentialsResult}
                parentCredentialsResult={parentCredentialsResult}
                setParentCredentialsResult={setParentCredentialsResult}
                copyAllParentCredentials={copyAllParentCredentials}
            />

            <EmailPromptModal
                showLoginEmailPrompt={showLoginEmailPrompt}
                setShowLoginEmailPrompt={setShowLoginEmailPrompt}
                loginTargetStudent={loginTargetStudent}
                loginEmail={loginEmail}
                setLoginEmail={setLoginEmail}
                doCreateLogin={doSendStudentInvite}
            />

            <BulkDeleteModal
                show={showBulkDeleteModal}
                onClose={() => setShowBulkDeleteModal(false)}
                onConfirm={handleBulkDelete}
                loading={bulkDeleting}
                selectedCount={selectedStudentIds.size}
                classes={classes}
                academicYears={[...new Set([academicYear, ...studentAcademicYears].filter(Boolean))].sort()}
                mode={bulkDeleteMode}
                setMode={setBulkDeleteMode}
                deleteClassId={bulkDeleteClassId}
                setDeleteClassId={setBulkDeleteClassId}
                deleteYear={bulkDeleteYear}
                setDeleteYear={setBulkDeleteYear}
                permanent={bulkDeletePermanent}
                setPermanent={setBulkDeletePermanent}
            />
        </div>
    );
};

export default StudentsPage;
