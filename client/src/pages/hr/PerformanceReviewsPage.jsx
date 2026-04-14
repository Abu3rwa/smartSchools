import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchReviews, selectReviews, createReview, updateReview,
  selectHRLoading, selectHRError,
} from '../../store/slices/hrSlice';
import './HR.css';

const PERIODS = ['q1','q2','q3','q4','semester_1','semester_2','annual','mid_year','probation'];

const PerformanceReviewsPage = () => {
  const dispatch = useDispatch();
  const reviews = useSelector(selectReviews);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  const [filters, setFilters] = useState({ status: '', academicYear: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staffId: '', academicYear: '', period: 'annual', dueDate: '' });

  useEffect(() => { dispatch(fetchReviews(filters)); }, [dispatch, filters]);

  const handleCreate = async (e) => {
    e.preventDefault();
    await dispatch(createReview(form));
    setShowForm(false);
    dispatch(fetchReviews(filters));
  };

  const handleStatusChange = async (id, newStatus) => {
    await dispatch(updateReview({ id, data: { status: newStatus } }));
    dispatch(fetchReviews(filters));
  };

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>Performance Reviews</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ New Review</button>
      </div>

      {error && <div className="hr-error">{error}</div>}

      <div className="hr-toolbar">
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="self_assessment">Self Assessment</option>
          <option value="in_review">In Review</option>
          <option value="submitted">Submitted</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="closed">Closed</option>
        </select>
        <input placeholder="Academic Year" value={filters.academicYear} onChange={(e) => setFilters({ ...filters, academicYear: e.target.value })} style={{ width: 120 }} />
      </div>

      {loading ? (
        <div className="hr-loading">Loading...</div>
      ) : reviews.length === 0 ? (
        <div className="hr-empty"><h3>No reviews found</h3></div>
      ) : (
        <table className="hr-table">
          <thead>
            <tr><th>Employee</th><th>Period</th><th>Year</th><th>Reviewer</th><th>Rating</th><th>Due Date</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r._id}>
                <td>{r.staff?.user?.firstName} {r.staff?.user?.lastName}</td>
                <td style={{ textTransform: 'capitalize' }}>{r.period?.replace('_', ' ')}</td>
                <td>{r.academicYear}</td>
                <td>{r.reviewer?.firstName} {r.reviewer?.lastName}</td>
                <td>{r.overallRating ? `${r.overallRating.toFixed(1)}/5` : '—'}</td>
                <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
                <td><span className={`hr-badge ${r.status}`}>{r.status?.replace('_', ' ')}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {r.status === 'draft' && (
                      <button className="btn-secondary btn-sm" onClick={() => handleStatusChange(r._id, 'self_assessment')}>Send for Self-Assessment</button>
                    )}
                    {r.status === 'in_review' && (
                      <button className="btn-primary btn-sm" onClick={() => handleStatusChange(r._id, 'submitted')}>Submit</button>
                    )}
                    {r.status === 'acknowledged' && (
                      <button className="btn-secondary btn-sm" onClick={() => handleStatusChange(r._id, 'closed')}>Close</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="hr-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create Performance Review</h2>
            <form onSubmit={handleCreate}>
              <div className="hr-form-group">
                <label>Staff Profile ID</label>
                <input required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} placeholder="Staff profile ObjectId" />
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Academic Year</label>
                  <input required value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} placeholder="e.g. 2025-2026" />
                </div>
                <div className="hr-form-group">
                  <label>Period</label>
                  <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                    {PERIODS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="hr-form-group">
                <label>Due Date</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="hr-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceReviewsPage;
