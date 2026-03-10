import React from 'react';
import { HiOutlineRefresh, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../utils/interventionQueuePresentation';
import { formatStandardLabel } from '../../../../utils/standardLabel';

const InterventionQueueItem = ({ item, onAction, actionLoading }) => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="card intervention-item">
            <div className="intervention-item-main">
                <div>
                    <h3>
                        {item.student?.firstName} {item.student?.lastName}
                        <span className={`risk-pill risk-${item.riskLevel}`}>
                            {t(`interventions:risk.${item.riskLevel || 'unknown'}`, {
                                defaultValue: item.riskLevel || t('interventions:risk.unknown')
                            })}
                        </span>
                    </h3>
                    <p className="text-muted">
                        {formatStandardLabel(item.standard) || t('interventions:item.standardFallback')}
                    </p>
                </div>
                <div className="meta-grid">
                    <span>{t('interventions:item.status')}: {t(`interventions:status.${item.status}`, { defaultValue: item.status })}</span>
                    <span>{t('interventions:item.riskScore')}: {item.riskScore ?? t('interventions:common.empty')}</span>
                    <span>{t('interventions:item.updated')}: {formatDate(item.updatedAt)}</span>
                    <span>{t('interventions:item.accuracy')}: {item.signals?.recentAccuracy ?? t('interventions:common.empty')}%</span>
                </div>
            </div>

            {Array.isArray(item.recommendedActions) && item.recommendedActions.length > 0 && (
                <div className="recommendations">
                    <strong>{t('interventions:item.recommendedActions')}</strong>
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
                        <span>{t('interventions:actions.acknowledge')}</span>
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={actionLoading}
                        onClick={() => onAction(item._id, 'resolve')}
                    >
                        <HiOutlineCheck size={16} />
                        <span>{t('interventions:actions.resolve')}</span>
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={actionLoading}
                        onClick={() => onAction(item._id, 'dismiss')}
                    >
                        <HiOutlineX size={16} />
                        <span>{t('interventions:actions.dismiss')}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default InterventionQueueItem;
