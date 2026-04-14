import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCertifications, selectCertifications, createCertification, updateCertification, deleteCertification,
  selectHRLoading, selectHRError,
} from '../../store/slices/hrSlice';
import './HR.css';

const CATEGORIES = [
  'teaching_license','subject_certification','first_aid','cpr','safeguarding',
  'special_education','leadership','technology','language','other',
];

const CertificationsPage = () => {
  const dispatch = useDispatch();
  const certs = useSelector(selectCertifications);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  const [filters, setFilters] = useState({ category: '', expiring: '' });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ staffId: '', name: '', category: 'teaching_license', issuedBy: '', issueDate: '', expiryDate: '', credentialId: '', isRequired: false, notes: '' });

  useEffect(() => { dispatch(fetchCertifications(filters)); }, [dispatch, filters]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) {
      await dispatch(updateCertification({ id: editId, data: form }));
    } else {
      await dispatch(createCertification(form));
    }
    setShowForm(false);
    dispatch(fetchCertifications(filters));
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this certification record?')) return;
    await dispatch(deleteCertification(id));
  };

  const openEdit = (c) => {
    setEditId(c._id);
    setForm({
      staffId: c.staff?._id || '', name: c.name, category: c.category, issuedBy: c.issuedBy || '',
      issueDate: c.issueDate ? c.issueDate.split('T')[0] : '', expiryDate: c.expiryDate ? c.expiryDate.split('T')[0] : '',
      credentialId: c.credentialId || '', isRequired: !!c.isRequired, notes: c.notes || '',
    });
    setShowForm(true);
  };

  const getStatus = (c) => {
    if (!c.expiryDate) return 'valid';
    const exp = new Date(c.expiryDate);
    if (exp < new Date()) return 'expired';
    if (exp < new Date(Date.now() + 30 * 86400000)) return 'expiring_soon';
    return 'valid';
  };

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>Certifications</h1>
        <button className="btn-primary" onClick={() => { setEditId(null); setForm({ staffId: '', name: '', category: 'teaching_license', issuedBy: '', issueDate: '', expiryDate: '', credentialId: '', isRequired: false, notes: '' }); setShowForm(true); }}>
          + Add Certification
        </button>
      </div>

      {error && <div className="hr-error">{error}</div>}

      <div className="hr-toolbar">
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
        <select value={filters.expiring} onChange={(e) => setFilters({ ...filters, expiring: e.target.value })}>
          <option value="">All</option>
          <option value="true">Expiring Soon</option>
        </select>
      </div>

      {loading ? (
        <div className="hr-loading">Loading...</div>
      ) : certs.length === 0 ? (
        <div className="hr-empty"><h3>No certifications found</h3></div>
      ) : (
        <table className="hr-table">
          <thead>
            <tr><th>Employee</th><th>Certification</th><th>Category</th><th>Issued By</th><th>Expiry</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {certs.map((c) => {
              const status = getStatus(c);
              return (
                <tr key={c._id}>
                  <td>{c.staff?.user?.firstName} {c.staff?.user?.lastName}</td>
                  <td>{c.name}{c.isRequired && <span style={{ color: 'var(--accent-red)', marginLeft: 4 }}>*</span>}</td>
                  <td style={{ textTransform: 'capitalize' }}>{c.category?.replace('_', ' ')}</td>
                  <td>{c.issuedBy || '—'}</td>
                  <td>{c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : 'N/A'}</td>
                  <td><span className={`hr-badge ${status}`}>{status.replace('_', ' ')}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn-danger btn-sm" onClick={() => handleDelete(c._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="hr-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editId ? 'Edit' : 'Add'} Certification</h2>
            <form onSubmit={handleSubmit}>
              {!editId && (
                <div className="hr-form-group">
                  <label>Staff Profile ID</label>
                  <input required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} placeholder="Staff profile ObjectId" />
                </div>
              )}
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Certification Name</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="hr-form-group">
                  <label>Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="hr-form-group">
                <label>Issued By</label>
                <input value={form.issuedBy} onChange={(e) => setForm({ ...form, issuedBy: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Issue Date</label>
                  <input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                </div>
                <div className="hr-form-group">
                  <label>Expiry Date</label>
                  <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                </div>
              </div>
              <div className="hr-form-group">
                <label>Credential ID</label>
                <input value={form.credentialId} onChange={(e) => setForm({ ...form, credentialId: e.target.value })} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <input type="checkbox" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} />
                Required Certification
              </label>
              <div className="hr-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editId ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CertificationsPage;
