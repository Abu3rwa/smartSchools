import React from 'react';

const InterventionQueueStats = ({ openCount, highRiskCount }) => {
    return (
        <div className="intervention-stats">
            <div className="stat-card">
                <div className="stat-value">{openCount}</div>
                <div className="stat-label">Open Cases</div>
            </div>
            <div className="stat-card high">
                <div className="stat-value">{highRiskCount}</div>
                <div className="stat-label">High Risk</div>
            </div>
        </div>
    );
};

export default InterventionQueueStats;
