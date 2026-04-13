import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchOutstandingReport, fetchStudentStatement,
  selectOutstandingReport, selectStudentStatement, selectFinanceLoading, selectFinanceError,
  clearStudentStatement
} from '../../store/slices/financeSlice';
import '../finance/Finance.css';

const FinanceReportsPage = () => {
  const dispatch = useDispatch();
  const outstanding = useSelector(selectOutstandingReport);
  const statement = useSelector(selectStudentStatement);
  const loading = useSelector(selectFinanceLoading);
  const error = useSelector(selectFinanceError);

  const [tab, setTab] = useState('outstanding');
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    if (tab === 'outstanding') dispatch(fetchOutstandingReport());
    return () => { dispatch(clearStudentStatement()); };
  }, [dispatch, tab]);

  const handleStatementSearch = (e) => {
    e.preventDefault();
    if (studentId.trim()) dispatch(fetchStudentStatement(studentId.trim()));
  };

  return (
    <div className="finance-page">
      <div className="finance-header">
        <h1>Finance Reports</h1>
      </div>

      <div className="finance-filters" style={{ marginBottom: 24 }}>
        <button className={`btn-${tab === 'outstanding' ? 'primary' : 'secondary'}`} onClick={() => setTab('outstanding')}>Outstanding Report</button>
        <button className={`btn-${tab === 'statement' ? 'primary' : 'secondary'}`} onClick={() => setTab('statement')}>Student Statement</button>
      </div>

      {error && <div className="finance-error">{error}</div>}
      {loading && <div className="finance-loading"><div className="finance-spinner" /></div>}

      {tab === 'outstanding' && !loading && (
        <>
          <h3>Outstanding Balances</h3>
          {outstanding && outstanding.length > 0 ? (
            <table className="finance-table">
              <thead><tr><th>Student</th><th>Grade</th><th>Invoices</th><th>Total Outstanding</th></tr></thead>
              <tbody>
                {outstanding.map((row, i) => (
                  <tr key={i}>
                    <td>{row.studentName || `${row.student?.firstName} ${row.student?.lastName}`}</td>
                    <td>{row.gradeLevel || '—'}</td>
                    <td>{row.invoiceCount || row.count}</td>
                    <td className="amount" style={{ color: 'var(--danger)' }}>{row.totalOutstanding?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="finance-empty"><h3>No outstanding balances</h3></div>
          )}
        </>
      )}

      {tab === 'statement' && (
        <>
          <h3>Student Financial Statement</h3>
          <form onSubmit={handleStatementSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Enter Student ID" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd' }} />
            <button type="submit" className="btn-primary" disabled={loading}>Search</button>
          </form>

          {statement && (
            <div>
              <div className="finance-stats-grid" style={{ marginBottom: 24 }}>
                <div className="finance-stat-card"><div className="stat-label">Total Billed</div><div className="stat-value">{statement.summary?.totalBilled?.toLocaleString() || 0}</div></div>
                <div className="finance-stat-card"><div className="stat-label">Total Paid</div><div className="stat-value success">{statement.summary?.totalPaid?.toLocaleString() || 0}</div></div>
                <div className="finance-stat-card"><div className="stat-label">Balance</div><div className="stat-value danger">{statement.summary?.balance?.toLocaleString() || 0}</div></div>
              </div>

              {statement.invoices?.length > 0 && (
                <>
                  <h4>Invoices</h4>
                  <table className="finance-table">
                    <thead><tr><th>Invoice #</th><th>Date</th><th>Net</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
                    <tbody>
                      {statement.invoices.map((inv) => (
                        <tr key={inv._id}>
                          <td>{inv.invoiceNumber}</td>
                          <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                          <td className="amount">{inv.netAmount?.toLocaleString()}</td>
                          <td className="amount">{inv.paidAmount?.toLocaleString()}</td>
                          <td className="amount">{inv.balance?.toLocaleString()}</td>
                          <td><span className={`finance-badge ${inv.status}`}>{inv.status?.replace('-', ' ')}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {statement.payments?.length > 0 && (
                <>
                  <h4 style={{ marginTop: 20 }}>Payments</h4>
                  <table className="finance-table">
                    <thead><tr><th>Receipt #</th><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
                    <tbody>
                      {statement.payments.map((p) => (
                        <tr key={p._id}>
                          <td>{p.receiptNumber}</td>
                          <td>{new Date(p.receivedAt).toLocaleDateString()}</td>
                          <td className="amount">{p.amount?.toLocaleString()}</td>
                          <td style={{ textTransform: 'capitalize' }}>{p.method?.replace('_', ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FinanceReportsPage;
