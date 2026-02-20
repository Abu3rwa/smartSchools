import { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    HiOutlineCalendar,
    HiOutlineClock,
    HiOutlineUserGroup,
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineX,
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
import { fetchTeachers } from '../../store/slices/teacherSlice';
import { fetchClasses } from '../../store/slices/classSlice';
import { fetchSubjects } from '../../store/slices/subjectSlice';
import attendanceService from '../../services/attendanceService';
import './AdminAttendancePage.css';

function mapRecordToUI(record) {
    const scheduleDisplay = record.schedule
        ? {
            _id: record.schedule._id,
            title: record.schedule.title,
            class: record.schedule.class || record.class,
            subject: record.schedule.subject || record.subject,
            teacher: record.schedule.teacher || record.teacher,
            startTime: record.schedule.startTime || record.startTime,
            endTime: record.schedule.endTime || record.endTime,
            room: record.schedule.room?.name ?? record.schedule.room ?? record.room ?? '—'
        }
        : {
            _id: record.period?._id || record._id,
            title: record.period ? `Period: ${record.period.name || record.period._id}` : 'Period',
            class: record.class,
            subject: record.subject,
            teacher: record.teacher,
            startTime: record.startTime,
            endTime: record.endTime,
            room: record.room || '—'
        };
    return {
        _id: record._id,
        schedule: scheduleDisplay,
        attendanceRecorded: record.status !== 'draft',
        recordedAt: record.recordedAt,
        recordedBy: record.recordedBy,
        totalStudents: record.totalStudents ?? 0,
        present: record.present ?? 0,
        absent: record.absent ?? 0,
        late: record.late ?? 0,
        excused: record.excused ?? 0,
        attendanceRate: record.attendanceRate ?? 0
    };
}

const AdminAttendancePage = () => {
    const dispatch = useDispatch();
    const teachers = useSelector((state) => state.teachers.teachers) || [];
    const classes = useSelector((state) => state.classes.classes) || [];
    const subjects = useSelector((state) => state.subjects.subjects) || [];

    const [attendanceData, setAttendanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedAttendance, setSelectedAttendance] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [viewMode, setViewMode] = useState('today');
    const [filters, setFilters] = useState({
        teacher: '',
        class: '',
        subject: '',
        status: ''
    });

    useEffect(() => {
        dispatch(fetchTeachers());
        dispatch(fetchClasses());
        dispatch(fetchSubjects());
    }, [dispatch]);

    const fetchAttendanceData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const today = new Date(currentDate);
            let startDate, endDate;
            if (viewMode === 'today') {
                startDate = new Date(today);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
            } else if (viewMode === 'week') {
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay());
                startDate = new Date(startOfWeek);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startOfWeek);
                endDate.setDate(startOfWeek.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
            } else {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
            }
            const params = {
                viewMode: 'range',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                ...(filters.teacher && { teacher: filters.teacher }),
                ...(filters.class && { class: filters.class }),
                ...(filters.subject && { subject: filters.subject }),
                ...(filters.status && { status: filters.status })
            };
            const res = await attendanceService.getAdminAttendance(params);
            const records = res?.attendanceRecords ?? [];
            setAttendanceData(records.map(mapRecordToUI));
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to load attendance');
        } finally {
            setLoading(false);
        }
    }, [currentDate, viewMode, filters]);

    useEffect(() => {
        fetchAttendanceData();
    }, [fetchAttendanceData]);

    const handleExport = async () => {
        try {
            const today = new Date(currentDate);
            let startDate, endDate;
            if (viewMode === 'today') {
                startDate = new Date(today);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(today);
                endDate.setHours(23, 59, 59, 999);
            } else if (viewMode === 'week') {
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay());
                startDate = new Date(startOfWeek);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startOfWeek);
                endDate.setDate(startOfWeek.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
            } else {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
            }
            const params = {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                format: 'csv',
                ...(filters.teacher && { teacher: filters.teacher }),
                ...(filters.class && { class: filters.class }),
                ...(filters.subject && { subject: filters.subject })
            };
            const blob = await attendanceService.exportAttendanceData(params);
            const url = window.URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `attendance_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Export failed');
        }
    };

    const handleViewDetails = (attendanceRecord) => {
        setSelectedAttendance(attendanceRecord);
        setShowDetailsModal(true);
    };

    const clearFilters = () => {
        setFilters({
            teacher: '',
            class: '',
            subject: '',
            status: ''
        });
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
    const hasActiveFilters = Boolean(filters.teacher || filters.class || filters.subject || filters.status);

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
                        onClick={handleExport}
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
                                <option key={teacher._id} value={teacher.user?._id || teacher._id}>
                                    {teacher.user ? `${teacher.user.firstName || ''} ${teacher.user.lastName || ''}`.trim() : 'Unknown'}
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
                        <p>
                            {hasActiveFilters
                                ? 'No attendance data matches the current filters for this period.'
                                : 'No attendance data is available for the selected period.'}
                        </p>
                        {hasActiveFilters && (
                            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                                Clear Filters
                            </button>
                        )}
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
                                            {record.schedule.teacher ? `${record.schedule.teacher.firstName || ''} ${record.schedule.teacher.lastName || ''}`.trim() : '—'}
                                        </span>
                                        <span className="class-name">
                                            <HiOutlineAcademicCap size={14} />
                                            {record.schedule.class?.name ?? '—'}
                                        </span>
                                        <span className="subject">{record.schedule.subject?.name ?? '—'}</span>
                                        <span className="room">{record.schedule.room ?? '—'}</span>
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
                                {record.attendanceRecorded && record.recordedBy && (
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
                                    <p><strong>Teacher:</strong> {selectedAttendance.schedule.teacher ? `${selectedAttendance.schedule.teacher.firstName || ''} ${selectedAttendance.schedule.teacher.lastName || ''}`.trim() : '—'}</p>
                                    <p><strong>Class:</strong> {selectedAttendance.schedule.class?.name ?? '—'}</p>
                                    <p><strong>Subject:</strong> {selectedAttendance.schedule.subject?.name ?? '—'}</p>
                                    <p><strong>Room:</strong> {selectedAttendance.schedule.room ?? '—'}</p>
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
                                
                                {selectedAttendance.attendanceRecorded && selectedAttendance.recordedBy && (
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
