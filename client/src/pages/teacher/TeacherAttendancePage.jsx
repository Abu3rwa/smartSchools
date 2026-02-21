import { useEffect, useMemo, useState } from 'react';
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
    HiOutlineChevronRight,
    HiOutlineX
} from 'react-icons/hi';
import './TeacherAttendancePage.css';
import attendanceService from '../../services/attendanceService';
import studentService from '../../services/studentService';

const STATUS_OPTIONS = [
    { value: 'present', label: 'Present' },
    { value: 'absent', label: 'Absent' },
    { value: 'tardy', label: 'Tardy' },
    { value: 'tardy_excused', label: 'Tardy Excused' },
    { value: 'absent_excused', label: 'Absent Excused' }
];

const STATUS_LABELS = {
    present: 'Present',
    absent: 'Absent',
    tardy: 'Tardy',
    tardy_excused: 'Tardy Excused',
    absent_excused: 'Absent Excused'
};

const TeacherAttendancePage = () => {
    const [attendanceData, setAttendanceData] = useState([]);
    const [missedSchedules, setMissedSchedules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedSchedule, setSelectedSchedule] = useState(null);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [viewMode, setViewMode] = useState('today');
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({ class: '', subject: '', status: '' });
    const [students, setStudents] = useState([]);
    const [studentAttendance, setStudentAttendance] = useState({});

    useEffect(() => {
        fetchAttendanceData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDate, viewMode]);

    const fetchAttendanceData = async () => {
        try {
            setLoading(true);
            setError(null);
            const { startDate, endDate } = getDateRange(currentDate, viewMode);
            const response = await attendanceService.getTeacherAttendance({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                viewMode
            });
            setAttendanceData(response?.attendanceRecords || []);
            setMissedSchedules(response?.missedSchedules || []);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    const mergedItems = useMemo(() => {
        const recordedItems = attendanceData.map((record) => {
            const schedule = record.schedule || null;
            const classInfo = record.class || schedule?.class || null;
            const subjectInfo = record.subject || schedule?.subject || null;
            const periodName = record.period?.name || '';
            const title = schedule?.title ||
                [classInfo?.name, subjectInfo?.name || periodName].filter(Boolean).join(' • ') ||
                'Attendance Record';
            return {
                id: `record-${record._id}`,
                isRecorded: true,
                title,
                classId: classInfo?._id || '',
                className: classInfo?.name || 'Unknown class',
                subjectId: subjectInfo?._id || '',
                subjectName: subjectInfo?.name || periodName || 'Unknown subject',
                room: getRoomLabel(record.room || schedule?.room) || 'N/A',
                startTime: record.startTime || schedule?.startTime || record.date,
                endTime: record.endTime || schedule?.endTime || record.date,
                totalStudents: record.totalStudents || 0,
                present: record.present || 0,
                absent: record.absent || 0,
                late: record.late || 0,
                attendanceRate: Number(record.attendanceRate || 0),
                rawRecord: record
            };
        });

        const pendingItems = missedSchedules.map((schedule) => {
            const classInfo = schedule.class || null;
            const subjectInfo = schedule.subject || null;
            return {
                id: `pending-${schedule._id}`,
                isRecorded: false,
                title: schedule.title ||
                    [classInfo?.name, subjectInfo?.name].filter(Boolean).join(' • ') ||
                    'Scheduled class',
                classId: classInfo?._id || '',
                className: classInfo?.name || 'Unknown class',
                subjectId: subjectInfo?._id || '',
                subjectName: subjectInfo?.name || 'Unknown subject',
                room: getRoomLabel(schedule.room) || 'N/A',
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                totalStudents: 0,
                present: 0,
                absent: 0,
                late: 0,
                attendanceRate: 0,
                rawSchedule: schedule
            };
        });

        return [...recordedItems, ...pendingItems].sort(
            (a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0)
        );
    }, [attendanceData, missedSchedules]);

    const classOptions = useMemo(() => buildSelectOptions(mergedItems, 'classId', 'className'), [mergedItems]);
    const subjectOptions = useMemo(() => buildSelectOptions(mergedItems, 'subjectId', 'subjectName'), [mergedItems]);

    const filteredItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return mergedItems.filter((item) => {
            if (filters.class && item.classId !== filters.class) return false;
            if (filters.subject && item.subjectId !== filters.subject) return false;
            if (filters.status === 'recorded' && !item.isRecorded) return false;
            if (filters.status === 'pending' && item.isRecorded) return false;
            if (!query) return true;
            return `${item.title} ${item.className} ${item.subjectName} ${item.room}`
                .toLowerCase()
                .includes(query);
        });
    }, [filters, mergedItems, searchQuery]);

    const stats = useMemo(() => {
        const recorded = filteredItems.filter((item) => item.isRecorded);
        const totalStudents = recorded.reduce((sum, item) => sum + (item.totalStudents || 0), 0);
        const totalPresent = recorded.reduce((sum, item) => sum + (item.present || 0), 0);
        const totalLate = recorded.reduce((sum, item) => sum + (item.late || 0), 0);
        const totalAbsent = recorded.reduce((sum, item) => sum + (item.absent || 0), 0);
        const overallRate = totalStudents > 0
            ? (((totalPresent + totalLate) / totalStudents) * 100).toFixed(1)
            : '0.0';
        return {
            totalClasses: filteredItems.length,
            recordedClasses: recorded.length,
            pendingClasses: filteredItems.length - recorded.length,
            totalStudents,
            totalPresent,
            totalAbsent,
            totalLate,
            overallRate
        };
    }, [filteredItems]);

    const handleRecordAttendance = async (schedule) => {
        if (!schedule?._id || !schedule?.class?._id) return;
        setSelectedSchedule(schedule);
        setStudents([]);
        setStudentAttendance({});
        setShowAttendanceModal(true);
        setError(null);
        setSuccess(null);
        try {
            const response = await studentService.getStudentsByClass(schedule.class._id);
            const list = response?.data?.students || [];
            setStudents(list);
            const initial = {};
            list.forEach((student) => {
                initial[student._id] = 'present';
            });
            setStudentAttendance(initial);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        }
    };

    const handleSaveAttendance = async () => {
        if (!selectedSchedule?._id) return;
        try {
            setSaving(true);
            setError(null);
            await attendanceService.createOrUpdateAttendance({
                scheduleId: selectedSchedule._id,
                studentAttendance: students.map((student) => ({
                    student: student._id,
                    status: studentAttendance[student._id] || 'present'
                }))
            });
            setSuccess('Attendance saved successfully.');
            setShowAttendanceModal(false);
            await fetchAttendanceData();
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleExport = async () => {
        try {
            setError(null);
            const { startDate, endDate } = getDateRange(currentDate, viewMode);
            const blob = await attendanceService.exportAttendanceData({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                format: 'csv'
            });
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `attendance_${startDate.toISOString().slice(0, 10)}_${endDate.toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        }
    };

    const navigateDate = (direction) => {
        const next = new Date(currentDate);
        if (viewMode === 'today') next.setDate(next.getDate() + (direction === 'prev' ? -1 : 1));
        else if (viewMode === 'week') next.setDate(next.getDate() + (direction === 'prev' ? -7 : 7));
        else next.setMonth(next.getMonth() + (direction === 'prev' ? -1 : 1));
        setCurrentDate(next);
    };

    const handleViewDetails = (record) => {
        setSelectedRecord(record);
        setShowDetailsModal(true);
    };

    if (loading) {
        return (
            <div className="attendance-loading">
                <div className="spinner"></div>
                <p>Loading attendance data...</p>
            </div>
        );
    }

    if (error && !showAttendanceModal && !showDetailsModal) {
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
            <div className="page-header">
                <div className="header-content">
                    <h1>Attendance Management</h1>
                    <p>Track attendance, fill gaps, and keep classroom records current.</p>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={fetchAttendanceData}>
                        <HiOutlineRefresh size={20} />
                        Refresh
                    </button>
                    <button className="btn btn-secondary" onClick={handleExport}>
                        <HiOutlineDownload size={20} />
                        Export
                    </button>
                </div>
            </div>

            {success && (
                <div className="feedback-banner feedback-success">
                    <HiOutlineCheckCircle size={18} />
                    <span>{success}</span>
                </div>
            )}

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
                        <span>{getDateRangeText(currentDate, viewMode)}</span>
                        <button onClick={() => navigateDate('next')}>
                            <HiOutlineChevronRight size={20} />
                        </button>
                    </div>
                </div>

                <div className="filters">
                    <div className="filter-group search-group">
                        <HiOutlineSearch size={16} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search class, subject, room..."
                        />
                    </div>

                    <div className="filter-group select-group">
                        <HiOutlineFilter size={15} />
                        <select
                            value={filters.class}
                            onChange={(event) => setFilters((prev) => ({ ...prev, class: event.target.value }))}
                        >
                            <option value="">All Classes</option>
                            {classOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-group">
                        <select
                            value={filters.subject}
                            onChange={(event) => setFilters((prev) => ({ ...prev, subject: event.target.value }))}
                        >
                            <option value="">All Subjects</option>
                            {subjectOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-group">
                        <select
                            value={filters.status}
                            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            <option value="">All Status</option>
                            <option value="recorded">Recorded</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="attendance-cards">
                {filteredItems.length === 0 ? (
                    <div className="empty-state">
                        <HiOutlineCalendar size={48} />
                        <h3>No attendance records found</h3>
                        <p>No attendance data available for the selected period.</p>
                    </div>
                ) : (
                    filteredItems.map((item) => (
                        <div key={item.id} className="attendance-card">
                            <div className="attendance-header">
                                <div className="class-info">
                                    <h3>{item.title}</h3>
                                    <div className="class-details">
                                        <span className="class-name">{item.className}</span>
                                        <span className="subject">{item.subjectName}</span>
                                        <span className="room">{item.room}</span>
                                    </div>
                                </div>
                                <div className="attendance-status">
                                    {item.isRecorded ? (
                                        <div className="status-recorded">
                                            <HiOutlineCheckCircle size={20} />
                                            <span>Recorded</span>
                                        </div>
                                    ) : (
                                        <div className="status-pending">
                                            <HiOutlineExclamation size={20} />
                                            <span>Pending</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="attendance-content">
                                <div className="time-info">
                                    <div className="time-item">
                                        <HiOutlineClock size={16} />
                                        <span>{formatTime(item.startTime)} - {formatTime(item.endTime)}</span>
                                    </div>
                                    <div className="date-item">
                                        <HiOutlineCalendar size={16} />
                                        <span>{new Date(item.startTime).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <div className="attendance-stats">
                                    <div className="stat-item">
                                        <span className="stat-label">Total</span>
                                        <span className="stat-value">{item.totalStudents}</span>
                                    </div>
                                    <div className="stat-item present">
                                        <span className="stat-label">Present</span>
                                        <span className="stat-value">{item.present}</span>
                                    </div>
                                    <div className="stat-item absent">
                                        <span className="stat-label">Absent</span>
                                        <span className="stat-value">{item.absent}</span>
                                    </div>
                                    <div className="stat-item late">
                                        <span className="stat-label">Late</span>
                                        <span className="stat-value">{item.late}</span>
                                    </div>
                                    <div className="stat-item rate">
                                        <span className="stat-label">Rate</span>
                                        <span className="stat-value">{item.isRecorded ? `${item.attendanceRate}%` : '--'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="attendance-actions">
                                {item.isRecorded ? (
                                    <button
                                        className="action-btn"
                                        onClick={() => handleViewDetails(item.rawRecord)}
                                    >
                                        <HiOutlineEye size={16} />
                                        View Details
                                    </button>
                                ) : (
                                    <button
                                        className="action-btn primary"
                                        onClick={() => handleRecordAttendance(item.rawSchedule)}
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

            {showAttendanceModal && selectedSchedule && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Record Attendance</h2>
                            <button className="modal-close" onClick={() => setShowAttendanceModal(false)}>
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {error && (
                                <div className="feedback-banner feedback-error compact">
                                    <HiOutlineExclamation size={16} />
                                    <span>{error}</span>
                                </div>
                            )}
                            <div className="attendance-form">
                                <h3>{selectedSchedule.title || selectedSchedule.class?.name}</h3>
                                <p>
                                    {formatDateTime(selectedSchedule.startTime)} - {formatDateTime(selectedSchedule.endTime)}
                                </p>
                                <p>Room: {getRoomLabel(selectedSchedule.room) || 'N/A'}</p>

                                <div className="attendance-list">
                                    {students.length === 0 ? (
                                        <div className="empty-state compact">
                                            <p>No students found for this class.</p>
                                        </div>
                                    ) : (
                                        students.map((student) => (
                                            <div key={student._id} className="attendance-item">
                                                <div className="student-info">
                                                    <span className="student-name">{getStudentName(student)}</span>
                                                </div>
                                                <div className="attendance-status">
                                                    <select
                                                        className="status-select"
                                                        value={studentAttendance[student._id] || 'present'}
                                                        onChange={(event) => setStudentAttendance((prev) => ({
                                                            ...prev,
                                                            [student._id]: event.target.value
                                                        }))}
                                                    >
                                                        {STATUS_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAttendanceModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveAttendance}
                                disabled={saving || students.length === 0}
                            >
                                {saving ? 'Saving...' : 'Save Attendance'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDetailsModal && selectedRecord && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2>Attendance Details</h2>
                            <button className="modal-close" onClick={() => setShowDetailsModal(false)}>
                                <HiOutlineX size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="attendance-details">
                                <h3>{getRecordTitle(selectedRecord)}</h3>
                                <p>
                                    {formatDateTime(selectedRecord.startTime || selectedRecord.date)}
                                    {' - '}
                                    {formatDateTime(selectedRecord.endTime || selectedRecord.date)}
                                </p>
                                <p>Room: {getRoomLabel(selectedRecord.room || selectedRecord.schedule?.room) || 'N/A'}</p>

                                <div className="attendance-summary">
                                    <div className="summary-stats">
                                        <div className="summary-item">
                                            <span className="label">Total Students</span>
                                            <span className="value">{selectedRecord.totalStudents || 0}</span>
                                        </div>
                                        <div className="summary-item present">
                                            <span className="label">Present</span>
                                            <span className="value">{selectedRecord.present || 0}</span>
                                        </div>
                                        <div className="summary-item absent">
                                            <span className="label">Absent</span>
                                            <span className="value">{selectedRecord.absent || 0}</span>
                                        </div>
                                        <div className="summary-item late">
                                            <span className="label">Late</span>
                                            <span className="value">{selectedRecord.late || 0}</span>
                                        </div>
                                        <div className="summary-item rate">
                                            <span className="label">Attendance Rate</span>
                                            <span className="value">{selectedRecord.attendanceRate || 0}%</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="student-attendance-list">
                                    <h4>Student Attendance</h4>
                                    {(selectedRecord.studentAttendance || []).map((entry, index) => (
                                        <div key={`${entry.student?._id || index}`} className="student-attendance-item">
                                            <div className="student-details">
                                                <span className="student-name">{getStudentName(entry.student)}</span>
                                            </div>
                                            <div className={`attendance-status ${getStatusClassName(entry.status)}`}>
                                                {getStatusIcon(entry.status)}
                                                <span>{STATUS_LABELS[entry.status] || entry.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

function getDateRange(currentDate, viewMode) {
    const base = new Date(currentDate);
    if (viewMode === 'today') {
        const start = new Date(base);
        start.setHours(0, 0, 0, 0);
        const end = new Date(base);
        end.setHours(23, 59, 59, 999);
        return { startDate: start, endDate: end };
    }

    if (viewMode === 'week') {
        const startOfWeek = new Date(base);
        startOfWeek.setDate(base.getDate() - base.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        return { startDate: startOfWeek, endDate: endOfWeek };
    }

    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    return { startDate: monthStart, endDate: monthEnd };
}

function getDateRangeText(currentDate, viewMode) {
    const base = new Date(currentDate);
    if (viewMode === 'today') {
        return base.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    if (viewMode === 'week') {
        const startOfWeek = new Date(base);
        startOfWeek.setDate(base.getDate() - base.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
    }

    return base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function buildSelectOptions(items, idKey, labelKey) {
    const options = new Map();
    items.forEach((item) => {
        if (item[idKey]) options.set(item[idKey], item[labelKey]);
    });
    return [...options.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function getRoomLabel(room) {
    if (!room) return '';
    if (typeof room === 'string') return room;
    return room.name || '';
}

function getStudentName(student) {
    if (!student) return 'Student';
    if (typeof student === 'string') return student;
    const firstName = student.firstName || student.user?.firstName || '';
    const lastName = student.lastName || student.user?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || 'Student';
}

function formatDateTime(date) {
    if (!date) return '--';
    return new Date(date).toLocaleString();
}

function formatTime(date) {
    if (!date) return '--';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getStatusClassName(status) {
    if (status === 'present') return 'present';
    if (status === 'absent' || status === 'absent_excused') return 'absent';
    return 'late';
}

function getStatusIcon(status) {
    if (status === 'present') return <HiOutlineCheckCircle size={16} />;
    if (status === 'absent' || status === 'absent_excused') return <HiOutlineXCircle size={16} />;
    return <HiOutlineExclamation size={16} />;
}

function getRecordTitle(record) {
    const className = record.class?.name || record.schedule?.class?.name || '';
    const subjectName = record.subject?.name || record.schedule?.subject?.name || record.period?.name || '';
    return record.schedule?.title || [className, subjectName].filter(Boolean).join(' • ') || 'Attendance Record';
}

export default TeacherAttendancePage;
