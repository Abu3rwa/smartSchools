import React from 'react';
import InterventionQueueItem from './InterventionQueueItem';

const InterventionQueueList = ({ items, onAction, actionLoading }) => {
    if (items.length === 0) {
        return (
            <div className="card intervention-empty">
                <p className="text-muted">No cases found for the selected filters.</p>
            </div>
        );
    }

    return (
        <div className="intervention-list">
            {items.map((item) => (
                <InterventionQueueItem 
                    key={item._id} 
                    item={item} 
                    onAction={onAction} 
                    actionLoading={actionLoading} 
                />
            ))}
        </div>
    );
};

export default InterventionQueueList;
