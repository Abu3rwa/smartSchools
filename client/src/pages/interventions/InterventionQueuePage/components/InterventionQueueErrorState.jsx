import React from 'react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

const InterventionQueueErrorState = ({ error }) => {
    return (
        <div className="card intervention-empty">
            <HiOutlineExclamationCircle size={44} />
            <p>{error}</p>
        </div>
    );
};

export default InterventionQueueErrorState;
