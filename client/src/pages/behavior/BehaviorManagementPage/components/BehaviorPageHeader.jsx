import React from 'react';
import { HiOutlinePlus } from 'react-icons/hi';

const BehaviorPageHeader = ({ onCreateIncident }) => {
    return (
        <div className="page-header">
            <div>
                <h1>Behavior Management</h1>
                <p>Track and manage student behavior incidents</p>
            </div>
            <button className="btn btn-primary" onClick={onCreateIncident}>
                <HiOutlinePlus /> Report Incident
            </button>
        </div>
    );
};

export default BehaviorPageHeader;
