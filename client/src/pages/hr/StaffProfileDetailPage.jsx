import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchStaffProfile, selectCurrentStaffProfile, updateStaffProfile,
  fetchContracts, selectContracts, createContract,
  fetchCertifications, selectCertifications,
  fetchPDRecords, selectPDRecords,
  fetchReviews, selectReviews,
  selectHRLoading, selectHRError,
} from '../../store/slices/hrSlice';
import './HR.css';

const StaffProfileDetailPage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const profile = useSelector(selectCurrentStaffProfile);
  const contracts = useSelector(selectContracts);
  const certifications = useSelector(selectCertifications);
  const pdRecords = useSelector(selectPDRecords);
  const reviews = useSelector(selectReviews);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  const [tab, setTab] = useState('overview');

  useEffect(() => {
    dispatch(fetchStaffProfile(id));
    dispatch(fetchContracts({ staffId: id }));
    dispatch(fetchCertifications({ staffId: id }));
    dispatch(fetchPDRecords({ staffId: id }));
    dispatch(fetchReviews({ staffId: id }));
  }, [dispatch, id]);

  const getInitials = (user) => {
    if (!user) return '?';
    return `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
  };

  if (loading) return <div className="hr-page"><div className="hr-loading">Loading profile...</div></div>;
  if (error) return <div className="hr-page"><div className="hr-error">{error}</div></div>;
  if (!profile) return <div className="hr-page"><div className="hr-empty"><h3>Profile not found</h3></div></div>;

  const user = profile.user || {};

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn-secondary btn-sm" onClick={() => navigate('/portal/hr/staff')}>← Back</button>
          Staff Profile
        </h1>
      </div>

      <div className="hr-profile-layout">
        {/* Sidebar */}
        <div className="hr-profile-sidebar">
          <div className="avatar-large">{getInitials(user)}</div>
          <div className="profile-name">{user.firstName} {user.lastName}</div>
          <div className="profile-id">{profile.employeeId}</div>
          <div style={{ marginTop: '8px' }}>
            <span className={`hr-badge ${profile.status}`}>{profile.status?.replace('_', ' ')}</span>
          </div>
          <div className="profile-meta">
            <div className="meta-row"><span className="label">Type</span><span className="value" style={{ textTransform: 'capitalize' }}>{profile.staffType?.replace('_', ' ')}</span></div>
            <div className="meta-row"><span className="label">Department</span><span className="value">{profile.department?.name || '—'}</span></div>
            <div className="meta-row"><span className="label">Email</span><span className="value">{user.email || '—'}</span></div>
            <div className="meta-row"><span className="label">Phone</span><span className="value">{user.phone || '—'}</span></div>
            <div className="meta-row"><span className="label">Hire Date</span><span className="value">{profile.hireDate ? new Date(profile.hireDate).toLocaleDateString() : '—'}</span></div>
            {profile.personalInfo?.gender && <div className="meta-row"><span className="label">Gender</span><span className="value" style={{ textTransform: 'capitalize' }}>{profile.personalInfo.gender}</span></div>}
            {profile.personalInfo?.nationality && <div className="meta-row"><span className="label">Nationality</span><span className="value">{profile.personalInfo.nationality}</span></div>}
          </div>
        </div>

        {/* Main content */}
        <div className="hr-profile-main">
          <div className="hr-tabs">
            {['overview','contracts','certifications','development','reviews'].map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="hr-card">
              <h3>Personal Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.875rem' }}>
                <div><strong>Date of Birth:</strong> {profile.personalInfo?.dob ? new Date(profile.personalInfo.dob).toLocaleDateString() : '—'}</div>
                <div><strong>National ID:</strong> {profile.personalInfo?.nationalId || '—'}</div>
                <div><strong>Marital Status:</strong> {profile.personalInfo?.maritalStatus || '—'}</div>
                <div><strong>Blood Type:</strong> {profile.personalInfo?.bloodType || '—'}</div>
              </div>
              {profile.personalInfo?.address && (
                <div style={{ marginTop: '12px', fontSize: '0.875rem' }}>
                  <strong>Address:</strong>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {profile.personalInfo.address.street}, {profile.personalInfo.address.city}, {profile.personalInfo.address.country}
                  </div>
                </div>
              )}
              {profile.personalInfo?.emergencyContacts?.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h3>Emergency Contacts</h3>
                  {profile.personalInfo.emergencyContacts.map((ec, i) => (
                    <div key={i} style={{ padding: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '6px', fontSize: '0.85rem' }}>
                      <strong>{ec.name}</strong> ({ec.relationship}) — {ec.phone}
                    </div>
                  ))}
                </div>
              )}
              {profile.qualifications?.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h3>Qualifications</h3>
                  {profile.qualifications.map((q, i) => (
                    <div key={i} style={{ padding: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '6px', fontSize: '0.85rem' }}>
                      <strong>{q.degree}</strong> in {q.field} — {q.institution} ({q.year})
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'contracts' && (
            <div className="hr-card">
              <h3>Contracts ({contracts.length})</h3>
              {contracts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No contracts recorded</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Type</th><th>Start</th><th>End</th><th>Status</th><th>Salary</th></tr></thead>
                  <tbody>
                    {contracts.map((c) => (
                      <tr key={c._id}>
                        <td style={{ textTransform: 'capitalize' }}>{c.type?.replace('_', ' ')}</td>
                        <td>{new Date(c.startDate).toLocaleDateString()}</td>
                        <td>{c.endDate ? new Date(c.endDate).toLocaleDateString() : 'Indefinite'}</td>
                        <td><span className={`hr-badge ${c.status}`}>{c.status}</span></td>
                        <td>{c.salary?.amount ? `${c.salary.amount} ${c.salary.currency || ''}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'certifications' && (
            <div className="hr-card">
              <h3>Certifications ({certifications.length})</h3>
              {certifications.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No certifications recorded</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Name</th><th>Category</th><th>Issued By</th><th>Expiry</th><th>Status</th></tr></thead>
                  <tbody>
                    {certifications.map((c) => {
                      const now = new Date();
                      const expiry = c.expiryDate ? new Date(c.expiryDate) : null;
                      let status = 'valid';
                      if (expiry && expiry < now) status = 'expired';
                      else if (expiry && expiry < new Date(Date.now() + 30 * 86400000)) status = 'expiring_soon';
                      return (
                        <tr key={c._id}>
                          <td>{c.name}</td>
                          <td style={{ textTransform: 'capitalize' }}>{c.category?.replace('_', ' ')}</td>
                          <td>{c.issuedBy || '—'}</td>
                          <td>{expiry ? expiry.toLocaleDateString() : 'N/A'}</td>
                          <td><span className={`hr-badge ${status}`}>{status.replace('_', ' ')}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'development' && (
            <div className="hr-card">
              <h3>Professional Development ({pdRecords.length})</h3>
              {pdRecords.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No PD records</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Title</th><th>Category</th><th>Hours</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {pdRecords.map((r) => (
                      <tr key={r._id}>
                        <td>{r.title}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.category?.replace('_', ' ')}</td>
                        <td>{r.hours || 0}</td>
                        <td><span className={`hr-badge ${r.status}`}>{r.status?.replace('_', ' ')}</span></td>
                        <td>{r.startDate ? new Date(r.startDate).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'reviews' && (
            <div className="hr-card">
              <h3>Performance Reviews ({reviews.length})</h3>
              {reviews.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No reviews</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Period</th><th>Year</th><th>Reviewer</th><th>Rating</th><th>Status</th></tr></thead>
                  <tbody>
                    {reviews.map((r) => (
                      <tr key={r._id}>
                        <td style={{ textTransform: 'capitalize' }}>{r.period?.replace('_', ' ')}</td>
                        <td>{r.academicYear}</td>
                        <td>{r.reviewer?.firstName} {r.reviewer?.lastName}</td>
                        <td>{r.overallRating ? r.overallRating.toFixed(1) : '—'}</td>
                        <td><span className={`hr-badge ${r.status}`}>{r.status?.replace('_', ' ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffProfileDetailPage;
