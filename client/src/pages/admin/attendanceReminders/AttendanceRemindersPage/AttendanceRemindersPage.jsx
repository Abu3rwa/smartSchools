import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    HiOutlineCheckCircle,
    HiOutlineXCircle,
    HiOutlineBell,
    HiOutlineRefresh,
    HiOutlinePaperAirplane,
    HiOutlineFilter,
    HiOutlineExclamation,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import notificationService from '../../../../services/notificationService';
import './AttendanceRemindersPage.css';

const AttendanceRemindersPage = () => {
    const { t, i18n } = useTranslation(['attendanceReminders', 'common']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';

    // Reminder sending state
    const [sending, setSending] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [reminderSettings, setReminderSettings] = useState({
        enabled: true,
        delayMinutes: 60
    });

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
            toast.error(error.response?.data?.message || t('attendanceReminders:toast.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter, startDate, endDate, t]);

    const fetchReminderSettings = useCallback(async () => {
        setSettingsLoading(true);
        try {
            const response = await notificationService.getAttendanceReminderSettings();
            setReminderSettings({
                enabled: response?.data?.enabled !== false,
                delayMinutes: Number(response?.data?.delayMinutes || 60)
            });
        } catch (error) {
            toast.error(error.response?.data?.message || t('attendanceReminders:toast.loadSettingsFailed'));
        } finally {
            setSettingsLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchReminders();
        fetchReminderSettings();
    }, [fetchReminders, fetchReminderSettings]);

    const handleSendReminders = async () => {
        setSending(true);
        setLastResult(null);
        try {
            const result = await notificationService.runAttendanceReminder();
            setLastResult(result);
            toast.success(
                t('attendanceReminders:toast.sentSummary', {
                    sent: result.results.sent,
                    minutes: result.delayMinutes || reminderSettings.delayMinutes
                })
            );
            // Refresh the history
            fetchReminders();
        } catch (error) {
            toast.error(error.response?.data?.message || t('attendanceReminders:toast.sendFailed'));
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
                    {t('attendanceReminders:status.sent')}
                </span>
            );
        }
        return (
            <span className="badge badge-error">
                <HiOutlineXCircle size={14} />
                {t('attendanceReminders:status.failed')}
            </span>
        );
    };

    const formatTime = (value) => new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const formatDate = (value) => new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    const formatDateTime = (value) => new Date(value).toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="attendance-reminders-page">
            <div className="page-header">
                <div>
                    <h1>{t('attendanceReminders:header.title')}</h1>
                    <p className="text-muted">
                        {t('attendanceReminders:header.subtitle')}
                    </p>
                </div>
            </div>

            {/* Send Reminders Panel */}
            <div className="card send-panel">
                <div className="send-panel-header">
                    <HiOutlineBell size={24} />
                    <div>
                        <h3>{t('attendanceReminders:sendPanel.title')}</h3>
                        <p className="text-muted">
                            {t('attendanceReminders:sendPanel.subtitle')}
                        </p>
                    </div>
                </div>

                <div className="send-panel-body">
                    <div className="send-controls">
                        <div className="form-group">
                            <label>{t('attendanceReminders:sendPanel.currentConfig')}</label>
                            {settingsLoading ? (
                                <p className="text-muted">{t('attendanceReminders:sendPanel.loadingConfig')}</p>
                            ) : (
                                <>
                                    <p className="text-muted">
                                        {reminderSettings.enabled
                                            ? t('attendanceReminders:sendPanel.configEnabled', { minutes: reminderSettings.delayMinutes })
                                            : t('attendanceReminders:sendPanel.configDisabled')}
                                    </p>
                                    <p className="text-muted">
                                        {t('attendanceReminders:sendPanel.manageInSchoolSettings')}
                                    </p>
                                </>
                            )}
                        </div>

                        <button
                            className="btn btn-primary send-btn"
                            onClick={handleSendReminders}
                            disabled={sending || settingsLoading || !reminderSettings.enabled}
                        >
                            {sending ? (
                                <>
                                    <div className="spinner-small"></div>
                                    {t('attendanceReminders:actions.sending')}
                                </>
                            ) : (
                                <>
                                    <HiOutlinePaperAirplane size={18} />
                                    {t('attendanceReminders:actions.sendReminders')}
                                </>
                            )}
                        </button>
                    </div>

                    {!settingsLoading && !reminderSettings.enabled && (
                        <p className="text-muted" style={{ marginTop: '0.75rem' }}>
                            {t('attendanceReminders:sendPanel.disabledHint')}
                        </p>
                    )}

                    {/* Last Result */}
                    {lastResult && (
                        <div className="result-banner">
                            <div className="result-stats">
                                <div className="result-stat">
                                    <span className="result-stat-value">{lastResult.results.processed}</span>
                                    <span className="result-stat-label">{t('attendanceReminders:result.checked')}</span>
                                </div>
                                <div className="result-stat success">
                                    <span className="result-stat-value">{lastResult.results.sent}</span>
                                    <span className="result-stat-label">{t('attendanceReminders:result.sent')}</span>
                                </div>
                                <div className="result-stat warning">
                                    <span className="result-stat-value">{lastResult.results.skipped}</span>
                                    <span className="result-stat-label">{t('attendanceReminders:result.skipped')}</span>
                                </div>
                                <div className="result-stat error">
                                    <span className="result-stat-value">{lastResult.results.failed}</span>
                                    <span className="result-stat-label">{t('attendanceReminders:result.failed')}</span>
                                </div>
                            </div>
                            <p className="result-message text-muted">
                                {t('attendanceReminders:result.checkedBetween')}{' '}
                                {formatTime(lastResult.windowStart)} {t('attendanceReminders:common.and')}{' '}
                                {formatTime(lastResult.windowEnd)}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Reminder History */}
            <div className="card">
                <div className="card-header-row">
                    <h3>{t('attendanceReminders:history.title')}</h3>
                    <button
                        className="btn btn-ghost"
                        onClick={fetchReminders}
                        disabled={loading}
                    >
                        <HiOutlineRefresh size={18} className={loading ? 'spin' : ''} />
                        {t('attendanceReminders:actions.refresh')}
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
                            <option value="">{t('attendanceReminders:filters.allStatuses')}</option>
                            <option value="sent">{t('attendanceReminders:status.sent')}</option>
                            <option value="failed">{t('attendanceReminders:status.failed')}</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label>{t('attendanceReminders:filters.from')}</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                        />
                    </div>
                    <div className="filter-group">
                        <label>{t('attendanceReminders:filters.to')}</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                        />
                    </div>
                    {(statusFilter || startDate || endDate) && (
                        <button className="btn btn-ghost btn-sm" onClick={handleClearFilters}>
                            {t('attendanceReminders:actions.clear')}
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
                                    <th>{t('attendanceReminders:table.reminderStatus')}</th>
                                    <th>{t('attendanceReminders:table.attendanceStatus')}</th>
                                    <th>{t('attendanceReminders:table.teacher')}</th>
                                    <th>{t('attendanceReminders:table.class')}</th>
                                    <th>{t('attendanceReminders:table.scheduledTime')}</th>
                                    <th>{t('attendanceReminders:table.attendanceDate')}</th>
                                    <th>{t('attendanceReminders:table.sentAt')}</th>
                                    <th>{t('attendanceReminders:table.failureReason')}</th>
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
                                                    {t('attendanceReminders:attendance.taken')}
                                                </span>
                                            ) : (
                                                <span className="badge badge-warning">
                                                    <HiOutlineXCircle size={14} />
                                                    {t('attendanceReminders:attendance.notTaken')}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {reminder.teacher
                                                ? `${reminder.teacher.firstName} ${reminder.teacher.lastName}`
                                                : t('attendanceReminders:common.dash')}
                                        </td>
                                        <td>
                                            {reminder.schedule?.title || t('attendanceReminders:common.dash')}
                                        </td>
                                        <td className="text-muted">
                                            {reminder.schedule?.startTime
                                                ? formatTime(reminder.schedule.startTime)
                                                : t('attendanceReminders:common.dash')}
                                            {reminder.schedule?.endTime && (
                                                <> – {formatTime(reminder.schedule.endTime)}</>
                                            )}
                                        </td>
                                        <td className="text-muted">
                                            {reminder.attendanceDate
                                                ? formatDate(reminder.attendanceDate)
                                                : t('attendanceReminders:common.dash')}
                                        </td>
                                        <td className="text-muted">
                                            {reminder.sentAt
                                                ? formatDateTime(reminder.sentAt)
                                                : t('attendanceReminders:common.dash')}
                                        </td>
                                        <td>
                                            {reminder.failureReason ? (
                                                <span className="failure-reason">
                                                    <HiOutlineExclamation size={14} />
                                                    {reminder.failureReason}
                                                </span>
                                            ) : (
                                                t('attendanceReminders:common.dash')
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {reminders.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="empty-row">
                                            {t('attendanceReminders:empty.noReminders')}
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
                            {t('attendanceReminders:pagination.previous')}
                        </button>
                        <span className="pagination-info">
                            {t('attendanceReminders:pagination.summary', { page: pagination.page, pages: pagination.pages, total: pagination.total })}
                        </span>
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={page >= pagination.pages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            {t('attendanceReminders:pagination.next')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttendanceRemindersPage;
