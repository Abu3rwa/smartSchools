import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchFeeStructures, createFeeStructure, updateFeeStructure, deleteFeeStructure,
  selectFeeStructures, selectFinanceLoading, selectFinanceError
} from '../../store/slices/financeSlice';
import '../finance/Finance.css';

const CATEGORIES = ['tuition', 'transport', 'activity', 'lab', 'registration', 'uniform', 'books', 'other'];
const FREQUENCIES = ['one-time', 'monthly', 'quarterly', 'semester', 'annual'];
const EMPTY_FORM = { name: '', category: 'tuition', amount: '', frequency: 'annual', academicYear: '', optional: false, description: '' };

const FeeStructuresPage = () => {
  const dispatch = useDispatch();
  const feeStructures = useSelector(selectFeeStructures);
  const loading = useSelector(selectFinanceLoading);
  const error = useSelector(selectFinanceError);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterCat, setFilterCat] = useState('');

  useEffect(() => { dispatch(fetchFeeStructures({ limit: 'all' })); }, [dispatch]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (fs) => {
    setEditingId(fs._id);
    setForm({ name: fs.name, category: fs.category, amount: fs.amount, frequency: fs.frequency, academicYear: fs.academicYear, optional: fs.optional, description: fs.description || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form, amount: Number(form.amount) };
    if (editingId) {
      await dispatch(updateFeeStructure({ id: editingId, data: payload }));
    } else {
      await dispatch(createFeeStructure(payload));
    }
    setShowModal(false);
    dispatch(fetchFeeStructures({ limit: 'all' }));
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this fee structure?')) return;
    await dispatch(deleteFeeStructure(id));
  };

  const filtered = filterCat ? feeStructures.filter((f) => f.category === filterCat) : feeStructures;

  return (
    <div className="finance-page">
      <div className="finance-header">
        <h1>Fee Structures</h1>
        <button className="btn-primary" onClick={openCreate}>+ New Fee</button>
      </div>

      {error && <div className="finance-error">{error}</div>}

      <div className="finance-filters">
        <div className="filter-group">
          <label>Category</label>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="finance-loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="finance-empty"><h3>No fee structures found</h3><p>Create your first fee structure to get started.</p></div>
      ) : (
        <table className="finance-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Frequency</th>
              <th>Academic Year</th>
              <th>Optional</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((fs) => (
              <tr key={fs._id}>
                <td>{fs.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{fs.category}</td>
                <td className="amount">{Number(fs.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ textTransform: 'capitalize' }}>{fs.frequency}</td>
                <td>{fs.academicYear}</td>
                <td>{fs.optional ? 'Yes' : 'No'}</td>
                <td><span className={`finance-badge ${fs.isActive ? 'active' : 'cancelled'}`}>{fs.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <button className="btn-secondary btn-sm" onClick={() => openEdit(fs)}>Edit</button>{' '}
                  {fs.isActive && <button className="btn-danger btn-sm" onClick={() => handleDelete(fs._id)}>Deactivate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="finance-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="finance-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Edit Fee Structure' : 'New Fee Structure'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="finance-form-group">
                <label>Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="finance-form-row">
                <div className="finance-form-group">
                  <label>Category *</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="finance-form-group">
                  <label>Amount *</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
              </div>
              <div className="finance-form-row">
                <div className="finance-form-group">
                  <label>Frequency *</label>
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                    {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="finance-form-group">
                  <label>Academic Year *</label>
                  <input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} placeholder="e.g. 2025-2026" required />
                </div>
              </div>
              <div className="finance-form-group">
                <label>Description</label>
                <textarea rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="finance-form-group">
                <label>
                  <input type="checkbox" checked={form.optional} onChange={(e) => setForm({ ...form, optional: e.target.checked })} style={{ marginRight: 8 }} />
                  Optional (elective fee)
                </label>
              </div>
              <div className="finance-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeeStructuresPage;
