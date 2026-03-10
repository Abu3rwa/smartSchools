import React from 'react';
import { useTranslation } from 'react-i18next';

const InterventionQueueStats = ({ openCount, highRiskCount }) => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="intervention-stats">
            <div className="stat-card">
                <div className="stat-value">{openCount}</div>
                <div className="stat-label">{t('interventions:stats.openCases')}</div>
            </div>
            <div className="stat-card high">
                <div className="stat-value">{highRiskCount}</div>
                <div className="stat-label">{t('interventions:stats.highRisk')}</div>
            </div>
        </div>
    );
};

export default InterventionQueueStats;
