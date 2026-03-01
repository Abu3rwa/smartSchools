import React from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';

const InterventionQueueHeader = ({ onRefresh, isLoading }) => {
    return (
        <div className="page-header">
            <div>
                <h1>Intervention Queue</h1>
                <p className="text-muted">Track students who need targeted reteach and follow-up support.</p>
            </div>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onRefresh}
                disabled={isLoading}
            >
                <HiOutlineRefresh size={16} />
                <span>Refresh</span>
            </button>
        </div>
    );
};

export default InterventionQueueHeader;
