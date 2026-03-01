import { useState, useEffect, useCallback } from 'react';
import api from '../../../../config/api';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../../store/slices/authSlice';
import {
    HiOutlineClipboardList,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineClock,
    HiOutlineRefresh,
    HiOutlineDocumentText,
    HiOutlineCog,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import './AdminAttendanceRequestsPage.css';

const statusOptions = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
];

const AdminAttendanceRequestsPage = () => {
    const navigate = useNavigate();
    const user = useSelector(selectUser);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [reviewModal, setReviewModal] = useState(null);
    const [reviewNote, setReviewNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchRequests = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        api.get(`/attendance-requests?${params.toString()}`)
            .then((res) => {
                if (res.data.success) setRequests(res.data.data || []);
            })
            .catch(() => {
                toast.error('Failed to load requests');
                setRequests([]);
            })
            .finally(() => setLoading(false));
    }, [statusFilter]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const handleReview = (action) => {
        if (!reviewModal) return;
        setSubmitting(true);
        api.patch(`/attendance-requests/${reviewModal._id}/review`, {
            status: action,
            reviewNote: reviewNote.trim() || undefined,
        })
            .then((res) => {
                if (res.data.success) {
                    toast.success(res.data.message);
                    setReviewModal(null);
                    setReviewNote('');
                    fetchRequests();
                } else {
                    toast.error(res.data.message || 'Failed to update');
                }
            })
            .catch((err) => toast.error(err.response?.data?.message || 'Failed to update'))
            .finally(() => setSubmitting(false));
    };

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

    const pendingCount = requests.filter((r) => r.status === 'pending').length;

    return (
        <div className="admin-attendance-requests-page">
            <header className="page-header">
                <div>
                    <h1><HiOutlineClipboardList className="header-icon" /> Attendance Requests</h1>
                    <p className="page-subtitle">Review and approve or reject attendance and leave requests.</p>
                </div>
                <div className="header-actions">
                    {pendingCount > 0 && (
                        <span className="pending-badge">{pendingCount} pending</span>
                    )}
                    {user?.role === 'admin' && (
                        <button type="button" className="btn btn-secondary" onClick={() => navigate('/portal/attendance-request-types')}>
                            <HiOutlineCog className="btn-icon" /> Manage request types
                        </button>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={fetchRequests} disabled={loading}>
                        <HiOutlineRefresh className="btn-icon" /> Refresh
                    </button>
                </div>
            </header>

            <div className="filters-bar">
                <label className="filter-group">
                    <span className="filter-label">Status</span>
                    <select
                        className="filter-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        {statusOptions.map((o) => (
                            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </label>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner" />
                    <p>Loading...</p>
                </div>
            ) : requests.length === 0 ? (
                <div className="empty-state">No attendance requests found.</div>
            ) : (
                <div className="requests-table-wrap">
                    <table className="requests-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Requester</th>
                                <th>Type</th>
                                <th>Student</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map((r) => {
                                const typeLabel = r.requestType?.labelEn || r.requestType?.labelAr || '—';
                                const studentLabel = r.student
                                    ? `${r.student.firstName || ''} ${r.student.lastName || ''}`.trim() || r.student.studentId || '—'
                                    : '—';
                                return (
                                    <tr key={r._id} className={`row-status-${r.status}`}>
                                        <td>{formatDate(r.requestDate || r.createdAt)}</td>
                                        <td>{formatTimeRange(r)}</td>
                                        <td>
                                            <div className="requester-cell">
                                                <span className="requester-name">{r.requesterName}</span>
                                                <span className="requester-email">{r.requesterEmail}</span>
                                            </div>
                                        </td>
                                        <td>{typeLabel}</td>
                                        <td>{studentLabel}</td>
                                        <td>
                                            <span className={`status-badge status-${r.status}`}>
                                                {r.status === 'pending' && <HiOutlineClock className="badge-icon" />}
                                                {r.status === 'approved' && <HiOutlineCheck className="badge-icon" />}
                                                {r.status === 'rejected' && <HiOutlineX className="badge-icon" />}
                                                {r.status}
                                            </span>
                                        </td>
                                        <td>
                                            {r.status === 'pending' ? (
                                                <div className="action-buttons">
                                                    <button
                                                        type="button"
                                                        className="btn-action btn-approve"
                                                        onClick={() => setReviewModal(r)}
                                                        title="Approve or reject"
                                                    >
                                                        Review
                                                    </button>
                                                </div>
                                            ) : (
                                                r.reviewNote && (
                                                    <span className="review-note-preview" title={r.reviewNote}>
                                                        <HiOutlineDocumentText /> Note
                                                    </span>
                                                )
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {reviewModal && (
                <div className="modal-overlay" onClick={() => !submitting && setReviewModal(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Review request</h3>
                        <p className="modal-requester">{reviewModal.requesterName} – {reviewModal.requestType?.labelEn || reviewModal.requestType?.labelAr || 'Request'}</p>
                        {reviewModal.notes && (
                            <p className="modal-notes"><strong>Notes:</strong> {reviewModal.notes}</p>
                        )}
                        <label className="modal-field">
                            <span>Review note (optional)</span>
                            <textarea
                                value={reviewNote}
                                onChange={(e) => setReviewNote(e.target.value)}
                                rows={3}
                                placeholder="Add a note for the requester..."
                                disabled={submitting}
                            />
                        </label>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => !submitting && setReviewModal(null)} disabled={submitting}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-reject"
                                onClick={() => handleReview('rejected')}
                                disabled={submitting}
                            >
                                Reject
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => handleReview('approved')}
                                disabled={submitting}
                            >
                                {submitting ? 'Saving...' : 'Approve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminAttendanceRequestsPage;
