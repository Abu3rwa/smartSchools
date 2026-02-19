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
    HiOutlinePencil
} from 'react-icons/hi';
import './TeacherSchedulePage.css';
import scheduleService from '../../services/scheduleService';
import studentService from '../../services/studentService';
import attendanceService from '../../services/attendanceService';

const TeacherSchedulePage = () => {
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

    const mapStatusForApi = (status) => {
        if (status === 'late') return 'tardy';
        if (status === 'excused') return 'absent_excused';
        return status;
    };

    const handleSaveAttendance = async () => {
        if (!selectedSchedule?._id) return;
        try {
            setSavingAttendance(true);
            await attendanceService.createOrUpdateAttendance({
                scheduleId: selectedSchedule._id,
                studentAttendance: attendanceData.map(r => ({
                    student: r.student?._id,
                    status: mapStatusForApi(r.status),
                    notes: r.notes || ''
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
        return new Date(date).toLocaleString();
    };

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
                    <h3>{currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                    <div className="view-navigation">
                        <button onClick={() => navigateDate('prev')}>
                            <HiOutlineChevronLeft size={20} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())}>Today</button>
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
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        
        return (
            <div className="week-view">
                <div className="view-header">
                    <h3>
                        {startOfWeek.toLocaleDateString()} - {new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </h3>
                    <div className="view-navigation">
                        <button onClick={() => navigateDate('prev')}>
                            <HiOutlineChevronLeft size={20} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())}>This Week</button>
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
                                    <span>{dayDate.toLocaleDateString()}</span>
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
                    <h3>{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
                    <div className="view-navigation">
                        <button onClick={() => navigateDate('prev')}>
                            <HiOutlineChevronLeft size={20} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())}>This Month</button>
                        <button onClick={() => navigateDate('next')}>
                            <HiOutlineChevronRight size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="month-grid">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
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
                                            +{daySchedules.length - 3} more
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
                <p>Loading schedule...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="schedule-error">
                <HiOutlineExclamation size={48} />
                <h3>Error loading schedule</h3>
                <p>{error}</p>
                <button onClick={fetchSchedules} className="btn btn-primary">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="teacher-schedule-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>My Schedule</h1>
                    <p>View and manage your teaching schedule</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={fetchSchedules}
                    >
                        <HiOutlineRefresh size={20} />
                        Refresh
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
                        <p>Today's Classes</p>
                    </div>
                </div>
                
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineClock size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{schedules.filter(s => s.requiresAttendance && !s.attendanceRecorded).length}</h3>
                        <p>Pending Attendance</p>
                    </div>
                </div>
                
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineBell size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{getUpcomingSchedules().length}</h3>
                        <p>Upcoming Classes</p>
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
                        Day
                    </button>
                    <button
                        className={`toggle-btn ${currentView === 'week' ? 'active' : ''}`}
                        onClick={() => setCurrentView('week')}
                    >
                        Week
                    </button>
                    <button
                        className={`toggle-btn ${currentView === 'month' ? 'active' : ''}`}
                        onClick={() => setCurrentView('month')}
                    >
                        Month
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
                            <h2>Class Details</h2>
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
                                    <h3>Class Information</h3>
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
                                            <label>Time:</label>
                                            <span>{formatDateTime(selectedSchedule.startTime)} - {formatDateTime(selectedSchedule.endTime)}</span>
                                        </div>
                                        {selectedSchedule.room && (
                                            <div className="detail-item">
                                                <label>Room:</label>
                                                <span>{getRoomLabel(selectedSchedule.room)}</span>
                                            </div>
                                        )}
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
                                    </div>
                                </div>
                                
                                {selectedSchedule.description && (
                                    <div className="detail-section">
                                        <h3>Description</h3>
                                        <p>{selectedSchedule.description}</p>
                                    </div>
                                )}
                                
                                {selectedSchedule.requiresAttendance && (
                                    <div className="detail-section">
                                        <h3>Attendance</h3>
                                        <div className="attendance-status">
                                            {selectedSchedule.attendanceRecorded ? (
                                                <div className="attendance-recorded">
                                                    <HiOutlineCheckCircle size={20} color="green" />
                                                    <span>Attendance has been recorded</span>
                                                </div>
                                            ) : (
                                                <div className="attendance-pending">
                                                    <HiOutlineExclamation size={20} color="orange" />
                                                    <span>Attendance pending</span>
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
                                                Record Attendance
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
                                Close
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
                            <h2>Record Attendance</h2>
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
                                                    <span className="check-in-time">Checked in: {record.checkInTime}</span>
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
                                                    <option value="present">Present</option>
                                                    <option value="absent">Absent</option>
                                                    <option value="late">Late</option>
                                                    <option value="excused">Excused</option>
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
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    // Handle attendance submission
                                    handleSaveAttendance();
                                }}
                                disabled={savingAttendance}
                            >
                                {savingAttendance ? 'Saving...' : 'Save Attendance'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherSchedulePage;
