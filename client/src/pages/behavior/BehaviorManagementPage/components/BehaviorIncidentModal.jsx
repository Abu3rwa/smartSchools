import React from 'react';
import { getSeverityBadge, getStatusBadge } from '../utils/behaviorPresentation';
import BehaviorIncidentForm from './BehaviorIncidentForm';

const BehaviorIncidentModal = ({ 
    show, 
    onClose, 
    viewMode, 
    selectedIncident, 
    formData, 
    onFormDataChange, 
    onStudentChange, 
    onSubmit, 
    students, 
    classes, 
    selectedStudentProfile 
}) => {
    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        {viewMode ? 'View Incident' : selectedIncident ? 'Edit Incident' : 'Report New Incident'}
                    </h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                {viewMode ? (
                    <div className="modal-body">
                        <div className="incident-detail-view">
                            <h4>{selectedIncident.title}</h4>
                            <div className="detail-grid">
                                <div><strong>Student:</strong> {selectedIncident.student.firstName} {selectedIncident.student.lastName}</div>
                                <div><strong>Date:</strong> {new Date(selectedIncident.incidentDate).toLocaleDateString()}</div>
                                <div><strong>Type:</strong> {selectedIncident.incidentType}</div>
                                <div><strong>Category:</strong> {selectedIncident.category}</div>
                                <div><strong>Severity:</strong> <span className={`badge ${getSeverityBadge(selectedIncident.severity)}`}>{selectedIncident.severity}</span></div>
                                <div><strong>Status:</strong> <span className={`badge ${getStatusBadge(selectedIncident.status)}`}>{selectedIncident.status}</span></div>
                                <div><strong>Location:</strong> {selectedIncident.location}</div>
                                {selectedIncident.locationDetails && <div><strong>Location Details:</strong> {selectedIncident.locationDetails}</div>}
                            </div>
                            <div className="detail-section">
                                <strong>Description:</strong>
                                <p>{selectedIncident.description}</p>
                            </div>
                            {selectedIncident.actionTaken && (
                                <div className="detail-section">
                                    <strong>Action Taken:</strong> {selectedIncident.actionTaken}
                                    {selectedIncident.actionDetails && <p>{selectedIncident.actionDetails}</p>}
                                </div>
                            )}
                            {selectedIncident.reportedBy && (
                                <div className="detail-section">
                                    <strong>Reported By:</strong> {selectedIncident.reportedBy.firstName} {selectedIncident.reportedBy.lastName}
                                    {selectedIncident.reportedBy.title && ` (${selectedIncident.reportedBy.title})`}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <BehaviorIncidentForm 
                        formData={formData}
                        onFormDataChange={onFormDataChange}
                        onStudentChange={onStudentChange}
                        onSubmit={onSubmit}
                        onCancel={onClose}
                        students={students}
                        classes={classes}
                        selectedStudentProfile={selectedStudentProfile}
                        isEdit={!!selectedIncident}
                    />
                )}
            </div>
        </div>
    );
};

export default BehaviorIncidentModal;
