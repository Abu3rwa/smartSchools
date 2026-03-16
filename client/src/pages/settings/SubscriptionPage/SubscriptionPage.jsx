import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../config/api';
import './SubscriptionPage.css';

const formatDate = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString();
};

const formatLimit = (value, unit = '') => {
    if (value === -1) return 'Unlimited';
    return `${value ?? 0}${unit}`;
};

const planBadgeClass = (plan = '') => `subscription-plan-badge ${String(plan).toLowerCase()}`;

const SubscriptionPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [subscription, setSubscription] = useState(null);

    useEffect(() => {
        const loadSubscription = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await api.get('/schools/me/subscription');
                setSubscription(response.data?.data || null);
            } catch (requestError) {
                setError(requestError.response?.data?.message || 'Failed to load subscription details');
            } finally {
                setLoading(false);
            }
        };

        loadSubscription();
    }, []);

    const usageItems = useMemo(() => {
        if (!subscription) return [];

        return [
            {
                label: 'Students',
                usage: subscription.usage?.currentStudents ?? 0,
                limit: subscription.limits?.maxStudents ?? 0,
                unit: ''
            },
            {
                label: 'Teachers',
                usage: subscription.usage?.currentTeachers ?? 0,
                limit: subscription.limits?.maxTeachers ?? 0,
                unit: ''
            },
            {
                label: 'Classes',
                usage: subscription.usage?.currentClasses ?? 0,
                limit: subscription.limits?.maxClasses ?? 0,
                unit: ''
            },
            {
                label: 'Storage',
                usage: subscription.usage?.currentStorage ?? 0,
                limit: subscription.limits?.maxStorage ?? 0,
                unit: ' MB'
            }
        ];
    }, [subscription]);

    if (loading) {
        return (
            <div className="subscription-page">
                <div className="card"><p>Loading subscription details...</p></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="subscription-page">
                <div className="card">
                    <h2>Subscription</h2>
                    <p className="error-text">{error}</p>
                </div>
            </div>
        );
    }

    if (!subscription) {
        return (
            <div className="subscription-page">
                <div className="card"><p>No subscription data found.</p></div>
            </div>
        );
    }

    return (
        <div className="subscription-page">
            <div className="page-header">
                <div>
                    <h1>Subscription</h1>
                    <p className="text-muted">Billing status, limits, and enabled features</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/portal/settings')}>
                    Back to settings
                </button>
            </div>

            <div className="card subscription-summary-card">
                <div className="subscription-summary-top">
                    <div>
                        <p className="summary-label">Current plan</p>
                        <h2>{subscription.plan || 'starter'}</h2>
                    </div>
                    <span className={planBadgeClass(subscription.plan)}>{subscription.plan || 'starter'}</span>
                    <span className={`subscription-status-badge ${String(subscription.status || '').toLowerCase()}`}>
                        {subscription.status || 'inactive'}
                    </span>
                </div>

                <div className="subscription-period-grid">
                    <div>
                        <span className="summary-label">Billing interval</span>
                        <strong>{subscription.billingInterval || 'monthly'}</strong>
                    </div>
                    <div>
                        <span className="summary-label">Current period start</span>
                        <strong>{formatDate(subscription.currentPeriodStart)}</strong>
                    </div>
                    <div>
                        <span className="summary-label">Current period end</span>
                        <strong>{formatDate(subscription.currentPeriodEnd)}</strong>
                    </div>
                    <div>
                        <span className="summary-label">Days remaining</span>
                        <strong>{subscription.daysRemaining ?? 'N/A'}</strong>
                    </div>
                </div>

                <div className="subscription-cta-row">
                    <button type="button" className="btn btn-primary" onClick={() => navigate('/portal/settings')}>
                        Request upgrade
                    </button>
                    <a className="btn btn-secondary" href="mailto:support@gradebook.local">Contact support</a>
                </div>
            </div>

            <div className="subscription-grid">
                <div className="card">
                    <h3>Usage</h3>
                    <ul className="usage-list">
                        {usageItems.map((item) => {
                            const isUnlimited = item.limit === -1;
                            const percent = isUnlimited || item.limit <= 0
                                ? 0
                                : Math.min(100, Math.round((item.usage / item.limit) * 100));

                            return (
                                <li key={item.label}>
                                    <div className="usage-row">
                                        <span>{item.label}</span>
                                        <span>{item.usage}{item.unit} / {formatLimit(item.limit, item.unit)}</span>
                                    </div>
                                    <div className="usage-track">
                                        <div style={{ width: `${percent}%` }} className="usage-fill" />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="card">
                    <h3>Features</h3>
                    <ul className="feature-list">
                        {Object.entries(subscription.features || {}).map(([key, enabled]) => (
                            <li key={key} className={enabled ? 'enabled' : 'locked'}>
                                <span>{key}</span>
                                <strong>{enabled ? 'Enabled' : 'Locked'}</strong>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="card">
                <h3>Invoice history</h3>
                {!Array.isArray(subscription.invoices) || subscription.invoices.length === 0
                    ? <p className="text-muted">No invoices available yet.</p>
                    : (
                        <table className="subscription-invoice-table">
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {subscription.invoices.map((invoice) => (
                                    <tr key={invoice._id || invoice.number}>
                                        <td>{invoice.number || '-'}</td>
                                        <td>{invoice.amount} {invoice.currency || 'USD'}</td>
                                        <td>{invoice.status || '-'}</td>
                                        <td>{formatDate(invoice.createdAt || invoice.paidAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </div>
        </div>
    );
};

export default SubscriptionPage;
