import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineBookOpen,
    HiOutlineCheck,
    HiOutlineClock,
    HiOutlineOfficeBuilding,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineUpload,
    HiOutlineX
} from 'react-icons/hi';
import { fetchTeachers, selectTeachers } from '../../../../store/slices/teacherSlice';
import { fetchClasses, selectClasses } from '../../../../store/slices/classSlice';
import {
    createSubject,
    deleteSubject,
    fetchSubjects,
    selectSubjects,
    selectSubjectsError,
    selectSubjectsLoading,
    updateSubject
} from '../../../../store/slices/subjectSlice';
import { selectIsAdmin } from '../../../../store/slices/authSlice';
import timetableService from '../../../../services/timetableService';
import roomService from '../../../../services/roomService';
import subjectService from '../../../../services/subjectService';
import { TIMETABLE_DROPDOWN_LIMIT, DAY_LABELS, ROOM_TYPES, ROOM_STATUSES, DEFAULT_WEEK_WORKING_DAYS } from './constants';
import useTimetableAssignmentOptions from './hooks/useTimetableAssignmentOptions';
import { createDefaultAssignment, createDefaultPeriod, createDefaultRoom, formatDateAsYmd } from './utils/timetableState';
import TimetableErrorBanner from './components/TimetableErrorBanner';
import AssignmentFiltersBar from './components/AssignmentFiltersBar';
import SubjectsFilters from '../../../subjects/SubjectsPage/components/SubjectsFilters';
import SubjectsTable from '../../../subjects/SubjectsPage/components/SubjectsTable';
import SubjectFormModal from '../../../subjects/SubjectsPage/components/SubjectFormModal';
import useSubjectsPageState from '../../../subjects/SubjectsPage/hooks/useSubjectsPageState';
import { createDefaultSubjectForm } from '../../../subjects/SubjectsPage/constants';
import { mapSubjectToFormData } from '../../../subjects/SubjectsPage/utils/subjectPresentation';
import { parseCsvFile } from '../../../../utils/csvImport';
import toast from 'react-hot-toast';
import TablePagination from '../../../../components/common/TablePagination';
import './AdminTimetablePage.css';
import '../../../subjects/SubjectsPage/SubjectsPage.css';

const DEFAULT_ASSIGNMENTS_PAGE_SIZE = 10;
const DEFAULT_PERIODS_PAGE_SIZE = 8;

