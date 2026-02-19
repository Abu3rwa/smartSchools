import { useEffect, useMemo, useState } from 'react';
import { HiOutlineExclamationCircle, HiOutlineRefresh, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import api from '../config/api';
import './InterventionQueuePage.css';

const riskOrder = { high: 3, medium: 2, low: 1 };

const InterventionQueuePage = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [featureEnabled, setFeatureEnabled] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ status: 'open', riskLevel: '' });

    const loadQueue = async () => {
        setLoading(true);
        setError('');
        try {
            const params = { status: filters.status, limit: 50 };
            if (filters.riskLevel) params.riskLevel = filters.riskLevel;
            const response = await api.get('/interventions/queue', { params });
            setItems(response.data?.data?.items || []);
            setFeatureEnabled(Boolean(response.data?.data?.featureEnabled));
        } catch (err) {
            setItems([]);
            setError(err.response?.data?.message || 'Failed to load intervention queue');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadQueue();
    }, [filters.status, filters.riskLevel]);

    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            const diff = (riskOrder[b.riskLevel] || 0) - (riskOrder[a.riskLevel] || 0);
            if (diff !== 0) return diff;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
    }, [items]);

    const runAction = async (caseId, actionType) => {
        setActionLoading(true);
        try {
            if (actionType === 'acknowledge') {
                await api.post(`/interventions/${caseId}/acknowledge`);
            } else if (actionType === 'resolve') {
                const note = window.prompt('Resolution note (optional):', '') || '';
                await api.post(`/interventions/${caseId}/resolve`, { note });
            } else if (actionType === 'dismiss') {
                const note = window.prompt('Dismiss note (optional):', '') || '';
                await api.post(`/interventions/${caseId}/dismiss`, { note });
            }
            await loadQueue();
        } catch (err) {
            setError(err.response?.data?.message || 'Action failed, please try again');
        } finally {
            setActionLoading(false);
        }
    };

    const formatDate = (value) => {
        if (!value) return '—';
        return new Date(value).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const openCount = sortedItems.filter((item) => ['open', 'acknowledged', 'in_progress'].includes(item.status)).length;
    const highRiskCount = sortedItems.filter((item) => item.riskLevel === 'high').length;

    return (
        <div className="intervention-queue-page">
            <div className="page-header">
                <div>
                    <h1>Intervention Queue</h1>
                    <p className="text-muted">Track students who need targeted reteach and follow-up support.</p>
                </div>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={loadQueue}
                    disabled={loading || actionLoading}
                >
                    <HiOutlineRefresh size={16} />
                    <span>Refresh</span>
                </button>
            </div>

            {!featureEnabled ? (
                <div className="card intervention-empty">
                    <p className="text-muted">Intervention queue is currently disabled by feature flag.</p>
                </div>
            ) : (
                <>
                    <div className="intervention-stats">
                        <div className="stat-card">
                            <div className="stat-value">{openCount}</div>
                            <div className="stat-label">Open Cases</div>
                        </div>
                        <div className="stat-card high">
                            <div className="stat-value">{highRiskCount}</div>
                            <div className="stat-label">High Risk</div>
                        </div>
                    </div>

                    <div className="intervention-filters card">
                        <label>
                            Status
                            <select
                                value={filters.status}
                                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="open">Open</option>
                                <option value="resolved">Resolved</option>
                                <option value="dismissed">Dismissed</option>
                            </select>
                        </label>

                        <label>
                            Risk
                            <select
                                value={filters.riskLevel}
                                onChange={(e) => setFilters((prev) => ({ ...prev, riskLevel: e.target.value }))}
                            >
                                <option value="">All</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </label>
                    </div>

                    {loading ? (
                        <div className="loading-container">
                            <div className="spinner" />
                            <p>Loading intervention queue...</p>
                        </div>
                    ) : error ? (
                        <div className="card intervention-empty">
                            <HiOutlineExclamationCircle size={44} />
                            <p>{error}</p>
                        </div>
                    ) : sortedItems.length === 0 ? (
                        <div className="card intervention-empty">
                            <p className="text-muted">No cases found for the selected filters.</p>
                        </div>
                    ) : (
                        <div className="intervention-list">
                            {sortedItems.map((item) => (
                                <div key={item._id} className="card intervention-item">
                                    <div className="intervention-item-main">
                                        <div>
                                            <h3>
                                                {item.student?.firstName} {item.student?.lastName}
                                                <span className={`risk-pill risk-${item.riskLevel}`}>{item.riskLevel || 'unknown'}</span>
                                            </h3>
                                            <p className="text-muted">
                                                {item.standard?.code || 'Standard'}
                                                {item.standard?.name ? ` · ${item.standard.name}` : ''}
                                            </p>
                                        </div>
                                        <div className="meta-grid">
                                            <span>Status: {item.status}</span>
                                            <span>Risk Score: {item.riskScore ?? '—'}</span>
                                            <span>Updated: {formatDate(item.updatedAt)}</span>
                                            <span>Accuracy: {item.signals?.recentAccuracy ?? '—'}%</span>
                                        </div>
                                    </div>

                                    {Array.isArray(item.recommendedActions) && item.recommendedActions.length > 0 && (
                                        <div className="recommendations">
                                            <strong>Recommended Actions</strong>
                                            <ul>
                                                {item.recommendedActions.slice(0, 3).map((actionText) => (
                                                    <li key={actionText}>{actionText}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {['open', 'acknowledged', 'in_progress'].includes(item.status) && (
                                        <div className="actions">
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                disabled={actionLoading}
                                                onClick={() => runAction(item._id, 'acknowledge')}
                                            >
                                                <HiOutlineRefresh size={16} />
                                                <span>Acknowledge</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                disabled={actionLoading}
                                                onClick={() => runAction(item._id, 'resolve')}
                                            >
                                                <HiOutlineCheck size={16} />
                                                <span>Resolve</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                disabled={actionLoading}
                                                onClick={() => runAction(item._id, 'dismiss')}
                                            >
                                                <HiOutlineX size={16} />
                                                <span>Dismiss</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default InterventionQueuePage;