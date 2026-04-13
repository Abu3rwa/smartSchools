import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  fetchInvoices, issueInvoice, cancelInvoice,
  selectInvoices, selectInvoicesPagination, selectFinanceLoading, selectFinanceError
} from '../../store/slices/financeSlice';
import '../finance/Finance.css';

const STATUS_OPTIONS = ['', 'draft', 'issued', 'partially-paid', 'paid', 'overdue', 'cancelled'];

const InvoiceListPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const invoices = useSelector(selectInvoices);
  const pagination = useSelector(selectInvoicesPagination);
  const loading = useSelector(selectFinanceLoading);
  const error = useSelector(selectFinanceError);

  const [filters, setFilters] = useState({ status: '', page: 1, limit: 20 });

  useEffect(() => { dispatch(fetchInvoices(filters)); }, [dispatch, filters]);

  const handleFilter = (key, val) => setFilters((p) => ({ ...p, [key]: val, page: 1 }));

  const handleIssue = async (id) => {
    if (!window.confirm('Issue this invoice? It will become payable.')) return;
    await dispatch(issueInvoice(id));
    dispatch(fetchInvoices(filters));
  };

  const handleCancel = async (id) => {
    const reason = window.prompt('Cancellation reason:');
    if (!reason) return;
    await dispatch(cancelInvoice({ id, reason }));
    dispatch(fetchInvoices(filters));
  };

  const totalPages = pagination?.pages || 1;

  return (
    <div className="finance-page">
      <div className="finance-header">
        <h1>Invoices</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={() => navigate('/portal/finance/invoices/generate')}>Bulk Generate</button>
        </div>
      </div>

      <div className="finance-filters">
        <select value={filters.status} onChange={(e) => handleFilter('status', e.target.value)}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
        </select>
      </div>

      {error && <div className="finance-error">{error}</div>}
      {loading && <div className="finance-loading"><div className="finance-spinner" /></div>}

      {!loading && invoices.length === 0 ? (
        <div className="finance-empty"><h3>No invoices found</h3><p>Generate invoices from fee structures or create individually.</p></div>
      ) : (
        <>
          <table className="finance-table">
            <thead>
              <tr><th>Invoice #</th><th>Student</th><th>Net Amount</th><th>Paid</th><th>Balance</th><th>Due Date</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id}>
                  <td><a onClick={() => navigate(`/portal/finance/invoices/${inv._id}`)} style={{ cursor: 'pointer', color: 'var(--primary)' }}>{inv.invoiceNumber}</a></td>
                  <td>{inv.student?.firstName} {inv.student?.lastName}</td>
                  <td className="amount">{inv.netAmount?.toLocaleString()}</td>
                  <td className="amount">{inv.paidAmount?.toLocaleString()}</td>
                  <td className="amount">{inv.balance?.toLocaleString()}</td>
                  <td>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                  <td><span className={`finance-badge ${inv.status}`}>{inv.status?.replace('-', ' ')}</span></td>
                  <td>
                    <button className="btn-secondary btn-sm" onClick={() => navigate(`/portal/finance/invoices/${inv._id}`)}>View</button>
                    {inv.status === 'draft' && <>{' '}<button className="btn-success btn-sm" onClick={() => handleIssue(inv._id)}>Issue</button></>}
                    {['draft', 'issued', 'partially-paid'].includes(inv.status) && <>{' '}<button className="btn-danger btn-sm" onClick={() => handleCancel(inv._id)}>Cancel</button></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="finance-pagination">
              <button disabled={filters.page <= 1} onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}>Previous</button>
              <span>Page {filters.page} of {totalPages}</span>
              <button disabled={filters.page >= totalPages} onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InvoiceListPage;
