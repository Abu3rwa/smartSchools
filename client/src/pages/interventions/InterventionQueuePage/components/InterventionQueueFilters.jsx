import React from 'react';
import { useTranslation } from 'react-i18next';

const InterventionQueueFilters = ({ filters, onFilterChange }) => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="intervention-filters card">
            <label>
                {t('interventions:filters.status')}
                <select
                    value={filters.status}
                    onChange={(e) => onFilterChange((prev) => ({ ...prev, status: e.target.value }))}
                >
                    <option value="open">{t('interventions:status.open')}</option>
                    <option value="resolved">{t('interventions:status.resolved')}</option>
                    <option value="dismissed">{t('interventions:status.dismissed')}</option>
                </select>
            </label>

            <label>
                {t('interventions:filters.risk')}
                <select
                    value={filters.riskLevel}
                    onChange={(e) => onFilterChange((prev) => ({ ...prev, riskLevel: e.target.value }))}
                >
                    <option value="">{t('interventions:common.all')}</option>
                    <option value="high">{t('interventions:risk.high')}</option>
                    <option value="medium">{t('interventions:risk.medium')}</option>
                    <option value="low">{t('interventions:risk.low')}</option>
                </select>
            </label>
        </div>
    );
};

export default InterventionQueueFilters;
