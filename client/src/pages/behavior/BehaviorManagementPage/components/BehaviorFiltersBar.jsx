import React from 'react';
import { useTranslation } from 'react-i18next';
import { INCIDENT_TYPES, SEVERITY_LEVELS, STATUS_OPTIONS } from '../constants';
import { getTranslatedValue } from '../utils/behaviorPresentation';

const BehaviorFiltersBar = ({ filters, onFilterChange }) => {
    const { t } = useTranslation(['behaviorManagement']);

    return (
        <div className="filters-card">
            <div className="filters-grid">
                <div className="form-group">
                    <label>{t('behaviorManagement:filters.labels.incidentType')}</label>
                    <select
                        value={filters.incidentType}
                        onChange={(e) => onFilterChange({ ...filters, incidentType: e.target.value })}
                    >
                        <option value="">{t('behaviorManagement:filters.options.allTypes')}</option>
                        {INCIDENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {getTranslatedValue(t, 'behaviorManagement:incidentTypes', type)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>{t('behaviorManagement:filters.labels.severity')}</label>
                    <select
                        value={filters.severity}
                        onChange={(e) => onFilterChange({ ...filters, severity: e.target.value })}
                    >
                        <option value="">{t('behaviorManagement:filters.options.allSeverities')}</option>
                        {SEVERITY_LEVELS.map((level) => (
                            <option key={level} value={level}>
                                {getTranslatedValue(t, 'behaviorManagement:severityLevels', level)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>{t('behaviorManagement:filters.labels.status')}</label>
                    <select
                        value={filters.status}
                        onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
                    >
                        <option value="">{t('behaviorManagement:filters.options.allStatuses')}</option>
                        {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                                {getTranslatedValue(t, 'behaviorManagement:statusOptions', status)}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>{t('behaviorManagement:filters.labels.startDate')}</label>
                    <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => onFilterChange({ ...filters, startDate: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label>{t('behaviorManagement:filters.labels.endDate')}</label>
                    <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => onFilterChange({ ...filters, endDate: e.target.value })}
                    />
                </div>
            </div>
        </div>
    );
};

export default BehaviorFiltersBar;
