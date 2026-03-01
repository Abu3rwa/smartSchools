import React from 'react';
import { HiOutlineExclamation } from 'react-icons/hi';

const ErrorState = ({ message = "Failed to load behavior incidents" }) => {
    return (
        <div className="empty-state">
            <HiOutlineExclamation size={48} className="text-danger" />
            <h3>Error</h3>
            <p>{message}</p>
        </div>
    );
};

export default ErrorState;
