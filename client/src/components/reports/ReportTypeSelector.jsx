import React from 'react';
import './ReportComponents.css';

const reportTypes = [
  { value: 'weekly', label: 'Weekly', icon: '📅', description: 'Last 7 days' },
  { value: 'monthly', label: 'Monthly', icon: '📆', description: 'Current month' },
  { value: 'quarterly', label: 'Quarterly', icon: '📊', description: '3-month period' },
  { value: 'yearly', label: 'Yearly', icon: '📈', description: 'Full year' },
  { value: 'custom', label: 'Custom', icon: '🎯', description: 'Date range' }
];

const ReportTypeSelector = ({ value, onChange, showCustomDates, startDate, endDate, onDateChange }) => {
  return (
    <div className="report-type-selector">
      <label className="selector-label">Report Type</label>
      <div className="type-grid">
        {reportTypes.map((type) => (
          <button
            key={type.value}
            type="button"
            className={`type-option ${value === type.value ? 'active' : ''}`}
            onClick={() => onChange(type.value)}
          >
            <span className="type-icon">{type.icon}</span>
            <span className="type-label">{type.label}</span>
            <span className="type-description">{type.description}</span>
          </button>
        ))}
      </div>
      
      {showCustomDates && value === 'custom' && (
        <div className="custom-date-range">
          <div className="date-field">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onDateChange('startDate', e.target.value)}
            />
          </div>
          <div className="date-field">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onDateChange('endDate', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportTypeSelector;
