import { useEffect, useState } from 'react';
import {
    HiOutlineCalendar,
    HiOutlineClock,
    HiOutlineUserGroup,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineExclamation,
    HiOutlineRefresh,
    HiOutlineSearch,
    HiOutlineFilter,
    HiOutlineDownload,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlineChevronLeft,
    HiOutlineChevronRight
} from 'react-icons/hi';
import './TeacherAttendancePage.css';
import attendanceService from '../../services/attendanceService';

const TeacherAttendancePage = () => {
    // Local state
    const [attendanceData, setAttendanceData] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedSchedule, setSelectedSchedule] = useState(null);
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [viewMode, setViewMode] = useState('today'); // 'today', 'week', 'month'
    const [filters, setFilters] = useState({
        class: '',
        subject: '',
        status: ''
    });

    useEffect(() => {
        fetchAttendanceData();
        fetchSchedules();
    }, [currentDate, viewMode, filters]);

    const fetchAttendanceData = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Calculate date range based on view mode
            let startDate, endDate;
            const today = new Date(currentDate);
            
            if (viewMode === 'today') {
                startDate = new Date(today.setHours(0, 0, 0, 0));
                endDate = new Date(today.setHours(23, 59, 59, 999));
            } else if (viewMode === 'week') {
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
            
            const response = await attendanceService.getTeacherAttendance({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                viewMode
            });

            const records = response?.attendanceRecords || [];

            const filtered = records.filter(r => {
                if (filters.class && r.class?._id !== filters.class) return false;
                if (filters.subject && r.subject?._id !== filters.subject) return false;
                if (filters.status === 'recorded' && r.status === 'draft') return false;
                if (filters.status === 'pending' && r.status !== 'draft') return false;
                return true;
            });

            setAttendanceData(filtered);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchSchedules = async () => {
        try {
            // This page focuses on attendance records; schedules are derived from attendanceRecords.
            setSchedules([]);
        } catch (err) {
            console.error('Error fetching schedules:', err);
        }
    };

    const handleRecordAttendance = (schedule) => {
        setSelectedSchedule(schedule);
        setShowAttendanceModal(true);
    };

    const handleViewDetails = (attendanceRecord) => {
        setSelectedSchedule(attendanceRecord.schedule);
        setShowDetailsModal(true);
    };

    const navigateDate = (direction) => {
        const newDate = new Date(currentDate);
        
        if (viewMode === 'today') {
            newDate.setDate(newDate.getDate() + (direction === 'prev' ? -1 : 1));
        } else if (viewMode === 'week') {
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

    const getDateRangeText = () => {
        const today = new Date(currentDate);
        
        if (viewMode === 'today') {
            return today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } else if (viewMode === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            return `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
        } else { // month
            return today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
    };

    const getAttendanceStats = () => {
        const total = attendanceData.length;
        const recorded = attendanceData.filter(item => item.attendanceRecorded).length;
        const pending = total - recorded;
        
        const totalStudents = attendanceData.reduce((sum, item) => sum + item.totalStudents, 0);
        const totalPresent = attendanceData.reduce((sum, item) => sum + item.present, 0);
        const totalAbsent = attendanceData.reduce((sum, item) => sum + item.absent, 0);
        const totalLate = attendanceData.reduce((sum, item) => sum + item.late, 0);
        
        const overallRate = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : 0;
        
        return {
            totalClasses: total,
            recordedClasses: recorded,
            pendingClasses: pending,
            totalStudents,
            totalPresent,
            totalAbsent,
            totalLate,
            overallRate
        };
    };

    const stats = getAttendanceStats();

    if (loading) {
        return (
            <div className="attendance-loading">
                <div className="spinner"></div>
                <p>Loading attendance data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="attendance-error">
                <HiOutlineExclamation size={48} />
                <h3>Error loading attendance</h3>
                <p>{error}</p>
                <button onClick={fetchAttendanceData} className="btn btn-primary">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="teacher-attendance-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Attendance Management</h1>
                    <p>Record and manage class attendance</p>
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={fetchAttendanceData}
                    >
                        <HiOutlineRefresh size={20} />
                        Refresh
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {/* Export functionality */}}
                    >
                        <HiOutlineDownload size={20} />
                        Export
                    </button>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineCalendar size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.totalClasses}</h3>
                        <p>Total Classes</p>
                    </div>
                </div>
                
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineCheckCircle size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.recordedClasses}</h3>
                        <p>Attendance Recorded</p>
                    </div>
                </div>
                
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineExclamation size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.pendingClasses}</h3>
                        <p>Pending Attendance</p>
                    </div>
                </div>
                
                <div className="stat-card">
                    <div className="stat-icon">
                        <HiOutlineUserGroup size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.overallRate}%</h3>
                        <p>Overall Attendance Rate</p>
                    </div>
                </div>
            </div>

            {/* View Controls */}
            <div className="view-controls">
                <div className="view-modes">
                    <div className="toggle-buttons">
                        <button
                            className={`toggle-btn ${viewMode === 'today' ? 'active' : ''}`}
                            onClick={() => setViewMode('today')}
                        >
                            Today
                        </button>
                        <button
                            className={`toggle-btn ${viewMode === 'week' ? 'active' : ''}`}
                            onClick={() => setViewMode('week')}
                        >
                            Week
                        </button>
                        <button
                            className={`toggle-btn ${viewMode === 'month' ? 'active' : ''}`}
                            onClick={() => setViewMode('month')}
                        >
                            Month
                        </button>
                    </div>
                    
                    <div className="date-navigation">
                        <button onClick={() => navigateDate('prev')}>
                            <HiOutlineChevronLeft size={20} />
                        </button>
                        <span>{getDateRangeText()}</span>
                        <button onClick={() => navigateDate('next')}>
                            <HiOutlineChevronRight size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="filters">
                    <div className="filter-group">
                        <select
                            value={filters.class}
                            onChange={(e) => setFilters(prev => ({ ...prev, class: e.target.value }))}
                        >
                            <option value="">All Classes</option>
                            <option value="1">Grade 10A</option>
                            <option value="2">Grade 11B</option>
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <select
                            value={filters.subject}
                            onChange={(e) => setFilters(prev => ({ ...prev, subject: e.target.value }))}
                        >
                            <option value="">All Subjects</option>
                            <option value="1">Mathematics</option>
                            <option value="2">Science</option>
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        >
                            <option value="">All Status</option>
                            <option value="recorded">Recorded</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Attendance List */}
            <div className="attendance-list">
                {attendanceData.length === 0 ? (
                    <div className="empty-state">
                        <HiOutlineCalendar size={48} />
                        <h3>No attendance records found</h3>
                        <p>No attendance data available for the selected period.</p>
                    </div>
                ) : (
                    attendanceData.map(record => (
                        <div key={record._id} className="attendance-card">
                            <div className="attendance-header">
                                <div className="class-info">
                                    <h3>{record.schedule.title}</h3>
                                    <div className="class-details">
                                        <span className="class-name">{record.schedule.class.name}</span>
                                        <span className="subject">{record.schedule.subject.name}</span>
                                        <span className="room">{record.schedule.room}</span>
                                    </div>
                                </div>
                                <div className="attendance-status">
                                    {record.attendanceRecorded ? (
                                        <div className="status-recorded">
                                            <HiOutlineCheckCircle size={20} color="green" />
                                            <span>Recorded</span>
                                        </div>
                                    ) : (
                                        <div className="status-pending">
                                            <HiOutlineExclamation size={20} color="orange" />
                                            <span>Pending</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="attendance-content">
                                <div className="time-info">
                                    <div className="time-item">
                                        <HiOutlineClock size={16} />
                                        <span>{formatTime(record.schedule.startTime)} - {formatTime(record.schedule.endTime)}</span>
                                    </div>
                                    <div className="date-item">
                                        <HiOutlineCalendar size={16} />
                                        <span>{new Date(record.schedule.startTime).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                
                                <div className="attendance-stats">
                                    <div className="stat-item">
                                        <span className="stat-label">Total:</span>
                                        <span className="stat-value">{record.totalStudents}</span>
                                    </div>
                                    <div className="stat-item present">
                                        <span className="stat-label">Present:</span>
                                        <span className="stat-value">{record.present}</span>
                                    </div>
                                    <div className="stat-item absent">
                                        <span className="stat-label">Absent:</span>
                                        <span className="stat-value">{record.absent}</span>
                                    </div>
                                    <div className="stat-item late">
                                        <span className="stat-label">Late:</span>
                                        <span className="stat-value">{record.late}</span>
                                    </div>
                                    <div className="stat-item rate">
                                        <span className="stat-label">Rate:</span>
                                        <span className="stat-value">{record.attendanceRate}%</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="attendance-actions">
                                {record.attendanceRecorded ? (
                                    <button
                                        className="action-btn"
                                        onClick={() => handleViewDetails(record)}
                                    >
                                        <HiOutlineEye size={16} />
                                        View Details
                                    </button>
                                ) : (
                                    <button
                                        className="action-btn primary"
                                        onClick={() => handleRecordAttendance(record.schedule)}
                                    >
                                        <HiOutlinePencil size={16} />
                                        Record Attendance
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Attendance Recording Modal */}
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
                                <p>
                                    {formatDateTime(selectedSchedule.startTime)} - {formatDateTime(selectedSchedule.endTime)}
                                </p>
                                <p>Room: {selectedSchedule.room}</p>
                                
                                <div className="attendance-list">
                                    {/* Mock student list - in real app, this would come from API */}
                                    {[
                                        { _id: '1', firstName: 'John', lastName: 'Doe' },
                                        { _id: '2', firstName: 'Jane', lastName: 'Smith' },
                                        { _id: '3', firstName: 'Bob', lastName: 'Johnson' },
                                        { _id: '4', firstName: 'Alice', lastName: 'Brown' },
                                        { _id: '5', firstName: 'Charlie', lastName: 'Wilson' }
                                    ].map(student => (
                                        <div key={student._id} className="attendance-item">
                                            <div className="student-info">
                                                <span className="student-name">
                                                    {student.firstName} {student.lastName}
                                                </span>
                                            </div>
                                            <div className="attendance-status">
                                                <select className="status-select">
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
                                    setShowAttendanceModal(false);
                                    fetchAttendanceData();
                                }}
                            >
                                Save Attendance
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Attendance Details Modal */}
            {showDetailsModal && selectedSchedule && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Attendance Details</h2>
                            <button
                                className="modal-close"
                                onClick={() => setShowDetailsModal(false)}
                            >
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="attendance-details">
                                <h3>{selectedSchedule.title}</h3>
                                <p>
                                    {formatDateTime(selectedSchedule.startTime)} - {formatDateTime(selectedSchedule.endTime)}
                                </p>
                                <p>Room: {selectedSchedule.room}</p>
                                
                                <div className="attendance-summary">
                                    <div className="summary-stats">
                                        <div className="summary-item">
                                            <span className="label">Total Students:</span>
                                            <span className="value">25</span>
                                        </div>
                                        <div className="summary-item present">
                                            <span className="label">Present:</span>
                                            <span className="value">22</span>
                                        </div>
                                        <div className="summary-item absent">
                                            <span className="label">Absent:</span>
                                            <span className="value">2</span>
                                        </div>
                                        <div className="summary-item late">
                                            <span className="label">Late:</span>
                                            <span className="value">1</span>
                                        </div>
                                        <div className="summary-item rate">
                                            <span className="label">Attendance Rate:</span>
                                            <span className="value">88%</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="student-attendance-list">
                                    <h4>Student Attendance</h4>
                                    {[
                                        { student: { firstName: 'John', lastName: 'Doe' }, status: 'present', checkInTime: '09:05' },
                                        { student: { firstName: 'Jane', lastName: 'Smith' }, status: 'late', checkInTime: '09:10' },
                                        { student: { firstName: 'Bob', lastName: 'Johnson' }, status: 'absent', checkInTime: null }
                                    ].map((record, index) => (
                                        <div key={index} className="student-attendance-item">
                                            <div className="student-details">
                                                <span className="student-name">
                                                    {record.student.firstName} {record.student.lastName}
                                                </span>
                                                {record.checkInTime && (
                                                    <span className="check-in-time">
                                                        Check-in: {record.checkInTime}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={`attendance-status ${record.status}`}>
                                                {record.status === 'present' && <HiOutlineCheckCircle size={16} />}
                                                {record.status === 'absent' && <HiOutlineXCircle size={16} />}
                                                {record.status === 'late' && <HiOutlineExclamation size={16} />}
                                                <span>{record.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
        </div>
    );
};

export default TeacherAttendancePage;
