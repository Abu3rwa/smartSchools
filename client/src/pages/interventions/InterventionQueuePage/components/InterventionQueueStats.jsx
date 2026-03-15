import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineUserGroup, HiOutlineExclamationCircle } from 'react-icons/hi';

const InterventionQueueStats = ({ openCount, highRiskCount }) => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="intervention-stats">
            <div className="stat-card">
                <div className="stat-card-icon icon-blue">
                    <HiOutlineUserGroup size={24} />
                </div>
                <div className="stat-card-content">
                    <div className="stat-value">{openCount}</div>
                    <div className="stat-label">{t('interventions:stats.openCases')}</div>
                </div>
            </div>
            <div className="stat-card">
                <div className="stat-card-icon icon-red">
                    <HiOutlineExclamationCircle size={24} />
                </div>
                <div className="stat-card-content">
                    <div className="stat-value">{highRiskCount}</div>
                    <div className="stat-label">{t('interventions:stats.highRisk')}</div>
                </div>
            </div>
        </div>
    );
};

export default InterventionQueueStats;
