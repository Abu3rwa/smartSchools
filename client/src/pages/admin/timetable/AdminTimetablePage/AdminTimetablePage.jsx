import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
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
import { TIMETABLE_DROPDOWN_LIMIT, DAY_LABELS, ROOM_TYPES, ROOM_STATUSES } from './constants';
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
import './AdminTimetablePage.css';
import '../../../subjects/SubjectsPage/SubjectsPage.css';

const DAY_LABEL_BY_VALUE = DAY_LABELS.reduce((lookup, day) => {
    lookup[day.value] = day.label;
    return lookup;
}, {});

const formatShortDate = (value) => {
    if (!value) return 'Open-ended';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown date';

    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const formatAssignmentWindow = (startDate, endDate) => {
    if (!startDate && !endDate) return 'Always active';
    if (!endDate) return `Starts ${formatShortDate(startDate)}`;
    if (!startDate) return `Until ${formatShortDate(endDate)}`;
    return `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`;
};

const formatAssignmentDays = (daysOfWeek = []) => {
    return [...daysOfWeek]
        .sort((left, right) => left - right)
        .map((day) => DAY_LABEL_BY_VALUE[day] || String(day));
};

const AdminTimetablePage = () => {
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

    const [editingAssignmentId, setEditingAssignmentId] = useState(null);
    const [filterTeacher, setFilterTeacher] = useState('');
    const [filterClass, setFilterClass] = useState('');

    const [newPeriod, setNewPeriod] = useState(createDefaultPeriod);
    const [editingPeriod, setEditingPeriod] = useState(null);
    const [newAssignment, setNewAssignment] = useState(createDefaultAssignment);

    const [showRoomModal, setShowRoomModal] = useState(false);
    const [newRoom, setNewRoom] = useState(createDefaultRoom);
    const [savingRoom, setSavingRoom] = useState(false);

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

    const summaryCards = useMemo(() => {
        const activeAssignments = assignments.filter((assignment) => assignment.isActive !== false).length;
        const availableRooms = rooms.filter((room) => room.status === 'active' && room.isAvailable !== false).length;

        return [
            {
                label: 'Subjects',
                value: subjects.length,
                help: 'Curriculum options used in the schedule'
            },
            {
                label: 'Periods',
                value: periods.length,
                help: 'Time slots available each day'
            },
            {
                label: 'Assignments',
                value: activeAssignments,
                help: 'Teacher blocks currently active'
            },
            {
                label: 'Available rooms',
                value: availableRooms,
                help: 'Rooms ready for scheduling'
            }
        ];
    }, [assignments, periods, rooms, subjects.length]);

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
            setAssignments(assignmentResponse?.data?.assignments || []);
            setRooms(roomResponse?.data?.rooms || []);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch]);

    useEffect(() => {
        if (location.hash !== '#subjects') return;

        const timeoutId = window.setTimeout(() => {
            subjectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);

        return () => window.clearTimeout(timeoutId);
    }, [location.hash, loading]);

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
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSaving(false);
        }
    };

    const deletePeriod = async (id) => {
        if (!window.confirm('Delete this period?')) return;

        try {
            setSaving(true);
            setError(null);
            await timetableService.deletePeriod(id);
            await fetchTimetableData();
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
                daysOfWeek: (newAssignment.daysOfWeek || []).map((dayNumber) => parseInt(dayNumber, 10))
            };

            if (editingAssignmentId) {
                await timetableService.updateAssignment(editingAssignmentId, payload);
                setEditingAssignmentId(null);
            } else {
                await timetableService.createAssignment(payload);
            }

            setNewAssignment(createDefaultAssignment());
            await fetchTimetableData();
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSaving(false);
        }
    };

    const cancelAssignmentEdit = () => {
        setEditingAssignmentId(null);
        setNewAssignment(createDefaultAssignment());
    };

    const fillAssignmentFormForEdit = (assignment) => {
        setEditingAssignmentId(assignment._id);
        setNewAssignment({
            teacher: assignment.teacher?._id || assignment.teacher || '',
            class: assignment.class?._id || assignment.class || '',
            subject: assignment.subject?._id || assignment.subject || '',
            room: assignment.room?._id || assignment.room || '',
            period: assignment.period?._id || assignment.period || '',
            daysOfWeek: assignment.daysOfWeek || [],
            startDate: formatDateAsYmd(assignment.startDate),
            endDate: formatDateAsYmd(assignment.endDate),
            isActive: assignment.isActive ?? true
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const deleteAssignment = async (id) => {
        if (!window.confirm('Delete this assignment?')) return;

        try {
            setSaving(true);
            setError(null);
            await timetableService.deleteAssignment(id);
            await fetchTimetableData();
        } catch (requestError) {
            setError(requestError?.response?.data?.message || requestError.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleAssignmentDay = (dayValue) => {
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
            toast.error('Please select a CSV file');
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
            toast.error('No valid period rows found in CSV');
            return;
        }

        try {
            const response = await timetableService.importPeriods(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            toast.success(response?.message || `Imported ${imported} periods`);
            if (failed > 0) toast.error(`${failed} period rows failed`);
            await fetchTimetableData();
        } catch (importError) {
            toast.error(importError?.response?.data?.message || 'Failed to import periods');
        }
    };

    const handleRoomImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error('Please select a CSV file');
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
            toast.error('No valid room rows found in CSV');
            return;
        }

        try {
            const response = await roomService.importRooms(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            toast.success(response?.message || `Imported ${imported} rooms`);
            if (failed > 0) toast.error(`${failed} room rows failed`);
            const roomResponse = await roomService.getRooms();
            setRooms(roomResponse?.data?.rooms || []);
        } catch (importError) {
            toast.error(importError?.response?.data?.message || 'Failed to import rooms');
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
                toast.success(`Subject ${editingId ? 'updated' : 'created'} successfully`);
                handleCloseSubjectModal();
            } else {
                toast.error(result.payload || `Failed to ${editingId ? 'update' : 'create'} subject`);
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
        if (!window.confirm('Are you sure you want to delete this subject?')) return;

        const result = await dispatch(deleteSubject(id));
        if (deleteSubject.fulfilled.match(result)) {
            toast.success('Subject deleted successfully');
        } else {
            toast.error(result.payload || 'Failed to delete subject');
        }
    };

    const handleSubjectImportFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error('Please select a CSV file');
            return;
        }

        const { rows, errors } = await parseCsvFile(file, { requiredColumns: ['name', 'code'] });
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        if (rows.length === 0) {
            toast.error('No valid subject rows found in CSV');
            return;
        }

        try {
            const response = await subjectService.importSubjects(rows);
            const imported = response?.summary?.importedRows ?? response?.data?.imported ?? 0;
            const failed = response?.summary?.failedRows ?? response?.data?.failed ?? 0;
            const skipped = response?.summary?.skippedRows ?? response?.data?.skipped ?? 0;

            toast.success(response?.message || `Imported ${imported} subjects`);
            if (failed > 0) {
                toast.error(`${failed} subject rows failed`);
            } else if (skipped > 0) {
                toast(`${skipped} subject rows skipped`);
            }

            dispatch(fetchSubjects({ limit: TIMETABLE_DROPDOWN_LIMIT }));
        } catch (importError) {
            toast.error(importError?.response?.data?.message || 'Failed to import subjects');
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
                        <span className="hero-eyebrow">Scheduling workspace</span>
                        <h3>Timetable Builder</h3>
                        <p>Set up subjects, periods, rooms, and teacher assignments from one responsive workspace.</p>
                    </div>
                    <div className="header-actions"  >
                        {isAdmin && (
                            <button className="btn btn-secondary" onClick={triggerSubjectImport} disabled={saving}>
                                <HiOutlineUpload size={18} />
                                Import Subjects CSV
                            </button>
                        )}
                        <button className="btn btn-secondary" onClick={triggerPeriodImport} disabled={saving}>
                            <HiOutlinePlus size={18} />
                            Import Periods CSV
                        </button>
                        <button className="btn btn-secondary" onClick={triggerRoomImport} disabled={saving}>
                            <HiOutlineOfficeBuilding size={18} />
                            Import Rooms CSV
                        </button>
                        <button className="btn btn-primary" onClick={fetchTimetableData} disabled={saving}>
                            <HiOutlineRefresh size={18} />
                            Refresh
                        </button>
                    </div>
                </div>

                <div className="summary-grid">
                    {summaryCards.map((card) => (
                        <article key={card.label} className="summary-card">
                            <span className="summary-label">{card.label}</span>
                            <strong className="summary-value">{card.value}</strong>
                            <span className="summary-help">{card.help}</span>
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
                                    {editingAssignmentId ? 'Edit Assignment' : 'Build Assignment'}
                                </div>
                                <p className="section-copy">Match a teacher, class, subject, room, and period in one flow.</p>
                            </div>
                            {editingAssignmentId && (
                                <button className="btn btn-secondary btn-sm" onClick={cancelAssignmentEdit} disabled={saving}>
                                    Cancel edit
                                </button>
                            )}
                        </div>

                        <div className="assignment-form">
                            <div className="field">
                                <label>Teacher</label>
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
                                    <option value="">Select teacher</option>
                                    {teachers.map((teacher) => (
                                        <option key={teacher._id} value={teacher.user?._id || ''}>
                                            {teacher.user?.firstName} {teacher.user?.lastName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="field">
                                <label>Class</label>
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
                                            ? 'Select teacher first'
                                            : (availableClasses.length > 0 ? 'Select class' : 'No classes assigned to this teacher')}
                                    </option>
                                    {availableClasses.map((classItem) => (
                                        <option key={classItem._id} value={classItem._id}>{classItem.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="field">
                                <label>Subject</label>
                                <select
                                    value={newAssignment.subject}
                                    onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, subject: event.target.value }))}
                                    disabled={!newAssignment.teacher}
                                >
                                    <option value="">
                                        {!newAssignment.teacher
                                            ? 'Select teacher first'
                                            : (availableSubjects.length > 0 ? '(Optional)' : 'No subjects assigned to this teacher')}
                                    </option>
                                    {availableSubjects.map((subject) => (
                                        <option key={subject._id} value={subject._id}>{subject.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="field field-room">
                                <label>Room</label>
                                <div className="field-with-action">
                                    <select value={newAssignment.room} onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, room: event.target.value }))}>
                                        <option value="">(Optional)</option>
                                        {rooms.map((room) => {
                                            const isOccupied = occupiedRoomIds.has(room._id);
                                            const blockedByStatus = room.status && room.status !== 'active';
                                            const blockedByAvailability = room.isAvailable === false;
                                            const disabled = isOccupied || blockedByStatus || blockedByAvailability;
                                            const roomLocation = [room.building, room.floor ? `Floor ${room.floor}` : null, room.number]
                                                .filter(Boolean)
                                                .join(' • ');
                                            const unavailableReason = isOccupied
                                                ? 'occupied'
                                                : blockedByStatus
                                                    ? room.status
                                                    : blockedByAvailability
                                                        ? 'unavailable'
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
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowRoomModal(true)} title="Add room">
                                        <HiOutlineOfficeBuilding size={18} />
                                        Add room
                                    </button>
                                </div>
                            </div>

                            <div className="field">
                                <label>Period</label>
                                <select value={newAssignment.period} onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, period: event.target.value }))}>
                                    <option value="">Select period</option>
                                    {periods.map((period) => (
                                        <option key={period._id} value={period._id}>{period.name} ({period.startTime}-{period.endTime})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="field">
                                <label>Start date</label>
                                <input
                                    type="date"
                                    value={newAssignment.startDate}
                                    onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, startDate: event.target.value }))}
                                />
                            </div>

                            <div className="field">
                                <label>End date</label>
                                <input
                                    type="date"
                                    value={newAssignment.endDate}
                                    onChange={(event) => setNewAssignment((previousAssignment) => ({ ...previousAssignment, endDate: event.target.value }))}
                                />
                            </div>

                            <div className="field full">
                                <label>Days</label>
                                <div className="weekday-selector">
                                    {DAY_LABELS.map((day) => (
                                        <button
                                            type="button"
                                            key={day.value}
                                            className={`weekday-pill ${newAssignment.daysOfWeek.includes(day.value) ? 'active' : ''}`}
                                            onClick={() => toggleAssignmentDay(day.value)}
                                        >
                                            {day.label}
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
                                    {saving ? 'Saving...' : (editingAssignmentId ? 'Update assignment' : 'Create assignment')}
                                </button>
                                <p className="action-note">Teachers only see subjects connected to the classes they already teach.</p>
                            </div>
                        </div>
                    </section>

                    <section className="card assignments-card">
                        <div className="section-heading">
                            <div>
                                <div className="card-title">Assignments</div>
                                <p className="section-copy">Review the current timetable blocks and narrow them by teacher or class.</p>
                            </div>
                            <span className="results-badge">{filteredAssignments.length} shown</span>
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
                                <div className="empty">No assignments found.</div>
                            ) : (
                                <>
                                    <div className="row ">
                                        <div className="cell name">Teacher</div>
                                        <div className="cell">Class</div>
                                        <div className="cell">Subject</div>
                                        <div className="cell">Slot</div>
                                        <div className="cell">Schedule</div>
                                        <div className="cell actions" />
                                    </div>

                                    {filteredAssignments.map((assignment) => {
                                        const assignmentDays = formatAssignmentDays(assignment.daysOfWeek);

                                        return (
                                            <div key={assignment._id} className="row">
                                                <div className="cell name">{assignment.teacher?.firstName} {assignment.teacher?.lastName}</div>
                                                <div className="cell">{assignment.class?.name}</div>
                                                <div className="cell">{assignment.subject?.name ?? '—'}</div>
                                                <div className="cell cell-stack">
                                                    <span>{assignment.period?.name ?? '—'}</span>
                                                    <span className="cell-subtext">{assignment.room?.name ?? 'No room'}</span>
                                                </div>
                                                <div className="cell cell-stack">
                                                    <div className="day-chip-list">
                                                        {assignmentDays.length > 0 ? assignmentDays.map((dayLabel) => (
                                                            <span key={`${assignment._id}-${dayLabel}`} className="day-chip">{dayLabel}</span>
                                                        )) : <span className="cell-subtext">No days</span>}
                                                    </div>
                                                    <span className="cell-subtext">{formatAssignmentWindow(assignment.startDate, assignment.endDate)}</span>
                                                </div>
                                                <div className="cell flex-row-end">
                                                    <button className="icon-btn" onClick={() => fillAssignmentFormForEdit(assignment)} disabled={saving} title="Edit">
                                                        <HiOutlinePencil size={18} />
                                                    </button>
                                                    <button className="icon-btn danger" onClick={() => deleteAssignment(assignment._id)} disabled={saving} title="Delete">
                                                        <HiOutlineTrash size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </section>
                </div>

                <aside className="workspace-sidebar">
                    {isAdmin && (
                        <section id="subjects" ref={subjectsSectionRef} className="card subjects-panel">
                            <div className="section-heading section-heading-stack">
                                <div>
                                    <div className="card-title">
                                        <HiOutlineBookOpen size={20} />
                                        Subjects
                                    </div>
                                    <p className="section-copy">Keep the subject list beside the timetable so assignment setup stays in one place.</p>
                                </div>
                                <div className="section-actions">
                                    <button className="btn btn-secondary btn-sm" onClick={triggerSubjectImport}>
                                        <HiOutlineUpload size={18} />
                                        Import
                                    </button>
                                    <button className="btn btn-primary btn-sm" onClick={handleOpenCreateSubject}>
                                        <HiOutlinePlus size={18} />
                                        Add subject
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
                                    Period setup
                                </div>
                                <p className="section-copy">Create and adjust your teaching blocks without leaving the page.</p>
                            </div>
                        </div>

                        <div className="form-row period-form-row">
                            <input value={`Period ${newPeriod.periodNumber}`} readOnly aria-label="Period name" />
                            <select
                                value={newPeriod.periodNumber}
                                onChange={(event) => setNewPeriod((previousPeriod) => ({ ...previousPeriod, periodNumber: parseInt(event.target.value, 10) }))}
                                aria-label="Period number"
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
                                Add
                            </button>
                        </div>

                        <div className="table periods-table">
                            {periods.length === 0 ? (
                                <div className="empty">No periods yet.</div>
                            ) : (
                                periods.map((period) => (
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
                                                    <button className="icon-btn success" onClick={saveEditedPeriod} disabled={saving} title="Save">
                                                        <HiOutlineCheck size={18} />
                                                    </button>
                                                    <button className="icon-btn muted" onClick={() => setEditingPeriod(null)} disabled={saving} title="Cancel">
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
                                                    <button className="icon-btn" onClick={() => setEditingPeriod({ ...period })} disabled={saving} title="Edit">
                                                        <HiOutlinePencil size={18} />
                                                    </button>
                                                    <button className="icon-btn danger" onClick={() => deletePeriod(period._id)} disabled={saving} title="Delete">
                                                        <HiOutlineTrash size={18} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
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
                            <h3>Add room</h3>
                            <button type="button" className="modal-close" onClick={() => !savingRoom && setShowRoomModal(false)} aria-label="Close">&times;</button>
                        </div>
                        <form onSubmit={handleCreateRoom}>
                            <div className="modal-body">
                                <div className="field">
                                    <label>Name *</label>
                                    <input
                                        type="text"
                                        value={newRoom.name}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, name: event.target.value }))}
                                        placeholder="e.g. Room 101"
                                        required
                                    />
                                </div>
                                <div className="field">
                                    <label>Type</label>
                                    <select value={newRoom.type} onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, type: event.target.value }))}>
                                        {ROOM_TYPES.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Capacity</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={1000}
                                        value={newRoom.capacity}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, capacity: parseInt(event.target.value, 10) || 40 }))}
                                    />
                                </div>
                                <div className="field">
                                    <label>Building</label>
                                    <input
                                        type="text"
                                        value={newRoom.building}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, building: event.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="field">
                                    <label>Floor</label>
                                    <input
                                        type="text"
                                        value={newRoom.floor}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, floor: event.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="field">
                                    <label>Room number</label>
                                    <input
                                        type="text"
                                        value={newRoom.number}
                                        onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, number: event.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="field">
                                    <label>Status</label>
                                    <select value={newRoom.status} onChange={(event) => setNewRoom((previousRoom) => ({ ...previousRoom, status: event.target.value }))}>
                                        {ROOM_STATUSES.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
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
                                        {' '}Available for scheduling
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => !savingRoom && setShowRoomModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={savingRoom || !newRoom.name?.trim()}>
                                    {savingRoom ? 'Creating...' : 'Create room'}
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