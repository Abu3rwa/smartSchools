import React from 'react';
import { HiOutlineEye, HiOutlinePencil, HiOutlineCheck, HiOutlineTrash } from 'react-icons/hi';
import { getSeverityBadge, getStatusBadge, getIncidentTypeIcon } from '../utils/behaviorPresentation';

const BehaviorIncidentsList = ({ 
    incidents, 
    userRole, 
    onViewIncident, 
    onEditIncident, 
    onResolveIncident, 
    onDeleteIncident 
}) => {
    return (
        <div className="incidents-grid">
            {incidents.map((incident) => (
                <div key={incident._id} className="incident-card">
                    <div className="incident-header">
                        <div className="incident-icon">
                            {getIncidentTypeIcon(incident.incidentType)}
                        </div>
                        <div className="incident-meta">
                            <h3>{incident.title}</h3>
                            <p className="student-name">
                                {incident.student.firstName} {incident.student.lastName}
                            </p>
                        </div>
                        <div className="incident-badges">
                            <span className={`badge ${getSeverityBadge(incident.severity)}`}>
                                {incident.severity}
                            </span>
                            <span className={`badge ${getStatusBadge(incident.status)}`}>
                                {incident.status}
                            </span>
                        </div>
                    </div>

                    <div className="incident-body">
                        <p className="incident-description">{incident.description}</p>
                        <div className="incident-details">
                            <span><strong>Date:</strong> {new Date(incident.incidentDate).toLocaleDateString()}</span>
                            <span><strong>Location:</strong> {incident.location}</span>
                            <span><strong>Category:</strong> {incident.category}</span>
                        </div>
                        {incident.reportedBy && (
                            <p className="reported-by">
                                Reported by: {incident.reportedBy.firstName} {incident.reportedBy.lastName}
                                {incident.reportedBy.title && ` (${incident.reportedBy.title})`}
                            </p>
                        )}
                    </div>

                    <div className="incident-actions">
                        <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => onViewIncident(incident)}
                        >
                            <HiOutlineEye /> View
                        </button>
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={() => onEditIncident(incident)}
                        >
                            <HiOutlinePencil /> Edit
                        </button>
                        {incident.status !== 'resolved' && incident.status !== 'closed' && (
                            <button
                                className="btn btn-sm btn-success"
                                onClick={() => onResolveIncident(incident._id)}
                            >
                                <HiOutlineCheck /> Resolve
                            </button>
                        )}
                        {userRole === 'admin' && (
                            <button
                                className="btn btn-sm btn-danger"
                                onClick={() => onDeleteIncident(incident._id)}
                            >
                                <HiOutlineTrash /> Delete
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default BehaviorIncidentsList;
