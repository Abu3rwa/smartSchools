import React from 'react';

const BehaviorFiltersBar = ({ filters, onFilterChange }) => {
    return (
        <div className="filters-card">
            <div className="filters-grid">
                <div className="form-group">
                    <label>Incident Type</label>
                    <select
                        value={filters.incidentType}
                        onChange={(e) => onFilterChange({ ...filters, incidentType: e.target.value })}
                    >
                        <option value="">All Types</option>
                        <option value="positive">Positive</option>
                        <option value="minor_infraction">Minor Infraction</option>
                        <option value="major_infraction">Major Infraction</option>
                        <option value="academic_concern">Academic Concern</option>
                        <option value="attendance_issue">Attendance Issue</option>
                        <option value="social_concern">Social Concern</option>
                        <option value="safety_concern">Safety Concern</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Severity</label>
                    <select
                        value={filters.severity}
                        onChange={(e) => onFilterChange({ ...filters, severity: e.target.value })}
                    >
                        <option value="">All Severities</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Status</label>
                    <select
                        value={filters.status}
                        onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
                    >
                        <option value="">All Statuses</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Start Date</label>
                    <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => onFilterChange({ ...filters, startDate: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label>End Date</label>
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
