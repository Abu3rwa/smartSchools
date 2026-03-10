import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    ACTION_TAKEN_OPTIONS,
    CATEGORIES,
    INCIDENT_TYPES,
    LOCATIONS,
    NOTIFICATION_METHODS,
    SEVERITY_LEVELS
} from '../constants';
import { formatStudentClassLabel, getTranslatedValue } from '../utils/behaviorPresentation';

const BehaviorIncidentForm = ({ 
    formData, 
    onFormDataChange, 
    onStudentChange, 
    onSubmit, 
    onCancel, 
    students, 
    classes, 
    selectedStudentProfile,
    isEdit
}) => {
    const { t } = useTranslation(['behaviorManagement']);

    return (
        <form onSubmit={onSubmit}>
            <div className="modal-body">
                <div className="form-grid">
                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.studentRequired')}</label>
                        <select
                            value={formData.student}
                            onChange={onStudentChange}
                            required
                        >
                            <option value="">{t('behaviorManagement:form.options.selectStudent')}</option>
                            {students.map((s) => (
                                <option key={s._id} value={s._id}>
                                    {s.firstName} {s.lastName} ({s.studentId})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.class')}</label>
                        <select
                            value={formData.class}
                            onChange={(e) => onFormDataChange({ ...formData, class: e.target.value })}
                        >
                            <option value="">{t('behaviorManagement:form.options.selectClass')}</option>
                            {classes.map((c) => (
                                <option key={c._id} value={c._id}>
                                    {c.name}
                                    {c.grade
                                        ? ` - ${t('behaviorManagement:common.gradeValue', {
                                              grade: c.grade
                                          })}`
                                        : ''}
                                    {c.section
                                        ? ` (${t('behaviorManagement:common.sectionValue', {
                                              section: c.section
                                          })})`
                                        : ''}
                                </option>
                            ))}
                        </select>
                        {formData.student && (
                            <p className="field-hint">
                                {t('behaviorManagement:form.hints.classAutofill')}
                            </p>
                        )}
                    </div>

                    {formData.student && (
                        <div className="student-profile-summary">
                            <span>
                                <strong>{t('behaviorManagement:details.studentId')}</strong>{' '}
                                {selectedStudentProfile?.studentId ||
                                    t('behaviorManagement:common.na')}
                            </span>
                            <span>
                                <strong>{t('behaviorManagement:details.currentClass')}</strong>{' '}
                                {formatStudentClassLabel(selectedStudentProfile, t)}
                            </span>
                            <span>
                                <strong>{t('behaviorManagement:details.academicYear')}</strong>{' '}
                                {selectedStudentProfile?.academicYear ||
                                    t('behaviorManagement:common.na')}
                            </span>
                        </div>
                    )}

                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.incidentTypeRequired')}</label>
                        <select
                            value={formData.incidentType}
                            onChange={(e) => onFormDataChange({ ...formData, incidentType: e.target.value })}
                            required
                        >
                            {INCIDENT_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:incidentTypes',
                                        type
                                    )}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.categoryRequired')}</label>
                        <select
                            value={formData.category}
                            onChange={(e) => onFormDataChange({ ...formData, category: e.target.value })}
                            required
                        >
                            <optgroup label={t('behaviorManagement:form.categoryGroups.positive')}>
                                {CATEGORIES.positive.map((value) => (
                                    <option key={value} value={value}>
                                        {getTranslatedValue(
                                            t,
                                            'behaviorManagement:categories',
                                            value
                                        )}
                                    </option>
                                ))}
                            </optgroup>
                            <optgroup label={t('behaviorManagement:form.categoryGroups.negative')}>
                                {CATEGORIES.negative.map((value) => (
                                    <option key={value} value={value}>
                                        {getTranslatedValue(
                                            t,
                                            'behaviorManagement:categories',
                                            value
                                        )}
                                    </option>
                                ))}
                            </optgroup>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.severityRequired')}</label>
                        <select
                            value={formData.severity}
                            onChange={(e) => onFormDataChange({ ...formData, severity: e.target.value })}
                            required
                        >
                            {SEVERITY_LEVELS.map((level) => (
                                <option key={level} value={level}>
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:severityLevels',
                                        level
                                    )}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.incidentDateRequired')}</label>
                        <input
                            type="date"
                            value={formData.incidentDate}
                            onChange={(e) => onFormDataChange({ ...formData, incidentDate: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.locationRequired')}</label>
                        <select
                            value={formData.location}
                            onChange={(e) => onFormDataChange({ ...formData, location: e.target.value })}
                            required
                        >
                            {LOCATIONS.map((location) => (
                                <option key={location} value={location}>
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:locations',
                                        location
                                    )}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.actionTaken')}</label>
                        <select
                            value={formData.actionTaken}
                            onChange={(e) => onFormDataChange({ ...formData, actionTaken: e.target.value })}
                        >
                            {ACTION_TAKEN_OPTIONS.map((action) => (
                                <option key={action} value={action}>
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:actionsTaken',
                                        action
                                    )}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label>{t('behaviorManagement:form.labels.titleRequired')}</label>
                    <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => onFormDataChange({ ...formData, title: e.target.value })}
                        placeholder={t('behaviorManagement:form.placeholders.title')}
                        required
                        maxLength={200}
                    />
                </div>

                <div className="form-group">
                    <label>{t('behaviorManagement:form.labels.descriptionRequired')}</label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
                        placeholder={t('behaviorManagement:form.placeholders.description')}
                        required
                        rows={4}
                        maxLength={2000}
                    />
                </div>

                <div className="form-group">
                    <label>{t('behaviorManagement:form.labels.locationDetails')}</label>
                    <input
                        type="text"
                        value={formData.locationDetails}
                        onChange={(e) => onFormDataChange({ ...formData, locationDetails: e.target.value })}
                        placeholder={t('behaviorManagement:form.placeholders.locationDetails')}
                        maxLength={200}
                    />
                </div>

                <div className="form-group">
                    <label>{t('behaviorManagement:form.labels.actionDetails')}</label>
                    <textarea
                        value={formData.actionDetails}
                        onChange={(e) => onFormDataChange({ ...formData, actionDetails: e.target.value })}
                        placeholder={t('behaviorManagement:form.placeholders.actionDetails')}
                        rows={3}
                        maxLength={1000}
                    />
                </div>

                <div className="form-group checkbox-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={formData.followUpRequired}
                            onChange={(e) => onFormDataChange({ ...formData, followUpRequired: e.target.checked })}
                        />
                        {t('behaviorManagement:form.labels.followUpRequired')}
                    </label>
                </div>

                {formData.followUpRequired && (
                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.followUpDate')}</label>
                        <input
                            type="date"
                            value={formData.followUpDate}
                            onChange={(e) => onFormDataChange({ ...formData, followUpDate: e.target.value })}
                        />
                    </div>
                )}

                <div className="form-group checkbox-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={formData.parentNotified}
                            onChange={(e) => onFormDataChange({ ...formData, parentNotified: e.target.checked })}
                        />
                        {t('behaviorManagement:form.labels.parentNotified')}
                    </label>
                </div>

                {formData.parentNotified && (
                    <div className="form-group">
                        <label>{t('behaviorManagement:form.labels.notificationMethod')}</label>
                        <select
                            value={formData.parentNotificationMethod}
                            onChange={(e) => onFormDataChange({ ...formData, parentNotificationMethod: e.target.value })}
                        >
                            {NOTIFICATION_METHODS.map((method) => (
                                <option key={method} value={method}>
                                    {getTranslatedValue(
                                        t,
                                        'behaviorManagement:notificationMethods',
                                        method
                                    )}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                    {t('behaviorManagement:actions.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                    {isEdit
                        ? t('behaviorManagement:actions.updateIncident')
                        : t('behaviorManagement:actions.createIncident')}
                </button>
            </div>
        </form>
    );
};

export default BehaviorIncidentForm;