const formatShortDate = (value, locale = undefined) => {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const formatAssignmentWindow = (startDate, endDate, t, locale) => {
    if (!startDate && !endDate) return t('adminTimetable:assignment.alwaysActive');
    if (!endDate) return t('adminTimetable:assignment.startsOn', { date: formatShortDate(startDate, locale) });
    if (!startDate) return t('adminTimetable:assignment.untilDate', { date: formatShortDate(endDate, locale) });
    return `${formatShortDate(startDate, locale)} - ${formatShortDate(endDate, locale)}`;
};

const formatAssignmentDays = (daysOfWeek = []) => {
    return [...daysOfWeek]
        .sort((left, right) => left - right);
};

const normalizeDays = (candidate, fallback = DEFAULT_WEEK_WORKING_DAYS) => {
    if (!Array.isArray(candidate)) return [...fallback];

    const normalized = Array.from(
        new Set(
            candidate
                .map((value) => Number.parseInt(value, 10))
                .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        )
    ).sort((left, right) => left - right);

    return normalized.length > 0 ? normalized : [...fallback];
};

const AdminTimetablePage = () => {
    const { t, i18n } = useTranslation(['adminTimetable', 'subjects', 'common']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
    const dispatch = useDispatch();
    const location = useLocation();

    const teachers = useSelector(selectTeachers);
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);
    const subjectsLoading = useSelector(selectSubjectsLoading);
    const subjectsError = useSelector(selectSubjectsError);
    const isAdmin = useSelector(selectIsAdmin);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const [periods, setPeriods] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [weekWorkingDays, setWeekWorkingDays] = useState(DEFAULT_WEEK_WORKING_DAYS);

    const [editingAssignmentId, setEditingAssignmentId] = useState(null);
    const [filterTeacher, setFilterTeacher] = useState('');
    const [filterClass, setFilterClass] = useState('');

    const [newPeriod, setNewPeriod] = useState(createDefaultPeriod);
    const [editingPeriod, setEditingPeriod] = useState(null);
    const [newAssignment, setNewAssignment] = useState(() => createDefaultAssignment(undefined, DEFAULT_WEEK_WORKING_DAYS));
    const [assignmentsPage, setAssignmentsPage] = useState(1);
    const [assignmentsPageSize, setAssignmentsPageSize] = useState(DEFAULT_ASSIGNMENTS_PAGE_SIZE);
    const [periodsPage, setPeriodsPage] = useState(1);
    const [periodsPageSize, setPeriodsPageSize] = useState(DEFAULT_PERIODS_PAGE_SIZE);

    const [showRoomModal, setShowRoomModal] = useState(false);
    const [newRoom, setNewRoom] = useState(createDefaultRoom);
    const [savingRoom, setSavingRoom] = useState(false);

    const [bulkDates, setBulkDates] = useState({ startDate: '', endDate: '' });
    const [savingBulkDates, setSavingBulkDates] = useState(false);
    const [currentAcademicYear, setCurrentAcademicYear] = useState('');
    const [migrationForm, setMigrationForm] = useState({
        sourceAcademicYear: '',
        targetAcademicYear: '',
        overwriteMode: 'skip_conflicts',
        dateMode: 'clamp_to_target_year'
    });
    const [savingMigration, setSavingMigration] = useState(false);

    const periodImportInputRef = useRef(null);
    const roomImportInputRef = useRef(null);
    const subjectImportInputRef = useRef(null);
    const subjectsSectionRef = useRef(null);

    const {
        searchTerm,
        setSearchTerm,
        showModal,
        setShowModal,
        editingId,
        setEditingId,
        submitting,
        setSubmitting,
        formData,
        setFormData,
        filteredSubjects,
        resetForm
    } = useSubjectsPageState(subjects);

    const {
        filteredAssignments,
        availableClasses,
        availableSubjects,
        occupiedRoomIds
    } = useTimetableAssignmentOptions({
        teachers,
        classes,
        subjects,
        assignments,
        newAssignment,
        filterTeacher,
        filterClass,
        editingAssignmentId
    });

    const assignmentsTotalPages = Math.max(1, Math.ceil(filteredAssignments.length / assignmentsPageSize));
    const paginatedAssignments = useMemo(() => {
        const startIndex = (assignmentsPage - 1) * assignmentsPageSize;
        return filteredAssignments.slice(startIndex, startIndex + assignmentsPageSize);
    }, [filteredAssignments, assignmentsPage, assignmentsPageSize]);

    const periodsTotalPages = Math.max(1, Math.ceil(periods.length / periodsPageSize));
    const paginatedPeriods = useMemo(() => {
        const startIndex = (periodsPage - 1) * periodsPageSize;
        return periods.slice(startIndex, startIndex + periodsPageSize);
    }, [periods, periodsPage, periodsPageSize]);

    const summaryCards = useMemo(() => {
        const activeAssignments = assignments.filter((assignment) => assignment.isActive !== false).length;
        const availableRooms = rooms.filter((room) => room.status === 'active' && room.isAvailable !== false).length;

        return [
            {
                labelKey: 'summary.subjects.label',
                value: subjects.length,
                helpKey: 'summary.subjects.help'
            },
            {
                labelKey: 'summary.periods.label',
                value: periods.length,
                helpKey: 'summary.periods.help'
            },
            {
                labelKey: 'summary.assignments.label',
                value: activeAssignments,
                helpKey: 'summary.assignments.help'
            },
            {
                labelKey: 'summary.availableRooms.label',
                value: availableRooms,
                helpKey: 'summary.availableRooms.help'
            }
        ];
    }, [assignments, periods, rooms, subjects.length]);

    const dayLabelByValue = useMemo(
        () =>
            DAY_LABELS.reduce((accumulator, day) => {
                accumulator[day.value] = day.labelKey;
                return accumulator;
            }, {}),
        []
    );

    const selectableDayOptions = useMemo(
        () => DAY_LABELS.filter((day) => weekWorkingDays.includes(day.value)),
        [weekWorkingDays]
    );

    const fetchTimetableData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [periodResponse, assignmentResponse, roomResponse] = await Promise.all([
                timetableService.getPeriods(),
                timetableService.getAssignments(),
                roomService.getRooms()
            ]);

            setPeriods(periodResponse?.data?.periods || []);
            const responseWorkingDays = normalizeDays(assignmentResponse?.data?.workingDays, DEFAULT_WEEK_WORKING_DAYS);
            const responseAssignments = assignmentResponse?.data?.assignments || [];
            const responseAcademicYear = assignmentResponse?.data?.academicYear || '';
            setWeekWorkingDays(responseWorkingDays);
            setAssignments(responseAssignments);
            setCurrentAcademicYear(responseAcademicYear);
            setMigrationForm((previousForm) => ({
                ...previousForm,
                sourceAcademicYear: previousForm.sourceAcademicYear || responseAcademicYear
            }));
            setRooms(roomResponse?.data?.rooms || []);
            setNewAssignment((previousAssignment) => {
                const selectedDays = normalizeDays(previousAssignment.daysOfWeek, []);
                const filteredDays = selectedDays.filter((day) => responseWorkingDays.includes(day));
                return {
                    ...previousAssignment,
                    daysOfWeek: filteredDays.length > 0 ? filteredDays : [...responseWorkingDays]
                };
            });
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        dispatch(fetchTeachers({ limit: TIMETABLE_DROPDOWN_LIMIT }));
        dispatch(fetchClasses({ limit: TIMETABLE_DROPDOWN_LIMIT }));
        dispatch(fetchSubjects({ limit: TIMETABLE_DROPDOWN_LIMIT }));
        fetchTimetableData();
    }, [dispatch]);

    useEffect(() => {
        if (location.hash !== '#subjects') return;

        const timeoutId = window.setTimeout(() => {
            subjectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);

        return () => window.clearTimeout(timeoutId);
    }, [location.hash, loading]);

    useEffect(() => {
        setAssignmentsPage(1);
    }, [filterTeacher, filterClass]);

    useEffect(() => {
        if (assignmentsPage > assignmentsTotalPages) {
            setAssignmentsPage(assignmentsTotalPages);
        }
    }, [assignmentsPage, assignmentsTotalPages]);

    useEffect(() => {
        if (periodsPage > periodsTotalPages) {
            setPeriodsPage(periodsTotalPages);
        }
    }, [periodsPage, periodsTotalPages]);

    const addPeriod = async () => {
        try {
            setSaving(true);
            setError(null);

            await timetableService.createPeriod({
                name: `Period ${newPeriod.periodNumber}`,
                startTime: newPeriod.startTime,
                endTime: newPeriod.endTime,
                order: newPeriod.periodNumber,
                isActive: newPeriod.isActive
            });

            setNewPeriod((previousPeriod) => ({
                ...previousPeriod,
                periodNumber: previousPeriod.periodNumber < 8 ? previousPeriod.periodNumber + 1 : 8
            }));
            await fetchTimetableData();
            toast.success(t('adminTimetable:toast.periodCreated'));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSaving(false);
        }
    };

    const deletePeriod = async (id) => {
        if (!window.confirm(t('adminTimetable:confirm.deletePeriod'))) return;

        try {
            setSaving(true);
            setError(null);
            await timetableService.deletePeriod(id);
            if (editingPeriod?._id === id) {
                setEditingPeriod(null);
            }
            await fetchTimetableData();
            toast.success(t('adminTimetable:toast.periodDeleted'));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSaving(false);
        }
    };

    const saveEditedPeriod = async () => {
        if (!editingPeriod) return;

        try {
            setSaving(true);
            setError(null);
            await timetableService.updatePeriod(editingPeriod._id, {
                name: editingPeriod.name,
                startTime: editingPeriod.startTime,
                endTime: editingPeriod.endTime,
                order: editingPeriod.order,
                isActive: editingPeriod.isActive
            });
            setEditingPeriod(null);
            await fetchTimetableData();
            toast.success(t('adminTimetable:toast.periodUpdated'));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSaving(false);
        }
    };

    const submitAssignmentForm = async () => {
        try {
            setSaving(true);
            setError(null);

            const payload = {
                ...newAssignment,
                daysOfWeek: normalizeDays(newAssignment.daysOfWeek, weekWorkingDays)
            };

            if (editingAssignmentId) {
                await timetableService.updateAssignment(editingAssignmentId, payload);
                toast.success(t('adminTimetable:toast.assignmentUpdated'));
                setEditingAssignmentId(null);
            } else {
                await timetableService.createAssignment(payload);
                toast.success(t('adminTimetable:toast.assignmentCreated'));
            }

            setNewAssignment(createDefaultAssignment(undefined, weekWorkingDays));
            await fetchTimetableData();
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSaving(false);
        }
    };

    const cancelAssignmentEdit = () => {
        setEditingAssignmentId(null);
        setNewAssignment(createDefaultAssignment(undefined, weekWorkingDays));
    };

    const applyBulkDates = async () => {
        if (!bulkDates.startDate || !bulkDates.endDate) {
            toast.error(t('adminTimetable:toast.bulkDatesRequired', 'Both start and end dates are required'));
            return;
        }
        if (!window.confirm(t('adminTimetable:confirm.bulkDates', `Update ALL assignments to ${bulkDates.startDate} – ${bulkDates.endDate}? Individual dates can still be changed afterwards.`))) return;
        try {
            setSavingBulkDates(true);
            const result = await timetableService.bulkUpdateAssignmentDates(bulkDates.startDate, bulkDates.endDate);
            toast.success(result.message || t('adminTimetable:toast.bulkDatesUpdated', 'Dates updated'));
            await fetchTimetableData();
        } catch (requestError) {
            toast.error(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSavingBulkDates(false);
        }
    };

    const applyYearMigration = async () => {
        const payload = {
            sourceAcademicYear: migrationForm.sourceAcademicYear.trim(),
            targetAcademicYear: migrationForm.targetAcademicYear.trim(),
            overwriteMode: migrationForm.overwriteMode,
            dateMode: migrationForm.dateMode
        };

        if (!payload.sourceAcademicYear || !payload.targetAcademicYear) {
            toast.error(t('adminTimetable:migration.requiredYears', 'Source and target academic year are required'));
            return;
        }
        if (payload.sourceAcademicYear === payload.targetAcademicYear) {
            toast.error(t('adminTimetable:migration.yearsMustDiffer', 'Source and target academic year must be different'));
            return;
        }

        const confirmed = window.confirm(
            t(
                'adminTimetable:migration.confirm',
                `Migrate timetable assignments from ${payload.sourceAcademicYear} to ${payload.targetAcademicYear}?`
            )
        );
        if (!confirmed) return;

        try {
            setSavingMigration(true);
            const response = await timetableService.migrateAssignmentsYear(payload);
            const summary = response?.data || {};
            toast.success(
                t(
                    'adminTimetable:migration.success',
                    `Done. Created: ${summary.createdCount || 0}, replaced: ${summary.updatedCount || 0}, skipped: ${summary.skippedCount || 0}, conflicts: ${summary.conflictCount || 0}`
                )
            );
            await fetchTimetableData();
        } catch (requestError) {
            toast.error(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSavingMigration(false);
        }
    };

    const fillAssignmentFormForEdit = (assignment) => {
        setEditingAssignmentId(assignment._id);
        const assignmentDays = normalizeDays(assignment.daysOfWeek, weekWorkingDays)
            .filter((day) => weekWorkingDays.includes(day));
        setNewAssignment({
            teacher: assignment.teacher?._id || assignment.teacher || '',
            class: assignment.class?._id || assignment.class || '',
            subject: assignment.subject?._id || assignment.subject || '',
            room: assignment.room?._id || assignment.room || '',
            period: assignment.period?._id || assignment.period || '',
            daysOfWeek: assignmentDays.length > 0 ? assignmentDays : [...weekWorkingDays],
            startDate: formatDateAsYmd(assignment.startDate),
            endDate: formatDateAsYmd(assignment.endDate),
            isActive: assignment.isActive ?? true
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const deleteAssignment = async (id) => {
        if (!window.confirm(t('adminTimetable:confirm.deleteAssignment'))) return;

        try {
            setSaving(true);
            setError(null);
            await timetableService.deleteAssignment(id);
            if (editingAssignmentId === id) {
                cancelAssignmentEdit();
            }
            await fetchTimetableData();
            toast.success(t('adminTimetable:toast.assignmentDeleted'));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleAssignmentDay = (dayValue) => {
        if (!weekWorkingDays.includes(dayValue)) return;

        setNewAssignment((previousAssignment) => {
            const nextDays = previousAssignment.daysOfWeek.includes(dayValue)
                ? previousAssignment.daysOfWeek.filter((existingDay) => existingDay !== dayValue)
                : [...previousAssignment.daysOfWeek, dayValue];

            return {
                ...previousAssignment,
                daysOfWeek: nextDays.sort((left, right) => left - right)
            };
        });
    };

    const handleCreateRoom = async (event) => {
        event?.preventDefault();
        if (!newRoom.name?.trim()) return;

        try {
            setSavingRoom(true);
            setError(null);

            await roomService.createRoom({
                name: newRoom.name.trim(),
                type: newRoom.type,
                capacity: newRoom.capacity || 40,
                building: newRoom.building?.trim() || undefined,
                floor: newRoom.floor?.trim() || undefined,
                number: newRoom.number?.trim() || undefined,
                status: newRoom.status,
                isAvailable: !!newRoom.isAvailable
            });

            setShowRoomModal(false);
            setNewRoom(createDefaultRoom());
            const roomResponse = await roomService.getRooms();
            setRooms(roomResponse?.data?.rooms || []);
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSavingRoom(false);
        }
    };

    const triggerPeriodImport = () => {
        periodImportInputRef.current?.click();
    };

    const triggerRoomImport = () => {
        roomImportInputRef.current?.click();
    };

    const triggerSubjectImport = () => {
        subjectImportInputRef.current?.click();
    };

    const handlePeriodImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error(t('adminTimetable:toast.selectCsv'));
            return;
        }

        const { rows, errors } = await parseCsvFile(file, {
            requiredColumns: ['name', 'startTime', 'endTime']
        });
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        if (rows.length === 0) {
            toast.error(t('adminTimetable:toast.noValidPeriodRows'));
            return;
        }

        try {
            const response = await timetableService.importPeriods(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            toast.success(response?.message || t('adminTimetable:toast.importedPeriods', { count: imported }));
            if (failed > 0) toast.error(t('adminTimetable:toast.failedPeriodRows', { count: failed }));
            await fetchTimetableData();
        } catch (importError) {
            toast.error(importError?.response?.data?.message || t('adminTimetable:toast.importPeriodsFailed'));
        }
    };

    const handleRoomImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error(t('adminTimetable:toast.selectCsv'));
            return;
        }

        const { rows, errors } = await parseCsvFile(file, {
            requiredColumns: ['name']
        });
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        if (rows.length === 0) {
            toast.error(t('adminTimetable:toast.noValidRoomRows'));
            return;
        }

        try {
            const response = await roomService.importRooms(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            toast.success(response?.message || t('adminTimetable:toast.importedRooms', { count: imported }));
            if (failed > 0) toast.error(t('adminTimetable:toast.failedRoomRows', { count: failed }));
            const roomResponse = await roomService.getRooms();
            setRooms(roomResponse?.data?.rooms || []);
        } catch (importError) {
            toast.error(importError?.response?.data?.message || t('adminTimetable:toast.importRoomsFailed'));
        }
    };

    const handleCloseSubjectModal = () => {
        setShowModal(false);
        setEditingId(null);
        resetForm();
    };

    const handleOpenCreateSubject = () => {
        setEditingId(null);
        setFormData(createDefaultSubjectForm());
        setShowModal(true);
    };

    const handleSubjectSubmit = async (event) => {
        event.preventDefault();
        setSubmitting(true);

        try {
            let result;

            if (editingId) {
                result = await dispatch(updateSubject({ id: editingId, data: formData }));
            } else {
                result = await dispatch(createSubject(formData));
            }

            if (createSubject.fulfilled.match(result) || updateSubject.fulfilled.match(result)) {
                toast.success(editingId ? t('subjects:toast.updated') : t('subjects:toast.created'));
                handleCloseSubjectModal();
            } else {
                toast.error(result.payload || (editingId ? t('subjects:toast.updateFailed') : t('subjects:toast.createFailed')));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditSubject = (subject) => {
        setEditingId(subject._id);
        setFormData(mapSubjectToFormData(subject));
        setShowModal(true);
    };

    const handleDeleteSubject = async (id) => {
        if (!window.confirm(t('subjects:confirm.delete'))) return;

        const result = await dispatch(deleteSubject(id));
        if (deleteSubject.fulfilled.match(result)) {
            toast.success(t('subjects:toast.deleted'));
        } else {
            toast.error(result.payload || t('subjects:toast.deleteFailed'));
        }
    };

    const handleSubjectImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error(t('subjects:toast.selectCsv'));
            return;
        }

        const { rows, errors } = await parseCsvFile(file, { requiredColumns: ['name', 'code'] });
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        if (rows.length === 0) {
            toast.error(t('adminTimetable:toast.noValidSubjectRows'));
            return;
        }

        try {
            const response = await subjectService.importSubjects(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            const skipped = response?.summary?.skippedRows ?? response?.data?.skipped ?? 0;

            toast.success(response?.message || t('subjects:toast.imported', { count: imported }));
            if (failed > 0) {
                toast.error(t('subjects:toast.importFailedRows', { count: failed }));
            } else if (skipped > 0) {
                toast(t('subjects:toast.importSkippedRows', { count: skipped }));
            }

            dispatch(fetchSubjects({ limit: TIMETABLE_DROPDOWN_LIMIT }));
        } catch (importError) {
            toast.error(importError?.response?.data?.message || t('subjects:toast.importFailed'));
        }
    };

    if (loading) {
        return (
            <div className="admin-timetable-page">
                <div className="loading-overlay">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-timetable-page">
            <input
                ref={periodImportInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handlePeriodImportFileChange}
            />
            <input
                ref={roomImportInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleRoomImportFileChange}
            />
            <input
                ref={subjectImportInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleSubjectImportFileChange}
            />

            <section className="timetable-hero">
                <div className="page-header">
                    <div className="header-content">
                        <span className="hero-eyebrow">{t('adminTimetable:page.eyebrow')}</span>
                        <h3>{t('adminTimetable:page.title')}</h3>
                        <p>{t('adminTimetable:page.subtitle')}</p>
                    </div>
                    <div className="header-actions"  >
                        {isAdmin && (
                            <button className="btn btn-secondary" onClick={triggerSubjectImport} disabled={saving}>
                                <HiOutlineUpload size={18} />
                                {t('adminTimetable:actions.importSubjectsCsv')}
                            </button>
                        )}
                        <button className="btn btn-secondary" onClick={triggerPeriodImport} disabled={saving}>
                            <HiOutlinePlus size={18} />
                            {t('adminTimetable:actions.importPeriodsCsv')}
                        </button>
                        <button className="btn btn-secondary" onClick={triggerRoomImport} disabled={saving}>
                            <HiOutlineOfficeBuilding size={18} />
                            {t('adminTimetable:actions.importRoomsCsv')}
                        </button>
                        <button className="btn btn-primary" onClick={fetchTimetableData} disabled={saving}>
                            <HiOutlineRefresh size={18} />
                            {t('adminTimetable:actions.refresh')}
                        </button>
                    </div>
                </div>

                    <div className="summary-grid">
                        {summaryCards.map((card) => (
                            <article key={card.labelKey} className="summary-card">
                                <span className="summary-label">{t(`adminTimetable:${card.labelKey}`)}</span>
                                <strong className="summary-value">{card.value}</strong>
                                <span className="summary-help">{t(`adminTimetable:${card.helpKey}`)}</span>
                            </article>
                        ))}
                    </div>
            </section>

            <TimetableErrorBanner error={error} />

            <div className="workspace-grid">
                <div className="workspace-main">
                    <section className="card card-emphasis">
                        <div className="section-heading">
                            <div>
                                <div className="card-title">
                                    <HiOutlineClock size={20} />
                                    {editingAssignmentId
                                        ? t('adminTimetable:assignmentForm.editTitle')
                                        : t('adminTimetable:assignmentForm.buildTitle')}
                                </div>
                                <p className="section-copy">{t('adminTimetable:assignmentForm.subtitle')}</p>
                            </div>
                            {editingAssignmentId && (
                                <button className="btn btn-secondary btn-sm" onClick={cancelAssignmentEdit} disabled={saving}>
                                    {t('adminTimetable:assignmentForm.cancelEdit')}
                                </button>
                            )}
                        </div>

                        <div className="assignment-form">
                            <div className="field">
                                <label>{t('adminTimetable:assignmentForm.teacher')}</label>
                                <select
                                    value={newAssignment.teacher}
                                    onChange={(event) => {
                                        const teacherId = event.target.value;
                                        setNewAssignment((previousAssignment) => ({
                                            ...previousAssignment,
                                            teacher: teacherId,
                                            class: '',
                                            subject: ''
                                        }));
                                    }}
                                >
                                    <option value="">{t('adminTimetable:assignmentForm.teacherPlaceholder')}</option>
                                    {teachers.map((teacher) => (
                                        <option key={teacher._id} value={teacher.user?._id || teacher.user || ''}>
                                            {teacher.user?.firstName} {teacher.user?.lastName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="field">
                                <label>{t('adminTimetable:assignmentForm.class')}</label>
                                <select
                                    value={newAssignment.class}
                                    onChange={(event) => {
                                        const classId = event.target.value;
                                        setNewAssignment((previousAssignment) => ({
                                            ...previousAssignment,
                                            class: classId,
                                            subject: ''
                                        }));
                                    }}
                                    disabled={!newAssignment.teacher}
                                >
                                    <option value="">
                                        {!newAssignment.teacher
                                            ? t('adminTimetable:assignmentForm.classPlaceholderSelectTeacherFirst')
                                            : (availableClasses.length > 0
                                                ? t('adminTimetable:assignmentForm.classPlaceholderSelectClass')
                                                : t('adminTimetable:assignmentForm.classPlaceholderNoClasses'))}
                                    </option>
                                    {availableClasses.map((classItem) => (
                                        <option key={classItem._id} value={classItem._id}>{classItem.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="field">
                                <label>{t('adminTimetable:assignmentForm.subject')}</label>
                                <select
                                    value={newAssignment.subject}
                                    onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, subject: event.target.value }))}
                                    disabled={!newAssignment.teacher}
                                >
                                    <option value="">
                                        {!newAssignment.teacher
                                            ? t('adminTimetable:assignmentForm.subjectPlaceholderSelectTeacherFirst')
                                            : (availableSubjects.length > 0
                                                ? t('adminTimetable:assignmentForm.subjectPlaceholderOptional')
                                                : t('adminTimetable:assignmentForm.subjectPlaceholderNoSubjects'))}
                                    </option>
                                    {availableSubjects.map((subject) => (
                                        <option key={subject._id} value={subject._id}>{subject.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="field field-room">
                                <label>{t('adminTimetable:assignmentForm.room')}</label>
                                <div className="field-with-action">
                                    <select value={newAssignment.room} onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, room: event.target.value }))}>
                                        <option value="">{t('adminTimetable:assignmentForm.roomOptional')}</option>
                                        {rooms.map((room) => {
                                            const isOccupied = occupiedRoomIds.has(room._id);
                                            const blockedByStatus = room.status && room.status !== 'active';
                                            const blockedByAvailability = room.isAvailable === false;
                                            const disabled = isOccupied || blockedByStatus || blockedByAvailability;
                                            const roomLocation = [
                                                room.building,
                                                room.floor ? t('adminTimetable:room.floor', { value: room.floor }) : null,
                                                room.number
                                            ]
                                                .filter(Boolean)
                                                .join(' • ');
                                            const unavailableReason = isOccupied
                                                ? t('adminTimetable:room.unavailable.occupied')
                                                : blockedByStatus
                                                    ? t(`adminTimetable:room.status.${room.status}`, { defaultValue: room.status })
                                                    : blockedByAvailability
                                                        ? t('adminTimetable:room.unavailable.unavailable')
                                                        : '';

                                            return (
                                                <option key={room._id} value={room._id} disabled={disabled}>
                                                    {room.name}
                                                    {roomLocation ? ` — ${roomLocation}` : ''}
                                                    {disabled ? ` (${unavailableReason})` : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setShowRoomModal(true)}
                                        title={t('adminTimetable:actions.addRoom')}
                                    >
                                        <HiOutlineOfficeBuilding size={18} />
                                        {t('adminTimetable:actions.addRoom')}
                                    </button>
                                </div>
                            </div>

                            <div className="field">
                                <label>{t('adminTimetable:assignmentForm.period')}</label>
                                <select value={newAssignment.period} onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, period: event.target.value }))}>
                                    <option value="">{t('adminTimetable:assignmentForm.periodPlaceholder')}</option>
                                    {periods.map((period) => (
                                        <option key={period._id} value={period._id}>{period.name} ({period.startTime}-{period.endTime})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="field">
                                <label>{t('adminTimetable:assignmentForm.startDate')}</label>
                                <input
                                    type="date"
                                    value={newAssignment.startDate}
                                    onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, startDate: event.target.value }))}
                                />
                            </div>

                            <div className="field">
                                <label>{t('adminTimetable:assignmentForm.endDate')}</label>
                                <input
                                    type="date"
                                    value={newAssignment.endDate}
                                    onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, endDate: event.target.value }))}
                                />
                            </div>

                            <div className="field full">
                                <label>{t('adminTimetable:assignmentForm.days')}</label>
                                <div className="weekday-selector">
                                    {selectableDayOptions.map((day) => (
                                        <button
                                            type="button"
                                            key={day.value}
                                            className={`weekday-pill ${newAssignment.daysOfWeek.includes(day.value) ? 'active' : ''}`}
                                            onClick={() => toggleAssignmentDay(day.value)}
                                        >
                                            {t(`adminTimetable:${day.labelKey}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="field full action-row">
                                <button
                                    className="btn btn-primary"
                                    onClick={submitAssignmentForm}
                                    disabled={saving || !newAssignment.teacher || !newAssignment.class || !newAssignment.period}
                                >
                                    {saving
                                        ? t('adminTimetable:actions.saving')
                                        : (editingAssignmentId
                                            ? t('adminTimetable:assignmentForm.submitUpdate')
                                            : t('adminTimetable:assignmentForm.submitCreate'))}
                                </button>
                                <p className="action-note">{t('adminTimetable:assignmentForm.actionNote')}</p>
                            </div>
                        </div>
                    </section>

                    <section className="card assignments-card">
                        <div className="section-heading">
                            <div>
                                <div className="card-title">{t('adminTimetable:assignments.title')}</div>
                                <p className="section-copy">{t('adminTimetable:assignments.subtitle')}</p>
                            </div>
                            <span className="results-badge">
                                {t('adminTimetable:assignments.resultsShown', { count: filteredAssignments.length })}
                            </span>
                        </div>

                        {/* Bulk date updater */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', padding: '0 0 16px', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {t('adminTimetable:migration.sourceYear', 'Source year')}
                                </label>
                                <input
                                    type="text"
                                    value={migrationForm.sourceAcademicYear}
                                    onChange={(e) => setMigrationForm((prev) => ({ ...prev, sourceAcademicYear: e.target.value }))}
                                    placeholder={currentAcademicYear || '2026-2027'}
                                    style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {t('adminTimetable:migration.targetYear', 'Target year')}
                                </label>
                                <input
                                    type="text"
                                    value={migrationForm.targetAcademicYear}
                                    onChange={(e) => setMigrationForm((prev) => ({ ...prev, targetAcademicYear: e.target.value }))}
                                    placeholder="2027-2028"
                                    style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {t('adminTimetable:migration.overwriteMode', 'When conflicts happen')}
                                </label>
                                <select
                                    value={migrationForm.overwriteMode}
                                    onChange={(e) => setMigrationForm((prev) => ({ ...prev, overwriteMode: e.target.value }))}
                                    style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                >
                                    <option value="skip_conflicts">{t('adminTimetable:migration.skipConflicts', 'Skip conflicts')}</option>
                                    <option value="replace_conflicts">{t('adminTimetable:migration.replaceConflicts', 'Replace conflicts')}</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {t('adminTimetable:migration.dateMode', 'Date strategy')}
                                </label>
                                <select
                                    value={migrationForm.dateMode}
                                    onChange={(e) => setMigrationForm((prev) => ({ ...prev, dateMode: e.target.value }))}
                                    style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                >
                                    <option value="clamp_to_target_year">{t('adminTimetable:migration.clampDates', 'Clamp into target year')}</option>
                                    <option value="keep_relative">{t('adminTimetable:migration.keepRelativeDates', 'Keep relative offset')}</option>
                                </select>
                            </div>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={applyYearMigration}
                                disabled={savingMigration || !migrationForm.sourceAcademicYear || !migrationForm.targetAcademicYear}
                            >
                                {savingMigration
                                    ? t('adminTimetable:migration.migrating', 'Migrating...')
                                    : t('adminTimetable:migration.action', 'Migrate year in one click')}
                            </button>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                                {t('adminTimetable:migration.hint', 'Copies assignments from source year classes to matching target year classes.')}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', padding: '0 0 16px', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {t('adminTimetable:bulkDates.startLabel', 'Year start (all assignments)')}
                                </label>
                                <input
                                    type="date"
                                    value={bulkDates.startDate}
                                    onChange={(e) => setBulkDates((prev) => ({ ...prev, startDate: e.target.value }))}
                                    style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {t('adminTimetable:bulkDates.endLabel', 'Year end (all assignments)')}
                                </label>
                                <input
                                    type="date"
                                    value={bulkDates.endDate}
                                    onChange={(e) => setBulkDates((prev) => ({ ...prev, endDate: e.target.value }))}
                                    style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                                />
                            </div>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={applyBulkDates}
                                disabled={savingBulkDates || !bulkDates.startDate || !bulkDates.endDate}
                            >
                                {savingBulkDates
                                    ? t('adminTimetable:bulkDates.saving', 'Updating…')
                                    : t('adminTimetable:bulkDates.apply', 'Apply to all')}
                            </button>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                                {t('adminTimetable:bulkDates.hint', 'Updates every assignment. You can still edit individual dates in the table.')}
                            </span>
                        </div>

                        <div className="table assignments-table">
                            <AssignmentFiltersBar
                                filterTeacher={filterTeacher}
                                setFilterTeacher={setFilterTeacher}
                                filterClass={filterClass}
                                setFilterClass={setFilterClass}
                                teachers={teachers}
                                classes={classes}
                            />

                            {filteredAssignments.length === 0 ? (
                                <div className="empty">{t('adminTimetable:assignments.empty')}</div>
                            ) : (
                                <>
                                    <div className="row ">
                                        <div className="cell name">{t('adminTimetable:table.teacher')}</div>
                                        <div className="cell">{t('adminTimetable:table.class')}</div>
                                        <div className="cell">{t('adminTimetable:table.subject')}</div>
                                        <div className="cell">{t('adminTimetable:table.slot')}</div>
                                        <div className="cell">{t('adminTimetable:table.schedule')}</div>
                                        <div className="cell actions" />
                                    </div>

                                    {paginatedAssignments.map((assignment) => {
                                        const assignmentDays = formatAssignmentDays(
                                            assignment.daysOfWeek?.length ? assignment.daysOfWeek : weekWorkingDays
                                        );

                                        return (
                                            <div key={assignment._id} className="row">
                                                <div className="cell name">{assignment.teacher?.firstName} {assignment.teacher?.lastName}</div>
                                                <div className="cell">{assignment.class?.name}</div>
                                                <div className="cell">{assignment.subject?.name ?? '—'}</div>
                                                <div className="cell cell-stack">
                                                    <span>{assignment.period?.name ?? '—'}</span>
                                                    <span className="cell-subtext">
                                                        {assignment.room?.name ?? t('adminTimetable:table.noRoom')}
                                                    </span>
                                                </div>
                                                <div className="cell cell-stack">
                                                    <div className="day-chip-list">
                                                        {assignmentDays.length > 0 ? assignmentDays.map((dayNumber) => (
                                                            <span key={`${assignment._id}-${dayNumber}`} className="day-chip">
                                                                {t(`adminTimetable:${dayLabelByValue[dayNumber]}`, { defaultValue: String(dayNumber) })}
                                                            </span>
                                                        )) : <span className="cell-subtext">{t('adminTimetable:table.noDays')}</span>}
                                                    </div>
                                                    <span className="cell-subtext">
                                                        {formatAssignmentWindow(assignment.startDate, assignment.endDate, t, locale)}
                                                    </span>
                                                </div>
                                                <div className="cell flex-row-end">
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => fillAssignmentFormForEdit(assignment)}
                                                        disabled={saving}
                                                        title={t('common:actions.edit')}
                                                    >
                                                        <HiOutlinePencil size={18} />
                                                    </button>
                                                    <button
                                                        className="icon-btn danger"
                                                        onClick={() => deleteAssignment(assignment._id)}
                                                        disabled={saving}
                                                        title={t('common:actions.delete')}
                                                    >
                                                        <HiOutlineTrash size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                        <TablePagination
                            page={assignmentsPage}
                            pageSize={assignmentsPageSize}
                            totalItems={filteredAssignments.length}
                            totalPages={assignmentsTotalPages}
                            onPageChange={(nextPage) => setAssignmentsPage(Math.max(1, Math.min(nextPage, assignmentsTotalPages)))}
                            onPageSizeChange={(nextSize) => {
                                setAssignmentsPageSize(nextSize);
                                setAssignmentsPage(1);
                            }}
                            pageSizeOptions={[10, 20, 50]}
                        />
                    </section>
                </div>

                <aside className="workspace-sidebar">
                    {isAdmin && (
                        <section id="subjects" ref={subjectsSectionRef} className="card subjects-panel">
                            <div className="section-heading section-heading-stack">
                                <div>
                                    <div className="card-title">
                                        <HiOutlineBookOpen size={20} />
                                        {t('adminTimetable:subjectsPanel.title')}
                                    </div>
                                    <p className="section-copy">{t('adminTimetable:subjectsPanel.subtitle')}</p>
                                </div>
                                <div className="section-actions">
                                    <button className="btn btn-secondary btn-sm" onClick={triggerSubjectImport}>
                                        <HiOutlineUpload size={18} />
                                        {t('common:actions.import')}
                                    </button>
                                    <button className="btn btn-primary btn-sm" onClick={handleOpenCreateSubject}>
                                        <HiOutlinePlus size={18} />
                                        {t('adminTimetable:subjectsPanel.addSubject')}
                                    </button>
                                </div>
                            </div>

                            <SubjectsFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} />
                            <SubjectsTable
                                loading={subjectsLoading}
                                error={subjectsError}
                                subjects={filteredSubjects}
                                isAdmin={isAdmin}
                                onRetry={() => dispatch(fetchSubjects({ limit: TIMETABLE_DROPDOWN_LIMIT }))}
                                onEdit={handleEditSubject}
                                onDelete={handleDeleteSubject}
                            />
                        </section>
                    )}

                    <section className="card periods-panel">
                        <div className="section-heading section-heading-stack">
                            <div>
                                <div className="card-title">
                                    <HiOutlineClock size={20} />
                                    {t('adminTimetable:periods.title')}
                                </div>
                                <p className="section-copy">{t('adminTimetable:periods.subtitle')}</p>
                            </div>
                        </div>

                        <div className="form-row period-form-row">
                            <input
                                value={t('adminTimetable:periods.periodName', { number: newPeriod.periodNumber })}
                                readOnly
                                aria-label={t('adminTimetable:periods.periodNameAria')}
                            />
                            <select
                                value={newPeriod.periodNumber}
                                onChange={(event) => setNewPeriod((previousPeriod) => ({ ...previousPeriod, periodNumber: parseInt(event.target.value, 10) }))}
                                aria-label={t('adminTimetable:periods.periodNumberAria')}
                            >
                                {Array.from({ length: 8 }, (_, index) => index + 1).map((periodNumber) => (
                                    <option key={periodNumber} value={periodNumber}>{periodNumber}</option>
                                ))}
                            </select>
                            <input
                                value={newPeriod.startTime}
                                onChange={(event) => setNewPeriod((previousPeriod) => ({ ...previousPeriod, startTime: event.target.value }))}
                                type="time"
                            />
                            <input
                                value={newPeriod.endTime}
                                onChange={(event) => setNewPeriod((previousPeriod) => ({ ...previousPeriod, endTime: event.target.value }))}
                                type="time"
                            />
                            <button className="btn btn-primary" onClick={addPeriod} disabled={saving}>
                                <HiOutlinePlus size={18} />
                                {t('common:actions.add')}
                            </button>
                        </div>

                        <div className="table periods-table">
                            {periods.length === 0 ? (
                                <div className="empty">{t('adminTimetable:periods.empty')}</div>
                            ) : (
                                paginatedPeriods.map((period) => (
                                    <div key={period._id} className="row row-has-actions">
                                        {editingPeriod && editingPeriod._id === period._id ? (
                                            <>
                                                <div className="cell name">
                                                    <input
                                                        type="text"
                                                        value={editingPeriod.name}
                                                        onChange={(event) => setEditingPeriod((previousPeriod) => ({ ...previousPeriod, name: event.target.value }))}
                                                        className="inline-edit-input"
                                                    />
                                                </div>
                                                <div className="cell action-input-group">
                                                    <input
                                                        type="time"
                                                        value={editingPeriod.startTime}
                                                        onChange={(event) => setEditingPeriod((previousPeriod) => ({ ...previousPeriod, startTime: event.target.value }))}
                                                        className="inline-edit-input"
                                                    />
                                                    <span>-</span>
                                                    <input
                                                        type="time"
                                                        value={editingPeriod.endTime}
                                                        onChange={(event) => setEditingPeriod((previousPeriod) => ({ ...previousPeriod, endTime: event.target.value }))}
                                                        className="inline-edit-input"
                                                    />
                                                </div>
                                                <div className="cell">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="20"
                                                        value={editingPeriod.order}
                                                        onChange={(event) => setEditingPeriod((previousPeriod) => ({
                                                            ...previousPeriod,
                                                            order: parseInt(event.target.value, 10) || previousPeriod.order
                                                        }))}
                                                        className="inline-edit-input inline-edit-number"
                                                    />
                                                </div>
                                                <div className="cell flex-row-end">
                                                    <button
                                                        className="icon-btn success"
                                                        onClick={saveEditedPeriod}
                                                        disabled={saving}
                                                        title={t('common:actions.save')}
                                                    >
                                                        <HiOutlineCheck size={18} />
                                                    </button>
                                                    <button
                                                        className="icon-btn muted"
                                                        onClick={() => setEditingPeriod(null)}
                                                        disabled={saving}
                                                        title={t('common:actions.cancel')}
                                                    >
                                                        <HiOutlineX size={18} />
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="cell name">{period.name}</div>
                                                <div className="cell">{period.startTime} - {period.endTime}</div>
                                                <div className="cell">#{period.order}</div>
                                                <div className="cell flex-row-end">
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => setEditingPeriod({ ...period })}
                                                        disabled={saving}
                                                        title={t('common:actions.edit')}
                                                    >
                                                        <HiOutlinePencil size={18} />
                                                    </button>
                                                    <button
                                                        className="icon-btn danger"
                                                        onClick={() => deletePeriod(period._id)}
                                                        disabled={saving}
                                                        title={t('common:actions.delete')}
                                                    >
                                                        <HiOutlineTrash size={18} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                        <TablePagination
                            page={periodsPage}
                            pageSize={periodsPageSize}
                            totalItems={periods.length}
                            totalPages={periodsTotalPages}
                            onPageChange={(nextPage) => setPeriodsPage(Math.max(1, Math.min(nextPage, periodsTotalPages)))}
                            onPageSizeChange={(nextSize) => {
                                setPeriodsPageSize(nextSize);
                                setPeriodsPage(1);
                            }}
                            pageSizeOptions={[8, 16, 32]}
                        />
                    </section>
                </aside>
            </div>

            <SubjectFormModal
                open={showModal}
                editingId={editingId}
                formData={formData}
                setFormData={setFormData}
                submitting={submitting}
                onClose={handleCloseSubjectModal}
                onSubmit={handleSubjectSubmit}
            />

            {showRoomModal && (
                <div className="modal-overlay" onClick={() => !savingRoom && setShowRoomModal(false)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t('adminTimetable:roomModal.title')}</h3>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !savingRoom && setShowRoomModal(false)}
                                aria-label={t('adminTimetable:roomModal.closeAria')}
                            >
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleCreateRoom}>
                            <div className="modal-body">
                                <div className="field">
                                    <label>{t('adminTimetable:roomModal.name')}</label>
                                    <input
                                        type="text"
                                        value={newRoom.name}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, name: event.target.value }))}
                                        placeholder={t('adminTimetable:roomModal.namePlaceholder')}
                                        required
                                    />
                                </div>
                                <div className="field">
                                    <label>{t('adminTimetable:roomModal.type')}</label>
                                    <select value={newRoom.type} onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, type: event.target.value }))}>
                                        {ROOM_TYPES.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {t(`adminTimetable:${option.labelKey}`)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>{t('adminTimetable:roomModal.capacity')}</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={1000}
                                        value={newRoom.capacity}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, capacity: parseInt(event.target.value, 10) || 40 }))}
                                    />
                                </div>
                                <div className="field">
                                    <label>{t('adminTimetable:roomModal.building')}</label>
                                    <input
                                        type="text"
                                        value={newRoom.building}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, building: event.target.value }))}
                                        placeholder={t('adminTimetable:roomModal.optionalPlaceholder')}
                                    />
                                </div>
                                <div className="field">
                                    <label>{t('adminTimetable:roomModal.floor')}</label>
                                    <input
                                        type="text"
                                        value={newRoom.floor}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, floor: event.target.value }))}
                                        placeholder={t('adminTimetable:roomModal.optionalPlaceholder')}
                                    />
                                </div>
                                <div className="field">
                                    <label>{t('adminTimetable:roomModal.roomNumber')}</label>
                                    <input
                                        type="text"
                                        value={newRoom.number}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, number: event.target.value }))}
                                        placeholder={t('adminTimetable:roomModal.optionalPlaceholder')}
                                    />
                                </div>
                                <div className="field">
                                    <label>{t('adminTimetable:roomModal.status')}</label>
                                    <select value={newRoom.status} onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, status: event.target.value }))}>
                                        {ROOM_STATUSES.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {t(`adminTimetable:${option.labelKey}`)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field checkbox-field">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={!!newRoom.isAvailable}
                                            onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, isAvailable: event.target.checked }))}
                                        />
                                        {' '}{t('adminTimetable:roomModal.availableForScheduling')}
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => !savingRoom && setShowRoomModal(false)}>
                                    {t('common:actions.cancel')}
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={savingRoom || !newRoom.name?.trim()}>
                                    {savingRoom ? t('adminTimetable:roomModal.creating') : t('adminTimetable:roomModal.create')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTimetablePage;
