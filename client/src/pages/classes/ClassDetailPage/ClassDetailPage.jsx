import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@mui/material';
import {
    fetchClass,
    fetchClasses,
    updateClass,
    selectCurrentClass,
    selectClassStudents,
    selectClasses,
    selectClassDetailStatus,
    selectClassDetailError,
    selectClassDetailId,
    addSubjectToClass,
    removeSubjectFromClass,
    fetchClassAnalytics,
    fetchClassInsights,
    selectClassAnalytics,
    selectClassInsights,
    selectClassAnalyticsLoading,
    selectClassInsightsLoading,
    clearClassAnalyticsData,
    enrollStudentsInClass,
    unenrollStudentFromClass
} from '../../../store/slices/classSlice';
import { updateStudent } from '../../../store/slices/studentSlice';
import { selectSubjects } from '../../../store/slices/subjectSlice';
import { selectTeachers } from '../../../store/slices/teacherSlice';
import { fetchDepartments, selectDepartments } from '../../../store/slices/departmentSlice';
import { selectIsAdmin, selectCanEditClass } from '../../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../../store/slices/uiSlice';
import {
    HiOutlineArrowLeft,
    HiOutlineUserGroup,
    HiOutlineBookOpen,
    HiOutlineClipboardList,
    HiOutlinePlus,
    HiOutlineDocumentText,
    HiOutlineChartBar,
    HiOutlineLightBulb,
    HiOutlinePencil,
    HiOutlineSearch,
    HiOutlineUser,
    HiOutlineX,
    HiOutlineExclamationCircle
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { AI_LANGUAGE_OPTIONS, buildRequestedLanguages, toLegacyLanguageValue } from '../../../constants/aiLanguages';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import useFocusTrap from '../../../hooks/useFocusTrap';
import StudentFormModal from '../../students/StudentsPage/components/StudentFormModal';
import useEnrollSearch from './hooks/useEnrollSearch';
import { formatTeacherName, resolveDetailView, summarizeEnrollResult } from './utils/classDetailState';
import '../../../styles/greenPages.css';
import './ClassDetailPage.css';

const HOMEROOM_SUBJECT_MATCHERS = ['homeroom', 'home room', 'advisory', 'advisor', 'hmrm'];

const emptyStudentForm = (academicYear) => ({
    firstName: '',
    lastName: '',
    externalName: '',
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

const isHomeroomSubject = (subject) => {
    const name = String(subject?.name || '').toLowerCase();
    const code = String(subject?.code || '').toLowerCase();
    return HOMEROOM_SUBJECT_MATCHERS.some((term) => name.includes(term) || code.includes(term));
};

const studentInitials = (student) =>
    `${student?.firstName?.charAt(0) || ''}${student?.lastName?.charAt(0) || ''}`;

const studentName = (student) =>
    [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim();

const ClassDetailPage = () => {
    const { id } = useParams();
    const dispatch = useDispatch();
    const { t } = useTranslation(['classes', 'students', 'common']);
    const isCompact = useMediaQuery('(max-width: 899px)');

    const currentClass = useSelector(selectCurrentClass);
    const students = useSelector(selectClassStudents);
    const classes = useSelector(selectClasses);
    const detailStatus = useSelector(selectClassDetailStatus);
    const detailError = useSelector(selectClassDetailError);
    const detailClassId = useSelector(selectClassDetailId);
    const subjectsList = useSelector(selectSubjects);
    const teachersList = useSelector(selectTeachers);
    const departments = useSelector(selectDepartments);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = useSelector(selectIsAdmin);
    const canEditClass = useSelector(selectCanEditClass);

    const analytics = useSelector(selectClassAnalytics);
    const insightsData = useSelector(selectClassInsights);
    const analyticsLoading = useSelector(selectClassAnalyticsLoading);
    const insightsLoading = useSelector(selectClassInsightsLoading);

    const [showEditModal, setShowEditModal] = useState(false);
    const [editFormData, setEditFormData] = useState({
        grade: '',
        section: '',
        academicYear: '',
        department: '',
        room: '',
        capacity: 40,
        isActive: true
    });
    const [submitting, setSubmitting] = useState(false);

    const [showSubjectModal, setShowSubjectModal] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedTeacher, setSelectedTeacher] = useState('');
    const [removeSubjectTarget, setRemoveSubjectTarget] = useState(null);
    const [removingSubject, setRemovingSubject] = useState(false);
    const [removeSubjectError, setRemoveSubjectError] = useState('');

    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [enrolling, setEnrolling] = useState(false);

    const [unenrollTarget, setUnenrollTarget] = useState(null);
    const [unenrolling, setUnenrolling] = useState(false);
    const [unenrollError, setUnenrollError] = useState('');

    const [showStudentEditModal, setShowStudentEditModal] = useState(false);
    const [editingStudentId, setEditingStudentId] = useState(null);
    const [studentFormData, setStudentFormData] = useState(() => emptyStudentForm(academicYear));
    const [savingStudent, setSavingStudent] = useState(false);

    const [showAnalytics, setShowAnalytics] = useState(false);
    const [analyticsError, setAnalyticsError] = useState('');
    const [insightsError, setInsightsError] = useState('');
    const [insightsPrimaryLanguage, setInsightsPrimaryLanguage] = useState('en');
    const [insightsSecondaryLanguage, setInsightsSecondaryLanguage] = useState('');

    const editDialogRef = useRef(null);
    const subjectDialogRef = useRef(null);
    const subjectSelectRef = useRef(null);
    const enrollDialogRef = useRef(null);
    const enrollSearchRef = useRef(null);

    const enrolledIds = useMemo(() => new Set(students.map((student) => student._id)), [students]);
    const {
        query: enrollQuery,
        setQuery: setEnrollQuery,
        reset: resetEnrollSearch,
        retry: retryEnrollSearch,
        status: enrollStatus,
        results: enrollResults,
        error: enrollError
    } = useEnrollSearch({ enrolledIds, active: showEnrollModal });

    useEffect(() => {
        dispatch(fetchClass(id));
        dispatch(fetchClasses({ limit: 'all' }));
        dispatch(clearClassAnalyticsData());
        setShowAnalytics(false);
        setAnalyticsError('');
        setInsightsError('');
    }, [dispatch, id]);

    // /departments rejects a plain teacher with 403; only the edit-class and
    // edit-student forms read it.
    useEffect(() => {
        if (!canEditClass) return;
        dispatch(fetchDepartments());
    }, [dispatch, canEditClass]);

    const closeEditModal = useCallback(() => {
        setShowEditModal(false);
    }, []);

    const closeSubjectModal = useCallback(() => {
        setShowSubjectModal(false);
    }, []);

    const closeEnrollModal = useCallback(() => {
        setShowEnrollModal(false);
        setSelectedStudentIds([]);
        resetEnrollSearch();
    }, [resetEnrollSearch]);

    useFocusTrap({
        active: showEditModal,
        containerRef: editDialogRef,
        onEscape: () => {
            if (!submitting) closeEditModal();
        }
    });

    useFocusTrap({
        active: showSubjectModal,
        containerRef: subjectDialogRef,
        initialFocusRef: subjectSelectRef,
        onEscape: () => {
            if (!submitting) closeSubjectModal();
        }
    });

    useFocusTrap({
        active: showEnrollModal,
        containerRef: enrollDialogRef,
        initialFocusRef: enrollSearchRef,
        onEscape: () => {
            if (!enrolling) closeEnrollModal();
        }
    });

    const view = resolveDetailView({
        status: detailStatus,
        routeId: id,
        currentClassId: currentClass?._id,
        detailClassId,
        error: detailError
    });

    const insightsText = useMemo(() => {
        const value = insightsData?.insights ?? insightsData?.data?.insights;
        return typeof value === 'string' ? value.trim() : '';
    }, [insightsData]);

    const hasAnalyticsData = Boolean(
        analytics?.gradeStatsBySubject?.length ||
        analytics?.attendanceSummary ||
        analytics?.studentsToSupport?.length
    );

    const openEditModal = () => {
        if (!currentClass) return;
        setEditFormData({
            grade: currentClass.grade?.toString() ?? '',
            section: currentClass.section ?? '',
            academicYear: currentClass.academicYear ?? academicYear ?? '',
            department: currentClass.department?._id ?? currentClass.department ?? '',
            room: currentClass.room ?? '',
            capacity: currentClass.capacity ?? 40,
            isActive: currentClass.isActive !== false
        });
        setShowEditModal(true);
    };

    const handleUpdateClass = async (event) => {
        event.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            const payload = {
                ...editFormData,
                grade: parseInt(editFormData.grade, 10),
                capacity: editFormData.capacity || 40
            };
            if (payload.department === '') payload.department = undefined;
            const result = await dispatch(updateClass({ id, data: payload }));
            if (updateClass.fulfilled.match(result)) {
                toast.success(t('classes:detail.toast.updated'));
                closeEditModal();
                dispatch(fetchClass(id));
            } else {
                toast.error(t('classes:detail.toast.updateFailed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleLoadAnalytics = () => {
        setShowAnalytics(true);
        setAnalyticsError('');
        dispatch(fetchClassAnalytics({ classId: id, academicYear: currentClass?.academicYear })).then((result) => {
            if (fetchClassAnalytics.rejected.match(result)) {
                setAnalyticsError(t('classes:detail.analytics.loadFailed'));
            }
        });
    };

    const handleGenerateInsights = () => {
        if (insightsLoading) return;
        const requestedLanguages = buildRequestedLanguages(insightsPrimaryLanguage, insightsSecondaryLanguage);
        const normalizedRequestedLanguages = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
        setInsightsError('');
        dispatch(fetchClassInsights({
            classId: id,
            academicYear: currentClass?.academicYear,
            includeAnalytics: true,
            requestedLanguages: normalizedRequestedLanguages,
            primaryLanguage: insightsPrimaryLanguage,
            secondaryLanguage: insightsSecondaryLanguage,
            language: toLegacyLanguageValue(normalizedRequestedLanguages)
        })).then((result) => {
            if (fetchClassInsights.rejected.match(result)) {
                setInsightsError(t('classes:detail.analytics.insightsFailed'));
                return;
            }
            const generated = result.payload?.insights ?? result.payload?.data?.insights;
            if (!generated || !String(generated).trim()) {
                setInsightsError(t('classes:detail.analytics.emptyInsights'));
                return;
            }
            toast.success(t('classes:detail.analytics.generated'));
        });
    };

    const handleAddSubject = async (event) => {
        event.preventDefault();
        if (submitting) return;
        if (!selectedSubject || !selectedTeacher) {
            toast.error(t('classes:detail.subjectDialog.selectBoth'));
            return;
        }
        setSubmitting(true);
        try {
            const result = await dispatch(addSubjectToClass({
                classId: id,
                subjectId: selectedSubject,
                teacherId: selectedTeacher
            }));
            if (addSubjectToClass.fulfilled.match(result)) {
                toast.success(t('classes:detail.toast.subjectAdded'));
                closeSubjectModal();
                setSelectedSubject('');
                setSelectedTeacher('');
                dispatch(fetchClass(id));
            } else {
                toast.error(t('classes:detail.toast.subjectAddFailed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const requestRemoveSubject = (item, subjectId) => {
        if (!isAdmin) return;
        setRemoveSubjectError('');
        setRemoveSubjectTarget({
            id: subjectId,
            name: item.subject?.name || t('classes:detail.subjects.unknown')
        });
    };

    const confirmRemoveSubject = async () => {
        if (!removeSubjectTarget || removingSubject) return;
        setRemovingSubject(true);
        setRemoveSubjectError('');
        try {
            const result = await dispatch(removeSubjectFromClass({
                classId: id,
                subjectId: removeSubjectTarget.id
            }));
            if (removeSubjectFromClass.fulfilled.match(result)) {
                toast.success(t('classes:detail.toast.subjectRemoved'));
                setRemoveSubjectTarget(null);
                dispatch(fetchClass(id));
            } else {
                setRemoveSubjectError(t('classes:detail.toast.subjectRemoveFailed'));
            }
        } finally {
            setRemovingSubject(false);
        }
    };

    const toggleStudentSelection = (studentId) => {
        setSelectedStudentIds((previous) => (
            previous.includes(studentId)
                ? previous.filter((value) => value !== studentId)
                : [...previous, studentId]
        ));
    };

    const handleEnrollSubmit = async () => {
        if (selectedStudentIds.length === 0 || enrolling) return;
        const requested = selectedStudentIds.length;
        setEnrolling(true);
        try {
            const result = await dispatch(enrollStudentsInClass({ classId: id, studentIds: selectedStudentIds }));
            if (enrollStudentsInClass.fulfilled.match(result)) {
                const serverModified = result.payload?.response?.data?.modifiedCount;
                const summary = summarizeEnrollResult({
                    requested,
                    modified: Number.isFinite(serverModified) ? serverModified : requested
                });
                if (summary.isNone) {
                    toast.error(t('classes:detail.toast.enrollNone'));
                } else if (summary.isPartial) {
                    toast.success(t('classes:detail.toast.enrolledPartial', {
                        modified: summary.modified,
                        total: summary.requested
                    }));
                } else {
                    toast.success(t('classes:detail.toast.enrolled', { total: summary.modified }));
                }
                closeEnrollModal();
                dispatch(fetchClass(id));
            } else {
                toast.error(t('classes:detail.toast.enrollFailed'));
            }
        } finally {
            setEnrolling(false);
        }
    };

    const requestUnenroll = (student) => {
        if (!canEditClass) return;
        setUnenrollError('');
        setUnenrollTarget({ id: student._id, name: studentName(student) });
    };

    const confirmUnenroll = async () => {
        if (!unenrollTarget || unenrolling) return;
        setUnenrolling(true);
        setUnenrollError('');
        try {
            const result = await dispatch(unenrollStudentFromClass({
                classId: id,
                studentId: unenrollTarget.id
            }));
            if (unenrollStudentFromClass.fulfilled.match(result)) {
                toast.success(t('classes:detail.toast.unenrolled'));
                setUnenrollTarget(null);
                dispatch(fetchClass(id));
            } else {
                setUnenrollError(t('classes:detail.toast.unenrollFailed'));
            }
        } finally {
            setUnenrolling(false);
        }
    };

    const openEditStudent = (student) => {
        setEditingStudentId(student._id);
        setStudentFormData({
            firstName: student.firstName || '',
            lastName: student.lastName || '',
            externalName: student.externalName || '',
            studentId: student.studentId || '',
            email: student.email || '',
            dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split('T')[0] : '',
            gender: student.gender || '',
            currentClass: student.currentClass?._id || student.currentClass || '',
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
        setShowStudentEditModal(true);
    };

    const resetStudentForm = () => {
        setEditingStudentId(null);
        setStudentFormData(emptyStudentForm(academicYear));
    };

    const handleStudentSubmit = async (event) => {
        event.preventDefault();
        if (!editingStudentId || savingStudent) return;
        setSavingStudent(true);
        try {
            const payload = { ...studentFormData, department: studentFormData.department || null };
            const result = await dispatch(updateStudent({ id: editingStudentId, data: payload }));
            if (updateStudent.fulfilled.match(result)) {
                toast.success(t('students:toast.updated'));
                setShowStudentEditModal(false);
                resetStudentForm();
                dispatch(fetchClass(id));
            } else {
                toast.error(t('students:toast.updateFailed'));
            }
        } finally {
            setSavingStudent(false);
        }
    };

    const statusTitleKey = view.kind === 'notFound'
        ? 'classes:detail.notFoundTitle'
        : view.kind === 'forbidden'
            ? 'classes:detail.forbiddenTitle'
            : 'classes:detail.errorTitle';
    const statusBodyKey = view.kind === 'notFound'
        ? 'classes:detail.notFoundBody'
        : view.kind === 'forbidden'
            ? 'classes:detail.forbiddenBody'
            : 'classes:detail.errorBody';

    return (
        <div className="class-detail-page" aria-busy={view.refreshing || undefined}>
            <div className="cd-topline">
                <Link to="/portal/classes" className="cd-back-link">
                    <HiOutlineArrowLeft aria-hidden="true" />
                    <span>{t('classes:detail.back')}</span>
                </Link>
                {view.refreshing && (
                    <span className="cd-refreshing" role="status">{t('classes:detail.refreshing')}</span>
                )}
            </div>

            {view.kind === 'loading' && (
                <div className="cd-skeleton" aria-live="polite">
                    <span className="gp-sr-only">{t('classes:detail.loading')}</span>
                    <div className="cd-skeleton-head">
                        <div className="gp-skeleton" style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)' }} />
                        <div className="gp-skeleton-lines">
                            <div className="gp-skeleton" style={{ width: '42%', height: 20 }} />
                            <div className="gp-skeleton" style={{ width: '28%', height: 12 }} />
                        </div>
                    </div>
                    <div className="gp-surface">
                        {[0, 1, 2, 3, 4].map((row) => (
                            <div className="gp-skeleton-row" key={row}>
                                <div className="gp-skeleton" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                                <div className="gp-skeleton-lines">
                                    <div className="gp-skeleton" style={{ width: '38%', height: 12 }} />
                                    <div className="gp-skeleton" style={{ width: '60%', height: 10 }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(view.kind === 'notFound' || view.kind === 'forbidden' || view.kind === 'error') && (
                <div className="gp-surface">
                    <div className="gp-empty" role={view.kind === 'error' ? 'alert' : undefined}>
                        <span className="gp-empty-icon">
                            <HiOutlineExclamationCircle size={26} />
                        </span>
                        <h2>{t(statusTitleKey)}</h2>
                        <p>{t(statusBodyKey)}</p>
                        <div className="cd-status-actions">
                            {view.kind === 'error' && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => dispatch(fetchClass(id))}
                                >
                                    {t('common:actions.retry')}
                                </button>
                            )}
                            <Link to="/portal/classes" className="btn btn-secondary btn-sm">
                                {t('classes:detail.back')}
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {view.kind === 'ready' && currentClass && (
                <>
                    <header className="cd-identity gp-surface">
                        <div className="cd-identity-main">
                            <div className="cd-grade">{currentClass.grade}</div>
                            <div className="cd-identity-text">
                                <h1 className="cd-title">{currentClass.name}</h1>
                                <div className="cd-meta">
                                    <span className="cd-meta-chip">
                                        {t('classes:detail.meta.academicYear', { year: currentClass.academicYear })}
                                    </span>
                                    {currentClass.section && (
                                        <span className="cd-meta-chip">
                                            {t('classes:detail.meta.section', { section: currentClass.section })}
                                        </span>
                                    )}
                                    {currentClass.department?.name && (
                                        <span className="cd-meta-chip">{currentClass.department.name}</span>
                                    )}
                                    <span className="cd-meta-chip">
                                        {currentClass.room || t('classes:detail.meta.noRoom')}
                                    </span>
                                    {currentClass.isActive === false && (
                                        <span className="cd-meta-chip is-inactive">{t('classes:status.inactive')}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="cd-identity-side">
                            <div className="cd-counts">
                                <span className="gp-count-pill">
                                    <HiOutlineUserGroup size={14} aria-hidden="true" />
                                    {t('classes:detail.meta.studentsCount', { total: students.length })}
                                </span>
                                <span className="gp-count-pill">
                                    <HiOutlineBookOpen size={14} aria-hidden="true" />
                                    {t('classes:detail.meta.subjectsCount', { total: currentClass.subjects?.length || 0 })}
                                </span>
                                {currentClass.capacity > 0 && (
                                    <span className="cd-capacity">
                                        <bdi dir="ltr">{students.length} / {currentClass.capacity}</bdi>
                                        <span>{t('classes:detail.meta.capacityLabel')}</span>
                                    </span>
                                )}
                            </div>
                            <div className="cd-actions">
                                <Link to={`/portal/grades/entry?class=${id}`} className="btn btn-primary">
                                    <HiOutlineClipboardList aria-hidden="true" />
                                    {t('classes:detail.actions.enterGrades')}
                                </Link>
                                <Link to={`/portal/classes/${id}/gradebook`} className="btn btn-secondary">
                                    <HiOutlineBookOpen aria-hidden="true" />
                                    {t('classes:detail.actions.gradebook')}
                                </Link>
                                <Link to={`/portal/grades/weekly/class/${id}`} className="btn btn-secondary">
                                    <HiOutlineDocumentText aria-hidden="true" />
                                    {t('classes:detail.actions.weeklyReport')}
                                </Link>
                                {canEditClass && (
                                    <button type="button" className="btn btn-secondary" onClick={openEditModal}>
                                        <HiOutlinePencil aria-hidden="true" />
                                        {t('classes:detail.actions.editClass')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </header>

                    {view.error && (
                        <div className="gp-error" role="alert">
                            <p>{t('classes:detail.refreshFailed')}</p>
                            <div className="gp-error-actions">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => dispatch(fetchClass(id))}
                                >
                                    {t('common:actions.retry')}
                                </button>
                            </div>
                        </div>
                    )}

                    <section className="cd-roster gp-surface" aria-labelledby="cd-roster-title">
                        <div className="cd-section-head">
                            <h2 id="cd-roster-title" className="cd-section-title">
                                {t('classes:detail.roster.title')}
                            </h2>
                            <div className="cd-section-actions">
                                <span className="gp-count-pill">
                                    {t('classes:detail.roster.count', { total: students.length })}
                                </span>
                                {canEditClass && (
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-primary"
                                        onClick={() => setShowEnrollModal(true)}
                                    >
                                        <HiOutlinePlus aria-hidden="true" />
                                        {t('classes:detail.actions.enrollStudents')}
                                    </button>
                                )}
                            </div>
                        </div>

                        {students.length === 0 ? (
                            <div className="gp-empty">
                                <span className="gp-empty-icon">
                                    <HiOutlineUserGroup size={26} />
                                </span>
                                <h3>{t('classes:detail.roster.emptyTitle')}</h3>
                                <p>{t('classes:detail.roster.emptyBody')}</p>
                                {canEditClass && (
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setShowEnrollModal(true)}
                                    >
                                        {t('classes:detail.actions.enrollStudents')}
                                    </button>
                                )}
                            </div>
                        ) : isCompact ? (
                            <div className="cd-student-list">
                                {students.map((student) => (
                                    <article className="cd-student-card" key={student._id}>
                                        <div className="cd-student-head">
                                            <div className="avatar-sm" aria-hidden="true">{studentInitials(student)}</div>
                                            <div className="cd-student-identity">
                                                <Link to={`/portal/students/${student._id}`} className="cd-student-link">
                                                    {studentName(student)}
                                                </Link>
                                                <span className="cd-student-id">{student.studentId}</span>
                                                <span className="cd-student-gender">
                                                    {t(`students:genders.${student.gender || 'other'}`)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="cd-student-actions">
                                            <Link to={`/portal/grades/student/${student._id}`} className="btn btn-sm btn-secondary">
                                                {t('classes:detail.studentActions.gradebook')}
                                            </Link>
                                            <Link to={`/portal/grades/report/${student._id}`} className="btn btn-sm btn-secondary">
                                                {t('classes:detail.studentActions.report')}
                                            </Link>
                                            <Link to={`/portal/students/${student._id}`} className="btn btn-sm btn-secondary">
                                                {t('classes:detail.studentActions.details')}
                                            </Link>
                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => openEditStudent(student)}
                                                >
                                                    <HiOutlinePencil size={16} aria-hidden="true" />
                                                    {t('classes:detail.studentActions.edit')}
                                                </button>
                                            )}
                                            {canEditClass && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm cd-quiet-danger"
                                                    onClick={() => requestUnenroll(student)}
                                                    aria-label={t('classes:detail.roster.unenrollAria', { name: studentName(student) })}
                                                >
                                                    {t('classes:detail.studentActions.remove')}
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="cd-roster-scroll">
                                <table className="cd-roster-table">
                                    <thead>
                                        <tr>
                                            <th>{t('classes:detail.roster.columns.student')}</th>
                                            <th>{t('classes:detail.roster.columns.id')}</th>
                                            <th>{t('classes:detail.roster.columns.gender')}</th>
                                            <th className="cd-roster-actions-head">{t('classes:detail.roster.columns.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map((student) => (
                                            <tr key={student._id}>
                                                <td>
                                                    <div className="cd-student-cell">
                                                        <div className="avatar-sm" aria-hidden="true">{studentInitials(student)}</div>
                                                        <Link to={`/portal/students/${student._id}`} className="cd-student-link">
                                                            {studentName(student)}
                                                        </Link>
                                                    </div>
                                                </td>
                                                <td className="cd-muted cd-student-id">{student.studentId}</td>
                                                <td className="cd-muted">
                                                    {t(`students:genders.${student.gender || 'other'}`)}
                                                </td>
                                                <td>
                                                    <div className="cd-row-actions">
                                                        <Link to={`/portal/grades/student/${student._id}`} className="cd-row-action">
                                                            {t('classes:detail.studentActions.gradebook')}
                                                        </Link>
                                                        <Link to={`/portal/grades/report/${student._id}`} className="cd-row-action">
                                                            {t('classes:detail.studentActions.report')}
                                                        </Link>
                                                        <Link to={`/portal/students/${student._id}`} className="cd-row-action">
                                                            {t('classes:detail.studentActions.details')}
                                                        </Link>
                                                        {isAdmin && (
                                                            <button
                                                                type="button"
                                                                className="cd-row-action"
                                                                onClick={() => openEditStudent(student)}
                                                            >
                                                                {t('classes:detail.studentActions.edit')}
                                                            </button>
                                                        )}
                                                        {canEditClass && (
                                                            <>
                                                                <span className="cd-row-divider" aria-hidden="true" />
                                                                <button
                                                                    type="button"
                                                                    className="cd-row-action cd-quiet-danger"
                                                                    onClick={() => requestUnenroll(student)}
                                                                    aria-label={t('classes:detail.roster.unenrollAria', { name: studentName(student) })}
                                                                >
                                                                    {t('classes:detail.studentActions.remove')}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <div className="cd-lower-grid">
                        <section className="cd-subjects gp-surface" aria-labelledby="cd-subjects-title">
                            <div className="cd-section-head">
                                <h2 id="cd-subjects-title" className="cd-section-title">
                                    {t('classes:detail.subjects.title')}
                                </h2>
                                {isAdmin && (
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => setShowSubjectModal(true)}
                                    >
                                        <HiOutlinePlus aria-hidden="true" />
                                        {t('classes:detail.subjects.add')}
                                    </button>
                                )}
                            </div>
                            {currentClass.subjects?.length > 0 ? (
                                <ul className="cd-subject-list">
                                    {currentClass.subjects.map((item, index) => {
                                        const removableSubjectId = item.subject?._id || item.subject || item._id;
                                        const homeroom = isHomeroomSubject(item.subject);
                                        return (
                                            <li className="cd-subject-row" key={item._id || item.subject?._id || index}>
                                                <div className="cd-subject-main">
                                                    <span className="cd-subject-name">
                                                        {item.subject?.name || t('classes:detail.subjects.unknown')}
                                                    </span>
                                                    {item.subject?.code && (
                                                        <span className="cd-subject-code">{item.subject.code}</span>
                                                    )}
                                                </div>
                                                <div className="cd-subject-meta">
                                                    <span className="cd-subject-teacher">
                                                        <HiOutlineUser size={14} aria-hidden="true" />
                                                        <span className="gp-sr-only">
                                                            {t('classes:detail.subjects.teacherAria')}
                                                        </span>
                                                        {formatTeacherName(item.teacher)
                                                            || t('classes:detail.subjects.unassigned')}
                                                    </span>
                                                    {homeroom && (
                                                        <span className="cd-homeroom" title={t('classes:detail.subjects.homeroomHint')}>
                                                            {t('classes:detail.subjects.homeroom')}
                                                        </span>
                                                    )}
                                                    {isAdmin && removableSubjectId && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm cd-quiet-danger"
                                                            onClick={() => requestRemoveSubject(item, removableSubjectId)}
                                                        >
                                                            {t('classes:detail.subjects.remove')}
                                                        </button>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="cd-muted cd-empty-inline">{t('classes:detail.subjects.empty')}</p>
                            )}
                        </section>

                        <section className="cd-analytics gp-surface" aria-labelledby="cd-analytics-title">
                            <div className="cd-section-head">
                                <h2 id="cd-analytics-title" className="cd-section-title">
                                    <HiOutlineChartBar aria-hidden="true" />
                                    {t('classes:detail.analytics.title')}
                                </h2>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-secondary"
                                    onClick={handleLoadAnalytics}
                                    disabled={analyticsLoading}
                                >
                                    {analyticsLoading
                                        ? t('classes:detail.analytics.loading')
                                        : showAnalytics
                                            ? t('classes:detail.actions.refreshAnalytics')
                                            : t('classes:detail.actions.loadAnalytics')}
                                </button>
                            </div>

                            {showAnalytics && (
                                <div className="cd-analytics-content">
                                    {analyticsError && (
                                        <div className="cd-inline-error" role="alert">
                                            <span>{analyticsError}</span>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-secondary"
                                                onClick={handleLoadAnalytics}
                                            >
                                                {t('common:actions.retry')}
                                            </button>
                                        </div>
                                    )}

                                    {analyticsLoading && !analytics && (
                                        <div className="cd-analytics-skeleton" aria-busy="true">
                                            <span className="gp-sr-only">{t('classes:detail.analytics.loading')}</span>
                                            {[0, 1, 2].map((row) => (
                                                <div className="gp-skeleton" key={row} style={{ height: 14 }} />
                                            ))}
                                        </div>
                                    )}

                                    {analytics && !hasAnalyticsData && (
                                        <p className="cd-muted">{t('classes:detail.analytics.noData')}</p>
                                    )}

                                    {analytics && hasAnalyticsData && (
                                        <div className="cd-analytics-summary">
                                            {analytics.gradeStatsBySubject?.length > 0 && (
                                                <div className="cd-analytics-block">
                                                    <h3>{t('classes:detail.analytics.bySubject')}</h3>
                                                    <ul className="cd-analytics-list">
                                                        {analytics.gradeStatsBySubject.map((row) => (
                                                            <li key={row.subjectId}>
                                                                <span>{row.subjectName}</span>
                                                                <span className="cd-analytics-stat">
                                                                    <bdi dir="ltr">{row.classAverage}%</bdi>
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {analytics.attendanceSummary && (
                                                <div className="cd-analytics-block">
                                                    <h3>{t('classes:detail.analytics.attendance')}</h3>
                                                    <p>
                                                        {t('classes:detail.analytics.present', {
                                                            rate: analytics.attendanceSummary.averageRate
                                                        })}
                                                        {analytics.attendanceSummary.totalSessions != null && (
                                                            <span className="cd-muted">
                                                                {' '}
                                                                {t('classes:detail.analytics.sessions', {
                                                                    total: analytics.attendanceSummary.totalSessions
                                                                })}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            )}
                                            {analytics.studentsToSupport?.length > 0 && (
                                                <div className="cd-analytics-block">
                                                    <h3>
                                                        {t('classes:detail.analytics.support', {
                                                            total: analytics.atRiskCount ?? analytics.studentsToSupport.length
                                                        })}
                                                    </h3>
                                                    <ul className="cd-analytics-list">
                                                        {analytics.studentsToSupport.map((student) => (
                                                            <li key={student._id}>
                                                                <Link to={`/portal/students/${student._id}`}>
                                                                    {student.firstName} {student.lastName}
                                                                </Link>
                                                                {(student.averagePercentage != null || student.attendanceRate != null) && (
                                                                    <span className="cd-muted">
                                                                        {student.averagePercentage != null && (
                                                                            <bdi dir="ltr">
                                                                                {t('classes:detail.analytics.supportAvg', { value: student.averagePercentage })}
                                                                            </bdi>
                                                                        )}
                                                                        {student.attendanceRate != null && (
                                                                            <bdi dir="ltr">
                                                                                {t('classes:detail.analytics.supportAttendance', { value: student.attendanceRate })}
                                                                            </bdi>
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="cd-insights-controls">
                                        <label className="cd-field">
                                            <span>{t('classes:detail.analytics.primaryLanguage')}</span>
                                            <select
                                                value={insightsPrimaryLanguage}
                                                onChange={(event) => {
                                                    const nextPrimary = event.target.value;
                                                    setInsightsPrimaryLanguage(nextPrimary);
                                                    if (nextPrimary === insightsSecondaryLanguage) {
                                                        setInsightsSecondaryLanguage('');
                                                    }
                                                }}
                                                disabled={insightsLoading}
                                                aria-label={t('classes:detail.analytics.primaryLanguage')}
                                            >
                                                {AI_LANGUAGE_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="cd-field">
                                            <span>{t('classes:detail.analytics.secondaryLanguage')}</span>
                                            <select
                                                value={insightsSecondaryLanguage}
                                                onChange={(event) => setInsightsSecondaryLanguage(event.target.value)}
                                                disabled={insightsLoading}
                                                aria-label={t('classes:detail.analytics.secondaryLanguage')}
                                            >
                                                <option value="">{t('classes:detail.analytics.noSecondary')}</option>
                                                {AI_LANGUAGE_OPTIONS
                                                    .filter((option) => option.value !== insightsPrimaryLanguage)
                                                    .map((option) => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                            </select>
                                        </label>
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={handleGenerateInsights}
                                            disabled={insightsLoading}
                                        >
                                            <HiOutlineLightBulb aria-hidden="true" />
                                            {insightsLoading
                                                ? t('classes:detail.actions.generating')
                                                : t('classes:detail.actions.generateInsights')}
                                        </button>
                                    </div>

                                    {insightsError && (
                                        <div className="cd-inline-error" role="alert">
                                            <span>{insightsError}</span>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-secondary"
                                                onClick={handleGenerateInsights}
                                                disabled={insightsLoading}
                                            >
                                                {t('common:actions.retry')}
                                            </button>
                                        </div>
                                    )}

                                    {insightsText && (
                                        <div className="cd-insights-block">
                                            <h3>{t('classes:detail.analytics.insights')}</h3>
                                            <div className="cd-insights-text">
                                                {insightsText
                                                    .split(/\n+/)
                                                    .filter(Boolean)
                                                    .map((line, index) => (
                                                        <p key={index}>{line.replace(/^[-•]\s*/, '')}</p>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                </>
            )}

            {showEditModal && (
                <div
                    className="gp-overlay"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !submitting) closeEditModal();
                    }}
                >
                    <div
                        ref={editDialogRef}
                        className="gp-dialog cd-dialog-lg"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cd-edit-title"
                        aria-busy={submitting || undefined}
                        tabIndex={-1}
                    >
                        <div className="gp-dialog-head">
                            <h2 id="cd-edit-title" className="gp-dialog-title">
                                {t('classes:detail.editDialog.title')}
                            </h2>
                            <button
                                type="button"
                                className="gp-dialog-close"
                                onClick={closeEditModal}
                                disabled={submitting}
                                aria-label={t('common:actions.close')}
                            >
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleUpdateClass}>
                            <div className="gp-dialog-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="cd-edit-grade">{t('classes:form.gradeLevel')}</label>
                                        <select
                                            id="cd-edit-grade"
                                            value={editFormData.grade}
                                            onChange={(event) => setEditFormData({ ...editFormData, grade: event.target.value })}
                                            required
                                        >
                                            <option value="">{t('classes:form.selectGrade')}</option>
                                            {[...Array(12)].map((_, index) => (
                                                <option key={index + 1} value={index + 1}>
                                                    {t('classes:form.gradeOption', { grade: index + 1 })}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="cd-edit-section">{t('classes:form.section')}</label>
                                        <input
                                            id="cd-edit-section"
                                            type="text"
                                            placeholder={t('classes:form.sectionPlaceholder')}
                                            value={editFormData.section}
                                            onChange={(event) => setEditFormData({
                                                ...editFormData,
                                                section: event.target.value.toUpperCase()
                                            })}
                                            maxLength={2}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="cd-edit-year">{t('classes:form.academicYear')}</label>
                                        <input
                                            id="cd-edit-year"
                                            type="text"
                                            placeholder={t('classes:form.academicYearPlaceholder')}
                                            value={editFormData.academicYear}
                                            onChange={(event) => setEditFormData({ ...editFormData, academicYear: event.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="cd-edit-department">{t('classes:form.department')}</label>
                                        <select
                                            id="cd-edit-department"
                                            value={editFormData.department}
                                            onChange={(event) => setEditFormData({ ...editFormData, department: event.target.value })}
                                        >
                                            <option value="">{t('classes:form.noDepartment')}</option>
                                            {departments.map((department) => (
                                                <option key={department._id} value={department._id}>{department.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="cd-edit-room">{t('classes:form.room')}</label>
                                        <input
                                            id="cd-edit-room"
                                            type="text"
                                            placeholder={t('classes:form.roomPlaceholder')}
                                            value={editFormData.room}
                                            onChange={(event) => setEditFormData({ ...editFormData, room: event.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="cd-edit-capacity">{t('classes:form.capacity')}</label>
                                        <input
                                            id="cd-edit-capacity"
                                            type="number"
                                            value={editFormData.capacity}
                                            onChange={(event) => setEditFormData({
                                                ...editFormData,
                                                capacity: parseInt(event.target.value, 10) || 40
                                            })}
                                            min={1}
                                            max={100}
                                        />
                                    </div>
                                </div>
                                <label className="cd-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={editFormData.isActive}
                                        onChange={(event) => setEditFormData({ ...editFormData, isActive: event.target.checked })}
                                    />
                                    <span>{t('classes:detail.editDialog.active')}</span>
                                </label>
                            </div>
                            <div className="gp-dialog-foot">
                                <button type="button" className="btn btn-secondary" onClick={closeEditModal} disabled={submitting}>
                                    {t('common:actions.cancel')}
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting
                                        ? t('classes:detail.editDialog.saving')
                                        : t('classes:detail.editDialog.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showSubjectModal && (
                <div
                    className="gp-overlay"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !submitting) closeSubjectModal();
                    }}
                >
                    <div
                        ref={subjectDialogRef}
                        className="gp-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cd-subject-title"
                        aria-busy={submitting || undefined}
                        tabIndex={-1}
                    >
                        <div className="gp-dialog-head">
                            <h2 id="cd-subject-title" className="gp-dialog-title">
                                {t('classes:detail.subjectDialog.title')}
                            </h2>
                            <button
                                type="button"
                                className="gp-dialog-close"
                                onClick={closeSubjectModal}
                                disabled={submitting}
                                aria-label={t('common:actions.close')}
                            >
                                ×
                            </button>
                        </div>
                        <form onSubmit={handleAddSubject}>
                            <div className="gp-dialog-body">
                                <div className="form-group">
                                    <label htmlFor="cd-subject-select">{t('classes:detail.subjectDialog.subject')}</label>
                                    <select
                                        id="cd-subject-select"
                                        ref={subjectSelectRef}
                                        value={selectedSubject}
                                        onChange={(event) => setSelectedSubject(event.target.value)}
                                        required
                                    >
                                        <option value="">{t('classes:detail.subjectDialog.selectSubject')}</option>
                                        {subjectsList.map((subject) => (
                                            <option key={subject._id} value={subject._id}>
                                                {subject.name} ({subject.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="cd-teacher-select">{t('classes:detail.subjectDialog.teacher')}</label>
                                    <select
                                        id="cd-teacher-select"
                                        value={selectedTeacher}
                                        onChange={(event) => setSelectedTeacher(event.target.value)}
                                        required
                                    >
                                        <option value="">{t('classes:detail.subjectDialog.selectTeacher')}</option>
                                        {teachersList.map((teacher) => (
                                            <option key={teacher._id} value={teacher._id}>
                                                {formatTeacherName(teacher)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="gp-dialog-foot">
                                <button type="button" className="btn btn-secondary" onClick={closeSubjectModal} disabled={submitting}>
                                    {t('common:actions.cancel')}
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting
                                        ? t('classes:detail.subjectDialog.adding')
                                        : t('classes:detail.subjectDialog.add')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEnrollModal && (
                <div
                    className="gp-overlay"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !enrolling) closeEnrollModal();
                    }}
                >
                    <div
                        ref={enrollDialogRef}
                        className="gp-dialog cd-dialog-lg"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cd-enroll-title"
                        aria-busy={enrolling || undefined}
                        tabIndex={-1}
                    >
                        <div className="gp-dialog-head">
                            <h2 id="cd-enroll-title" className="gp-dialog-title">
                                {t('classes:detail.enroll.title')}
                            </h2>
                            <button
                                type="button"
                                className="gp-dialog-close"
                                onClick={closeEnrollModal}
                                disabled={enrolling}
                                aria-label={t('common:actions.close')}
                            >
                                ×
                            </button>
                        </div>
                        <div className="gp-dialog-body">
                            <div className="cd-enroll-search">
                                <label htmlFor="cd-enroll-input">{t('classes:detail.enroll.searchLabel')}</label>
                                <div className="gp-search">
                                    <HiOutlineSearch className="gp-search-icon" aria-hidden="true" />
                                    <input
                                        id="cd-enroll-input"
                                        ref={enrollSearchRef}
                                        type="text"
                                        value={enrollQuery}
                                        onChange={(event) => setEnrollQuery(event.target.value)}
                                        placeholder={t('classes:detail.enroll.searchPlaceholder')}
                                        autoComplete="off"
                                    />
                                    {enrollQuery && (
                                        <button
                                            type="button"
                                            className="gp-search-clear"
                                            onClick={() => setEnrollQuery('')}
                                            aria-label={t('classes:detail.enroll.clearSearch')}
                                        >
                                            <HiOutlineX size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {selectedStudentIds.length > 0 && (
                                <div className="cd-selected-bar">
                                    <span>{t('classes:detail.enroll.selected', { total: selectedStudentIds.length })}</span>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setSelectedStudentIds([])}
                                    >
                                        {t('classes:detail.enroll.clearSelection')}
                                    </button>
                                </div>
                            )}

                            <div className="cd-enroll-results" aria-live="polite">
                                {enrollStatus === 'idle' && (
                                    <p className="cd-enroll-hint">{t('classes:detail.enroll.minQuery')}</p>
                                )}
                                {enrollStatus === 'searching' && (
                                    <p className="cd-enroll-hint">{t('classes:detail.enroll.searching')}</p>
                                )}
                                {enrollStatus === 'empty' && (
                                    <p className="cd-enroll-hint">
                                        {t('classes:detail.enroll.noResults', { query: enrollQuery.trim() })}
                                    </p>
                                )}
                                {enrollStatus === 'all-enrolled' && (
                                    <p className="cd-enroll-hint">
                                        {t('classes:detail.enroll.allEnrolled', { query: enrollQuery.trim() })}
                                    </p>
                                )}
                                {enrollStatus === 'error' && (
                                    <div className="cd-inline-error" role="alert">
                                        <span>{enrollError || t('classes:detail.enroll.searchFailed')}</span>
                                        <button type="button" className="btn btn-sm btn-secondary" onClick={retryEnrollSearch}>
                                            {t('common:actions.retry')}
                                        </button>
                                    </div>
                                )}
                                {enrollStatus === 'ready' && enrollResults.map((student) => {
                                    const checked = selectedStudentIds.includes(student._id);
                                    return (
                                        <label
                                            key={student._id}
                                            className={`cd-enroll-row${checked ? ' is-selected' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleStudentSelection(student._id)}
                                            />
                                            <span className="avatar-sm" aria-hidden="true">{studentInitials(student)}</span>
                                            <span className="cd-enroll-info">
                                                <span className="cd-enroll-name">{studentName(student)}</span>
                                                <span className="cd-enroll-meta">
                                                    {student.studentId}
                                                    {student.currentClass?.name ? ` • ${student.currentClass.name}` : ''}
                                                </span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>

                            {selectedStudentIds.length === 0 && (
                                <p className="cd-enroll-hint">{t('classes:detail.enroll.selectHint')}</p>
                            )}
                        </div>
                        <div className="gp-dialog-foot">
                            <button type="button" className="btn btn-secondary" onClick={closeEnrollModal} disabled={enrolling}>
                                {t('common:actions.cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleEnrollSubmit}
                                disabled={enrolling || selectedStudentIds.length === 0}
                            >
                                {enrolling
                                    ? t('classes:detail.enroll.enrolling')
                                    : selectedStudentIds.length > 0
                                        ? t('classes:detail.enroll.enroll', { total: selectedStudentIds.length })
                                        : t('classes:detail.enroll.enrollAction')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={Boolean(removeSubjectTarget)}
                title={t('classes:detail.confirm.removeSubjectTitle')}
                message={removeSubjectTarget
                    ? t('classes:detail.confirm.removeSubjectBody', { subject: removeSubjectTarget.name })
                    : ''}
                confirmLabel={t('classes:detail.confirm.remove')}
                cancelLabel={t('common:actions.cancel')}
                closeLabel={t('common:actions.close')}
                tone="danger"
                busy={removingSubject}
                busyLabel={t('classes:detail.confirm.removing')}
                onConfirm={confirmRemoveSubject}
                onCancel={() => {
                    if (removingSubject) return;
                    setRemoveSubjectTarget(null);
                    setRemoveSubjectError('');
                }}
            >
                {removeSubjectError ? (
                    <p className="cd-dialog-error" role="alert">{removeSubjectError}</p>
                ) : null}
            </ConfirmDialog>

            <ConfirmDialog
                open={Boolean(unenrollTarget)}
                title={t('classes:detail.confirm.unenrollTitle')}
                message={unenrollTarget
                    ? t('classes:detail.confirm.unenrollBody', { name: unenrollTarget.name })
                    : ''}
                confirmLabel={t('classes:detail.confirm.remove')}
                cancelLabel={t('common:actions.cancel')}
                closeLabel={t('common:actions.close')}
                tone="danger"
                busy={unenrolling}
                busyLabel={t('classes:detail.confirm.removing')}
                onConfirm={confirmUnenroll}
                onCancel={() => {
                    if (unenrolling) return;
                    setUnenrollTarget(null);
                    setUnenrollError('');
                }}
            >
                {unenrollError ? (
                    <p className="cd-dialog-error" role="alert">{unenrollError}</p>
                ) : null}
            </ConfirmDialog>

            <StudentFormModal
                showModal={showStudentEditModal}
                setShowModal={setShowStudentEditModal}
                isEditing
                formData={studentFormData}
                setFormData={setStudentFormData}
                classes={classes}
                departments={departments}
                resetForm={resetStudentForm}
                handleSubmit={handleStudentSubmit}
            />
        </div>
    );
};

export default ClassDetailPage;
