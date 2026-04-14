import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchPDRecords, selectPDRecords, createPDRecord, updatePDRecord, deletePDRecord,
  fetchPDSummary, selectPDSummary,
  selectHRLoading, selectHRError,
} from '../../store/slices/hrSlice';
import './HR.css';

const CATEGORIES = [
  'curriculum','instruction','assessment','technology','leadership',
  'special_education','behavior_management','content_knowledge',
  'cultural_competency','wellness','compliance','research','other',
];

const TYPES = ['workshop','conference','course','webinar','coaching','mentoring','self_study','certification_prep','other'];

const PDLogPage = () => {
  const dispatch = useDispatch();
  const records = useSelector(selectPDRecords);
  const summary = useSelector(selectPDSummary);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  const [tab, setTab] = useState('records');
  const [filters, setFilters] = useState({ category: '', status: '' });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    staffId: '', title: '', provider: '', category: 'instruction', type: 'workshop',
    startDate: '', endDate: '', hours: 0, credits: 0, description: '', status: 'completed',
  });

  useEffect(() => { dispatch(fetchPDRecords(filters)); }, [dispatch, filters]);
  useEffect(() => { if (tab === 'summary') dispatch(fetchPDSummary()); }, [dispatch, tab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) {
      await dispatch(updatePDRecord({ id: editId, data: form }));
    } else {
      await dispatch(createPDRecord(form));
    }
    setShowForm(false);
    dispatch(fetchPDRecords(filters));
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this PD record?')) return;
    await dispatch(deletePDRecord(id));
  };

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>Professional Development</h1>
        <button className="btn-primary" onClick={() => { setEditId(null); setForm({ staffId: '', title: '', provider: '', category: 'instruction', type: 'workshop', startDate: '', endDate: '', hours: 0, credits: 0, description: '', status: 'completed' }); setShowForm(true); }}>
          + Log PD Activity
        </button>
      </div>

      {error && <div className="hr-error">{error}</div>}

      <div className="hr-tabs">
        <button className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}>Records</button>
        <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Summary</button>
      </div>

      {tab === 'records' && (
        <>
          <div className="hr-toolbar">
            <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All Statuses</option>
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="verified">Verified</option>
            </select>
          </div>

          {loading ? (
            <div className="hr-loading">Loading...</div>
          ) : records.length === 0 ? (
            <div className="hr-empty"><h3>No PD records found</h3></div>
          ) : (
            <table className="hr-table">
              <thead>
                <tr><th>Employee</th><th>Title</th><th>Category</th><th>Type</th><th>Hours</th><th>Date</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r._id}>
                    <td>{r.staff?.user?.firstName} {r.staff?.user?.lastName}</td>
                    <td>{r.title}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.category?.replace('_', ' ')}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.type}</td>
                    <td>{r.hours || 0}</td>
                    <td>{r.startDate ? new Date(r.startDate).toLocaleDateString() : '—'}</td>
                    <td><span className={`hr-badge ${r.status}`}>{r.status?.replace('_', ' ')}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(r._id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'summary' && summary && (
        <div className="hr-card-grid">
          <div className="hr-card">
            <h3>Totals</h3>
            <div className="hr-stats-grid">
              <div className="hr-stat-card">
                <div className="stat-label">Total Hours</div>
                <div className="stat-value">{summary.totals?.totalHours || 0}</div>
              </div>
              <div className="hr-stat-card">
                <div className="stat-label">Activities</div>
                <div className="stat-value">{summary.totals?.totalActivities || 0}</div>
              </div>
              <div className="hr-stat-card">
                <div className="stat-label">Staff Participated</div>
                <div className="stat-value">{summary.totals?.staffCount || 0}</div>
              </div>
            </div>
          </div>

          <div className="hr-card">
            <h3>Hours by Category</h3>
            {(summary.byCategory || []).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No data</p>
            ) : (
              <table className="hr-table">
                <thead><tr><th>Category</th><th className="text-right">Hours</th><th className="text-right">Count</th></tr></thead>
                <tbody>
                  {summary.byCategory.map((c) => (
                    <tr key={c._id}>
                      <td style={{ textTransform: 'capitalize' }}>{c._id?.replace('_', ' ')}</td>
                      <td className="text-right">{c.totalHours}</td>
                      <td className="text-right">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="hr-card">
            <h3>Top Staff by Hours</h3>
            {(summary.byStaff || []).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No data</p>
            ) : (
              <table className="hr-table">
                <thead><tr><th>Staff</th><th className="text-right">Hours</th><th className="text-right">Activities</th></tr></thead>
                <tbody>
                  {summary.byStaff.map((s) => (
                    <tr key={s._id}>
                      <td>{s.staffName}</td>
                      <td className="text-right">{s.totalHours}</td>
                      <td className="text-right">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="hr-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editId ? 'Edit' : 'Log'} PD Activity</h2>
            <form onSubmit={handleSubmit}>
              {!editId && (
                <div className="hr-form-group">
                  <label>Staff Profile ID (leave empty for self)</label>
                  <input value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} placeholder="Optional - uses your own profile" />
                </div>
              )}
              <div className="hr-form-group">
                <label>Title</label>
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="hr-form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="hr-form-group">
                <label>Provider</label>
                <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Start Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="hr-form-group">
                  <label>End Date</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Hours</label>
                  <input type="number" min={0} step={0.5} value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
                </div>
                <div className="hr-form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="hr-form-group">
                <label>Description</label>
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="hr-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editId ? 'Update' : 'Log Activity'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PDLogPage;
