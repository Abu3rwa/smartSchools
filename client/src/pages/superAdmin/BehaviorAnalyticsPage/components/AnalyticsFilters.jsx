import { EVENT_TYPE_OPTIONS, PERIOD_OPTIONS } from '../constants';
import { useTranslation } from 'react-i18next';

const AnalyticsFilters = ({
    selectedPeriod,
    onPeriodChange,
    selectedSchool,
    onSchoolChange,
    selectedEventType,
    onEventTypeChange
}) => {
    const { t } = useTranslation(['behaviorAnalytics']);

    const getPeriodLabel = (period) =>
        t(`behaviorAnalytics:filters.periodOptions.${period}`, { defaultValue: period });

    const getEventTypeLabel = (eventType) => {
        if (!eventType) return t('behaviorAnalytics:filters.allEvents');
        return t(`behaviorAnalytics:filters.eventTypeOptions.${eventType}`, { defaultValue: eventType });
    };

    return (
        <div className="filters-panel">
            <div className="filter-group">
                <label>{t('behaviorAnalytics:filters.timePeriod')}</label>
                <select value={selectedPeriod} onChange={(event) => onPeriodChange(event.target.value)}>
                    {PERIOD_OPTIONS.map((period) => (
                        <option key={period.value} value={period.value}>{getPeriodLabel(period.value)}</option>
                    ))}
                </select>
            </div>
            <div className="filter-group">
                <label>{t('behaviorAnalytics:filters.school')}</label>
                <select value={selectedSchool} onChange={(event) => onSchoolChange(event.target.value)}>
                    <option value="">{t('behaviorAnalytics:filters.allSchools')}</option>
                </select>
            </div>
            <div className="filter-group">
                <label>{t('behaviorAnalytics:filters.eventType')}</label>
                <select value={selectedEventType} onChange={(event) => onEventTypeChange(event.target.value)}>
                    {EVENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value || 'all'} value={option.value}>{getEventTypeLabel(option.value)}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default AnalyticsFilters;
