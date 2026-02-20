import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    HiOutlineCalendar,
    HiOutlineClock,
    HiOutlineUser,
    HiOutlineAcademicCap,
    HiOutlineLocationMarker,
    HiOutlineTag,
    HiOutlinePlus,
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineEye,
    HiOutlineX,
    HiOutlineCheck,
    HiOutlineExclamation,
    HiOutlineFilter,
    HiOutlineSearch,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineRefresh
} from 'react-icons/hi';
import { fetchTeachers } from '../../store/slices/teacherSlice';
import { fetchClasses } from '../../store/slices/classSlice';
import { fetchSubjects } from '../../store/slices/subjectSlice';
import scheduleService from '../../services/scheduleService';
import roomService from '../../services/roomService';
import './AdminSchedulePage.css';

const AdminSchedulePage = () => {
    const dispatch = useDispatch();
    const teachers = useSelector((state) => state.teachers.teachers) || [];
    const classes = useSelector((state) => state.classes.classes) || [];
    const subjects = useSelector((state) => state.subjects.subjects) || [];
    const loadingData = useSelector((state) => state.teachers.loading || state.classes.loading || state.subjects.loading);

    // Local state
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [selectedSchedule, setSelectedSchedule] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [currentView, setCurrentView] = useState('list'); // 'list', 'calendar', 'week'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [rooms, setRooms] = useState([]);
    const [roomsLoading, setRoomsLoading] = useState(false);
    const [roomAvailability, setRoomAvailability] = useState(null);
    const [roomAvailabilityLoading, setRoomAvailabilityLoading] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        type: '',
        teacher: '',
        class: '',
        status: '',
        startDate: '',
        endDate: '',
        search: ''
    });

    // Form data
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        type: 'class',
        class: '',
        subject: '',
        teacher: '',
        room: '',
        location: '',
        startTime: '',
        endTime: '',
        isRecurring: false,
        recurrencePattern: {
            type: 'weekly',
            interval: 1,
            daysOfWeek: []
        },
        requiresAttendance: false,
        tags: [],
        color: '#3B82F6'
    });

    // Fetch dropdown data on mount
    useEffect(() => {
        dispatch(fetchTeachers());
        dispatch(fetchClasses());
        dispatch(fetchSubjects());
        const loadRooms = async () => {
            setRoomsLoading(true);
            try {
                const res = await roomService.getRooms();
                setRooms(res?.data?.rooms ?? []);
            } catch (err) {
                console.error('Error fetching rooms:', err);
            } finally {
                setRoomsLoading(false);
            }
        };
        loadRooms();
    }, [dispatch]);

    const fetchSchedules = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const params = { ...filters };
            if (currentView === 'list') {
                const res = await scheduleService.getSchedules(params);
                setSchedules(res?.data?.schedules ?? []);
            } else {
                const start = new Date(currentDate);
                const end = new Date(currentDate);
                if (currentView === 'week') {
                    start.setDate(start.getDate() - start.getDay());
                    end.setDate(start.getDate() + 6);
                } else if (currentView === 'calendar') {
                    start.setDate(1);
                    end.setMonth(end.getMonth() + 1);
                    end.setDate(0);
                }
                const res = await scheduleService.getSchedulesByDateRange(start.toISOString(), end.toISOString(), params);
                setSchedules(res?.data?.schedules ?? []);
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to load schedules');
        } finally {
            setLoading(false);
        }
    }, [filters, currentView, currentDate]);

    useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    // Fetch room availability when create/edit modal is open and start/end time are set
    useEffect(() => {
        if (!showCreateModal && !showEditModal) {
            setRoomAvailability(null);
            return;
        }
        const start = formData.startTime && formData.startTime.trim();
        const end = formData.endTime && formData.endTime.trim();
        if (!start || !end || new Date(start) >= new Date(end)) {
            setRoomAvailability(null);
            return;
        }
        let cancelled = false;
        setRoomAvailabilityLoading(true);
        scheduleService
            .getRoomAvailability(start, end, showEditModal ? selectedSchedule?._id : null)
            .then((res) => {
                if (!cancelled && res?.data?.rooms) setRoomAvailability(res.data.rooms);
            })
            .catch(() => {
                if (!cancelled) setRoomAvailability(null);
            })
            .finally(() => {
                if (!cancelled) setRoomAvailabilityLoading(false);
            });
        return () => { cancelled = true; };
    }, [showCreateModal, showEditModal, formData.startTime, formData.endTime, showEditModal ? selectedSchedule?._id : null]);

    const handleCreateSchedule = () => {
        // Reset form
        setFormData({
            title: '',
            description: '',
            type: 'class',
            class: '',
            subject: '',
            teacher: '',
            room: '',
            location: '',
            startTime: '',
            endTime: '',
            isRecurring: false,
            recurrencePattern: {
                type: 'weekly',
                interval: 1,
                daysOfWeek: []
            },
            requiresAttendance: true,
            tags: [],
            color: '#3B82F6'
        });
        setShowCreateModal(true);
    };

    const handleQuickSchedule = (teacherUserId, classId, subjectId) => {
        const teacher = teachers.find(t => t.user?._id === teacherUserId || t.user?._id?.toString() === teacherUserId);
        const classData = classes.find(c => c._id === classId);
        const subject = subjects.find(s => s._id === subjectId);
        const teacherName = teacher?.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : '';
        setFormData({
            title: `${subject?.name || 'Class'} - ${classData?.name || 'Class'} - ${teacherName}`,
            description: '',
            type: 'class',
            class: classId,
            subject: subjectId,
            teacher: teacherUserId,
            room: '',
            location: '',
            startTime: '',
            endTime: '',
            isRecurring: false,
            recurrencePattern: {
                type: 'weekly',
                interval: 1,
                daysOfWeek: []
            },
            requiresAttendance: true,
            tags: [],
            color: subject?.color || '#3B82F6'
        });
        setShowCreateModal(true);
    };

    const handleTeacherChange = (teacherUserId) => {
        setFormData(prev => ({ ...prev, teacher: teacherUserId }));
        const teacher = teachers.find(t => t.user?._id === teacherUserId || t.user?._id?.toString() === teacherUserId);
        const subjectIds = teacher?.subjects?.map(s => (typeof s === 'object' && s?._id ? s._id : s)) || [];
        if (subjectIds.length === 1) {
            setFormData(prev => ({ ...prev, subject: subjectIds[0] }));
        }
    };

    const handleSubjectChange = (subjectId) => {
        setFormData(prev => ({ ...prev, subject: subjectId }));
        const subject = subjects.find(s => s._id === subjectId);
        if (subject?.color) {
            setFormData(prev => ({ ...prev, color: subject.color }));
        }
    };

    const handleEditSchedule = (schedule) => {
        setSelectedSchedule(schedule);
        const roomId = schedule.room?._id || schedule.room || '';
        setFormData({
            title: schedule.title,
            description: schedule.description || '',
            type: schedule.type,
            class: schedule.class?._id || '',
            subject: schedule.subject?._id || '',
            teacher: schedule.teacher?._id || '',
            room: roomId,
            location: schedule.location || '',
            startTime: schedule.startTime ? new Date(schedule.startTime).toISOString().slice(0, 16) : '',
            endTime: schedule.endTime ? new Date(schedule.endTime).toISOString().slice(0, 16) : '',
            isRecurring: schedule.isRecurring || false,
            recurrencePattern: schedule.recurrencePattern || {
                type: 'weekly',
                interval: 1,
                daysOfWeek: []
            },
            requiresAttendance: schedule.requiresAttendance ?? false,
            tags: schedule.tags || [],
            color: schedule.color || '#3B82F6'
        });
        setShowEditModal(true);
    };

    const handleViewSchedule = (schedule) => {
        setSelectedSchedule(schedule);
        setShowViewModal(true);
    };

    const handleDeleteSchedule = async (scheduleId) => {
        if (!window.confirm('Are you sure you want to delete this schedule?')) return;
        try {
            await scheduleService.deleteSchedule(scheduleId);
            setSchedules(schedules.filter(s => s._id !== scheduleId));
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to delete schedule');
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setFilters({
            type: '',
            teacher: '',
            class: '',
            status: '',
            startDate: '',
            endDate: '',
            search: ''
        });
    };

    const handleSaveSchedule = async () => {
        if (!formData.title || !formData.startTime || !formData.endTime || !formData.teacher || !formData.room) {
            setError('Title, start time, end time, teacher, and room are required.');
            return;
        }
        try {
            setError(null);
            const payload = {
                title: formData.title,
                description: formData.description || '',
                type: formData.type,
                class: formData.class || undefined,
                subject: formData.subject || undefined,
                teacher: formData.teacher,
                room: formData.room,
                location: formData.location || '',
                startTime: formData.startTime,
                endTime: formData.endTime,
                requiresAttendance: formData.requiresAttendance ?? false,
                tags: Array.isArray(formData.tags) ? formData.tags : [],
                color: formData.color || '#3B82F6'
            };
            if (showCreateModal) {
                const res = await scheduleService.createSchedule(payload);
                const newSchedule = res?.data?.schedule;
                if (newSchedule) setSchedules(prev => [...prev, newSchedule]);
            } else if (showEditModal && selectedSchedule?._id) {
                const res = await scheduleService.updateSchedule(selectedSchedule._id, payload);
                const updated = res?.data?.schedule;
                if (updated) {
                    setSchedules(prev => prev.map(s => s._id === updated._id ? updated : s));
                }
            }
            setShowCreateModal(false);
            setShowEditModal(false);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to save schedule');
        }
    };

    const formatDateTime = (date) => {
        return new Date(date).toLocaleString();
    };

    const toIdString = (value) => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        return value._id ? value._id.toString() : value.toString();
    };

    const getRoomAvailabilityEntry = (roomId) => {
        if (!roomAvailability || !roomId) return null;
        const target = toIdString(roomId);
        return roomAvailability.find((entry) => toIdString(entry?._id) === target) || null;
    };

    const getRoomOptionLabel = (room, availabilityEntry) => {
        const locationParts = [room.building, room.floor ? `Floor ${room.floor}` : null, room.number]
            .filter(Boolean)
            .join(' • ');
        const base = `${room.name}${locationParts ? ` — ${locationParts}` : ''}`;
        const details = `${room.type}, Capacity: ${room.capacity}`;
        if (!availabilityEntry) {
            if (room.status && room.status !== 'active') return `${base} (${details}) — ${room.status}`;
            if (room.isAvailable === false) return `${base} (${details}) — unavailable`;
            return `${base} (${details})`;
        }
        if (availabilityEntry.available) return `${base} (${details}) ✓ Available`;
        const reason = availabilityEntry.unavailabilityReason || 'Unavailable';
        return `${base} (${details}) — ${reason}`;
    };

    const getRoomDisplay = (schedule) => {
        if (!schedule?.room) return '—';
        if (typeof schedule.room === 'object' && schedule.room?.name) return schedule.room.name;
        const r = rooms.find(rr => rr._id === schedule.room || rr._id?.toString() === schedule.room?.toString());
        return r?.name || schedule.room;
    };

    const getStatusColor = (status) => {
        const colors = {
            'scheduled': 'blue',
            'in_progress': 'green',
            'completed': 'gray',
            'cancelled': 'red',
            'postponed': 'yellow'
        };
        return colors[status] || 'gray';
    };

    const getTypeColor = (type) => {
        const colors = {
            'class': 'blue',
            'exam': 'red',
            'meeting': 'purple',
            'event': 'green',
            'holiday': 'yellow',
            'maintenance': 'gray',
            'appointment': 'indigo',
            'extracurricular': 'pink'
        };
        return colors[type] || 'gray';
    };

    const navigateWeek = (direction) => {
        const newDate = new Date(currentDate);
        if (direction === 'prev') {
            newDate.setDate(newDate.getDate() - 7);
        } else {
            newDate.setDate(newDate.getDate() + 7);
        }
        setCurrentDate(newDate);
    };

    const renderListView = () => (
        <div className="schedule-list">
            {schedules.map(schedule => (
                <div key={schedule._id} className="schedule-card">
                    <div className="schedule-header">
                        <div className="schedule-title">
                            <h3>{schedule.title}</h3>
                            <span className={`schedule-type type-${getTypeColor(schedule.type)}`}>
                                {schedule.type}
                            </span>
                        </div>
                        <div className="schedule-actions">
                            <button
                                className="action-btn"
                                onClick={() => handleViewSchedule(schedule)}
                                title="View Details"
                            >
                                <HiOutlineEye size={16} />
                            </button>
                            <button
                                className="action-btn"
                                onClick={() => handleEditSchedule(schedule)}
                                title="Edit"
                            >
                                <HiOutlinePencil size={16} />
                            </button>
                            <button
                                className="action-btn danger"
                                onClick={() => handleDeleteSchedule(schedule._id)}
                                title="Delete"
                            >
                                <HiOutlineTrash size={16} />
                            </button>
                        </div>
                    </div>
                    
                    <div className="schedule-content">
                        <div className="schedule-info">
                            <div className="info-item">
                                <HiOutlineClock size={16} />
                                <span>{formatDateTime(schedule.startTime)} - {formatDateTime(schedule.endTime)}</span>
                            </div>
                            {schedule.teacher && (
                                <div className="info-item">
                                    <HiOutlineUser size={16} />
                                    <span>{schedule.teacher.firstName} {schedule.teacher.lastName}</span>
                                </div>
                            )}
                            {schedule.class && (
                                <div className="info-item">
                                    <HiOutlineAcademicCap size={16} />
                                    <span>{schedule.class.name}</span>
                                </div>
                            )}
                            {schedule.room && (
                                <div className="info-item">
                                    <HiOutlineLocationMarker size={16} />
                                    <span>{getRoomDisplay(schedule)}</span>
                                </div>
                            )}
                            {schedule.subject && (
                                <div className="info-item">
                                    <HiOutlineTag size={16} />
                                    <span>{schedule.subject.name}</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="schedule-status">
                            <span className={`status-badge status-${getStatusColor(schedule.status)}`}>
                                {schedule.status}
                            </span>
                        </div>
                    </div>
                    
                    {schedule.description && (
                        <div className="schedule-description">
                            <p>{schedule.description}</p>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    const renderWeekView = () => {
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        
        return (
            <div className="week-view">
                <div className="week-header">
                    <button
                        className="nav-btn"
                        onClick={() => navigateWeek('prev')}
                    >
                        <HiOutlineChevronLeft size={20} />
                    </button>
                    <h3>
                        {startOfWeek.toLocaleDateString()} - {new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </h3>
                    <button
                        className="nav-btn"
                        onClick={() => navigateWeek('next')}
                    >
                        <HiOutlineChevronRight size={20} />
                    </button>
                </div>
                
                <div className="week-grid">
                    <div className="time-column">
                        {Array.from({ length: 24 }, (_, i) => (
                            <div key={i} className="time-slot">
                                {i.toString().padStart(2, '0')}:00
                            </div>
                        ))}
                    </div>
                    
                    {weekDays.map((day, dayIndex) => {
                        const dayDate = new Date(startOfWeek);
                        dayDate.setDate(dayDate.getDate() + dayIndex);
                        
                        return (
                            <div key={day} className="day-column">
                                <div className="day-header">
                                    <h4>{day}</h4>
                                    <span>{dayDate.toLocaleDateString()}</span>
                                </div>
                                
                                <div className="day-events">
                                    {schedules
                                        .filter(schedule => {
                                            const scheduleDate = new Date(schedule.startTime);
                                            return scheduleDate.toDateString() === dayDate.toDateString();
                                        })
                                        .map(schedule => (
                                            <div
                                                key={schedule._id}
                                                className="event-block"
                                                style={{
                                                    backgroundColor: schedule.color,
                                                    top: `${new Date(schedule.startTime).getHours() * 60 + new Date(schedule.startTime).getMinutes()}px`,
                                                    height: `${(new Date(schedule.endTime) - new Date(schedule.startTime)) / (1000 * 60)}px`
                                                }}
                                                onClick={() => handleViewSchedule(schedule)}
                                            >
                                                <div className="event-title">{schedule.title}</div>
                                                <div className="event-time">
                                                    {new Date(schedule.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                                                    {new Date(schedule.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                {schedule.room && (
                                                    <div className="event-room">{getRoomDisplay(schedule)}</div>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="schedule-loading">
                <div className="spinner"></div>
                <p>Loading schedules...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="schedule-error">
                <HiOutlineExclamation size={48} />
                <h3>Error loading schedules</h3>
                <p>{error}</p>
                <button onClick={fetchSchedules} className="btn btn-primary">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="admin-schedule-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Schedule Management</h1>
                    <p>Manage class schedules, events, and appointments</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <HiOutlineFilter size={20} />
                        Filters
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={fetchSchedules}
                    >
                        <HiOutlineRefresh size={20} />
                        Refresh
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleCreateSchedule}
                    >
                        <HiOutlinePlus size={20} />
                        Create Schedule
                    </button>
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="filters-panel">
                    <div className="filter-group">
                        <label>Search</label>
                        <div className="search-input">
                            <HiOutlineSearch size={16} />
                            <input
                                type="text"
                                placeholder="Search schedules..."
                                value={filters.search}
                                onChange={(e) => handleFilterChange('search', e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="filter-group">
                        <label>Type</label>
                        <select
                            value={filters.type}
                            onChange={(e) => handleFilterChange('type', e.target.value)}
                        >
                            <option value="">All Types</option>
                            <option value="class">Class</option>
                            <option value="exam">Exam</option>
                            <option value="meeting">Meeting</option>
                            <option value="event">Event</option>
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>Teacher</label>
                        <select
                            value={filters.teacher}
                            onChange={(e) => handleFilterChange('teacher', e.target.value)}
                        >
                            <option value="">All Teachers</option>
                            {teachers.map(teacher => (
                                <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                    {teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : 'Unknown'}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>Class</label>
                        <select
                            value={filters.class}
                            onChange={(e) => handleFilterChange('class', e.target.value)}
                        >
                            <option value="">All Classes</option>
                            {classes.map(cls => (
                                <option key={cls._id} value={cls._id}>
                                    {cls.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>Status</label>
                        <select
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                        >
                            <option value="">All Status</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>Date Range</label>
                        <div className="date-range">
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                            />
                            <span>to</span>
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="filter-actions">
                        <button className="btn btn-secondary" onClick={clearFilters}>
                            Clear Filters
                        </button>
                    </div>
                </div>
            )}

            {/* Quick Schedule Creation */}
            <div className="quick-schedule-section">
                <h2>Quick Schedule Creation</h2>
                <p>Create schedules quickly by selecting teacher, class, and subject combinations</p>
                
                <div className="quick-schedule-grid">
                    <div className="quick-schedule-card">
                        <h3>Teacher Assignments</h3>
                        <div className="teacher-assignments">
                            {teachers.map(teacher => {
                                const teacherUserId = teacher.user?._id || teacher._id;
                                const teacherSubjectIds = (teacher.subjects || []).map(s => (typeof s === 'object' && s?._id ? s._id : s));
                                return (
                                    <div key={teacher._id} className="teacher-card">
                                        <div className="teacher-info">
                                            <strong>{teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : 'Unknown'}</strong>
                                            <span>{teacher.user?.email || ''}</span>
                                        </div>
                                        <div className="teacher-subjects">
                                            {teacherSubjectIds.map(subjectId => {
                                                const subject = subjects.find(s => s._id === subjectId);
                                                return (
                                                    <span key={subjectId} className="subject-tag" style={{ backgroundColor: subject?.color }}>
                                                        {subject?.name}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <div className="quick-actions">
                                            {classes.map(cls => (
                                                teacherSubjectIds.map(subjectId => (
                                                    <button
                                                        key={`${cls._id}-${subjectId}`}
                                                        className="quick-schedule-btn"
                                                        onClick={() => handleQuickSchedule(teacherUserId, cls._id, subjectId)}
                                                        title={`Schedule ${subjects.find(s => s._id === subjectId)?.name} for ${cls.name}`}
                                                    >
                                                        {cls.name} - {subjects.find(s => s._id === subjectId)?.code}
                                                    </button>
                                                ))
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    
                    <div className="quick-schedule-card">
                        <h3>Class Schedule Matrix</h3>
                        <div className="schedule-matrix">
                            {classes.map(cls => (
                                <div key={cls._id} className="class-row">
                                    <div className="class-info">
                                        <strong>{cls.name}</strong>
                                        <span>{cls.students} students</span>
                                    </div>
                                    <div className="subject-slots">
                                        {subjects.map(subject => (
                                            <div key={subject._id} className="subject-slot">
                                                <span className="subject-name" style={{ backgroundColor: subject.color }}>
                                                    {subject.code}
                                                </span>
                                                <select
                                                    className="teacher-select"
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            handleQuickSchedule(e.target.value, cls._id, subject._id);
                                                            e.target.value = '';
                                                        }
                                                    }}
                                                >
                                                    <option value="">Assign Teacher</option>
                                                    {teachers
                                                        .filter(teacher => (teacher.subjects || []).some(s => (s?._id || s) === subject._id))
                                                        .map(teacher => (
                                                            <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                                                {teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : 'Unknown'}
                                                            </option>
                                                        ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* View Toggle */}
            <div className="view-toggle">
                <div className="toggle-buttons">
                    <button
                        className={`toggle-btn ${currentView === 'list' ? 'active' : ''}`}
                        onClick={() => setCurrentView('list')}
                    >
                        List View
                    </button>
                    <button
                        className={`toggle-btn ${currentView === 'week' ? 'active' : ''}`}
                        onClick={() => setCurrentView('week')}
                    >
                        Week View
                    </button>
                    <button
                        className={`toggle-btn ${currentView === 'calendar' ? 'active' : ''}`}
                        onClick={() => setCurrentView('calendar')}
                    >
                        Calendar View
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="schedule-content">
                {currentView === 'list' && renderListView()}
                {currentView === 'week' && renderWeekView()}
                {currentView === 'calendar' && (
                    <div className="calendar-view">
                        <p>Calendar view coming soon...</p>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {(showCreateModal || showEditModal) && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>{showCreateModal ? 'Create Schedule' : 'Edit Schedule'}</h2>
                            <button
                                className="modal-close"
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setShowEditModal(false);
                                }}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Title *</label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder="Enter schedule title"
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>Type *</label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                                    >
                                        <option value="class">Class</option>
                                        <option value="exam">Exam</option>
                                        <option value="meeting">Meeting</option>
                                        <option value="event">Event</option>
                                        <option value="holiday">Holiday</option>
                                        <option value="appointment">Appointment</option>
                                    </select>
                                </div>
                                
                                <div className="form-group full-width">
                                    <label>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Enter description"
                                        rows="3"
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>Class</label>
                                    <select
                                        value={formData.class}
                                        onChange={(e) => setFormData(prev => ({ ...prev, class: e.target.value }))}
                                    >
                                        <option value="">Select Class</option>
                                        {classes.map(cls => (
                                            <option key={cls._id} value={cls._id}>
                                                {cls.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label>Subject</label>
                                    <select
                                        value={formData.subject}
                                        onChange={(e) => handleSubjectChange(e.target.value)}
                                    >
                                        <option value="">Select Subject</option>
                                        {subjects.map(subject => (
                                            <option key={subject._id} value={subject._id}>
                                                {subject.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label>Teacher</label>
                                    <select
                                        value={formData.teacher}
                                        onChange={(e) => handleTeacherChange(e.target.value)}
                                    >
                                        <option value="">Select Teacher</option>
                                        {teachers.map(teacher => (
                                            <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                                {teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : 'Unknown'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label>
                                        Room
                                        {formData.startTime && formData.endTime && (
                                            <span className="room-availability-hint">
                                                {roomAvailabilityLoading ? ' (checking availability…)' : roomAvailability ? ' — select an available room' : ''}
                                            </span>
                                        )}
                                    </label>
                                    <select
                                        value={formData.room}
                                        onChange={(e) => setFormData(prev => ({ ...prev, room: e.target.value }))}
                                        className={(() => {
                                            const selectedAvailability = getRoomAvailabilityEntry(formData.room);
                                            if (!selectedAvailability) return '';
                                            return selectedAvailability.available ? 'room-available' : 'room-occupied';
                                        })()}
                                    >
                                        <option value="">Select Room</option>
                                        {rooms.map(room => {
                                            const avail = getRoomAvailabilityEntry(room._id);
                                            const defaultAvailable = room.status === 'active' && room.isAvailable !== false;
                                            const available = avail ? avail.available : defaultAvailable;
                                            const conflictingWith = avail?.conflictingWith;
                                            const conflictTitle = conflictingWith
                                                ? `${conflictingWith.title || 'Event'} (${new Date(conflictingWith.startTime).toLocaleString()} – ${new Date(conflictingWith.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                                                : (avail?.unavailabilityReason || (defaultAvailable ? 'Available room' : 'Unavailable room'));
                                            return (
                                                <option
                                                    key={room._id}
                                                    value={room._id}
                                                    disabled={!available}
                                                    title={available ? 'Available for this time' : conflictTitle}
                                                >
                                                    {getRoomOptionLabel(room, avail)}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    {formData.room && (() => {
                                        const selectedAvailability = getRoomAvailabilityEntry(formData.room);
                                        return selectedAvailability && !selectedAvailability.available;
                                    })() && (
                                        <span className="room-occupied-warning">
                                            <HiOutlineExclamation size={14} /> {getRoomAvailabilityEntry(formData.room)?.unavailabilityReason || 'This room is unavailable for the selected time.'}
                                        </span>
                                    )}
                                </div>
                                
                                <div className="form-group">
                                    <label>Location</label>
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                                        placeholder="Enter location"
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>Start Time *</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.startTime}
                                        onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>End Time *</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.endTime}
                                        onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>Color</label>
                                    <input
                                        type="color"
                                        value={formData.color}
                                        onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={formData.requiresAttendance}
                                            onChange={(e) => setFormData(prev => ({ ...prev, requiresAttendance: e.target.checked }))}
                                        />
                                        Requires Attendance
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setShowEditModal(false);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveSchedule}
                            >
                                {showCreateModal ? 'Create' : 'Update'} Schedule
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Modal */}
            {showViewModal && selectedSchedule && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Schedule Details</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowViewModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="schedule-details">
                                <div className="detail-section">
                                    <h3>Basic Information</h3>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>Title:</label>
                                            <span>{selectedSchedule.title}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Type:</label>
                                            <span className={`type-badge type-${getTypeColor(selectedSchedule.type)}`}>
                                                {selectedSchedule.type}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Status:</label>
                                            <span className={`status-badge status-${getStatusColor(selectedSchedule.status)}`}>
                                                {selectedSchedule.status}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Color:</label>
                                            <div className="color-display">
                                                <div
                                                    className="color-box"
                                                    style={{ backgroundColor: selectedSchedule.color }}
                                                ></div>
                                                <span>{selectedSchedule.color}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="detail-section">
                                    <h3>Time & Location</h3>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>Start Time:</label>
                                            <span>{formatDateTime(selectedSchedule.startTime)}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>End Time:</label>
                                            <span>{formatDateTime(selectedSchedule.endTime)}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Duration:</label>
                                            <span>
                                                {Math.round((new Date(selectedSchedule.endTime) - new Date(selectedSchedule.startTime)) / (1000 * 60))} minutes
                                            </span>
                                        </div>
                                        {selectedSchedule.room && (
                                            <div className="detail-item">
                                                <label>Room:</label>
                                                <span>{getRoomDisplay(selectedSchedule)}</span>
                                            </div>
                                        )}
                                        {selectedSchedule.location && (
                                            <div className="detail-item">
                                                <label>Location:</label>
                                                <span>{selectedSchedule.location}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="detail-section">
                                    <h3>Associated Information</h3>
                                    <div className="detail-grid">
                                        {selectedSchedule.class && (
                                            <div className="detail-item">
                                                <label>Class:</label>
                                                <span>{selectedSchedule.class.name}</span>
                                            </div>
                                        )}
                                        {selectedSchedule.subject && (
                                            <div className="detail-item">
                                                <label>Subject:</label>
                                                <span>{selectedSchedule.subject.name}</span>
                                            </div>
                                        )}
                                        {selectedSchedule.teacher && (
                                            <div className="detail-item">
                                                <label>Teacher:</label>
                                                <span>{selectedSchedule.teacher.firstName} {selectedSchedule.teacher.lastName}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {selectedSchedule.description && (
                                    <div className="detail-section">
                                        <h3>Description</h3>
                                        <p>{selectedSchedule.description}</p>
                                    </div>
                                )}
                                
                                <div className="detail-section">
                                    <h3>Participants</h3>
                                    <div className="participants-list">
                                        {selectedSchedule.participants.length > 0 ? (
                                            selectedSchedule.participants.map(participant => (
                                                <div key={participant.user._id} className="participant-item">
                                                    <span>{participant.user.firstName} {participant.user.lastName}</span>
                                                    <span className={`participant-status ${participant.status}`}>
                                                        {participant.status}
                                                    </span>
                                                </div>
                                            ))
                                        ) : (
                                            <p>No participants added</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowViewModal(false)}
                            >
                                Close
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    setShowViewModal(false);
                                    handleEditSchedule(selectedSchedule);
                                }}
                            >
                                Edit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminSchedulePage;
