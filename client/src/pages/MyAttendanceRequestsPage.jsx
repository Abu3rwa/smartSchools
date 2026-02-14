import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import { HiOutlineClipboardList, HiOutlinePlus, HiOutlineClock, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './MyAttendanceRequestsPage.css';

const statusConfig = {
    pending: { label: 'Pending', Icon: HiOutlineClock, className: 'status-pending' },
    approved: { label: 'Approved', Icon: HiOutlineCheck, className: 'status-approved' },
    rejected: { label: 'Rejected', Icon: HiOutlineX, className: 'status-rejected' },
};

const MyAttendanceRequestsPage = () => {
    const navigate = useNavigate();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/attendance-requests')
            .then((res) => {
                if (res.data.success) setRequests(res.data.data || []);
            })
            .catch(() => {
                toast.error('Failed to load requests');
                setRequests([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const formatDate = (d) =>
        d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    const formatTimeRange = (r) => {
        if (r.startDate && r.endDate) {
            return `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
        }
        if (r.fromTime && r.toTime) return `${r.fromTime} – ${r.toTime}`;
        if (r.fromTime) return r.fromTime;
        if (r.toTime) return r.toTime;
        return '—';
    };

    return (
        <div className="my-attendance-requests-page">
            <header className="page-header">
                <div>
                    <h1><HiOutlineClipboardList className="header-icon" /> My Attendance Requests</h1>
                    <p className="page-subtitle">View and submit attendance or leave requests.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/portal/attendance-request')}>
                    <HiOutlinePlus className="btn-icon" /> New request
                </button>
            </header>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            ) : requests.length === 0 ? (
                <div className="empty-state">
                    <p>You have not submitted any attendance requests yet.</p>
                    <button type="button" className="btn btn-primary" onClick={() => navigate('/portal/attendance-request')}>
                        <HiOutlinePlus className="btn-icon" /> Submit your first request
                    </button>
                </div>
            ) : (
                <div className="requests-list">
                    <div className="requests-table-header">
                        <span>Date</span>
                        <span>Type</span>
                        <span>Time</span>
                        <span>Status</span>
                        <span className="hide-mobile">Review note</span>
                    </div>
                    {requests.map((r) => {
                        const config = statusConfig[r.status] || statusConfig.pending;
                        const Icon = config.Icon;
                        const typeLabel = r.requestType?.labelEn || r.requestType?.labelAr || '—';
                        return (
                            <div key={r._id} className={`request-card ${config.className}`}>
                                <div className="request-main">
                                    <span className="request-date">{formatDate(r.startDate || r.requestDate || r.createdAt)}</span>
                                    <span className="request-type">{typeLabel}</span>
                                    <span className="request-time">{formatTimeRange(r)}</span>
                                    <span className="request-status">
                                        <Icon className="status-icon" /> {config.label}
                                    </span>
                                    <span className="request-note hide-mobile">{r.reviewNote || '—'}</span>
                                </div>
                                {r.reviewNote && (
                                    <div className="request-note-mobile show-mobile">
                                        <strong>Review note:</strong> {r.reviewNote}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MyAttendanceRequestsPage;
