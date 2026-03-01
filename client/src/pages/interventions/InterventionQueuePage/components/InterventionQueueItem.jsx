import React from 'react';
import { HiOutlineRefresh, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import { formatDate } from '../utils/interventionQueuePresentation';

const InterventionQueueItem = ({ item, onAction, actionLoading }) => {
    return (
        <div className="card intervention-item">
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
                        onClick={() => onAction(item._id, 'acknowledge')}
                    >
                        <HiOutlineRefresh size={16} />
                        <span>Acknowledge</span>
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={actionLoading}
                        onClick={() => onAction(item._id, 'resolve')}
                    >
                        <HiOutlineCheck size={16} />
                        <span>Resolve</span>
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={actionLoading}
                        onClick={() => onAction(item._id, 'dismiss')}
                    >
                        <HiOutlineX size={16} />
                        <span>Dismiss</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default InterventionQueueItem;
