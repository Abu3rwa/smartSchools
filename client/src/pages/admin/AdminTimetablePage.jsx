import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    HiOutlineClock,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineExclamation,
    HiOutlineOfficeBuilding,
    HiOutlinePencil,
    HiOutlineCheck,
    HiOutlineX
} from 'react-icons/hi';
import { fetchTeachers, selectTeachers } from '../../store/slices/teacherSlice';
import { fetchClasses, selectClasses } from '../../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../../store/slices/subjectSlice';
import timetableService from '../../services/timetableService';
import roomService from '../../services/roomService';
import './AdminTimetablePage.css';

const TIMETABLE_DROPDOWN_LIMIT = 200; // Max items for teachers/classes/subjects dropdowns; add pagination if needed.

const dayLabels = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
];

const ROOM_TYPES = [
    { value: 'classroom', label: 'Classroom' },
    { value: 'lab', label: 'Lab' },
    { value: 'lecture_hall', label: 'Lecture hall' },
    { value: 'gym', label: 'Gym' },
    { value: 'library', label: 'Library' },
    { value: 'office', label: 'Office' },
    { value: 'other', label: 'Other' }
];

const ROOM_STATUSES = [
    { value: 'active', label: 'Active' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'renovation', label: 'Renovation' },
    { value: 'closed', label: 'Closed' }
];

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


    const [newPeriod, setNewPeriod] = useState({ periodNumber: 1, startTime: '08:00', endTime: '09:00', isActive: true });
    const [editingPeriod, setEditingPeriod] = useState(null);


    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const filteredAssignments = useMemo(() => {
        return assignments.filter(a => {
            const matchTeacher = filterTeacher ? (a.teacher?._id === filterTeacher || a.teacher === filterTeacher) : true;
            const matchClass = filterClass ? (a.class?._id === filterClass || a.class === filterClass) : true;
            return matchTeacher && matchClass;
        });
    }, [assignments, filterTeacher, filterClass]);

    const [newAssignment, setNewAssignment] = useState({
        teacher: '',
        class: '',
        subject: '',
        room: '',
        period: '',
        daysOfWeek: [1, 2, 3, 4, 5],
        startDate: new Date(today).toISOString().slice(0, 10),
        endDate: new Date(new Date(today).setMonth(today.getMonth() + 3)).toISOString().slice(0, 10),
        isActive: true
    });

    const [showRoomModal, setShowRoomModal] = useState(false);
    const [newRoom, setNewRoom] = useState({
        name: '',
        type: 'classroom',
        capacity: 40,
        building: '',
        floor: '',
        number: '',
        status: 'active',
        isAvailable: true
    });
    const [savingRoom, setSavingRoom] = useState(false);

    // Resolve the Teacher document _id from the selected User _id
    const selectedTeacherId = useMemo(() => {
        if (!newAssignment.teacher) return null;
        const teacherDoc = teachers.find(teacher => (teacher.user?._id || teacher.user) === newAssignment.teacher);
        return teacherDoc?._id || null;
    }, [teachers, newAssignment.teacher]);

    // Filter classes where the selected teacher is listed in Class.subjects[]
    const availableClasses = useMemo(() => {
        if (!selectedTeacherId) return [];
        return classes.filter(classDoc =>
            classDoc.subjects?.some(classSubject => {
                const teacherId = typeof classSubject.teacher === 'string'
                    ? classSubject.teacher
                    : classSubject.teacher?._id;
                return teacherId === selectedTeacherId;
            })
        ).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [selectedTeacherId, classes]);

    // Extract subjects the selected teacher teaches (optionally filtered by selected class)
    const availableSubjects = useMemo(() => {
        if (!selectedTeacherId) return [];
        const uniqueSubjects = new Map();

        const classesToSearch = newAssignment.class
            ? classes.filter(classDoc => classDoc._id === newAssignment.class)
            : availableClasses;

        for (const classDoc of classesToSearch) {
            for (const classSubject of (classDoc.subjects || [])) {
                const teacherId = typeof classSubject.teacher === 'string'
                    ? classSubject.teacher
                    : classSubject.teacher?._id;
                if (teacherId !== selectedTeacherId) continue;

                const subjectRef = classSubject.subject;
                const subjectId = typeof subjectRef === 'string' ? subjectRef : subjectRef?._id;
                if (!subjectId || uniqueSubjects.has(subjectId)) continue;

                const subjectDoc = typeof subjectRef === 'object' && subjectRef?._id
                    ? subjectRef
                    : subjects.find(subj => subj._id === subjectId);
                uniqueSubjects.set(subjectId, subjectDoc || { _id: subjectId, name: 'Unknown subject' });
            }
        }

        return Array.from(uniqueSubjects.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [selectedTeacherId, newAssignment.class, availableClasses, classes, subjects]);

    // Determine which rooms are occupied (Globally unique to a single class, or used by same class at same time)
    const occupiedRoomIds = useMemo(() => {
        if (!newAssignment.daysOfWeek?.length) return new Set();

        const selectedDays = newAssignment.daysOfWeek;
        const candidateStart = new Date(newAssignment.startDate);
        const candidateEnd = new Date(newAssignment.endDate);

        const occupied = new Set();

        for (const assignment of assignments) {
            if (editingAssignmentId && (assignment._id === editingAssignmentId)) continue;

            const roomId = typeof assignment.room === 'string' ? assignment.room : assignment.room?._id;
            if (!roomId) continue;

            const assignClassId = typeof assignment.class === 'string' ? assignment.class : assignment.class?._id;

            // Global exclusivity rule: if room belongs to ANOTHER class, it is fully occupied
            if (newAssignment.class && assignClassId && assignClassId.toString() !== newAssignment.class.toString()) {
                // To support room isolation correctly, if date ranges overlap, it is blocked
                const assignStart = new Date(assignment.startDate);
                const assignEnd = new Date(assignment.endDate);
                if (candidateStart <= assignEnd && candidateEnd >= assignStart) {
                    occupied.add(roomId);
                }
                continue;
            }

            // If it is the same class, check if they are booking it at the EXACT SAME PERIOD and days
            // (A class shouldn't double-book its own room at the same time either)
            const assignPeriodId = typeof assignment.period === 'string' ? assignment.period : assignment.period?._id;
            const newPeriodId = typeof newAssignment.period === 'string' ? newAssignment.period : newAssignment.period?._id;

            if (newPeriodId && assignPeriodId === newPeriodId) {
                const assignStart = new Date(assignment.startDate);
                const assignEnd = new Date(assignment.endDate);
                if (candidateStart <= assignEnd && candidateEnd >= assignStart) {
                    const sharedDay = (assignment.daysOfWeek || []).some(d => selectedDays.includes(d));
                    if (sharedDay) {
                        occupied.add(roomId);
                    }
                }
            }
        }

        return occupied;
    }, [assignments, newAssignment.startDate, newAssignment.endDate, newAssignment.daysOfWeek, newAssignment.class, newAssignment.period, editingAssignmentId]);

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
            setNewAssignment({
                teacher: '',
                class: '',
                subject: '',
                room: '',
                period: '',
                daysOfWeek: [1, 2, 3, 4, 5],
                startDate: new Date(today).toISOString().slice(0, 10),
                endDate: new Date(new Date(today).setMonth(today.getMonth() + 3)).toISOString().slice(0, 10),
                isActive: true
            });

            await fetchTimetableData();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const cancelAssignmentEdit = () => {
        setEditingAssignmentId(null);
        setNewAssignment({
            teacher: '',
            class: '',
            subject: '',
            room: '',
            period: '',
            daysOfWeek: [1, 2, 3, 4, 5],
            startDate: new Date(today).toISOString().slice(0, 10),
            endDate: new Date(new Date(today).setMonth(today.getMonth() + 3)).toISOString().slice(0, 10),
            isActive: true
        });
    };

    const fillAssignmentFormForEdit = (a) => {
        setEditingAssignmentId(a._id);
        const formatYMD = (val) => {
            if (!val) return new Date().toISOString().slice(0, 10);
            return new Date(val).toISOString().slice(0, 10);
        };
        setNewAssignment({
            teacher: a.teacher?._id || a.teacher || '',
            class: a.class?._id || a.class || '',
            subject: a.subject?._id || a.subject || '',
            room: a.room?._id || a.room || '',
            period: a.period?._id || a.period || '',
            daysOfWeek: a.daysOfWeek || [],
            startDate: formatYMD(a.startDate),
            endDate: formatYMD(a.endDate),
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
            setNewRoom({
                name: '',
                type: 'classroom',
                capacity: 40,
                building: '',
                floor: '',
                number: '',
                status: 'active',
                isAvailable: true
            });
            const rRes = await roomService.getRooms();
            setRooms(rRes?.data?.rooms || []);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSavingRoom(false);
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
            <div className="page-header">
                <div className="header-content">
                    <h1>Timetable</h1>
                    <p>Define periods and assign teachers to periods</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={fetchTimetableData} disabled={saving}>
                        <HiOutlineRefresh size={20} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="error-banner">
                    <HiOutlineExclamation size={20} />
                    <span>{error}</span>
                </div>
            )}

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
                                {dayLabels.map(d => (
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
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: 'var(--surface)' }}>
                            <span style={{ fontWeight: 500 }}>Filter by:</span>
                            <select
                                value={filterTeacher}
                                onChange={(e) => setFilterTeacher(e.target.value)}
                                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '4px' }}
                            >
                                <option value="">All Teachers</option>
                                {teachers.map(t => (
                                    <option key={t._id} value={t.user?._id || ''}>
                                        {t.user?.firstName} {t.user?.lastName}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={filterClass}
                                onChange={(e) => setFilterClass(e.target.value)}
                                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '4px' }}
                            >
                                <option value="">All Classes</option>
                                {classes.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
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
