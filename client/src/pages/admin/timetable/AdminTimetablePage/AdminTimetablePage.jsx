import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    HiOutlineClock,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineOfficeBuilding,
    HiOutlinePencil,
    HiOutlineCheck,
    HiOutlineX
} from 'react-icons/hi';
import { fetchTeachers, selectTeachers } from '../../../../store/slices/teacherSlice';
import { fetchClasses, selectClasses } from '../../../../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../../../../store/slices/subjectSlice';
import timetableService from '../../../../services/timetableService';
import roomService from '../../../../services/roomService';
import { TIMETABLE_DROPDOWN_LIMIT, DAY_LABELS, ROOM_TYPES, ROOM_STATUSES } from './constants';
import useTimetableAssignmentOptions from './hooks/useTimetableAssignmentOptions';
import { createDefaultAssignment, createDefaultPeriod, createDefaultRoom, formatDateAsYmd } from './utils/timetableState';
import TimetableErrorBanner from './components/TimetableErrorBanner';
import AssignmentFiltersBar from './components/AssignmentFiltersBar';
import { parseCsvFile } from '../../../../utils/csvImport';
import toast from 'react-hot-toast';
import './AdminTimetablePage.css';

const AdminTimetablePage = () => {
    const dispatch = useDispatch();

    const teachers = useSelector(selectTeachers);
    const classes = useSelector(selectClasses);
    const subjects = useSelector(selectSubjects);

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

    const fetchTimetableData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [pRes, aRes, rRes] = await Promise.all([
                timetableService.getPeriods(),
                timetableService.getAssignments(),
                roomService.getRooms()
            ]);

            setPeriods(pRes?.data?.periods || []);
            setAssignments(aRes?.data?.assignments || []);
            setRooms(rRes?.data?.rooms || []);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
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

    const addPeriod = async () => {
        try {
            setSaving(true);
            setError(null);

            const payload = {
                name: `Period ${newPeriod.periodNumber}`,
                startTime: newPeriod.startTime,
                endTime: newPeriod.endTime,
                order: newPeriod.periodNumber,
                isActive: newPeriod.isActive
            };

            await timetableService.createPeriod(payload);

            setNewPeriod(prev => ({
                ...prev,
                periodNumber: prev.periodNumber < 8 ? prev.periodNumber + 1 : 8
            }));
            await fetchTimetableData();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
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
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const saveEditedPeriod = async () => {
        if (!editingPeriod) return;
        try {
            setSaving(true);
            setError(null);
            const payload = {
                name: editingPeriod.name,
                startTime: editingPeriod.startTime,
                endTime: editingPeriod.endTime,
                order: editingPeriod.order,
                isActive: editingPeriod.isActive
            };
            await timetableService.updatePeriod(editingPeriod._id, payload);
            setEditingPeriod(null);
            await fetchTimetableData();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
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
                daysOfWeek: (newAssignment.daysOfWeek || []).map(n => parseInt(n, 10))
            };

            if (editingAssignmentId) {
                await timetableService.updateAssignment(editingAssignmentId, payload);
                setEditingAssignmentId(null);
            } else {
                await timetableService.createAssignment(payload);
            }

            // Reset form
            setNewAssignment(createDefaultAssignment());

            await fetchTimetableData();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const cancelAssignmentEdit = () => {
        setEditingAssignmentId(null);
        setNewAssignment(createDefaultAssignment());
    };

    const fillAssignmentFormForEdit = (a) => {
        setEditingAssignmentId(a._id);
        setNewAssignment({
            teacher: a.teacher?._id || a.teacher || '',
            class: a.class?._id || a.class || '',
            subject: a.subject?._id || a.subject || '',
            room: a.room?._id || a.room || '',
            period: a.period?._id || a.period || '',
            daysOfWeek: a.daysOfWeek || [],
            startDate: formatDateAsYmd(a.startDate),
            endDate: formatDateAsYmd(a.endDate),
            isActive: a.isActive ?? true
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
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleAssignmentDay = (d) => {
        setNewAssignment(prev => {
            const next = prev.daysOfWeek.includes(d)
                ? prev.daysOfWeek.filter(x => x !== d)
                : [...prev.daysOfWeek, d];
            return { ...prev, daysOfWeek: next.sort((a, b) => a - b) };
        });
    };

    const handleCreateRoom = async (e) => {
        e?.preventDefault();
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
            const rRes = await roomService.getRooms();
            setRooms(rRes?.data?.rooms || []);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
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
            const rRes = await roomService.getRooms();
            setRooms(rRes?.data?.rooms || []);
        } catch (importError) {
            toast.error(importError?.response?.data?.message || 'Failed to import rooms');
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
            <div className="page-header">
                <div className="header-content">
                    <h1>Timetable</h1>
                    <p>Define periods and assign teachers to periods</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={triggerPeriodImport} disabled={saving}>
                        <HiOutlinePlus size={20} />
                        Import Periods CSV
                    </button>
                    <button className="btn btn-secondary" onClick={triggerRoomImport} disabled={saving}>
                        <HiOutlineOfficeBuilding size={20} />
                        Import Rooms CSV
                    </button>
                    <button className="btn btn-secondary" onClick={fetchTimetableData} disabled={saving}>
                        <HiOutlineRefresh size={20} />
                        Refresh
                    </button>
                </div>
            </div>

            <TimetableErrorBanner error={error} />

            <div className="grid">
                <div className="card">
                    <div className="card-title">
                        <HiOutlineClock size={20} />
                        Periods
                    </div>

                    <div className="form-row">
                        <input
                            value={`Period ${newPeriod.periodNumber}`}
                            readOnly
                            aria-label="Period name"
                        />
                        <select
                            value={newPeriod.periodNumber}
                            onChange={(e) => setNewPeriod(prev => ({ ...prev, periodNumber: parseInt(e.target.value, 10) }))}
                            aria-label="Period number"
                        >
                            {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                        <input
                            value={newPeriod.startTime}
                            onChange={(e) => setNewPeriod(prev => ({ ...prev, startTime: e.target.value }))}
                            type="time"
                        />
                        <input
                            value={newPeriod.endTime}
                            onChange={(e) => setNewPeriod(prev => ({ ...prev, endTime: e.target.value }))}
                            type="time"
                        />
                        <button className="btn btn-primary" onClick={addPeriod} disabled={saving}>
                            <HiOutlinePlus size={18} />
                            Add
                        </button>
                    </div>

                    <div className="table">
                        {periods.length === 0 ? (
                            <div className="empty">No periods yet.</div>
                        ) : (
                            periods.map(p => (
                                <div key={p._id} className="row row-has-actions">
                                    {editingPeriod && editingPeriod._id === p._id ? (
                                        <>
                                            <div className="cell name">
                                                <input
                                                    type="text"
                                                    value={editingPeriod.name}
                                                    onChange={(e) => setEditingPeriod(prev => ({ ...prev, name: e.target.value }))}
                                                    style={{ width: '100%', padding: '4px', border: '1px solid var(--border)', borderRadius: '4px' }}
                                                />
                                            </div>
                                            <div className="cell action-input-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input
                                                    type="time"
                                                    value={editingPeriod.startTime}
                                                    onChange={(e) => setEditingPeriod(prev => ({ ...prev, startTime: e.target.value }))}
                                                    style={{ padding: '4px', border: '1px solid var(--border)', borderRadius: '4px' }}
                                                />
                                                <span>-</span>
                                                <input
                                                    type="time"
                                                    value={editingPeriod.endTime}
                                                    onChange={(e) => setEditingPeriod(prev => ({ ...prev, endTime: e.target.value }))}
                                                    style={{ padding: '4px', border: '1px solid var(--border)', borderRadius: '4px' }}
                                                />
                                            </div>
                                            <div className="cell">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="20"
                                                    value={editingPeriod.order}
                                                    onChange={(e) => setEditingPeriod(prev => ({ ...prev, order: parseInt(e.target.value, 10) || prev.order }))}
                                                    style={{ width: '60px', padding: '4px', border: '1px solid var(--border)', borderRadius: '4px' }}
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
                                            <div className="cell name">{p.name}</div>
                                            <div className="cell">{p.startTime} - {p.endTime}</div>
                                            <div className="cell">#{p.order}</div>
                                            <div className="cell flex-row-end">
                                                <button className="icon-btn" onClick={() => setEditingPeriod({ ...p })} disabled={saving} title="Edit">
                                                    <HiOutlinePencil size={18} />
                                                </button>
                                                <button className="icon-btn danger" onClick={() => deletePeriod(p._id)} disabled={saving} title="Delete">
                                                    <HiOutlineTrash size={18} />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">
                        {editingAssignmentId ? 'Edit Teacher Period Assignment' : 'New Teacher Period Assignment'}
                    </div>

                    <div className="assignment-form">

                        <div className="field">
                            <label>Teacher</label>
                            <select
                                value={newAssignment.teacher}
                                onChange={(e) => {
                                    const teacherId = e.target.value;
                                    setNewAssignment(prev => ({
                                        ...prev,
                                        teacher: teacherId,
                                        class: '',
                                        subject: ''
                                    }));
                                }}
                            >
                                <option value="">Select teacher</option>
                                {teachers.map(t => (
                                    <option key={t._id} value={t.user?._id || ''}>
                                        {t.user?.firstName} {t.user?.lastName}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="field">
                            <label>Class</label>
                            <select
                                value={newAssignment.class}
                                onChange={(e) => {
                                    const classId = e.target.value;
                                    setNewAssignment(prev => ({
                                        ...prev,
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
                                {availableClasses.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="field">
                            <label>Subject</label>
                            <select
                                value={newAssignment.subject}
                                onChange={(e) => setNewAssignment(prev => ({ ...prev, subject: e.target.value }))}
                                disabled={!newAssignment.teacher}
                            >
                                <option value="">
                                    {!newAssignment.teacher
                                        ? 'Select teacher first'
                                        : (availableSubjects.length > 0 ? '(Optional)' : 'No subjects assigned to this teacher')}
                                </option>
                                {availableSubjects.map(s => (
                                    <option key={s._id} value={s._id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="field">
                            <label>Room</label>
                            <div className="field-with-action">
                                <select value={newAssignment.room} onChange={(e) => setNewAssignment(prev => ({ ...prev, room: e.target.value }))}>
                                    <option value="">(Optional)</option>
                                    {rooms.map(room => {
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
                            <select value={newAssignment.period} onChange={(e) => setNewAssignment(prev => ({ ...prev, period: e.target.value }))}>
                                <option value="">Select period</option>
                                {periods.map(p => (
                                    <option key={p._id} value={p._id}>{p.name} ({p.startTime}-{p.endTime})</option>
                                ))}
                            </select>
                        </div>

                        <div className="field full">
                            <label>Days</label>
                            <div className="weekday-selector">
                                {DAY_LABELS.map(d => (
                                    <button
                                        type="button"
                                        key={d.value}
                                        className={`weekday-pill ${newAssignment.daysOfWeek.includes(d.value) ? 'active' : ''}`}
                                        onClick={() => toggleAssignmentDay(d.value)}
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="field">
                            <label>Start date</label>
                            <input
                                type="date"
                                value={newAssignment.startDate}
                                onChange={(e) => setNewAssignment(prev => ({ ...prev, startDate: e.target.value }))}
                            />
                        </div>

                        <div className="field">
                            <label>End date</label>
                            <input
                                type="date"
                                value={newAssignment.endDate}
                                onChange={(e) => setNewAssignment(prev => ({ ...prev, endDate: e.target.value }))}
                            />
                        </div>

                        <div className="field full">
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={submitAssignmentForm}
                                    disabled={saving || !newAssignment.teacher || !newAssignment.class || !newAssignment.period}
                                >
                                    {saving ? 'Saving...' : (editingAssignmentId ? 'Update Assignment' : 'Create Assignment')}
                                </button>
                                {editingAssignmentId && (
                                    <button
                                        className="btn btn-secondary"
                                        onClick={cancelAssignmentEdit}
                                        disabled={saving}
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="table">
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
                                <div className="row">
                                    <div className="cell name">Teacher</div>
                                    <div className="cell">Class</div>
                                    <div className="cell">Period</div>
                                    <div className="cell">Room</div>
                                    <div className="cell muted">Days</div>
                                    <div className="cell actions" />
                                </div>
                                {filteredAssignments.map(a => (
                                    <div key={a._id} className="row">
                                        <div className="cell name">
                                            {a.teacher?.firstName} {a.teacher?.lastName}
                                        </div>
                                        <div className="cell">
                                            {a.class?.name}
                                        </div>
                                        <div className="cell">
                                            {a.period?.name}
                                        </div>
                                        <div className="cell">
                                            {a.room?.name ?? '—'}
                                        </div>
                                        <div className="cell muted">
                                            {a.daysOfWeek?.join(',')}
                                        </div>
                                        <div className="cell flex-row-end">
                                            <button className="icon-btn" onClick={() => fillAssignmentFormForEdit(a)} disabled={saving} title="Edit">
                                                <HiOutlinePencil size={18} />
                                            </button>
                                            <button className="icon-btn danger" onClick={() => deleteAssignment(a._id)} disabled={saving} title="Delete">
                                                <HiOutlineTrash size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>

                </div>
            </div>

            {showRoomModal && (
                <div className="modal-overlay" onClick={() => !savingRoom && setShowRoomModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
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
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="e.g. Room 101"
                                        required
                                    />
                                </div>
                                <div className="field">
                                    <label>Type</label>
                                    <select value={newRoom.type} onChange={(e) => setNewRoom(prev => ({ ...prev, type: e.target.value }))}>
                                        {ROOM_TYPES.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, capacity: parseInt(e.target.value, 10) || 40 }))}
                                    />
                                </div>
                                <div className="field">
                                    <label>Building</label>
                                    <input
                                        type="text"
                                        value={newRoom.building}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, building: e.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="field">
                                    <label>Floor</label>
                                    <input
                                        type="text"
                                        value={newRoom.floor}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, floor: e.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="field">
                                    <label>Room number</label>
                                    <input
                                        type="text"
                                        value={newRoom.number}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, number: e.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div className="field">
                                    <label>Status</label>
                                    <select value={newRoom.status} onChange={(e) => setNewRoom(prev => ({ ...prev, status: e.target.value }))}>
                                        {ROOM_STATUSES.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field checkbox-field">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={!!newRoom.isAvailable}
                                            onChange={(e) => setNewRoom(prev => ({ ...prev, isAvailable: e.target.checked }))}
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
