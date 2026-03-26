import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
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
import { fetchTeachers } from '../../../../store/slices/teacherSlice';
import { fetchClasses } from '../../../../store/slices/classSlice';
import { fetchSubjects } from '../../../../store/slices/subjectSlice';
import scheduleService from '../../../../services/scheduleService';
import roomService from '../../../../services/roomService';
import './AdminSchedulePage.css';

const AdminSchedulePage = () => {
    const { t, i18n } = useTranslation(['schedule']);
    const locale = i18n.language?.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-US';
    const dispatch = useDispatch();
    const teachers = useSelector((state) => state.teachers.teachers) || [];
    const classes = useSelector((state) => state.classes.classes) || [];
    const subjects = useSelector((state) => state.subjects.subjects) || [];
    const _loadingData = useSelector((state) => state.teachers.loading || state.classes.loading || state.subjects.loading);

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
    const [_roomsLoading, setRoomsLoading] = useState(false);
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
                console.error(t('schedule:admin.errors.fetchRoomsConsole'), err);
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
            setError(err.response?.data?.message || err.message || t('schedule:admin.errors.loadSchedules'));
        } finally {
            setLoading(false);
        }
    }, [filters, currentView, currentDate, t]);

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
            title: `${subject?.name || t('schedule:admin.labels.class')} - ${classData?.name || t('schedule:admin.labels.class')} - ${teacherName}`,
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
        if (!window.confirm(t('schedule:admin.confirm.deleteSchedule'))) return;
        try {
            await scheduleService.deleteSchedule(scheduleId);
            setSchedules(schedules.filter(s => s._id !== scheduleId));
        } catch (err) {
            setError(err.response?.data?.message || err.message || t('schedule:admin.errors.deleteSchedule'));
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
            setError(t('schedule:admin.errors.requiredFields'));
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
            setError(err.response?.data?.message || err.message || t('schedule:admin.errors.saveSchedule'));
        }
    };

    const formatDateTime = (date) => {
        return new Date(date).toLocaleString(locale);
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
        const locationParts = [room.building, room.floor ? t('schedule:admin.room.floor', { floor: room.floor }) : null, room.number]
            .filter(Boolean)
            .join(' • ');
        const base = `${room.name}${locationParts ? ` — ${locationParts}` : ''}`;
        const details = t('schedule:admin.room.details', { type: room.type, capacity: room.capacity });
        if (!availabilityEntry) {
            if (room.status && room.status !== 'active') return `${base} (${details}) — ${room.status}`;
            if (room.isAvailable === false) return `${base} (${details}) — ${t('schedule:admin.room.unavailableLower')}`;
            return `${base} (${details})`;
        }
        if (availabilityEntry.available) return `${base} (${details}) ✓ ${t('schedule:admin.room.available')}`;
        const reason = availabilityEntry.unavailabilityReason || t('schedule:admin.room.unavailable');
        return `${base} (${details}) — ${reason}`;
    };

    const getRoomDisplay = (schedule) => {
        if (!schedule?.room) return t('schedule:admin.common.dash');
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

    const getStatusLabel = (status) =>
        t(`schedule:status.${status}`, { defaultValue: status });

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

    const getTypeLabel = (type) =>
        t(`schedule:type.${type}`, { defaultValue: type });

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
                                {getTypeLabel(schedule.type)}
                            </span>
                        </div>
                        <div className="schedule-actions">
                            <button
                                className="action-btn"
                                onClick={() => handleViewSchedule(schedule)}
                                title={t('schedule:admin.actions.viewDetails')}
                            >
                                <HiOutlineEye size={16} />
                            </button>
                            <button
                                className="action-btn"
                                onClick={() => handleEditSchedule(schedule)}
                                title={t('schedule:admin.actions.edit')}
                            >
                                <HiOutlinePencil size={16} />
                            </button>
                            <button
                                className="action-btn danger"
                                onClick={() => handleDeleteSchedule(schedule._id)}
                                title={t('schedule:admin.actions.delete')}
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
                                {getStatusLabel(schedule.status)}
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
        const weekDays = [
            t('schedule:weekdays.full.sunday'),
            t('schedule:weekdays.full.monday'),
            t('schedule:weekdays.full.tuesday'),
            t('schedule:weekdays.full.wednesday'),
            t('schedule:weekdays.full.thursday'),
            t('schedule:weekdays.full.friday'),
            t('schedule:weekdays.full.saturday')
        ];
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
                        {startOfWeek.toLocaleDateString(locale)} - {new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString(locale)}
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
                                    <span>{dayDate.toLocaleDateString(locale)}</span>
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
                                                    {new Date(schedule.startTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} - 
                                                    {new Date(schedule.endTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
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
                <p>{t('schedule:admin.loading.schedules')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="schedule-error">
                <HiOutlineExclamation size={48} />
                <h3>{t('schedule:admin.error.title')}</h3>
                <p>{error}</p>
                <button onClick={fetchSchedules} className="btn btn-primary">
                    {t('schedule:admin.actions.retry')}
                </button>
            </div>
        );
    }

    return (
        <div className="admin-schedule-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>{t('schedule:admin.header.title')}</h1>
                    <p>{t('schedule:admin.header.subtitle')}</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <HiOutlineFilter size={20} />
                        {t('schedule:admin.actions.filters')}
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={fetchSchedules}
                    >
                        <HiOutlineRefresh size={20} />
                        {t('schedule:admin.actions.refresh')}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleCreateSchedule}
                    >
                        <HiOutlinePlus size={20} />
                        {t('schedule:admin.actions.createSchedule')}
                    </button>
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="filters-panel">
                    <div className="filter-group">
                        <label>{t('schedule:admin.filters.search')}</label>
                        <div className="search-input">
                            <HiOutlineSearch size={16} />
                            <input
                                type="text"
                                placeholder={t('schedule:admin.filters.searchPlaceholder')}
                                value={filters.search}
                                onChange={(e) => handleFilterChange('search', e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="filter-group">
                        <label>{t('schedule:admin.filters.type')}</label>
                        <select
                            value={filters.type}
                            onChange={(e) => handleFilterChange('type', e.target.value)}
                        >
                            <option value="">{t('schedule:admin.filters.allTypes')}</option>
                            <option value="class">{getTypeLabel('class')}</option>
                            <option value="exam">{getTypeLabel('exam')}</option>
                            <option value="meeting">{getTypeLabel('meeting')}</option>
                            <option value="event">{getTypeLabel('event')}</option>
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>{t('schedule:admin.filters.teacher')}</label>
                        <select
                            value={filters.teacher}
                            onChange={(e) => handleFilterChange('teacher', e.target.value)}
                        >
                            <option value="">{t('schedule:admin.filters.allTeachers')}</option>
                            {teachers.map(teacher => (
                                <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                    {teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : t('schedule:admin.common.unknown')}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>{t('schedule:admin.filters.class')}</label>
                        <select
                            value={filters.class}
                            onChange={(e) => handleFilterChange('class', e.target.value)}
                        >
                            <option value="">{t('schedule:admin.filters.allClasses')}</option>
                            {classes.map(cls => (
                                <option key={cls._id} value={cls._id}>
                                    {cls.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>{t('schedule:admin.filters.status')}</label>
                        <select
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                        >
                            <option value="">{t('schedule:admin.filters.allStatuses')}</option>
                            <option value="scheduled">{getStatusLabel('scheduled')}</option>
                            <option value="in_progress">{getStatusLabel('in_progress')}</option>
                            <option value="completed">{getStatusLabel('completed')}</option>
                            <option value="cancelled">{getStatusLabel('cancelled')}</option>
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <label>{t('schedule:admin.filters.dateRange')}</label>
                        <div className="date-range">
                            <input
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                            />
                            <span>{t('schedule:admin.filters.to')}</span>
                            <input
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="filter-actions">
                        <button className="btn btn-secondary" onClick={clearFilters}>
                            {t('schedule:admin.actions.clearFilters')}
                        </button>
                    </div>
                </div>
            )}

            {/* Quick Schedule Creation */}
            <div className="quick-schedule-section">
                <h2>{t('schedule:admin.quick.title')}</h2>
                <p>{t('schedule:admin.quick.subtitle')}</p>
                
                <div className="quick-schedule-grid">
                    <div className="quick-schedule-card">
                        <h3>{t('schedule:admin.quick.teacherAssignments')}</h3>
                        <div className="teacher-assignments">
                            {teachers.map(teacher => {
                                const teacherUserId = teacher.user?._id || teacher._id;
                                const teacherSubjectIds = (teacher.subjects || []).map(s => (typeof s === 'object' && s?._id ? s._id : s));
                                return (
                                    <div key={teacher._id} className="teacher-card">
                                        <div className="teacher-info">
                                            <strong>{teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : t('schedule:admin.common.unknown')}</strong>
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
                                                        title={t('schedule:admin.quick.scheduleForClass', {
                                                            subject: subjects.find(s => s._id === subjectId)?.name,
                                                            className: cls.name
                                                        })}
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
                        <h3>{t('schedule:admin.quick.classScheduleMatrix')}</h3>
                        <div className="schedule-matrix">
                            {classes.map(cls => (
                                <div key={cls._id} className="class-row">
                                    <div className="class-info">
                                        <strong>{cls.name}</strong>
                                        <span>{t('schedule:admin.quick.students', { count: cls.students })}</span>
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
                                                    <option value="">{t('schedule:admin.quick.assignTeacher')}</option>
                                                    {teachers
                                                        .filter(teacher => (teacher.subjects || []).some(s => (s?._id || s) === subject._id))
                                                        .map(teacher => (
                                                            <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                                                {teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : t('schedule:admin.common.unknown')}
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
                        {t('schedule:admin.views.list')}
                    </button>
                    <button
                        className={`toggle-btn ${currentView === 'week' ? 'active' : ''}`}
                        onClick={() => setCurrentView('week')}
                    >
                        {t('schedule:admin.views.week')}
                    </button>
                    <button
                        className={`toggle-btn ${currentView === 'calendar' ? 'active' : ''}`}
                        onClick={() => setCurrentView('calendar')}
                    >
                        {t('schedule:admin.views.calendar')}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="schedule-content">
                {currentView === 'list' && renderListView()}
                {currentView === 'week' && renderWeekView()}
                {currentView === 'calendar' && (
                    <div className="calendar-view">
                        <p>{t('schedule:admin.views.calendarComingSoon')}</p>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {(showCreateModal || showEditModal) && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>{showCreateModal ? t('schedule:admin.actions.createSchedule') : t('schedule:admin.actions.editSchedule')}</h2>
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
                                    <label>{t('schedule:admin.labels.title')} *</label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder={t('schedule:admin.placeholders.scheduleTitle')}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>{t('schedule:admin.labels.type')} *</label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                                    >
                                        <option value="class">{getTypeLabel('class')}</option>
                                        <option value="exam">{getTypeLabel('exam')}</option>
                                        <option value="meeting">{getTypeLabel('meeting')}</option>
                                        <option value="event">{getTypeLabel('event')}</option>
                                        <option value="holiday">{getTypeLabel('holiday')}</option>
                                        <option value="appointment">{getTypeLabel('appointment')}</option>
                                    </select>
                                </div>
                                
                                <div className="form-group full-width">
                                    <label>{t('schedule:admin.labels.description')}</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder={t('schedule:admin.placeholders.description')}
                                        rows="3"
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>{t('schedule:admin.labels.class')}</label>
                                    <select
                                        value={formData.class}
                                        onChange={(e) => setFormData(prev => ({ ...prev, class: e.target.value }))}
                                    >
                                        <option value="">{t('schedule:admin.select.selectClass')}</option>
                                        {classes.map(cls => (
                                            <option key={cls._id} value={cls._id}>
                                                {cls.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label>{t('schedule:admin.labels.subject')}</label>
                                    <select
                                        value={formData.subject}
                                        onChange={(e) => handleSubjectChange(e.target.value)}
                                    >
                                        <option value="">{t('schedule:admin.select.selectSubject')}</option>
                                        {subjects.map(subject => (
                                            <option key={subject._id} value={subject._id}>
                                                {subject.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label>{t('schedule:admin.labels.teacher')}</label>
                                    <select
                                        value={formData.teacher}
                                        onChange={(e) => handleTeacherChange(e.target.value)}
                                    >
                                        <option value="">{t('schedule:admin.select.selectTeacher')}</option>
                                        {teachers.map(teacher => (
                                            <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                                {teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : t('schedule:admin.common.unknown')}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="form-group">
                                    <label>
                                        {t('schedule:admin.labels.room')}
                                        {formData.startTime && formData.endTime && (
                                            <span className="room-availability-hint">
                                                {roomAvailabilityLoading
                                                    ? ` ${t('schedule:admin.room.checkingAvailability')}`
                                                    : roomAvailability ? ` ${t('schedule:admin.room.selectAvailable')}` : ''}
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
                                        <option value="">{t('schedule:admin.select.selectRoom')}</option>
                                        {rooms.map(room => {
                                            const avail = getRoomAvailabilityEntry(room._id);
                                            const defaultAvailable = room.status === 'active' && room.isAvailable !== false;
                                            const available = avail ? avail.available : defaultAvailable;
                                            const conflictingWith = avail?.conflictingWith;
                                            const conflictTitle = conflictingWith
                                                ? `${conflictingWith.title || t('schedule:admin.labels.event')} (${new Date(conflictingWith.startTime).toLocaleString(locale)} – ${new Date(conflictingWith.endTime).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })})`
                                                : (avail?.unavailabilityReason || (defaultAvailable ? t('schedule:admin.room.availableRoom') : t('schedule:admin.room.unavailableRoom')));
                                            return (
                                                <option
                                                    key={room._id}
                                                    value={room._id}
                                                    disabled={!available}
                                                    title={available ? t('schedule:admin.room.availableForTime') : conflictTitle}
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
                                            <HiOutlineExclamation size={14} /> {getRoomAvailabilityEntry(formData.room)?.unavailabilityReason || t('schedule:admin.room.unavailableForSelectedTime')}
                                        </span>
                                    )}
                                </div>
                                
                                <div className="form-group">
                                    <label>{t('schedule:admin.labels.location')}</label>
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                                        placeholder={t('schedule:admin.placeholders.location')}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>{t('schedule:admin.labels.startTime')} *</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.startTime}
                                        onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>{t('schedule:admin.labels.endTime')} *</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.endTime}
                                        onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>{t('schedule:admin.labels.color')}</label>
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
                                        {t('schedule:admin.labels.requiresAttendance')}
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
                                {t('schedule:admin.actions.cancel')}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveSchedule}
                            >
                                {showCreateModal ? t('schedule:admin.actions.create') : t('schedule:admin.actions.update')} {t('schedule:admin.labels.schedule')}
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
                            <h2>{t('schedule:admin.details.title')}</h2>
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
                                    <h3>{t('schedule:admin.details.basicInformation')}</h3>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>{t('schedule:admin.labels.title')}:</label>
                                            <span>{selectedSchedule.title}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t('schedule:admin.labels.type')}:</label>
                                            <span className={`type-badge type-${getTypeColor(selectedSchedule.type)}`}>
                                                {getTypeLabel(selectedSchedule.type)}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t('schedule:admin.labels.status')}:</label>
                                            <span className={`status-badge status-${getStatusColor(selectedSchedule.status)}`}>
                                                {getStatusLabel(selectedSchedule.status)}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t('schedule:admin.labels.color')}:</label>
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
                                    <h3>{t('schedule:admin.details.timeAndLocation')}</h3>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>{t('schedule:admin.labels.startTime')}:</label>
                                            <span>{formatDateTime(selectedSchedule.startTime)}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t('schedule:admin.labels.endTime')}:</label>
                                            <span>{formatDateTime(selectedSchedule.endTime)}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t('schedule:admin.labels.duration')}:</label>
                                            <span>
                                                {t('schedule:admin.details.durationMinutes', {
                                                    minutes: Math.round((new Date(selectedSchedule.endTime) - new Date(selectedSchedule.startTime)) / (1000 * 60))
                                                })}
                                            </span>
                                        </div>
                                        {selectedSchedule.room && (
                                            <div className="detail-item">
                                                <label>{t('schedule:admin.labels.room')}:</label>
                                                <span>{getRoomDisplay(selectedSchedule)}</span>
                                            </div>
                                        )}
                                        {selectedSchedule.location && (
                                            <div className="detail-item">
                                                <label>{t('schedule:admin.labels.location')}:</label>
                                                <span>{selectedSchedule.location}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="detail-section">
                                    <h3>{t('schedule:admin.details.associatedInformation')}</h3>
                                    <div className="detail-grid">
                                        {selectedSchedule.class && (
                                            <div className="detail-item">
                                                <label>{t('schedule:admin.labels.class')}:</label>
                                                <span>{selectedSchedule.class.name}</span>
                                            </div>
                                        )}
                                        {selectedSchedule.subject && (
                                            <div className="detail-item">
                                                <label>{t('schedule:admin.labels.subject')}:</label>
                                                <span>{selectedSchedule.subject.name}</span>
                                            </div>
                                        )}
                                        {selectedSchedule.teacher && (
                                            <div className="detail-item">
                                                <label>{t('schedule:admin.labels.teacher')}:</label>
                                                <span>{selectedSchedule.teacher.firstName} {selectedSchedule.teacher.lastName}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {selectedSchedule.description && (
                                    <div className="detail-section">
                                        <h3>{t('schedule:admin.labels.description')}</h3>
                                        <p>{selectedSchedule.description}</p>
                                    </div>
                                )}
                                
                                <div className="detail-section">
                                    <h3>{t('schedule:admin.details.participants')}</h3>
                                    <div className="participants-list">
                                        {selectedSchedule.participants.length > 0 ? (
                                            selectedSchedule.participants.map(participant => (
                                                <div key={participant.user._id} className="participant-item">
                                                    <span>{participant.user.firstName} {participant.user.lastName}</span>
                                                    <span className={`participant-status ${participant.status}`}>
                                                        {getStatusLabel(participant.status)}
                                                    </span>
                                                </div>
                                            ))
                                        ) : (
                                            <p>{t('schedule:admin.details.noParticipants')}</p>
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
                                {t('schedule:admin.actions.close')}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    setShowViewModal(false);
                                    handleEditSchedule(selectedSchedule);
                                }}
                            >
                                {t('schedule:admin.actions.edit')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminSchedulePage;
