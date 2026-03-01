import React from 'react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

const InterventionQueueEmptyState = ({ message, icon: Icon = HiOutlineExclamationCircle }) => {
    return (
        <div className="card intervention-empty">
            {Icon && <Icon size={44} />}
            <p className={Icon === HiOutlineExclamationCircle ? '' : 'text-muted'}>{message}</p>
        </div>
    );
};

export default InterventionQueueEmptyState;
