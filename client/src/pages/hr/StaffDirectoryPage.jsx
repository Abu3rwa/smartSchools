import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  fetchStaffProfiles, selectStaffProfiles, selectStaffPagination,
  selectHRLoading, selectHRError, createStaffProfile,
} from '../../store/slices/hrSlice';
import './HR.css';

const STAFF_TYPES = [
  'teacher','admin','support','counselor','librarian','nurse','driver',
  'security','maintenance','accountant','receptionist','lab_technician','it_support','cafeteria','other',
];

const StaffDirectoryPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const profiles = useSelector(selectStaffProfiles);
  const pagination = useSelector(selectStaffPagination);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  const [filters, setFilters] = useState({ staffType: '', status: '', search: '', page: 1 });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ userId: '', staffType: 'teacher', department: '' });

  useEffect(() => { dispatch(fetchStaffProfiles(filters)); }, [dispatch, filters]);

  const getInitials = (user) => {
    if (!user) return '?';
    return `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    await dispatch(createStaffProfile(form));
    setShowCreate(false);
    setForm({ userId: '', staffType: 'teacher', department: '' });
    dispatch(fetchStaffProfiles(filters));
  };

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>Staff Directory</h1>
        <div className="hr-header-actions">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Add Staff Profile</button>
        </div>
      </div>

      {error && <div className="hr-error">{error}</div>}

      <div className="hr-toolbar">
        <input
          className="hr-search-input"
          type="text" placeholder="Search by ID..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
        />
        <select value={filters.staffType} onChange={(e) => setFilters({ ...filters, staffType: e.target.value, page: 1 })}>
          <option value="">All Types</option>
          {STAFF_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="on_leave">On Leave</option>
          <option value="probation">Probation</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {loading ? (
        <div className="hr-loading">Loading staff...</div>
      ) : profiles.length === 0 ? (
        <div className="hr-empty">
          <h3>No staff profiles found</h3>
          <p>Create staff profiles to get started with HR management.</p>
        </div>
      ) : (
        <>
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>ID</th>
                <th>Type</th>
                <th>Department</th>
                <th>Status</th>
                <th>Hire Date</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p._id} onClick={() => navigate(`/portal/hr/staff/${p._id}`)}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="small-avatar" style={{
                      width: 32, height: 32, borderRadius: '50%', background: 'var(--brand-gradient)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: '0.75rem', flexShrink: 0
                    }}>
                      {getInitials(p.user)}
                    </div>
                    {p.user?.firstName} {p.user?.lastName}
                  </td>
                  <td>{p.employeeId}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.staffType?.replace('_', ' ')}</td>
                  <td>{p.department?.name || '—'}</td>
                  <td><span className={`hr-badge ${p.status}`}>{p.status?.replace('_', ' ')}</span></td>
                  <td>{p.hireDate ? new Date(p.hireDate).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {pagination && pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '1rem' }}>
              {Array.from({ length: pagination.pages }, (_, i) => (
                <button key={i + 1}
                  className={filters.page === i + 1 ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                  onClick={() => setFilters({ ...filters, page: i + 1 })}
                >{i + 1}</button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="hr-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Staff Profile</h2>
            <form onSubmit={handleCreate}>
              <div className="hr-form-group">
                <label>User ID</label>
                <input required value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  placeholder="Existing user's ObjectId" />
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Staff Type</label>
                  <select value={form.staffType} onChange={(e) => setForm({ ...form, staffType: e.target.value })}>
                    {STAFF_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="hr-form-group">
                  <label>Department ID (optional)</label>
                  <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                    placeholder="Department ObjectId" />
                </div>
              </div>
              <div className="hr-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffDirectoryPage;
