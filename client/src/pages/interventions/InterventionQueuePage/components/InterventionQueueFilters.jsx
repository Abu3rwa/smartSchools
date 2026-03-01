import React from 'react';

const InterventionQueueFilters = ({ filters, onFilterChange }) => {
    return (
        <div className="intervention-filters card">
            <label>
                Status
                <select
                    value={filters.status}
                    onChange={(e) => onFilterChange((prev) => ({ ...prev, status: e.target.value }))}
                >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                </select>
            </label>

            <label>
                Risk
                <select
                    value={filters.riskLevel}
                    onChange={(e) => onFilterChange((prev) => ({ ...prev, riskLevel: e.target.value }))}
                >
                    <option value="">All</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
            </label>
        </div>
    );
};

export default InterventionQueueFilters;
