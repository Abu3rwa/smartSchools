import { useEffect, useState } from 'react';
import {
    HiOutlineCalendar,
    HiOutlineClock,
    HiOutlineAcademicCap,
    HiOutlineLocationMarker,
    HiOutlineUser,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineRefresh,
    HiOutlineBell,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineExclamation,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlineX
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import './TeacherSchedulePage.css';
import scheduleService from '../../../../services/scheduleService';
import studentService from '../../../../services/studentService';
import attendanceService from '../../../../services/attendanceService';

const TeacherSchedulePage = () => {
    const { t, i18n } = useTranslation(['schedule']);
    const locale = i18n.language?.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-US';

    // Local state
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentView, setCurrentView] = useState('week'); // 'day', 'week', 'month'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedSchedule, setSelectedSchedule] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);
    const [attendanceData, setAttendanceData] = useState([]);
    const [savingAttendance, setSavingAttendance] = useState(false);

    useEffect(() => {
        fetchSchedules();
    }, [currentDate, currentView]);

    const fetchSchedules = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Calculate date range based on current view
            let startDate, endDate;
            const today = new Date(currentDate);
            
            if (currentView === 'day') {
                startDate = new Date(today.setHours(0, 0, 0, 0));
                endDate = new Date(today.setHours(23, 59, 59, 999));
            } else if (currentView === 'week') {
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay());
                startDate = new Date(startOfWeek.setHours(0, 0, 0, 0));
                
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endDate = new Date(endOfWeek.setHours(23, 59, 59, 999));
            } else { // month
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
            }
            
            const response = await scheduleService.getSchedulesByDateRange(
                startDate.toISOString(),
                endDate.toISOString()
            );

            setSchedules(response?.data?.schedules || []);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleScheduleClick = (schedule) => {
        setSelectedSchedule(schedule);
        setShowDetailsModal(true);
    };

    const handleAttendanceClick = (schedule) => {
        setSelectedSchedule(schedule);
        setShowAttendanceModal(true);
        setAttendanceData([]);

        if (!schedule?.class?._id) return;

        (async () => {
            try {
                const studentsResponse = await studentService.getStudentsByClass(schedule.class._id);
                const students = studentsResponse?.data?.students || [];
                setAttendanceData(
                    students.map(s => ({
                        student: s,
                        status: 'present',
                        checkInTime: null,
                        notes: ''
                    }))
                );
            } catch (err) {
                setError(err?.response?.data?.message || err.message);
            }
        })();
    };

    const handleSaveAttendance = async () => {
        if (!selectedSchedule?._id) return;
        try {
            setSavingAttendance(true);
            await attendanceService.createOrUpdateAttendance({
                scheduleId: selectedSchedule._id,
                studentAttendance: attendanceData.map(r => ({
                    student: r.student?._id,
                    status: r.status,
                    notes: r.notes
                }))
            });

            setShowAttendanceModal(false);
            await fetchSchedules();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSavingAttendance(false);
        }
    };

    const navigateDate = (direction) => {
        const newDate = new Date(currentDate);
        
        if (currentView === 'day') {
            newDate.setDate(newDate.getDate() + (direction === 'prev' ? -1 : 1));
        } else if (currentView === 'week') {
            newDate.setDate(newDate.getDate() + (direction === 'prev' ? -7 : 7));
        } else { // month
            newDate.setMonth(newDate.getMonth() + (direction === 'prev' ? -1 : 1));
        }
        
        setCurrentDate(newDate);
    };

    const formatDateTime = (date) => {
        return new Date(date).toLocaleString(locale);
    };

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    };

    const getRoomLabel = (room) => {
        if (!room) return '';
        if (typeof room === 'string') return room;
        return room.name || '';
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
            'appointment': 'indigo'
        };
        return colors[type] || 'gray';
    };

    const getTypeLabel = (type) =>
        t(`schedule:type.${type}`, { defaultValue: type });

    const getAttendanceStatusLabel = (status) =>
        t(`schedule:attendance.status.${status}`, { defaultValue: status });

    const getTodaySchedules = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        return schedules.filter(schedule => {
            const scheduleDate = new Date(schedule.startTime);
            return scheduleDate >= today && scheduleDate < tomorrow;
        });
    };

    const getUpcomingSchedules = () => {
        const now = new Date();
        return schedules
            .filter(schedule => new Date(schedule.startTime) > now)
            .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
            .slice(0, 5);
    };

    const renderDayView = () => {
        const todaySchedules = getTodaySchedules();
        const hours = Array.from({ length: 24 }, (_, i) => i);
        
        return (
            <div className="day-view">
                <div className="view-header">
                    <h3>{currentDate.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                    <div className="view-navigation">
                        <button onClick={() => navigateDate('prev')}>
                            <HiOutlineChevronLeft size={20} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())}>{t('schedule:teacher.navigation.today')}</button>
                        <button onClick={() => navigateDate('next')}>
                            <HiOutlineChevronRight size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="day-grid">
                    <div className="time-column">
                        {hours.map(hour => (
                            <div key={hour} className="time-slot">
                                {hour.toString().padStart(2, '0')}:00
                            </div>
                        ))}
                    </div>
                    
                    <div className="schedule-column">
                        {hours.map(hour => {
                            const hourSchedules = todaySchedules.filter(schedule => {
                                const scheduleHour = new Date(schedule.startTime).getHours();
                                return scheduleHour === hour;
                            });
                            
                            return (
                                <div key={hour} className="hour-slot">
                                    {hourSchedules.map(schedule => (
                                        <div
                                            key={schedule._id}
                                            className="schedule-block"
                                            style={{ backgroundColor: schedule.color }}
                                            onClick={() => handleScheduleClick(schedule)}
                                        >
                                            <div className="schedule-time">
                                                {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                                            </div>
                                            <div className="schedule-title">{schedule.title}</div>
                                            {schedule.room && (
                                                <div className="schedule-room">{getRoomLabel(schedule.room)}</div>
                                            )}
                                            {schedule.requiresAttendance && (
                                                <div className="attendance-indicator">
                                                    {schedule.attendanceRecorded ? (
                                                        <HiOutlineCheckCircle size={16} />
                                                    ) : (
                                                        <HiOutlineExclamation size={16} />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

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
                <div className="view-header">
                    <h3>
                        {startOfWeek.toLocaleDateString(locale)} - {new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString(locale)}
                    </h3>
                    <div className="view-navigation">
                        <button onClick={() => navigateDate('prev')}>
                            <HiOutlineChevronLeft size={20} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())}>{t('schedule:teacher.navigation.thisWeek')}</button>
                        <button onClick={() => navigateDate('next')}>
                            <HiOutlineChevronRight size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="week-grid">
                    <div className="time-column">
                        {Array.from({ length: 12 }, (_, i) => i + 8).map(hour => (
                            <div key={hour} className="time-slot">
                                {hour.toString().padStart(2, '0')}:00
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
                                        .map(schedule => {
                                            const startHour = new Date(schedule.startTime).getHours();
                                            const startMinute = new Date(schedule.startTime).getMinutes();
                                            const endHour = new Date(schedule.endTime).getHours();
                                            const endMinute = new Date(schedule.endTime).getMinutes();
                                            
                                            const top = (startHour - 8) * 60 + startMinute;
                                            const height = (endHour - startHour) * 60 + (endMinute - startMinute);
                                            
                                            return (
                                                <div
                                                    key={schedule._id}
                                                    className="event-block"
                                                    style={{
                                                        backgroundColor: schedule.color,
                                                        top: `${top}px`,
                                                        height: `${height}px`
                                                    }}
                                                    onClick={() => handleScheduleClick(schedule)}
                                                >
                                                    <div className="event-title">{schedule.title}</div>
                                                    <div className="event-time">
                                                        {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                                                    </div>
                                                    {schedule.room && (
                                                        <div className="event-room">{getRoomLabel(schedule.room)}</div>
                                                    )}
                                                    {schedule.requiresAttendance && (
                                                        <div className="attendance-indicator">
                                                            {schedule.attendanceRecorded ? (
                                                                <HiOutlineCheckCircle size={12} />
                                                            ) : (
                                                                <HiOutlineExclamation size={12} />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderMonthView = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        const calendarDays = [];
        
        // Add empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            calendarDays.push(null);
        }
        
        // Add days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            calendarDays.push(i);
        }
        
        return (
            <div className="month-view">
                <div className="view-header">
                    <h3>{currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h3>
                    <div className="view-navigation">
                        <button onClick={() => navigateDate('prev')}>
                            <HiOutlineChevronLeft size={20} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())}>{t('schedule:teacher.navigation.thisMonth')}</button>
                        <button onClick={() => navigateDate('next')}>
                            <HiOutlineChevronRight size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="month-grid">
                    {[
                        t('schedule:weekdays.short.sun'),
                        t('schedule:weekdays.short.mon'),
                        t('schedule:weekdays.short.tue'),
                        t('schedule:weekdays.short.wed'),
                        t('schedule:weekdays.short.thu'),
                        t('schedule:weekdays.short.fri'),
                        t('schedule:weekdays.short.sat')
                    ].map(day => (
                        <div key={day} className="weekday-header">
                            {day}
                        </div>
                    ))}
                    
                    {calendarDays.map((day, index) => {
                        if (!day) {
                            return <div key={`empty-${index}`} className="empty-day"></div>;
                        }
                        
                        const dayDate = new Date(year, month, day);
                        const daySchedules = schedules.filter(schedule => {
                            const scheduleDate = new Date(schedule.startTime);
                            return scheduleDate.toDateString() === dayDate.toDateString();
                        });
                        
                        const isToday = dayDate.toDateString() === new Date().toDateString();
                        
                        return (
                            <div
                                key={day}
                                className={`calendar-day ${isToday ? 'today' : ''}`}
                                onClick={() => {
                                    setCurrentDate(dayDate);
                                    setCurrentView('day');
                                }}
                            >
                                <div className="day-number">{day}</div>
                                <div className="day-events">
                                    {daySchedules.slice(0, 3).map(schedule => (
                                        <div
                                            key={schedule._id}
                                            className="mini-event"
                                            style={{ backgroundColor: schedule.color }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleScheduleClick(schedule);
                                            }}
                                        >
                                            {schedule.title.substring(0, 20)}...
                                        </div>
                                    ))}
                                    {daySchedules.length > 3 && (
                                        <div className="more-events">
                                            +{daySchedules.length - 3} {t('schedule:teacher.common.more')}
                                        </div>
                                    )}
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
                <p>{t('schedule:teacher.loading.schedule')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="schedule-error">
                <HiOutlineExclamation size={48} />
                <h3>{t('schedule:teacher.error.title')}</h3>
                <p>{error}</p>
                <button onClick={fetchSchedules} className="btn btn-primary">
                    {t('schedule:teacher.actions.retry')}
                </button>
            </div>
        );
    }

    return (
        <div className="teacher-schedule-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>{t('schedule:teacher.header.title')}</h1>
                    <p>{t('schedule:teacher.header.subtitle')}</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={fetchSchedules}
                    >
                        <HiOutlineRefresh size={20} />
                        {t('schedule:teacher.actions.refresh')}
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="quick-stats">
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineCalendar size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{getTodaySchedules().length}</h3>
                        <p>{t('schedule:teacher.stats.todayClasses')}</p>
                    </div>
                </div>
                
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineClock size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{schedules.filter(s => s.requiresAttendance && !s.attendanceRecorded).length}</h3>
                        <p>{t('schedule:teacher.stats.pendingAttendance')}</p>
                    </div>
                </div>
                
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineBell size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{getUpcomingSchedules().length}</h3>
                        <p>{t('schedule:teacher.stats.upcomingClasses')}</p>
                    </div>
                </div>
            </div>

            {/* View Toggle */}
            <div className="view-toggle">
                <div className="toggle-buttons">
                    <button
                        className={`toggle-btn ${currentView === 'day' ? 'active' : ''}`}
                        onClick={() => setCurrentView('day')}
                    >
                        {t('schedule:teacher.views.day')}
                    </button>
                    <button
                        className={`toggle-btn ${currentView === 'week' ? 'active' : ''}`}
                        onClick={() => setCurrentView('week')}
                    >
                        {t('schedule:teacher.views.week')}
                    </button>
                    <button
                        className={`toggle-btn ${currentView === 'month' ? 'active' : ''}`}
                        onClick={() => setCurrentView('month')}
                    >
                        {t('schedule:teacher.views.month')}
                    </button>
                </div>
            </div>

            {/* Schedule View */}
            <div className="schedule-view">
                {currentView === 'day' && renderDayView()}
                {currentView === 'week' && renderWeekView()}
                {currentView === 'month' && renderMonthView()}
            </div>

            {/* Details Modal */}
            {showDetailsModal && selectedSchedule && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>{t('schedule:teacher.details.title')}</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowDetailsModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="schedule-details">
                                <div className="detail-section">
                                    <h3>{t('schedule:teacher.details.classInformation')}</h3>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>{t('schedule:teacher.labels.title')}:</label>
                                            <span>{selectedSchedule.title}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t('schedule:teacher.labels.type')}:</label>
                                            <span className={`type-badge type-${getTypeColor(selectedSchedule.type)}`}>
                                                {getTypeLabel(selectedSchedule.type)}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t('schedule:teacher.labels.status')}:</label>
                                            <span className={`status-badge status-${getStatusColor(selectedSchedule.status)}`}>
                                                {getStatusLabel(selectedSchedule.status)}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <label>{t('schedule:teacher.labels.time')}:</label>
                                            <span>{formatDateTime(selectedSchedule.startTime)} - {formatDateTime(selectedSchedule.endTime)}</span>
                                        </div>
                                        {selectedSchedule.room && (
                                            <div className="detail-item">
                                                <label>{t('schedule:teacher.labels.room')}:</label>
                                                <span>{getRoomLabel(selectedSchedule.room)}</span>
                                            </div>
                                        )}
                                        {selectedSchedule.class && (
                                            <div className="detail-item">
                                                <label>{t('schedule:teacher.labels.class')}:</label>
                                                <span>{selectedSchedule.class.name}</span>
                                            </div>
                                        )}
                                        {selectedSchedule.subject && (
                                            <div className="detail-item">
                                                <label>{t('schedule:teacher.labels.subject')}:</label>
                                                <span>{selectedSchedule.subject.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {selectedSchedule.description && (
                                    <div className="detail-section">
                                        <h3>{t('schedule:teacher.labels.description')}</h3>
                                        <p>{selectedSchedule.description}</p>
                                    </div>
                                )}
                                
                                {selectedSchedule.requiresAttendance && (
                                    <div className="detail-section">
                                        <h3>{t('schedule:teacher.attendance.title')}</h3>
                                        <div className="attendance-status">
                                            {selectedSchedule.attendanceRecorded ? (
                                                <div className="attendance-recorded">
                                                    <HiOutlineCheckCircle size={20} color="green" />
                                                    <span>{t('schedule:teacher.attendance.recorded')}</span>
                                                </div>
                                            ) : (
                                                <div className="attendance-pending">
                                                    <HiOutlineExclamation size={20} color="orange" />
                                                    <span>{t('schedule:teacher.attendance.pending')}</span>
                                                </div>
                                            )}
                                        </div>
                                        {!selectedSchedule.attendanceRecorded && (
                                            <button
                                                className="btn btn-primary"
                                                onClick={() => {
                                                    setShowDetailsModal(false);
                                                    handleAttendanceClick(selectedSchedule);
                                                }}
                                            >
                                                {t('schedule:teacher.attendance.recordAttendance')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowDetailsModal(false)}
                            >
                                {t('schedule:teacher.actions.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Attendance Modal */}
            {showAttendanceModal && selectedSchedule && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>{t('schedule:teacher.attendance.recordAttendance')}</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowAttendanceModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="attendance-form">
                                <h3>{selectedSchedule.title}</h3>
                                <p>{formatDateTime(selectedSchedule.startTime)} - {formatDateTime(selectedSchedule.endTime)}</p>
                                
                                <div className="attendance-list">
                                    {attendanceData.map((record, index) => (
                                        <div key={index} className="attendance-item">
                                            <div className="student-info">
                                                <span className="student-name">
                                                    {record.student.firstName} {record.student.lastName}
                                                </span>
                                                {record.checkInTime && (
                                                    <span className="check-in-time">
                                                        {t('schedule:teacher.attendance.checkedIn')}: {record.checkInTime}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="attendance-status">
                                                <select
                                                    value={record.status}
                                                    onChange={(e) => {
                                                        const newAttendance = [...attendanceData];
                                                        newAttendance[index].status = e.target.value;
                                                        setAttendanceData(newAttendance);
                                                    }}
                                                >
                                                    <option value="present">{getAttendanceStatusLabel('present')}</option>
                                                    <option value="absent">{getAttendanceStatusLabel('absent')}</option>
                                                    <option value="late">{getAttendanceStatusLabel('late')}</option>
                                                    <option value="excused">{getAttendanceStatusLabel('excused')}</option>
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowAttendanceModal(false)}
                            >
                                {t('schedule:teacher.actions.cancel')}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    // Handle attendance submission
                                    handleSaveAttendance();
                                }}
                                disabled={savingAttendance}
                            >
                                {savingAttendance
                                    ? t('schedule:teacher.actions.saving')
                                    : t('schedule:teacher.attendance.saveAttendance')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherSchedulePage;
