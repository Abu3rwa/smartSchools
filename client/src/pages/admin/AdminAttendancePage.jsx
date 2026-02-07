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
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineAcademicCap,
    HiOutlineUsers
} from 'react-icons/hi';
import './AdminAttendancePage.css';

const AdminAttendancePage = () => {
    // Local state
    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedAttendance, setSelectedAttendance] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [viewMode, setViewMode] = useState('today'); // 'today', 'week', 'month'
    const [filters, setFilters] = useState({
        teacher: '',
        class: '',
        subject: '',
        status: ''
    });

    // Mock data
    const [teachers] = useState([
        { _id: '1', firstName: 'John', lastName: 'Doe' },
        { _id: '2', firstName: 'Jane', lastName: 'Smith' },
        { _id: '3', firstName: 'Mike', lastName: 'Johnson' }
    ]);

    const [classes] = useState([
        { _id: '1', name: 'Grade 10A' },
        { _id: '2', name: 'Grade 10B' },
        { _id: '3', name: 'Grade 11A' }
    ]);

    const [subjects] = useState([
        { _id: '1', name: 'Mathematics' },
        { _id: '2', name: 'Science' },
        { _id: '3', name: 'English' }
    ]);

    useEffect(() => {
        fetchAttendanceData();
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
            
            // Mock attendance data
            const mockAttendanceData = [
                {
                    _id: '1',
                    schedule: {
                        _id: '1',
                        title: 'Mathematics - Grade 10A',
                        class: { _id: '1', name: 'Grade 10A' },
                        subject: { _id: '1', name: 'Mathematics' },
                        teacher: { _id: '1', firstName: 'John', lastName: 'Doe' },
                        startTime: new Date('2024-01-15T09:00:00'),
                        endTime: new Date('2024-01-15T10:00:00'),
                        room: 'Room 101'
                    },
                    attendanceRecorded: true,
                    recordedAt: new Date('2024-01-15T10:05:00'),
                    recordedBy: { _id: '1', firstName: 'John', lastName: 'Doe' },
                    totalStudents: 25,
                    present: 22,
                    absent: 2,
                    late: 1,
                    excused: 0,
                    attendanceRate: 88.0
                },
                {
                    _id: '2',
                    schedule: {
                        _id: '2',
                        title: 'Science - Grade 10B',
                        class: { _id: '2', name: 'Grade 10B' },
                        subject: { _id: '2', name: 'Science' },
                        teacher: { _id: '2', firstName: 'Jane', lastName: 'Smith' },
                        startTime: new Date('2024-01-15T10:30:00'),
                        endTime: new Date('2024-01-15T11:30:00'),
                        room: 'Lab 201'
                    },
                    attendanceRecorded: false,
                    totalStudents: 23,
                    present: 0,
                    absent: 0,
                    late: 0,
                    excused: 0,
                    attendanceRate: 0
                },
                {
                    _id: '3',
                    schedule: {
                        _id: '3',
                        title: 'English - Grade 11A',
                        class: { _id: '3', name: 'Grade 11A' },
                        subject: { _id: '3', name: 'English' },
                        teacher: { _id: '3', firstName: 'Mike', lastName: 'Johnson' },
                        startTime: new Date('2024-01-15T14:00:00'),
                        endTime: new Date('2024-01-15T15:00:00'),
                        room: 'Room 102'
                    },
                    attendanceRecorded: true,
                    recordedAt: new Date('2024-01-15T15:02:00'),
                    recordedBy: { _id: '3', firstName: 'Mike', lastName: 'Johnson' },
                    totalStudents: 28,
                    present: 26,
                    absent: 2,
                    late: 0,
                    excused: 0,
                    attendanceRate: 92.9
                }
            ];
            
            // Filter attendance data based on date range
            const filteredData = mockAttendanceData.filter(item => {
                const scheduleDate = new Date(item.schedule.startTime);
                return scheduleDate >= startDate && scheduleDate <= endDate;
            });
            
            // Apply additional filters
            let finalData = filteredData;
            if (filters.teacher) {
                finalData = finalData.filter(item => item.schedule.teacher._id === filters.teacher);
            }
            if (filters.class) {
                finalData = finalData.filter(item => item.schedule.class._id === filters.class);
            }
            if (filters.subject) {
                finalData = finalData.filter(item => item.schedule.subject._id === filters.subject);
            }
            if (filters.status) {
                if (filters.status === 'recorded') {
                    finalData = finalData.filter(item => item.attendanceRecorded);
                } else if (filters.status === 'pending') {
                    finalData = finalData.filter(item => !item.attendanceRecorded);
                }
            }
            
            setAttendanceData(finalData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = (attendanceRecord) => {
        setSelectedAttendance(attendanceRecord);
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
        <div className="admin-attendance-page">
            {/* Header */}
            <div className="page-header">
                <div className="header-content">
                    <h1>Attendance Management</h1>
                    <p>Monitor and manage attendance across all classes</p>
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
                        Export Report
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
                            value={filters.teacher}
                            onChange={(e) => setFilters(prev => ({ ...prev, teacher: e.target.value }))}
                        >
                            <option value="">All Teachers</option>
                            {teachers.map(teacher => (
                                <option key={teacher._id} value={teacher._id}>
                                    {teacher.firstName} {teacher.lastName}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="filter-group">
                        <select
                            value={filters.class}
                            onChange={(e) => setFilters(prev => ({ ...prev, class: e.target.value }))}
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
                        <select
                            value={filters.subject}
                            onChange={(e) => setFilters(prev => ({ ...prev, subject: e.target.value }))}
                        >
                            <option value="">All Subjects</option>
                            {subjects.map(subject => (
                                <option key={subject._id} value={subject._id}>
                                    {subject.name}
                                </option>
                            ))}
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
                                        <span className="teacher-name">
                                            <HiOutlineUsers size={14} />
                                            {record.schedule.teacher.firstName} {record.schedule.teacher.lastName}
                                        </span>
                                        <span className="class-name">
                                            <HiOutlineAcademicCap size={14} />
                                            {record.schedule.class.name}
                                        </span>
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
                            
                            <div className="attendance-meta">
                                {record.attendanceRecorded && (
                                    <div className="recorded-info">
                                        <span>Recorded by {record.recordedBy.firstName} {record.recordedBy.lastName}</span>
                                        <span>{formatDateTime(record.recordedAt)}</span>
                                    </div>
                                )}
                            </div>
                            
                            <div className="attendance-actions">
                                <button
                                    className="action-btn"
                                    onClick={() => handleViewDetails(record)}
                                >
                                    <HiOutlineEye size={16} />
                                    View Details
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Attendance Details Modal */}
            {showDetailsModal && selectedAttendance && (
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
                                <h3>{selectedAttendance.schedule.title}</h3>
                                <div className="schedule-info">
                                    <p><strong>Teacher:</strong> {selectedAttendance.schedule.teacher.firstName} {selectedAttendance.schedule.teacher.lastName}</p>
                                    <p><strong>Class:</strong> {selectedAttendance.schedule.class.name}</p>
                                    <p><strong>Subject:</strong> {selectedAttendance.schedule.subject.name}</p>
                                    <p><strong>Room:</strong> {selectedAttendance.schedule.room}</p>
                                    <p><strong>Time:</strong> {formatDateTime(selectedAttendance.schedule.startTime)} - {formatDateTime(selectedAttendance.schedule.endTime)}</p>
                                </div>
                                
                                <div className="attendance-summary">
                                    <h4>Attendance Summary</h4>
                                    <div className="summary-stats">
                                        <div className="summary-item">
                                            <span className="label">Total Students:</span>
                                            <span className="value">{selectedAttendance.totalStudents}</span>
                                        </div>
                                        <div className="summary-item present">
                                            <span className="label">Present:</span>
                                            <span className="value">{selectedAttendance.present}</span>
                                        </div>
                                        <div className="summary-item absent">
                                            <span className="label">Absent:</span>
                                            <span className="value">{selectedAttendance.absent}</span>
                                        </div>
                                        <div className="summary-item late">
                                            <span className="label">Late:</span>
                                            <span className="value">{selectedAttendance.late}</span>
                                        </div>
                                        <div className="summary-item rate">
                                            <span className="label">Attendance Rate:</span>
                                            <span className="value">{selectedAttendance.attendanceRate}%</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {selectedAttendance.attendanceRecorded && (
                                    <div className="recorded-details">
                                        <h4>Recording Details</h4>
                                        <p><strong>Recorded by:</strong> {selectedAttendance.recordedBy.firstName} {selectedAttendance.recordedBy.lastName}</p>
                                        <p><strong>Recorded at:</strong> {formatDateTime(selectedAttendance.recordedAt)}</p>
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
        </div>
    );
};

export default AdminAttendancePage;
