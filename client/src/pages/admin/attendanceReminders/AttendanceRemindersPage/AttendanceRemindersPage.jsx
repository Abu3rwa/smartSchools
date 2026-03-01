import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../../store/slices/authSlice';
import {
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineClock,
    HiOutlineBell,
    HiOutlineRefresh,
    HiOutlinePaperAirplane,
    HiOutlineFilter,
    HiOutlineExclamation,
} from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import notificationService from '../../../../services/notificationService';
import './AttendanceRemindersPage.css';

const HOUR_OPTIONS = [
    { value: 1, label: '1 hour' },
    { value: 1.5, label: '1.5 hours' },
    { value: 2, label: '2 hours' },
    { value: 3, label: '3 hours' },
    { value: 6, label: '6 hours' },
    { value: 10, label: '10 hours (default)' },
];

const AttendanceRemindersPage = () => {
    const user = useSelector(selectUser);

    // Reminder sending state
    const [selectedHours, setSelectedHours] = useState(1);
    const [sending, setSending] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    // Reminder history state
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState(null);
    const [page, setPage] = useState(1);

    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchReminders = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, limit: 20 };
            if (statusFilter) params.status = statusFilter;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const response = await notificationService.getAttendanceReminders(params);
            setReminders(response.data || []);
            setPagination(response.pagination || null);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load reminders');
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter, startDate, endDate]);

    useEffect(() => {
        fetchReminders();
    }, [fetchReminders]);

    const handleSendReminders = async () => {
        setSending(true);
        setLastResult(null);
        try {
            const result = await notificationService.runAttendanceReminder(selectedHours);
            setLastResult(result);
            toast.success(
                `Sent ${result.results.sent} reminder(s) for classes ending ${selectedHours}h ago`
            );
            // Refresh the history
            fetchReminders();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send reminders');
        } finally {
            setSending(false);
        }
    };

    const handleClearFilters = () => {
        setStatusFilter('');
        setStartDate('');
        setEndDate('');
        setPage(1);
    };

    const getStatusBadge = (status) => {
        if (status === 'sent') {
            return (
                <span className="badge badge-success">
                    <HiOutlineCheckCircle size={14} />
                    Sent
                </span>
            );
        }
        return (
            <span className="badge badge-error">
                <HiOutlineXCircle size={14} />
                Failed
            </span>
        );
    };

    return (
        <div className="attendance-reminders-page">
            <div className="page-header">
                <div>
                    <h1>Attendance Reminders</h1>
                    <p className="text-muted">
                        Send reminders to teachers who haven't recorded attendance
                    </p>
                </div>
            </div>

            {/* Send Reminders Panel */}
            <div className="card send-panel">
                <div className="send-panel-header">
                    <HiOutlineBell size={24} />
                    <div>
                        <h3>Send Attendance Reminders</h3>
                        <p className="text-muted">
                            Notify teachers who missed recording attendance after their class ended. You can send multiple reminders for the same class.
                        </p>
                    </div>
                </div>

                <div className="send-panel-body">
                    <div className="send-controls">
                        <div className="form-group">
                            <label htmlFor="hours-select">Time after class ended</label>
                            <select
                                id="hours-select"
                                value={selectedHours}
                                onChange={(e) => setSelectedHours(parseFloat(e.target.value))}
                                disabled={sending}
                            >
                                {HOUR_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            className="btn btn-primary send-btn"
                            onClick={handleSendReminders}
                            disabled={sending}
                        >
                            {sending ? (
                                <>
                                    <div className="spinner-small"></div>
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <HiOutlinePaperAirplane size={18} />
                                    Send Reminders
                                </>
                            )}
                        </button>
                    </div>

                    {/* Last Result */}
                    {lastResult && (
                        <div className="result-banner">
                            <div className="result-stats">
                                <div className="result-stat">
                                    <span className="result-stat-value">{lastResult.results.processed}</span>
                                    <span className="result-stat-label">Checked</span>
                                </div>
                                <div className="result-stat success">
                                    <span className="result-stat-value">{lastResult.results.sent}</span>
                                    <span className="result-stat-label">Sent</span>
                                </div>
                                <div className="result-stat warning">
                                    <span className="result-stat-value">{lastResult.results.skipped}</span>
                                    <span className="result-stat-label">Skipped</span>
                                </div>
                                <div className="result-stat error">
                                    <span className="result-stat-value">{lastResult.results.failed}</span>
                                    <span className="result-stat-label">Failed</span>
                                </div>
                            </div>
                            <p className="result-message text-muted">
                                Checked classes ending between{' '}
                                {format(new Date(lastResult.windowStart), 'HH:mm')} and{' '}
                                {format(new Date(lastResult.windowEnd), 'HH:mm')}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Reminder History */}
            <div className="card">
                <div className="card-header-row">
                    <h3>Reminder History</h3>
                    <button
                        className="btn btn-ghost"
                        onClick={fetchReminders}
                        disabled={loading}
                    >
                        <HiOutlineRefresh size={18} className={loading ? 'spin' : ''} />
                        Refresh
                    </button>
                </div>

                {/* Filters */}
                <div className="filters-row">
                    <div className="filter-group">
                        <HiOutlineFilter size={16} />
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        >
                            <option value="">All Statuses</option>
                            <option value="sent">Sent</option>
                            <option value="failed">Failed</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>From</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                        />
                    </div>
                    <div className="filter-group">
                        <label>To</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                        />
                    </div>
                    {(statusFilter || startDate || endDate) && (
                        <button className="btn btn-ghost btn-sm" onClick={handleClearFilters}>
                            Clear
                        </button>
                    )}
                </div>

                {/* Table */}
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner"></div>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Reminder Status</th>
                                    <th>Attendance Status</th>
                                    <th>Teacher</th>
                                    <th>Class</th>
                                    <th>Scheduled Time</th>
                                    <th>Attendance Date</th>
                                    <th>Sent At</th>
                                    <th>Failure Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reminders.map((reminder) => (
                                    <tr key={reminder._id}>
                                        <td>{getStatusBadge(reminder.status)}</td>
                                        <td>
                                            {reminder.attendanceTaken ? (
                                                <span className="badge badge-success">
                                                    <HiOutlineCheckCircle size={14} />
                                                    Taken
                                                </span>
                                            ) : (
                                                <span className="badge badge-warning">
                                                    <HiOutlineXCircle size={14} />
                                                    Not Taken
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {reminder.teacher
                                                ? `${reminder.teacher.firstName} ${reminder.teacher.lastName}`
                                                : '—'}
                                        </td>
                                        <td>
                                            {reminder.schedule?.title || '—'}
                                        </td>
                                        <td className="text-muted">
                                            {reminder.schedule?.startTime
                                                ? format(new Date(reminder.schedule.startTime), 'HH:mm')
                                                : '—'}
                                            {reminder.schedule?.endTime && (
                                                <> – {format(new Date(reminder.schedule.endTime), 'HH:mm')}</>
                                            )}
                                        </td>
                                        <td className="text-muted">
                                            {reminder.attendanceDate
                                                ? format(new Date(reminder.attendanceDate), 'MMM d, yyyy')
                                                : '—'}
                                        </td>
                                        <td className="text-muted">
                                            {reminder.sentAt
                                                ? format(new Date(reminder.sentAt), 'MMM d, yyyy HH:mm')
                                                : '—'}
                                        </td>
                                        <td>
                                            {reminder.failureReason ? (
                                                <span className="failure-reason">
                                                    <HiOutlineExclamation size={14} />
                                                    {reminder.failureReason}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {reminders.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="empty-row">
                                            No attendance reminders found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {pagination && pagination.pages > 1 && (
                    <div className="pagination">
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            Previous
                        </button>
                        <span className="pagination-info">
                            Page {pagination.page} of {pagination.pages} ({pagination.total} total)
                        </span>
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={page >= pagination.pages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttendanceRemindersPage;
