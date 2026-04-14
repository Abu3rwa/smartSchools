import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchMyProfile, selectMyProfile,
  fetchMyLeaveRequests, selectMyLeaveRequests,
  fetchMyLeaveBalances, selectMyLeaveBalances,
  fetchMyCertifications, selectMyCertifications,
  fetchMyPDRecords, selectMyPDRecords,
  fetchMyReviews, selectMyReviews,
  submitLeaveRequest, cancelLeaveRequest,
  fetchLeaveTypes, selectLeaveTypes,
  submitSelfAssessment, acknowledgeReview,
  selectHRLoading, selectHRError,
} from '../../store/slices/hrSlice';
import './HR.css';

const MyHRPage = () => {
  const dispatch = useDispatch();
  const profile = useSelector(selectMyProfile);
  const leaveRequests = useSelector(selectMyLeaveRequests);
  const leaveBalances = useSelector(selectMyLeaveBalances);
  const certs = useSelector(selectMyCertifications);
  const pdRecords = useSelector(selectMyPDRecords);
  const reviews = useSelector(selectMyReviews);
  const leaveTypes = useSelector(selectLeaveTypes);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  const [tab, setTab] = useState('profile');
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', days: 1, reason: '', isHalfDay: false });

  useEffect(() => {
    dispatch(fetchMyProfile());
    dispatch(fetchMyLeaveRequests());
    dispatch(fetchMyLeaveBalances());
    dispatch(fetchMyCertifications());
    dispatch(fetchMyPDRecords());
    dispatch(fetchMyReviews());
    dispatch(fetchLeaveTypes({ active: 'true' }));
  }, [dispatch]);

  const getInitials = (user) => {
    if (!user) return '?';
    return `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    await dispatch(submitLeaveRequest(leaveForm));
    setShowLeaveForm(false);
    setLeaveForm({ leaveTypeId: '', startDate: '', endDate: '', days: 1, reason: '', isHalfDay: false });
    dispatch(fetchMyLeaveRequests());
    dispatch(fetchMyLeaveBalances());
  };

  const handleCancelLeave = async (id) => {
    if (!window.confirm('Cancel this leave request?')) return;
    await dispatch(cancelLeaveRequest({ id, reason: 'Cancelled by employee' }));
    dispatch(fetchMyLeaveRequests());
    dispatch(fetchMyLeaveBalances());
  };

  const handleAcknowledge = async (id) => {
    await dispatch(acknowledgeReview({ id, data: { response: 'Acknowledged' } }));
    dispatch(fetchMyReviews());
  };

  if (loading && !profile) return <div className="hr-page"><div className="hr-loading">Loading your HR profile...</div></div>;

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>My HR Profile</h1>
        {tab === 'leave' && <button className="btn-primary" onClick={() => setShowLeaveForm(true)}>+ Request Leave</button>}
      </div>

      {error && <div className="hr-error">{error}</div>}

      {!profile ? (
        <div className="hr-empty"><h3>No HR profile found</h3><p>Contact your administrator to create your staff profile.</p></div>
      ) : (
        <>
          <div className="hr-tabs">
            {['profile','leave','certifications','development','reviews'].map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'profile' && (
            <div className="hr-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div className="avatar-large" style={{
                  width: 72, height: 72, borderRadius: '50%', background: 'var(--brand-gradient)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 700
                }}>{getInitials(profile.user)}</div>
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {profile.user?.firstName} {profile.user?.lastName}
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>{profile.employeeId} · <span style={{ textTransform: 'capitalize' }}>{profile.staffType?.replace('_', ' ')}</span></div>
                  <span className={`hr-badge ${profile.status}`}>{profile.status?.replace('_', ' ')}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.875rem' }}>
                <div><strong>Department:</strong> {profile.department?.name || '—'}</div>
                <div><strong>Hire Date:</strong> {profile.hireDate ? new Date(profile.hireDate).toLocaleDateString() : '—'}</div>
                <div><strong>Email:</strong> {profile.user?.email || '—'}</div>
                <div><strong>Phone:</strong> {profile.user?.phone || '—'}</div>
              </div>
            </div>
          )}

          {tab === 'leave' && (
            <>
              {/* Balances */}
              <div className="leave-balance-grid">
                {leaveBalances.map((b) => {
                  const remaining = (b.allocated || 0) + (b.carriedOver || 0) + (b.adjustment || 0) - (b.used || 0) - (b.pending || 0);
                  return (
                    <div key={b._id} className="leave-balance-card" style={{ borderLeft: `4px solid ${b.leaveType?.color || 'var(--primary)'}` }}>
                      <div className="leave-type-name">{b.leaveType?.name}</div>
                      <div className="leave-remaining">{remaining}</div>
                      <div className="leave-total">of {b.allocated || 0} days ({b.used || 0} used, {b.pending || 0} pending)</div>
                    </div>
                  );
                })}
              </div>

              {/* Requests */}
              <div className="hr-card">
                <h3>My Leave Requests</h3>
                {leaveRequests.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No leave requests</p>
                ) : (
                  <table className="hr-table">
                    <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {leaveRequests.map((r) => (
                        <tr key={r._id}>
                          <td>{r.leaveType?.name}</td>
                          <td>{new Date(r.startDate).toLocaleDateString()}</td>
                          <td>{new Date(r.endDate).toLocaleDateString()}</td>
                          <td>{r.days}{r.isHalfDay ? ' (½)' : ''}</td>
                          <td><span className={`hr-badge ${r.status}`}>{r.status}</span></td>
                          <td>
                            {(r.status === 'pending' || r.status === 'approved') && (
                              <button className="btn-danger btn-sm" onClick={() => handleCancelLeave(r._id)}>Cancel</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {tab === 'certifications' && (
            <div className="hr-card">
              <h3>My Certifications</h3>
              {certs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No certifications</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Name</th><th>Category</th><th>Issued By</th><th>Expiry</th></tr></thead>
                  <tbody>
                    {certs.map((c) => (
                      <tr key={c._id}>
                        <td>{c.name}</td>
                        <td style={{ textTransform: 'capitalize' }}>{c.category?.replace('_', ' ')}</td>
                        <td>{c.issuedBy || '—'}</td>
                        <td>{c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'development' && (
            <div className="hr-card">
              <h3>My PD Activities</h3>
              {pdRecords.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No PD records</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Title</th><th>Category</th><th>Hours</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>
                    {pdRecords.map((r) => (
                      <tr key={r._id}>
                        <td>{r.title}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.category?.replace('_', ' ')}</td>
                        <td>{r.hours || 0}</td>
                        <td>{r.startDate ? new Date(r.startDate).toLocaleDateString() : '—'}</td>
                        <td><span className={`hr-badge ${r.status}`}>{r.status?.replace('_', ' ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'reviews' && (
            <div className="hr-card">
              <h3>My Performance Reviews</h3>
              {reviews.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No reviews</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Period</th><th>Year</th><th>Rating</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {reviews.map((r) => (
                      <tr key={r._id}>
                        <td style={{ textTransform: 'capitalize' }}>{r.period?.replace('_', ' ')}</td>
                        <td>{r.academicYear}</td>
                        <td>{r.overallRating ? `${r.overallRating.toFixed(1)}/5` : '—'}</td>
                        <td><span className={`hr-badge ${r.status}`}>{r.status?.replace('_', ' ')}</span></td>
                        <td>
                          {r.status === 'submitted' && (
                            <button className="btn-primary btn-sm" onClick={() => handleAcknowledge(r._id)}>Acknowledge</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Leave Request Modal */}
      {showLeaveForm && (
        <div className="hr-modal-overlay" onClick={() => setShowLeaveForm(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Request Leave</h2>
            <form onSubmit={handleSubmitLeave}>
              <div className="hr-form-group">
                <label>Leave Type</label>
                <select required value={leaveForm.leaveTypeId} onChange={(e) => setLeaveForm({ ...leaveForm, leaveTypeId: e.target.value })}>
                  <option value="">Select type...</option>
                  {leaveTypes.map((t) => (
                    <option key={t._id} value={t._id}>{t.name} ({t.daysPerYear} days/year)</option>
                  ))}
                </select>
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Start Date</label>
                  <input type="date" required value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
                </div>
                <div className="hr-form-group">
                  <label>End Date</label>
                  <input type="date" required value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
                </div>
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Number of Days</label>
                  <input type="number" min={0.5} step={0.5} required value={leaveForm.days} onChange={(e) => setLeaveForm({ ...leaveForm, days: Number(e.target.value) })} />
                </div>
                <div className="hr-form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="checkbox" checked={leaveForm.isHalfDay} onChange={(e) => setLeaveForm({ ...leaveForm, isHalfDay: e.target.checked })} />
                    Half Day
                  </label>
                </div>
              </div>
              <div className="hr-form-group">
                <label>Reason</label>
                <textarea rows={3} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Reason for leave..." />
              </div>
              <div className="hr-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowLeaveForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyHRPage;
