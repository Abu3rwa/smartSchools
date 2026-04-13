import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  fetchFinanceSummary, selectFinanceSummary, selectFinanceLoading, selectFinanceError
} from '../../store/slices/financeSlice';
import '../finance/Finance.css';

const fmtCurrency = (v) => {
  const n = Number(v) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const FinanceDashboardPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const summary = useSelector(selectFinanceSummary);
  const loading = useSelector(selectFinanceLoading);
  const error = useSelector(selectFinanceError);

  useEffect(() => { dispatch(fetchFinanceSummary()); }, [dispatch]);

  const s = summary?.summary || {};
  const byMethod = summary?.paymentsByMethod || [];
  const byCategory = summary?.revenueByCategory || [];

  return (
    <div className="finance-page">
      <div className="finance-header">
        <h1>Financial Dashboard</h1>
        <div className="finance-header-actions">
          <button className="btn-primary" onClick={() => navigate('/portal/finance/invoices')}>Invoices</button>
          <button className="btn-secondary" onClick={() => navigate('/portal/finance/payments')}>Payments</button>
        </div>
      </div>

      {error && <div className="finance-error">{error}</div>}

      {loading ? (
        <div className="finance-loading">Loading financial data...</div>
      ) : (
        <>
          {/* Stats */}
          <div className="finance-stats-grid">
            <div className="finance-stat-card">
              <div className="stat-label">Total Billed</div>
              <div className="stat-value">{fmtCurrency(s.totalBilled)}</div>
            </div>
            <div className="finance-stat-card">
              <div className="stat-label">Total Collected</div>
              <div className="stat-value positive">{fmtCurrency(s.totalPaid)}</div>
            </div>
            <div className="finance-stat-card">
              <div className="stat-label">Outstanding</div>
              <div className="stat-value warning">{fmtCurrency(s.totalOutstanding)}</div>
            </div>
            <div className="finance-stat-card">
              <div className="stat-label">Collection Rate</div>
              <div className={`stat-value ${(s.collectionRate || 0) >= 80 ? 'positive' : (s.collectionRate || 0) >= 50 ? 'warning' : 'negative'}`}>
                {s.collectionRate || 0}%
              </div>
            </div>
          </div>

          {/* Revenue by Category */}
          <div className="finance-chart-row">
            <div className="finance-card">
              <h3>Revenue by Category</h3>
              {byCategory.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No data yet</p>
              ) : (
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Discount</th>
                      <th className="text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((c) => (
                      <tr key={c._id || 'unknown'}>
                        <td style={{ textTransform: 'capitalize' }}>{c._id || 'Other'}</td>
                        <td className="text-right amount">{fmtCurrency(c.totalAmount)}</td>
                        <td className="text-right amount">{fmtCurrency(c.totalDiscount)}</td>
                        <td className="text-right amount">{fmtCurrency(c.netAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="finance-card">
              <h3>Payments by Method</h3>
              {byMethod.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No data yet</p>
              ) : (
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byMethod.map((m) => (
                      <tr key={m._id}>
                        <td style={{ textTransform: 'capitalize' }}>{m._id?.replace('-', ' ')}</td>
                        <td className="text-right amount">{fmtCurrency(m.total)}</td>
                        <td className="text-right">{m.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="finance-stats-grid">
            <div className="finance-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/portal/finance/fee-structures')}>
              <h3>Fee Structures</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Manage tuition fees, activity fees, and more</p>
            </div>
            <div className="finance-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/portal/finance/discounts')}>
              <h3>Discounts & Scholarships</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Manage discount rules and scholarship programs</p>
            </div>
            <div className="finance-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/portal/finance/invoices/generate')}>
              <h3>Bulk Invoice Generator</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Generate invoices for an entire class or grade</p>
            </div>
            <div className="finance-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/portal/finance/reports')}>
              <h3>Reports</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Outstanding balances and collection reports</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FinanceDashboardPage;
