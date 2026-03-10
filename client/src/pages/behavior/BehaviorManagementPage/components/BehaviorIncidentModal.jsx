import React from 'react';
import { useTranslation } from 'react-i18next';
import { getSeverityBadge, getStatusBadge, getTranslatedValue } from '../utils/behaviorPresentation';
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
    const { t, i18n } = useTranslation(['behaviorManagement']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;

    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        {viewMode
                            ? t('behaviorManagement:modal.viewIncident')
                            : selectedIncident
                              ? t('behaviorManagement:modal.editIncident')
                              : t('behaviorManagement:modal.reportNewIncident')}
                    </h3>
                    <button
                        className="modal-close"
                        onClick={onClose}
                        aria-label={t('behaviorManagement:actions.close')}
                    >
                        &times;
                    </button>
                </div>

                {viewMode ? (
                    <div className="modal-body">
                        <div className="incident-detail-view">
                            <h4>{selectedIncident.title}</h4>
                            <div className="detail-grid">
                                <div>
                                    <strong>{t('behaviorManagement:details.student')}</strong>{' '}
                                    {selectedIncident.student.firstName} {selectedIncident.student.lastName}
                                </div>
                                <div>
                                    <strong>{t('behaviorManagement:details.date')}</strong>{' '}
                                    {new Date(selectedIncident.incidentDate).toLocaleDateString(locale)}
                                </div>
                                <div>
                                    <strong>{t('behaviorManagement:details.type')}</strong>{' '}
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:incidentTypes',
                                        selectedIncident.incidentType
                                    )}
                                </div>
                                <div>
                                    <strong>{t('behaviorManagement:details.category')}</strong>{' '}
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:categories',
                                        selectedIncident.category
                                    )}
                                </div>
                                <div>
                                    <strong>{t('behaviorManagement:details.severity')}</strong>{' '}
                                    <span className={`badge ${getSeverityBadge(selectedIncident.severity)}`}>
                                        {getTranslatedValue(
                                            t,
                                            'behaviorManagement:severityLevels',
                                            selectedIncident.severity
                                        )}
                                    </span>
                                </div>
                                <div>
                                    <strong>{t('behaviorManagement:details.status')}</strong>{' '}
                                    <span className={`badge ${getStatusBadge(selectedIncident.status)}`}>
                                        {getTranslatedValue(
                                            t,
                                            'behaviorManagement:statusOptions',
                                            selectedIncident.status
                                        )}
                                    </span>
                                </div>
                                <div>
                                    <strong>{t('behaviorManagement:details.location')}</strong>{' '}
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:locations',
                                        selectedIncident.location
                                    )}
                                </div>
                                {selectedIncident.locationDetails && (
                                    <div>
                                        <strong>{t('behaviorManagement:details.locationDetails')}</strong>{' '}
                                        {selectedIncident.locationDetails}
                                    </div>
                                )}
                            </div>
                            <div className="detail-section">
                                <strong>{t('behaviorManagement:details.description')}</strong>
                                <p>{selectedIncident.description}</p>
                            </div>
                            {selectedIncident.actionTaken && (
                                <div className="detail-section">
                                    <strong>{t('behaviorManagement:details.actionTaken')}</strong>{' '}
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:actionsTaken',
                                        selectedIncident.actionTaken
                                    )}
                                    {selectedIncident.actionDetails && <p>{selectedIncident.actionDetails}</p>}
                                </div>
                            )}
                            {selectedIncident.reportedBy && (
                                <div className="detail-section">
                                    <strong>{t('behaviorManagement:details.reportedBy')}</strong>{' '}
                                    {selectedIncident.reportedBy.firstName} {selectedIncident.reportedBy.lastName}
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
