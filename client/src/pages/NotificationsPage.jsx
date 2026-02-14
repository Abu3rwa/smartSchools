import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    fetchNotificationHistory,
    selectNotifications,
    selectNotificationsLoading,
    selectNotificationSending
} from '../store/slices/notificationSlice';
import { selectUser } from '../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineClock, HiOutlineMail, HiOutlineBell, HiOutlinePaperAirplane, HiOutlineArrowRight } from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import notificationService from '../services/notificationService';
import './NotificationsPage.css';

const QUICK_HOUR_OPTIONS = [
    { value: 1, label: '1h' },
    { value: 1.5, label: '1.5h' },
    { value: 2, label: '2h' },
    { value: 10, label: '10h' },
];

const NotificationsPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const notifications = useSelector(selectNotifications);
    const loading = useSelector(selectNotificationsLoading);
    const sending = useSelector(selectNotificationSending);
    const user = useSelector(selectUser);

    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = user?.role === 'admin' || user?.role === 'department_principal';

    const [activeTab, setActiveTab] = useState('history');
    const [quickSending, setQuickSending] = useState(false);
    const [quickResult, setQuickResult] = useState(null);

    useEffect(() => {
        dispatch(fetchNotificationHistory());
    }, [dispatch, academicYear]);



    const getStatusIcon = (status) => {
        switch (status) {
            case 'sent':
                return <HiOutlineCheckCircle className="status-icon success" />;
            case 'failed':
                return <HiOutlineXCircle className="status-icon error" />;
            default:
                return <HiOutlineClock className="status-icon pending" />;
        }
    };

    const handleQuickSend = async (hours) => {
        setQuickSending(true);
        setQuickResult(null);
        try {
            const result = await notificationService.runAttendanceReminder(hours);
            setQuickResult(result);
            toast.success(`Sent ${result.results.sent} reminder(s)`);
            dispatch(fetchNotificationHistory());
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send reminders');
        } finally {
            setQuickSending(false);
        }
    };

    return (
        <div className="notifications-page">
            <div className="page-header">
                <div>
                    <h1>Notifications</h1>
                    <p className="text-muted">Send grade updates and reports to parents</p>
                </div>

            </div>

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    Notification History
                </button>
                <button
                    className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                >
                    Statistics
                </button>
                {isAdmin && (
                    <button
                        className={`tab ${activeTab === 'attendance' ? 'active' : ''}`}
                        onClick={() => setActiveTab('attendance')}
                    >
                        <HiOutlineBell size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Attendance Reminders
                    </button>
                )}
            </div>

            {/* History Tab */}
            {activeTab === 'history' && (
                <div className="card">
                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Status</th>
                                        <th>Type</th>
                                        <th>Recipient</th>
                                        <th>Student</th>
                                        <th>Subject</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {notifications.map(notification => (
                                        <tr key={notification._id}>
                                            <td>{getStatusIcon(notification.status)}</td>
                                            <td>
                                                <span className="notification-type">
                                                    {notification.type.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="text-muted">{notification.recipientEmail}</td>
                                            <td>
                                                {notification.student?.firstName} {notification.student?.lastName}
                                            </td>
                                            <td className="truncate" style={{ maxWidth: 200 }}>
                                                {notification.subject}
                                            </td>
                                            <td className="text-muted">
                                                {format(new Date(notification.createdAt), 'MMM d, yyyy HH:mm')}
                                            </td>
                                        </tr>
                                    ))}
                                    {notifications.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="empty-row">
                                                No notifications sent yet
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <HiOutlineMail size={32} />
                        <div>
                            <span className="stat-value">{notifications.length}</span>
                            <span className="stat-label">Total Sent</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <HiOutlineCheckCircle size={32} />
                        <div>
                            <span className="stat-value">
                                {notifications.filter(n => n.status === 'sent').length}
                            </span>
                            <span className="stat-label">Delivered</span>
                        </div>
                    </div>
                    <div className="stat-card">
                        <HiOutlineXCircle size={32} />
                        <div>
                            <span className="stat-value">
                                {notifications.filter(n => n.status === 'failed').length}
                            </span>
                            <span className="stat-label">Failed</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Attendance Reminders Tab (Admin only) */}
            {activeTab === 'attendance' && isAdmin && (
                <div className="card">
                    <div className="attendance-quick-panel">
                        <div className="quick-panel-header">
                            <HiOutlineBell size={22} />
                            <div>
                                <h3 style={{ margin: 0 }}>Quick Send Reminders</h3>
                                <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                                    Notify teachers who missed recording attendance
                                </p>
                            </div>
                        </div>

                        <div className="quick-send-buttons">
                            {QUICK_HOUR_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    className="quick-send-btn"
                                    onClick={() => handleQuickSend(opt.value)}
                                    disabled={quickSending}
                                >
                                    <HiOutlinePaperAirplane size={16} />
                                    <span>{opt.label} ago</span>
                                </button>
                            ))}
                        </div>

                        {quickSending && (
                            <div className="quick-sending-indicator">
                                <div className="spinner" style={{ width: 20, height: 20 }}></div>
                                <span>Sending reminders...</span>
                            </div>
                        )}

                        {quickResult && !quickSending && (
                            <div className="quick-result">
                                <div className="quick-result-stats">
                                    <span className="quick-stat">
                                        <strong>{quickResult.results.sent}</strong> sent
                                    </span>
                                    <span className="quick-stat muted">
                                        <strong>{quickResult.results.skipped}</strong> skipped
                                    </span>
                                    {quickResult.results.failed > 0 && (
                                        <span className="quick-stat error">
                                            <strong>{quickResult.results.failed}</strong> failed
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        <button
                            className="view-all-link"
                            onClick={() => navigate('/portal/attendance-reminders')}
                        >
                            View full reminder history & advanced options
                            <HiOutlineArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default NotificationsPage;
