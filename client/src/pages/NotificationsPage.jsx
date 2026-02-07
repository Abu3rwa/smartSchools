import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchNotificationHistory,
    selectNotifications,
    selectNotificationsLoading,
    selectNotificationSending
} from '../store/slices/notificationSlice';

import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineClock, HiOutlineMail } from 'react-icons/hi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import './NotificationsPage.css';

const NotificationsPage = () => {
    const dispatch = useDispatch();
    const notifications = useSelector(selectNotifications);
    const loading = useSelector(selectNotificationsLoading);
    const sending = useSelector(selectNotificationSending);

    const academicYear = useSelector(selectCurrentAcademicYear);


    const [activeTab, setActiveTab] = useState('history');

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


        </div>
    );
};

export default NotificationsPage;
