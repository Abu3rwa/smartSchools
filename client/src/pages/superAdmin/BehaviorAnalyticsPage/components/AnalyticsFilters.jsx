import { EVENT_TYPE_OPTIONS, PERIOD_OPTIONS } from '../constants';

const AnalyticsFilters = ({
    selectedPeriod,
    onPeriodChange,
    selectedSchool,
    onSchoolChange,
    selectedEventType,
    onEventTypeChange
}) => {
    return (
        <div className="filters-panel">
            <div className="filter-group">
                <label>Time Period</label>
                <select value={selectedPeriod} onChange={(event) => onPeriodChange(event.target.value)}>
                    {PERIOD_OPTIONS.map((period) => (
                        <option key={period.value} value={period.value}>{period.label}</option>
                    ))}
                </select>
            </div>
            <div className="filter-group">
                <label>School</label>
                <select value={selectedSchool} onChange={(event) => onSchoolChange(event.target.value)}>
                    <option value="">All Schools</option>
                </select>
            </div>
            <div className="filter-group">
                <label>Event Type</label>
                <select value={selectedEventType} onChange={(event) => onEventTypeChange(event.target.value)}>
                    {EVENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default AnalyticsFilters;
