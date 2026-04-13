import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchPayments, voidPayment,
  selectPayments, selectPaymentsPagination, selectFinanceLoading, selectFinanceError
} from '../../store/slices/financeSlice';
import '../finance/Finance.css';

const PaymentsPage = () => {
  const dispatch = useDispatch();
  const payments = useSelector(selectPayments);
  const pagination = useSelector(selectPaymentsPagination);
  const loading = useSelector(selectFinanceLoading);
  const error = useSelector(selectFinanceError);

  const [filters, setFilters] = useState({ page: 1, limit: 20 });

  useEffect(() => { dispatch(fetchPayments(filters)); }, [dispatch, filters]);

  const handleVoid = async (id) => {
    const reason = window.prompt('Reason for voiding this payment:');
    if (!reason) return;
    await dispatch(voidPayment({ id, reason }));
    dispatch(fetchPayments(filters));
  };

  const totalPages = pagination?.pages || 1;

  return (
    <div className="finance-page">
      <div className="finance-header">
        <h1>Payments</h1>
      </div>

      {error && <div className="finance-error">{error}</div>}
      {loading && <div className="finance-loading"><div className="finance-spinner" /></div>}

      {!loading && payments.length === 0 ? (
        <div className="finance-empty"><h3>No payments recorded</h3><p>Payments appear here once recorded against invoices.</p></div>
      ) : (
        <>
          <table className="finance-table">
            <thead>
              <tr><th>Receipt #</th><th>Student</th><th>Invoice #</th><th>Amount</th><th>Method</th><th>Date</th><th>Reference</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p._id}>
                  <td>{p.receiptNumber}</td>
                  <td>{p.student?.firstName} {p.student?.lastName}</td>
                  <td>{p.invoice?.invoiceNumber || '—'}</td>
                  <td className="amount">{p.amount?.toLocaleString()}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.method?.replace('_', ' ')}</td>
                  <td>{new Date(p.receivedAt).toLocaleDateString()}</td>
                  <td>{p.reference || '—'}</td>
                  <td>{p.voided ? <span className="finance-badge cancelled">Voided</span> : <span className="finance-badge paid">Valid</span>}</td>
                  <td>
                    {!p.voided && <button className="btn-danger btn-sm" onClick={() => handleVoid(p._id)}>Void</button>}
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

export default PaymentsPage;
