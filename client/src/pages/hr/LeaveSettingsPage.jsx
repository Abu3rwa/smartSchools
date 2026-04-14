import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchLeaveTypes, selectLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  selectHRLoading, selectHRError,
} from '../../store/slices/hrSlice';
import './HR.css';

const STAFF_TYPES = [
  'teacher','admin','support','counselor','librarian','nurse','driver',
  'security','maintenance','accountant','receptionist','lab_technician','it_support','cafeteria','other',
];

const blankForm = {
  name: '', nameAr: '', code: '', description: '', color: '#3B82F6',
  daysPerYear: 21, carryOver: false, maxCarryDays: 0,
  paidPercentage: 100, requiresDocument: false, minDaysNotice: 1,
  maxConsecutiveDays: 30, allowHalfDay: true, allowNegativeBalance: false,
  appliesTo: [], genderRestriction: '', requiresApproval: true,
  autoApprove: false, approvalLevels: 1, order: 0,
};

const LeaveSettingsPage = () => {
  const dispatch = useDispatch();
  const types = useSelector(selectLeaveTypes);
  const loading = useSelector(selectHRLoading);
  const error = useSelector(selectHRError);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...blankForm });

  useEffect(() => { dispatch(fetchLeaveTypes()); }, [dispatch]);

  const openCreate = () => { setEditId(null); setForm({ ...blankForm }); setShowForm(true); };
  const openEdit = (t) => {
    setEditId(t._id);
    setForm({
      name: t.name || '', nameAr: t.nameAr || '', code: t.code || '', description: t.description || '',
      color: t.color || '#3B82F6', daysPerYear: t.daysPerYear ?? 21, carryOver: !!t.carryOver,
      maxCarryDays: t.maxCarryDays || 0, paidPercentage: t.paidPercentage ?? 100,
      requiresDocument: !!t.requiresDocument, minDaysNotice: t.minDaysNotice ?? 1,
      maxConsecutiveDays: t.maxConsecutiveDays ?? 30, allowHalfDay: t.allowHalfDay !== false,
      allowNegativeBalance: !!t.allowNegativeBalance, appliesTo: t.appliesTo || [],
      genderRestriction: t.genderRestriction || '', requiresApproval: t.requiresApproval !== false,
      autoApprove: !!t.autoApprove, approvalLevels: t.approvalLevels || 1, order: t.order || 0,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) {
      await dispatch(updateLeaveType({ id: editId, data: form }));
    } else {
      await dispatch(createLeaveType(form));
    }
    setShowForm(false);
    dispatch(fetchLeaveTypes());
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this leave type?')) return;
    await dispatch(deleteLeaveType(id));
  };

  const toggleAppliesTo = (type) => {
    setForm((f) => ({
      ...f,
      appliesTo: f.appliesTo.includes(type)
        ? f.appliesTo.filter((t) => t !== type)
        : [...f.appliesTo, type],
    }));
  };

  return (
    <div className="hr-page">
      <div className="hr-header">
        <h1>Leave Types & Settings</h1>
        <button className="btn-primary" onClick={openCreate}>+ Add Leave Type</button>
      </div>

      {error && <div className="hr-error">{error}</div>}

      {loading ? (
        <div className="hr-loading">Loading...</div>
      ) : types.length === 0 ? (
        <div className="hr-empty"><h3>No leave types configured</h3><p>Add leave types to enable leave management.</p></div>
      ) : (
        <table className="hr-table">
          <thead>
            <tr><th>Color</th><th>Name</th><th>Code</th><th>Days/Year</th><th>Carry Over</th><th>Paid %</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t._id}>
                <td><span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', background: t.color || '#ccc' }} /></td>
                <td>{t.name}</td>
                <td>{t.code || '—'}</td>
                <td>{t.daysPerYear}</td>
                <td>{t.carryOver ? `Yes (max ${t.maxCarryDays})` : 'No'}</td>
                <td>{t.paidPercentage}%</td>
                <td><span className={`hr-badge ${t.isActive ? 'active' : 'expired'}`}>{t.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn-secondary btn-sm" onClick={() => openEdit(t)}>Edit</button>
                    {t.isActive && <button className="btn-danger btn-sm" onClick={() => handleDelete(t._id)}>Deactivate</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="hr-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <h2>{editId ? 'Edit' : 'Create'} Leave Type</h2>
            <form onSubmit={handleSubmit}>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Name</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="hr-form-group">
                  <label>Name (Arabic)</label>
                  <input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
                </div>
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Code</label>
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. AL, SL" />
                </div>
                <div className="hr-form-group">
                  <label>Color</label>
                  <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                </div>
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Days Per Year</label>
                  <input type="number" min={0} value={form.daysPerYear} onChange={(e) => setForm({ ...form, daysPerYear: Number(e.target.value) })} />
                </div>
                <div className="hr-form-group">
                  <label>Paid Percentage</label>
                  <input type="number" min={0} max={100} value={form.paidPercentage} onChange={(e) => setForm({ ...form, paidPercentage: Number(e.target.value) })} />
                </div>
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Min Days Notice</label>
                  <input type="number" min={0} value={form.minDaysNotice} onChange={(e) => setForm({ ...form, minDaysNotice: Number(e.target.value) })} />
                </div>
                <div className="hr-form-group">
                  <label>Max Consecutive Days</label>
                  <input type="number" min={1} value={form.maxConsecutiveDays} onChange={(e) => setForm({ ...form, maxConsecutiveDays: Number(e.target.value) })} />
                </div>
              </div>
              <div className="hr-form-row">
                <div className="hr-form-group">
                  <label>Approval Levels (1-3)</label>
                  <input type="number" min={1} max={3} value={form.approvalLevels} onChange={(e) => setForm({ ...form, approvalLevels: Number(e.target.value) })} />
                </div>
                <div className="hr-form-group">
                  <label>Gender Restriction</label>
                  <select value={form.genderRestriction} onChange={(e) => setForm({ ...form, genderRestriction: e.target.value })}>
                    <option value="">None</option>
                    <option value="male">Male Only (Paternity)</option>
                    <option value="female">Female Only (Maternity)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                {[
                  ['carryOver', 'Carry Over'], ['allowHalfDay', 'Allow Half Day'], ['allowNegativeBalance', 'Allow Negative'],
                  ['requiresDocument', 'Requires Document'], ['requiresApproval', 'Requires Approval'], ['autoApprove', 'Auto Approve'],
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
              {form.carryOver && (
                <div className="hr-form-group">
                  <label>Max Carry Days</label>
                  <input type="number" min={0} value={form.maxCarryDays} onChange={(e) => setForm({ ...form, maxCarryDays: Number(e.target.value) })} />
                </div>
              )}
              <div className="hr-form-group">
                <label>Applies To (leave empty for all)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {STAFF_TYPES.map((st) => (
                    <label key={st} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                      <input type="checkbox" checked={form.appliesTo.includes(st)} onChange={() => toggleAppliesTo(st)} />
                      {st.replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>
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

export default LeaveSettingsPage;
