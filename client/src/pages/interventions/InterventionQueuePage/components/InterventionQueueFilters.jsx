import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineFilter, HiOutlineSearch } from 'react-icons/hi';

const InterventionQueueFilters = ({ filters, onFilterChange }) => {
    const { t } = useTranslation(['interventions']);

    return (
        <div className="intervention-filters card glass">
            <div className="filter-group">
                <div className="filter-item search-box">
                    <HiOutlineSearch className="search-icon" size={18} />
                    <input
                        type="text"
                        placeholder={t('interventions:filters.searchPlaceholder', { defaultValue: 'Search student...' })}
                        className="filter-input"
                        value={filters.search || ''}
                        onChange={(e) => onFilterChange((prev) => ({ ...prev, search: e.target.value }))}
                    />
                </div>
                
                <div className="filter-item">
                    <label className="filter-label">{t('interventions:filters.status')}</label>
                    <select
                        className="filter-select"
                        value={filters.status}
                        onChange={(e) => onFilterChange((prev) => ({ ...prev, status: e.target.value }))}
                    >
                        <option value="open">{t('interventions:status.open')}</option>
                        <option value="resolved">{t('interventions:status.resolved')}</option>
                        <option value="dismissed">{t('interventions:status.dismissed')}</option>
                    </select>
                </div>

                <div className="filter-item">
                    <label className="filter-label">{t('interventions:filters.risk')}</label>
                    <select
                        className="filter-select"
                        value={filters.riskLevel}
                        onChange={(e) => onFilterChange((prev) => ({ ...prev, riskLevel: e.target.value }))}
                    >
                        <option value="">{t('interventions:common.all')}</option>
                        <option value="high">{t('interventions:risk.high')}</option>
                        <option value="medium">{t('interventions:risk.medium')}</option>
                        <option value="low">{t('interventions:risk.low')}</option>
                    </select>
                </div>
            </div>
            <div className="filter-summary">
                <HiOutlineFilter size={16} />
                <span>{t('interventions:filters.showingResults')}</span>
            </div>
        </div>
    );
};

export default InterventionQueueFilters;
