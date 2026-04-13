import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchInvoice, issueInvoice, cancelInvoice, recordPayment,
  selectCurrentInvoice, selectCurrentInvoicePayments, selectFinanceLoading, selectFinanceError
} from '../../store/slices/financeSlice';
import '../finance/Finance.css';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'check', 'online', 'other'];

const InvoiceDetailPage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const invoice = useSelector(selectCurrentInvoice);
  const payments = useSelector(selectCurrentInvoicePayments);
  const loading = useSelector(selectFinanceLoading);
  const error = useSelector(selectFinanceError);

  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', reference: '' });

  useEffect(() => { dispatch(fetchInvoice(id)); }, [dispatch, id]);

  const handleIssue = async () => {
    if (!window.confirm('Issue this invoice?')) return;
    await dispatch(issueInvoice(id));
    dispatch(fetchInvoice(id));
  };

  const handleCancel = async () => {
    const reason = window.prompt('Cancellation reason:');
    if (!reason) return;
    await dispatch(cancelInvoice({ id, reason }));
    dispatch(fetchInvoice(id));
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    await dispatch(recordPayment({ invoiceId: id, amount: Number(payForm.amount), method: payForm.method, reference: payForm.reference }));
    setShowPayment(false);
    setPayForm({ amount: '', method: 'cash', reference: '' });
    dispatch(fetchInvoice(id));
  };

  if (loading) return <div className="finance-page"><div className="finance-loading"><div className="finance-spinner" /></div></div>;
  if (!invoice) return <div className="finance-page"><div className="finance-empty"><h3>Invoice not found</h3></div></div>;

  const canPay = ['issued', 'partially-paid', 'overdue'].includes(invoice.status);

  return (
    <div className="finance-page">
      <div className="finance-header">
        <div>
          <button className="btn-secondary btn-sm" onClick={() => navigate('/portal/finance/invoices')} style={{ marginBottom: 8 }}>← Back</button>
          <h1>Invoice {invoice.invoiceNumber}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {invoice.status === 'draft' && <button className="btn-success" onClick={handleIssue}>Issue Invoice</button>}
          {canPay && <button className="btn-primary" onClick={() => setShowPayment(true)}>Record Payment</button>}
          {['draft', 'issued', 'partially-paid'].includes(invoice.status) && <button className="btn-danger" onClick={handleCancel}>Cancel</button>}
        </div>
      </div>

      {error && <div className="finance-error">{error}</div>}

      <div className="invoice-detail-grid">
        <div className="invoice-meta">
          <div><strong>Student:</strong> {invoice.student?.firstName} {invoice.student?.lastName}</div>
          <div><strong>Status:</strong> <span className={`finance-badge ${invoice.status}`}>{invoice.status?.replace('-', ' ')}</span></div>
          <div><strong>Academic Year:</strong> {invoice.academicYear}</div>
          {invoice.term && <div><strong>Term:</strong> {invoice.term}</div>}
          <div><strong>Due Date:</strong> {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}</div>
          <div><strong>Created:</strong> {new Date(invoice.createdAt).toLocaleDateString()}</div>
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>Line Items</h3>
      <table className="finance-table invoice-items-table">
        <thead>
          <tr><th>Description</th><th>Amount</th><th>Discount</th><th>Net</th></tr>
        </thead>
        <tbody>
          {invoice.items?.map((item, i) => (
            <tr key={i}>
              <td>{item.description}</td>
              <td className="amount">{item.amount?.toLocaleString()}</td>
              <td className="amount">{item.discount ? item.discount.toLocaleString() : '—'}</td>
              <td className="amount">{item.net?.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2}></td><td><strong>Subtotal</strong></td><td className="amount"><strong>{invoice.totalAmount?.toLocaleString()}</strong></td></tr>
          {invoice.discountAmount > 0 && <tr><td colSpan={2}></td><td><strong>Discount</strong></td><td className="amount">-{invoice.discountAmount?.toLocaleString()}</td></tr>}
          <tr><td colSpan={2}></td><td><strong>Net Total</strong></td><td className="amount"><strong>{invoice.netAmount?.toLocaleString()}</strong></td></tr>
          <tr><td colSpan={2}></td><td><strong>Paid</strong></td><td className="amount">{invoice.paidAmount?.toLocaleString()}</td></tr>
          <tr><td colSpan={2}></td><td><strong>Balance</strong></td><td className="amount" style={{ color: invoice.balance > 0 ? 'var(--danger)' : 'var(--success)' }}><strong>{invoice.balance?.toLocaleString()}</strong></td></tr>
        </tfoot>
      </table>

      <h3 style={{ marginTop: 24 }}>Payment History</h3>
      {payments && payments.length > 0 ? (
        <table className="finance-table">
          <thead><tr><th>Receipt #</th><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p._id}>
                <td>{p.receiptNumber}</td>
                <td>{new Date(p.receivedAt).toLocaleDateString()}</td>
                <td className="amount">{p.amount?.toLocaleString()}</td>
                <td style={{ textTransform: 'capitalize' }}>{p.method?.replace('_', ' ')}</td>
                <td>{p.reference || '—'}</td>
                <td>{p.voided ? <span className="finance-badge cancelled">Voided</span> : <span className="finance-badge paid">Valid</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#666' }}>No payments recorded yet.</p>
      )}

      {showPayment && (
        <div className="finance-modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="finance-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Record Payment</h2>
            <p>Outstanding balance: <strong>{invoice.balance?.toLocaleString()}</strong></p>
            <form onSubmit={handlePayment}>
              <div className="finance-form-row">
                <div className="finance-form-group">
                  <label>Amount *</label>
                  <input type="number" min="0.01" max={invoice.balance} step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} required />
                </div>
                <div className="finance-form-group">
                  <label>Method *</label>
                  <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="finance-form-group">
                <label>Reference / Transaction ID</label>
                <input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="Optional" />
              </div>
              <div className="finance-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowPayment(false)}>Cancel</button>
                <button type="submit" className="btn-success">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetailPage;
