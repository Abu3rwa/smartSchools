import React from 'react';
import { HiOutlineEye, HiOutlinePencil, HiOutlineCheck, HiOutlineTrash } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import {
    getSeverityBadge,
    getStatusBadge,
    getIncidentTypeIcon,
    getTranslatedValue
} from '../utils/behaviorPresentation';

const BehaviorIncidentsList = ({ 
    incidents, 
    userRole, 
    onViewIncident, 
    onEditIncident, 
    onResolveIncident, 
    onDeleteIncident 
}) => {
    const { t, i18n } = useTranslation(['behaviorManagement']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;

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
                                {getTranslatedValue(
                                    t,
                                    'behaviorManagement:severityLevels',
                                    incident.severity
                                )}
                            </span>
                            <span className={`badge ${getStatusBadge(incident.status)}`}>
                                {getTranslatedValue(
                                    t,
                                    'behaviorManagement:statusOptions',
                                    incident.status
                                )}
                            </span>
                        </div>
                    </div>

                    <div className="incident-body">
                        <p className="incident-description">{incident.description}</p>
                        <div className="incident-details">
                            <span>
                                <strong>{t('behaviorManagement:list.labels.date')}</strong>{' '}
                                {new Date(incident.incidentDate).toLocaleDateString(locale)}
                            </span>
                            <span>
                                <strong>{t('behaviorManagement:list.labels.location')}</strong>{' '}
                                {getTranslatedValue(
                                    t,
                                    'behaviorManagement:locations',
                                    incident.location
                                )}
                            </span>
                            <span>
                                <strong>{t('behaviorManagement:list.labels.category')}</strong>{' '}
                                {getTranslatedValue(
                                    t,
                                    'behaviorManagement:categories',
                                    incident.category
                                )}
                            </span>
                        </div>
                        {incident.reportedBy && (
                            <p className="reported-by">
                                {t('behaviorManagement:list.labels.reportedBy')}{' '}
                                {incident.reportedBy.firstName} {incident.reportedBy.lastName}
                                {incident.reportedBy.title && ` (${incident.reportedBy.title})`}
                            </p>
                        )}
                    </div>

                    <div className="incident-actions">
                        <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => onViewIncident(incident)}
                        >
                            <HiOutlineEye /> {t('behaviorManagement:actions.view')}
                        </button>
                        <button
                            className="btn btn-sm btn-primary"
                            onClick={() => onEditIncident(incident)}
                        >
                            <HiOutlinePencil /> {t('behaviorManagement:actions.edit')}
                        </button>
                        {incident.status !== 'resolved' && incident.status !== 'closed' && (
                            <button
                                className="btn btn-sm btn-success"
                                onClick={() => onResolveIncident(incident._id)}
                            >
                                <HiOutlineCheck /> {t('behaviorManagement:actions.resolve')}
                            </button>
                        )}
                        {userRole === 'admin' && (
                            <button
                                className="btn btn-sm btn-danger"
                                onClick={() => onDeleteIncident(incident._id)}
                            >
                                <HiOutlineTrash /> {t('behaviorManagement:actions.delete')}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default BehaviorIncidentsList;
