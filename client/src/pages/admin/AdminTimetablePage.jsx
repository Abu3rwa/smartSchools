import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    HiOutlineClock,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineExclamation
} from 'react-icons/hi';
import { fetchTeachers, selectTeachers } from '../../store/slices/teacherSlice';
import { fetchClasses, selectClasses } from '../../store/slices/classSlice';
import { fetchSubjects, selectSubjects } from '../../store/slices/subjectSlice';
import timetableService from '../../services/timetableService';
import roomService from '../../services/roomService';
import './AdminTimetablePage.css';

const dayLabels = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
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

    const [newPeriod, setNewPeriod] = useState({ periodNumber: 1, startTime: '08:00', endTime: '09:00', isActive: true });

    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

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

    // Determine which rooms are occupied for the selected period + days
    const occupiedRoomIds = useMemo(() => {
        if (!newAssignment.period || !newAssignment.daysOfWeek?.length) return new Set();

        const selectedDays = newAssignment.daysOfWeek;
        const candidateStart = new Date(newAssignment.startDate);
        const candidateEnd = new Date(newAssignment.endDate);

        const occupied = new Set();

        for (const assignment of assignments) {
            if (assignment.period?._id !== newAssignment.period && assignment.period !== newAssignment.period) continue;

            const roomId = typeof assignment.room === 'string' ? assignment.room : assignment.room?._id;
            if (!roomId) continue;

            const assignStart = new Date(assignment.startDate);
            const assignEnd = new Date(assignment.endDate);
            if (candidateStart > assignEnd || candidateEnd < assignStart) continue;

            const sharedDay = (assignment.daysOfWeek || []).some(d => selectedDays.includes(d));
            if (!sharedDay) continue;

            occupied.add(roomId);
        }

        return occupied;
    }, [assignments, newAssignment.period, newAssignment.daysOfWeek, newAssignment.startDate, newAssignment.endDate]);

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
        dispatch(fetchTeachers({ limit: 200 }));
        dispatch(fetchClasses({ limit: 200 }));
        dispatch(fetchSubjects({ limit: 200 }));
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

    const addAssignment = async () => {
        try {
            setSaving(true);
            setError(null);

            await timetableService.createAssignment({
                ...newAssignment,
                daysOfWeek: (newAssignment.daysOfWeek || []).map(n => parseInt(n, 10))
            });

            await fetchTimetableData();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
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
                                <div key={p._id} className="row">
                                    <div className="cell name">{p.name}</div>
                                    <div className="cell">{p.startTime} - {p.endTime}</div>
                                    <div className="cell">#{p.order}</div>
                                    <button className="icon-btn danger" onClick={() => deletePeriod(p._id)} disabled={saving}>
                                        <HiOutlineTrash size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">Teacher Period Assignments</div>

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
                            <select value={newAssignment.room} onChange={(e) => setNewAssignment(prev => ({ ...prev, room: e.target.value }))}>
                                <option value="">(Optional)</option>
                                {rooms.map(room => {
                                    const isOccupied = occupiedRoomIds.has(room._id);
                                    return (
                                        <option key={room._id} value={room._id} disabled={isOccupied}>
                                            {room.name}{isOccupied ? ' (occupied)' : ''}
                                        </option>
                                    );
                                })}
                            </select>
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
                            <button
                                className="btn btn-primary"
                                onClick={addAssignment}
                                disabled={saving || !newAssignment.teacher || !newAssignment.class || !newAssignment.period}
                            >
                                {saving ? 'Saving...' : 'Create Assignment'}
                            </button>
                        </div>
                    </div>

                    <div className="table">
                        {assignments.length === 0 ? (
                            <div className="empty">No assignments yet.</div>
                        ) : (
                            assignments.map(a => (
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
                                    <div className="cell muted">
                                        {a.daysOfWeek?.join(',')}
                                    </div>
                                    <button className="icon-btn danger" onClick={() => deleteAssignment(a._id)} disabled={saving}>
                                        <HiOutlineTrash size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminTimetablePage;
