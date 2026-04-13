import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  fetchFeeStructures, generateBulkInvoices,
  selectFeeStructures, selectBulkResult, selectFinanceLoading, selectFinanceError,
  clearBulkResult
} from '../../store/slices/financeSlice';
import '../finance/Finance.css';

const InvoiceGeneratorPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const feeStructures = useSelector(selectFeeStructures);
  const bulkResult = useSelector(selectBulkResult);
  const loading = useSelector(selectFinanceLoading);
  const error = useSelector(selectFinanceError);

  const [form, setForm] = useState({ feeStructureIds: [], classId: '', gradeLevel: '', dueDate: '', academicYear: new Date().getFullYear().toString(), term: '' });

  useEffect(() => { dispatch(fetchFeeStructures({ isActive: true })); return () => { dispatch(clearBulkResult()); }; }, [dispatch]);

  const toggleFee = (id) => {
    setForm((prev) => {
      const ids = prev.feeStructureIds.includes(id) ? prev.feeStructureIds.filter((f) => f !== id) : [...prev.feeStructureIds, id];
      return { ...prev, feeStructureIds: ids };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.classId) delete payload.classId;
    if (!payload.gradeLevel) delete payload.gradeLevel;
    if (!payload.term) delete payload.term;
    await dispatch(generateBulkInvoices(payload));
  };

  const selectedTotal = feeStructures.filter((f) => form.feeStructureIds.includes(f._id)).reduce((sum, f) => sum + f.amount, 0);

  return (
    <div className="finance-page">
      <div className="finance-header">
        <div>
          <button className="btn-secondary btn-sm" onClick={() => navigate('/portal/finance/invoices')} style={{ marginBottom: 8 }}>← Back to Invoices</button>
          <h1>Bulk Invoice Generator</h1>
        </div>
      </div>

      {error && <div className="finance-error">{error}</div>}

      {bulkResult ? (
        <div className="finance-success">
          <h3>Invoices Generated Successfully</h3>
          <p><strong>{bulkResult.count}</strong> invoices created.</p>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={() => navigate('/portal/finance/invoices')}>View Invoices</button>
            <button className="btn-secondary" onClick={() => dispatch(clearBulkResult())}>Generate More</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <h3>1. Select Fee Structures</h3>
          {feeStructures.length === 0 ? (
            <p style={{ color: '#666' }}>No active fee structures. <a onClick={() => navigate('/portal/finance/fee-structures')} style={{ cursor: 'pointer', color: 'var(--primary)' }}>Create one first</a>.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12, marginBottom: 24 }}>
              {feeStructures.map((f) => (
                <label key={f._id} className="finance-card" style={{ cursor: 'pointer', border: form.feeStructureIds.includes(f._id) ? '2px solid var(--primary)' : '2px solid transparent', padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.feeStructureIds.includes(f._id)} onChange={() => toggleFee(f._id)} />
                    <div>
                      <strong>{f.name}</strong>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>{f.category} · {f.frequency} · {f.amount?.toLocaleString()}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
          {form.feeStructureIds.length > 0 && <p><strong>Selected total per student:</strong> {selectedTotal.toLocaleString()}</p>}

          <h3>2. Target Students</h3>
          <div className="finance-form-row">
            <div className="finance-form-group">
              <label>Grade Level</label>
              <input value={form.gradeLevel} onChange={(e) => setForm({ ...form, gradeLevel: e.target.value })} placeholder="e.g. 5" />
            </div>
            <div className="finance-form-group">
              <label>Class ID (specific class)</label>
              <input value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} placeholder="Leave empty for all in grade" />
            </div>
          </div>

          <h3>3. Invoice Details</h3>
          <div className="finance-form-row">
            <div className="finance-form-group">
              <label>Due Date *</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
            </div>
            <div className="finance-form-group">
              <label>Academic Year *</label>
              <input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} required />
            </div>
            <div className="finance-form-group">
              <label>Term</label>
              <input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="Optional" />
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <button type="submit" className="btn-primary" disabled={loading || form.feeStructureIds.length === 0}>
              {loading ? 'Generating...' : 'Generate Invoices'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default InvoiceGeneratorPage;
