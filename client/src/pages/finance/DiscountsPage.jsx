import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDiscounts, createDiscount, updateDiscount, deleteDiscount,
  selectDiscounts, selectFinanceError
} from '../../store/slices/financeSlice';
import '../finance/Finance.css';

const TYPES = ['percentage', 'fixed'];
const CATEGORIES = ['tuition', 'transport', 'activity', 'lab', 'registration', 'uniform', 'books', 'other'];
const EMPTY_FORM = { name: '', type: 'percentage', value: '', maxAmount: '', applicableFeeCategories: [] };

const DiscountsPage = () => {
  const dispatch = useDispatch();
  const discounts = useSelector(selectDiscounts);
  const error = useSelector(selectFinanceError);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { dispatch(fetchDiscounts()); }, [dispatch]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (d) => {
    setEditingId(d._id);
    setForm({ name: d.name, type: d.type, value: d.value, maxAmount: d.maxAmount || '', applicableFeeCategories: d.applicableFeeCategories || [] });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form, value: Number(form.value), maxAmount: form.maxAmount ? Number(form.maxAmount) : null };
    if (editingId) await dispatch(updateDiscount({ id: editingId, data: payload }));
    else await dispatch(createDiscount(payload));
    setShowModal(false);
    dispatch(fetchDiscounts());
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this discount rule?')) return;
    await dispatch(deleteDiscount(id));
  };

  const toggleCategory = (cat) => {
    setForm((prev) => {
      const cats = prev.applicableFeeCategories.includes(cat)
        ? prev.applicableFeeCategories.filter((c) => c !== cat)
        : [...prev.applicableFeeCategories, cat];
      return { ...prev, applicableFeeCategories: cats };
    });
  };

  return (
    <div className="finance-page">
      <div className="finance-header">
        <h1>Discounts & Scholarships</h1>
        <button className="btn-primary" onClick={openCreate}>+ New Discount</button>
      </div>

      {error && <div className="finance-error">{error}</div>}

      {discounts.length === 0 ? (
        <div className="finance-empty"><h3>No discount rules</h3><p>Create discounts for sibling, staff child, or scholarship programs.</p></div>
      ) : (
        <table className="finance-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Value</th><th>Max</th><th>Applies To</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {discounts.map((d) => (
              <tr key={d._id}>
                <td>{d.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{d.type}</td>
                <td className="amount">{d.type === 'percentage' ? `${d.value}%` : d.value.toLocaleString()}</td>
                <td className="amount">{d.maxAmount ? d.maxAmount.toLocaleString() : '—'}</td>
                <td>{d.applicableFeeCategories?.length ? d.applicableFeeCategories.join(', ') : 'All'}</td>
                <td><span className={`finance-badge ${d.isActive ? 'active' : 'cancelled'}`}>{d.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <button className="btn-secondary btn-sm" onClick={() => openEdit(d)}>Edit</button>{' '}
                  <button className="btn-danger btn-sm" onClick={() => handleDelete(d._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="finance-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="finance-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Edit Discount' : 'New Discount'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="finance-form-group">
                <label>Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="finance-form-row">
                <div className="finance-form-group">
                  <label>Type *</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="finance-form-group">
                  <label>{form.type === 'percentage' ? 'Percentage (%) *' : 'Fixed Amount *'}</label>
                  <input type="number" min="0" max={form.type === 'percentage' ? 100 : undefined} step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
                </div>
              </div>
              {form.type === 'percentage' && (
                <div className="finance-form-group">
                  <label>Maximum Discount Amount (cap)</label>
                  <input type="number" min="0" step="0.01" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} placeholder="No limit" />
                </div>
              )}
              <div className="finance-form-group">
                <label>Applicable Fee Categories (leave empty for all)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {CATEGORIES.map((cat) => (
                    <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', textTransform: 'capitalize' }}>
                      <input type="checkbox" checked={form.applicableFeeCategories.includes(cat)} onChange={() => toggleCategory(cat)} />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>
              <div className="finance-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingId ? 'Save' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscountsPage;
