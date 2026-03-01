import React from 'react';
import { HiOutlineClipboardList } from 'react-icons/hi';

const BehaviorEmptyState = () => {
    return (
        <div className="empty-state">
            <HiOutlineClipboardList size={48} />
            <h3>No incidents found</h3>
            <p>Start by reporting a behavior incident</p>
        </div>
    );
};

export default BehaviorEmptyState;
