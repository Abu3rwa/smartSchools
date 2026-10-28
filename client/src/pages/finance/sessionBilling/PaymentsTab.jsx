import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../config/api';
import toast from 'react-hot-toast';
import {
    Badge,
    EmptyState,
    Icon,
    KpiCard,
    Modal,
    PersonAvatar,
    Skeleton
} from './ui';
import { money, niceDate } from './utils';

const methodLabel = (method) => ({
    cash: 'Cash',
    'bank-transfer': 'Bank transfer',
    cheque: 'Cheque',
    online: 'Online',
    other: 'Other'
}[method] || method || '—');

const PaymentsTab = ({
    range,
    filters,
    refreshKey,
    onRecordPayment,
    onRefund,
    onAdjustment,
    onOpenReceipt,
    onMutated
}) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [method, setMethod] = useState('');
    const [status, setStatus] = useState('active');
    const [voidTarget, setVoidTarget] = useState(null);
    const [reason, setReason] = useState('');
    const [voiding, setVoiding] = useState(false);

    const params = useMemo(() => ({
        ...range,
        ...filters,
        status,
        ...(method ? { method } : {})
    }), [range, filters, status, method]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/finance/billing/payments', { params });
            setData(response.data?.data || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load payments.');
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => { load(); }, [load, refreshKey]);

    const currency = data?.currency || 'USD';
    const payments = data?.payments || [];

    const confirmVoid = async () => {
        if (!voidTarget) return;
        setVoiding(true);
        try {
            await api.post(`/finance/billing/entries/${voidTarget.id}/void`, { reason });
            toast.success('Entry voided. Balances have been updated.');
            setVoidTarget(null);
            setReason('');
            load();
            onMutated?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not void this entry.');
        } finally {
            setVoiding(false);
        }
    };

    return (
        <div className="sb-tab">
            {!loading && data && (
                <div className="sb-kpi-grid sb-kpi-grid-four">
                    <KpiCard label="Received" value={data.totals.received} currency={currency} icon="money" tone="teal" hint={`${data.totals.count} entries in this period`} />
                    <KpiCard label="Refunded" value={data.totals.refunded} currency={currency} icon="refresh" tone="danger" hint="Money returned to families" delay={60} />
                    <KpiCard label="Net collected" value={data.totals.net} currency={currency} icon="check" tone="gold" hint="Received minus refunds" delay={120} />
                    <KpiCard label="Credit held" value={data.totals.creditHeld} currency={currency} icon="overview" tone="violet" hint={`${data.totals.unreferenced} payment${data.totals.unreferenced === 1 ? '' : 's'} without a reference`} delay={180} />
                </div>
            )}

            <div className="sb-toolbar">
                <div className="sb-chip-row">
                    <button className={`sb-chip ${status === 'active' ? 'is-active' : ''}`} onClick={() => setStatus('active')}>Active</button>
                    <button className={`sb-chip ${status === 'voided' ? 'is-active' : ''}`} onClick={() => setStatus('voided')}>Voided</button>
                </div>
                <div className="sb-toolbar-filters">
                    <select value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Payment method">
                        <option value="">All methods</option>
                        {(data?.paymentMethods || ['cash', 'bank-transfer', 'cheque', 'online', 'other']).map((value) => (
                            <option key={value} value={value}>{methodLabel(value)}</option>
                        ))}
                    </select>
                    <button className="btn-secondary btn-sm" onClick={() => onAdjustment()}>
                        <Icon name="refresh" size={14} /> Adjustment
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => onRefund()}>
                        <Icon name="money" size={14} /> Refund
                    </button>
                    <button className="btn-primary btn-sm" onClick={() => onRecordPayment()}>
                        <Icon name="plus" size={14} /> Record payment
                    </button>
                </div>
            </div>

            {error && <div className="finance-error">{error}</div>}

            <div className="sb-split">
                <section className="sb-card sb-table-card">
                    <header className="sb-card-head">
                        <div>
                            <span className="sb-eyebrow">Ledger</span>
                            <h2>Payments and refunds</h2>
                        </div>
                        {data && <Badge tone="neutral">{payments.length}</Badge>}
                    </header>
                    {loading ? <Skeleton rows={7} /> : payments.length === 0 ? (
                        <EmptyState icon="money" title="No payments in this period" body="Record a payment to see it here and on the student's account." />
                    ) : (
                        <div className="sb-table-wrap">
                            <table className="sb-table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Method</th>
                                        <th>Reference</th>
                                        <th>Date</th>
                                        <th className="num">Amount</th>
                                        <th>Receipt</th>
                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((payment) => (
                                        <tr key={payment.id} className={payment.kind === 'refund' ? 'is-refund' : ''}>
                                            <td>
                                                <div className="sb-person-cell sb-person-static">
                                                    <PersonAvatar name={payment.studentName} size={30} />
                                                    <span>
                                                        <strong>{payment.studentName}</strong>
                                                        <small>{payment.recordedByName || 'Staff'}</small>
                                                    </span>
                                                </div>
                                            </td>
                                            <td>{payment.kind === 'refund' ? <Badge tone="warning">Refund</Badge> : methodLabel(payment.method)}</td>
                                            <td className={payment.reference ? '' : 'sb-muted'}>{payment.reference || 'No reference'}</td>
                                            <td>{niceDate(payment.occurredAt)}</td>
                                            <td className={`num ${payment.kind === 'refund' ? 'negative' : 'positive'}`}>
                                                {payment.kind === 'refund' ? '−' : '+'} {money(payment.amount, currency)}
                                            </td>
                                            <td>
                                                {payment.kind === 'payment' && (
                                                    payment.receiptStatus === 'sent'
                                                        ? <Badge tone="good">Sent {niceDate(payment.receiptSentAt)}</Badge>
                                                        : <Badge tone="neutral">Not sent</Badge>
                                                )}
                                            </td>
                                            <td className="sb-row-actions">
                                                {payment.kind === 'payment' && (
                                                    <button className="sb-icon-btn" onClick={() => onOpenReceipt(payment)} aria-label="Receipt">
                                                        <Icon name="mail" size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    className="sb-icon-btn"
                                                    onClick={() => { setVoidTarget(payment); setReason(''); }}
                                                    aria-label="Void entry"
                                                >
                                                    <Icon name="close" size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="sb-card">
                    <header className="sb-card-head">
                        <div>
                            <span className="sb-eyebrow">Mix</span>
                            <h2>How families paid</h2>
                        </div>
                    </header>
                    {(data?.methods || []).length === 0 ? (
                        <EmptyState title="Nothing to show" body="Payment methods appear once money is recorded." />
                    ) : (
                        <ul className="sb-method-list">
                            {data.methods.map((row) => {
                                const max = Math.max(1, ...data.methods.map((item) => item.received));
                                return (
                                    <li key={row.method}>
                                        <div className="sb-method-row">
                                            <strong>{methodLabel(row.method)}</strong>
                                            <span>{row.count} entr{row.count === 1 ? 'y' : 'ies'}</span>
                                            <em>{money(row.received, currency)}</em>
                                        </div>
                                        <div className="sb-method-track"><span style={{ width: `${(row.received / max) * 100}%` }} /></div>
                                        {row.refunded > 0 && <small>{money(row.refunded, currency)} refunded</small>}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {data && data.totals.packagesSold > 0 && (
                        <div className="sb-package-sold">
                            <Icon name="check" size={16} />
                            <div>
                                <strong>{money(data.totals.packagesSold, currency)}</strong>
                                <small>prepaid packages sold in this period</small>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <Modal
                open={Boolean(voidTarget)}
                title="Void this entry"
                eyebrow="Correction"
                onClose={() => setVoidTarget(null)}
                footer={(
                    <>
                        <button className="btn-secondary" onClick={() => setVoidTarget(null)}>Cancel</button>
                        <button className="btn-danger" onClick={confirmVoid} disabled={voiding || !reason.trim()}>
                            {voiding ? 'Voiding…' : 'Void entry'}
                        </button>
                    </>
                )}
            >
                {voidTarget && (
                    <div className="sb-void">
                        <p>
                            Voiding keeps the entry in the ledger for the audit trail but removes its effect on the balance.
                            The student's balance will be recalculated immediately.
                        </p>
                        <div className="sb-void-summary">
                            <span>{voidTarget.studentName}</span>
                            <strong>{voidTarget.kind === 'refund' ? '−' : '+'} {money(voidTarget.amount, currency)}</strong>
                            <small>{niceDate(voidTarget.occurredAt)} · {methodLabel(voidTarget.method)}</small>
                        </div>
                        <label className="sb-field">
                            <span>Reason</span>
                            <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Why is this entry being voided?" />
                        </label>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default PaymentsTab;
