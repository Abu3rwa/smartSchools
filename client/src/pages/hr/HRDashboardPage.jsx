import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchHRDashboard, selectHRDashboard, selectHRLoading, selectHRError } from '../../store/slices/hrSlice';
import './HR.css';

const STAFF_TYPE_LABELS = {
  teacher: 'Teachers', admin: 'Admin', support: 'Support', counselor: 'Counselors',
  librarian: 'Librarians', nurse: 'Nurses', driver: 'Drivers', security: 'Security',
  maintenance: 'Maintenance', accountant: 'Accountants', receptionist: 'Receptionists',
  lab_technician: 'Lab Technicians', it_support: 'IT Support', cafeteria: 'Cafeteria', other: 'Other',
};

const HRDashboardPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const dashboard = useSelector(selectHRDashboard);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  useEffect(() => { dispatch(fetchHRDashboard()); }, [dispatch]);

  const getInitials = (user) => {
    if (!user) return '?';
    return `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
  };

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>HR Dashboard</h1>
        <div className="hr-header-actions">
          <button className="btn-primary" onClick={() => navigate('/portal/hr/staff')}>Staff Directory</button>
          <button className="btn-secondary" onClick={() => navigate('/portal/hr/leave')}>Leave Management</button>
        </div>
      </div>

      {error && <div className="hr-error">{error}</div>}

      {loading ? (
        <div className="hr-loading">Loading HR data...</div>
      ) : dashboard ? (
        <>
          <div className="hr-stats-grid">
            <div className="hr-stat-card">
              <div className="stat-label">Total Staff</div>
              <div className="stat-value">{dashboard.totalStaff || 0}</div>
            </div>
            <div className="hr-stat-card">
              <div className="stat-label">Pending Leave Requests</div>
              <div className="stat-value warning">{dashboard.pendingLeaveRequests || 0}</div>
            </div>
            <div className="hr-stat-card">
              <div className="stat-label">Expiring Certifications</div>
              <div className="stat-value negative">{dashboard.expiringCertifications || 0}</div>
            </div>
            <div className="hr-stat-card">
              <div className="stat-label">Contract Renewals Due</div>
              <div className="stat-value warning">{dashboard.expiringContracts || 0}</div>
            </div>
          </div>

          <div className="hr-card-grid">
            {/* Staff by type */}
            <div className="hr-card">
              <h3>Staff by Type</h3>
              {(dashboard.staffByType || []).length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No staff profiles yet</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Type</th><th className="text-right">Count</th></tr></thead>
                  <tbody>
                    {dashboard.staffByType.map((s) => (
                      <tr key={s._id}>
                        <td style={{ textTransform: 'capitalize' }}>{STAFF_TYPE_LABELS[s._id] || s._id}</td>
                        <td className="text-right">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* On Leave Today */}
            <div className="hr-card">
              <h3>On Leave Today</h3>
              {(dashboard.onLeaveToday || []).length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Nobody on leave today</p>
              ) : (
                <div className="on-leave-list">
                  {dashboard.onLeaveToday.map((l) => (
                    <div key={l._id} className="on-leave-item">
                      <div className="small-avatar">{getInitials(l.staff?.user)}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {l.staff?.user?.firstName} {l.staff?.user?.lastName}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {l.leaveType?.name} · {l.days} day{l.days > 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Hires */}
            <div className="hr-card">
              <h3>Recent Hires (30 days)</h3>
              {(dashboard.recentHires || []).length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No recent hires</p>
              ) : (
                <table className="hr-table">
                  <thead><tr><th>Name</th><th>Type</th><th>Hire Date</th></tr></thead>
                  <tbody>
                    {dashboard.recentHires.map((h) => (
                      <tr key={h._id}>
                        <td>{h.user?.firstName} {h.user?.lastName}</td>
                        <td style={{ textTransform: 'capitalize' }}>{h.staffType?.replace('_', ' ')}</td>
                        <td>{new Date(h.hireDate).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default HRDashboardPage;
