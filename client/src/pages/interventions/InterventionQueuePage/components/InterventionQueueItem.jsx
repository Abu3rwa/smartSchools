import React from 'react';
import { HiOutlineRefresh, HiOutlineCheck, HiOutlineX, HiOutlineTrendingUp, HiOutlineCalendar, HiOutlineBadgeCheck, HiOutlineLightBulb, HiOutlineUserCircle } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../utils/interventionQueuePresentation';
import { formatStandardLabel } from '../../../../utils/standardLabel';

const InterventionQueueItem = ({ item, onAction, actionLoading }) => {
    const { t } = useTranslation(['interventions']);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'resolved': return <HiOutlineCheck size={14} />;
            case 'dismissed': return <HiOutlineX size={14} />;
            default: return <HiOutlineBadgeCheck size={14} />;
        }
    };

    return (
        <div className={`intervention-item-card glass ${item.riskLevel}`}>
            <div className="item-header">
                <div className="student-info-area">
                    <div className="student-avatar-placeholder">
                        <HiOutlineUserCircle size={40} />
                    </div>
                    <div className="student-details">
                        <h3 className="student-name">
                            {item.student?.firstName} {item.student?.lastName}
                            <span className={`status-badge status-${item.status}`}>
                                {getStatusIcon(item.status)}
                                {t(`interventions:status.${item.status}`, { defaultValue: item.status })}
                            </span>
                        </h3>
                        <p className="item-standard">
                            <span className="standard-tag">{formatStandardLabel(item.standard) || t('interventions:item.standardFallback')}</span>
                        </p>
                    </div>
                </div>
                <div className="risk-indicator">
                    <div className={`risk-level-badge risk-${item.riskLevel}`}>
                        <HiOutlineTrendingUp size={16} />
                        <span>
                            {t(`interventions:risk.${item.riskLevel || 'unknown'}`, {
                                defaultValue: item.riskLevel || t('interventions:risk.unknown')
                            })}
                        </span>
                    </div>
                    <div className="risk-score">
                        <span className="score-label">{t('interventions:item.riskScore')}</span>
                        <span className="score-value">{item.riskScore ?? '--'}</span>
                    </div>
                </div>
            </div>

            <div className="item-body">
                <div className="meta-stats">
                    <div className="meta-stat">
                        <HiOutlineCalendar size={16} />
                        <div className="meta-stat-info">
                            <span className="meta-label">{t('interventions:item.updated')}</span>
                            <span className="meta-value">{formatDate(item.updatedAt)}</span>
                        </div>
                    </div>
                    <div className="meta-stat">
                        <HiOutlineBadgeCheck size={16} />
                        <div className="meta-stat-info">
                            <span className="meta-label">{t('interventions:item.accuracy')}</span>
                            <span className="meta-value">{item.signals?.recentAccuracy ?? '--'}%</span>
                        </div>
                    </div>
                </div>

                {Array.isArray(item.recommendedActions) && item.recommendedActions.length > 0 && (
                    <div className="recommendations-box">
                        <div className="recommendations-header">
                            <HiOutlineLightBulb size={18} className="bulb-icon" />
                            <strong>{t('interventions:item.recommendedActions')}</strong>
                        </div>
                        <ul className="recommendations-list">
                            {item.recommendedActions.slice(0, 3).map((actionText) => (
                                <li key={actionText}>{actionText}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {['open', 'acknowledged', 'in_progress'].includes(item.status) && (
                <div className="item-actions">
                    <button
                        type="button"
                        className="action-btn btn-outline"
                        disabled={actionLoading}
                        onClick={() => onAction(item._id, 'acknowledge')}
                        title={t('interventions:actions.acknowledge')}
                    >
                        <HiOutlineRefresh className={actionLoading ? 'animate-spin' : ''} size={18} />
                        <span>{t('interventions:actions.acknowledge')}</span>
                    </button>
                    <button
                        type="button"
                        className="action-btn btn-outline"
                        disabled={actionLoading}
                        onClick={() => onAction(item._id, 'dismiss')}
                        title={t('interventions:actions.dismiss')}
                    >
                        <HiOutlineX size={18} />
                        <span>{t('interventions:actions.dismiss')}</span>
                    </button>
                    <button
                        type="button"
                        className="action-btn btn-success"
                        disabled={actionLoading}
                        onClick={() => onAction(item._id, 'resolve')}
                        title={t('interventions:actions.resolve')}
                    >
                        <HiOutlineCheck size={18} />
                        <span>{t('interventions:actions.resolve')}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default InterventionQueueItem;
