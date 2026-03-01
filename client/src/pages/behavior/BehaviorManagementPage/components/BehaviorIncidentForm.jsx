import React from 'react';
import { formatStudentClassLabel } from '../utils/behaviorPresentation';

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
    return (
        <form onSubmit={onSubmit}>
            <div className="modal-body">
                <div className="form-grid">
                    <div className="form-group">
                        <label>Student *</label>
                        <select
                            value={formData.student}
                            onChange={onStudentChange}
                            required
                        >
                            <option value="">Select Student</option>
                            {students.map((s) => (
                                <option key={s._id} value={s._id}>
                                    {s.firstName} {s.lastName} ({s.studentId})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Class</label>
                        <select
                            value={formData.class}
                            onChange={(e) => onFormDataChange({ ...formData, class: e.target.value })}
                        >
                            <option value="">Select Class</option>
                            {classes.map((c) => (
                                <option key={c._id} value={c._id}>
                                    {c.name}
                                    {c.grade ? ` - Grade ${c.grade}` : ''}
                                    {c.section ? ` (${c.section})` : ''}
                                </option>
                            ))}
                        </select>
                        {formData.student && (
                            <p className="field-hint">Auto-filled from student profile. You can still adjust if needed.</p>
                        )}
                    </div>

                    {formData.student && (
                        <div className="student-profile-summary">
                            <span><strong>Student ID:</strong> {selectedStudentProfile?.studentId || 'N/A'}</span>
                            <span><strong>Current Class:</strong> {formatStudentClassLabel(selectedStudentProfile)}</span>
                            <span><strong>Academic Year:</strong> {selectedStudentProfile?.academicYear || 'N/A'}</span>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Incident Type *</label>
                        <select
                            value={formData.incidentType}
                            onChange={(e) => onFormDataChange({ ...formData, incidentType: e.target.value })}
                            required
                        >
                            <option value="positive">Positive</option>
                            <option value="minor_infraction">Minor Infraction</option>
                            <option value="major_infraction">Major Infraction</option>
                            <option value="academic_concern">Academic Concern</option>
                            <option value="attendance_issue">Attendance Issue</option>
                            <option value="social_concern">Social Concern</option>
                            <option value="safety_concern">Safety Concern</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Category *</label>
                        <select
                            value={formData.category}
                            onChange={(e) => onFormDataChange({ ...formData, category: e.target.value })}
                            required
                        >
                            <optgroup label="Positive">
                                <option value="achievement">Achievement</option>
                                <option value="leadership">Leadership</option>
                                <option value="kindness">Kindness</option>
                                <option value="participation">Participation</option>
                                <option value="improvement">Improvement</option>
                            </optgroup>
                            <optgroup label="Negative">
                                <option value="disruptive">Disruptive</option>
                                <option value="disrespectful">Disrespectful</option>
                                <option value="academic_dishonesty">Academic Dishonesty</option>
                                <option value="bullying">Bullying</option>
                                <option value="fighting">Fighting</option>
                                <option value="vandalism">Vandalism</option>
                                <option value="technology_misuse">Technology Misuse</option>
                                <option value="dress_code">Dress Code</option>
                                <option value="tardiness">Tardiness</option>
                                <option value="truancy">Truancy</option>
                                <option value="other">Other</option>
                            </optgroup>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Severity *</label>
                        <select
                            value={formData.severity}
                            onChange={(e) => onFormDataChange({ ...formData, severity: e.target.value })}
                            required
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Incident Date *</label>
                        <input
                            type="date"
                            value={formData.incidentDate}
                            onChange={(e) => onFormDataChange({ ...formData, incidentDate: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Location *</label>
                        <select
                            value={formData.location}
                            onChange={(e) => onFormDataChange({ ...formData, location: e.target.value })}
                            required
                        >
                            <option value="classroom">Classroom</option>
                            <option value="hallway">Hallway</option>
                            <option value="cafeteria">Cafeteria</option>
                            <option value="playground">Playground</option>
                            <option value="gym">Gym</option>
                            <option value="library">Library</option>
                            <option value="bathroom">Bathroom</option>
                            <option value="bus">Bus</option>
                            <option value="parking_lot">Parking Lot</option>
                            <option value="office">Office</option>
                            <option value="auditorium">Auditorium</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Action Taken</label>
                        <select
                            value={formData.actionTaken}
                            onChange={(e) => onFormDataChange({ ...formData, actionTaken: e.target.value })}
                        >
                            <option value="none">None</option>
                            <option value="verbal_warning">Verbal Warning</option>
                            <option value="written_warning">Written Warning</option>
                            <option value="parent_contact">Parent Contact</option>
                            <option value="detention">Detention</option>
                            <option value="suspension">Suspension</option>
                            <option value="counseling_referral">Counseling Referral</option>
                            <option value="behavior_contract">Behavior Contract</option>
                            <option value="positive_reinforcement">Positive Reinforcement</option>
                            <option value="reward">Reward</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label>Title *</label>
                    <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => onFormDataChange({ ...formData, title: e.target.value })}
                        placeholder="Brief title for the incident"
                        required
                        maxLength={200}
                    />
                </div>

                <div className="form-group">
                    <label>Description *</label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
                        placeholder="Detailed description of what happened"
                        required
                        rows={4}
                        maxLength={2000}
                    />
                </div>

                <div className="form-group">
                    <label>Location Details</label>
                    <input
                        type="text"
                        value={formData.locationDetails}
                        onChange={(e) => onFormDataChange({ ...formData, locationDetails: e.target.value })}
                        placeholder="Specific location details"
                        maxLength={200}
                    />
                </div>

                <div className="form-group">
                    <label>Action Details</label>
                    <textarea
                        value={formData.actionDetails}
                        onChange={(e) => onFormDataChange({ ...formData, actionDetails: e.target.value })}
                        placeholder="Details about the action taken"
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
                        Follow-up Required
                    </label>
                </div>

                {formData.followUpRequired && (
                    <div className="form-group">
                        <label>Follow-up Date</label>
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
                        Parent Notified
                    </label>
                </div>

                {formData.parentNotified && (
                    <div className="form-group">
                        <label>Notification Method</label>
                        <select
                            value={formData.parentNotificationMethod}
                            onChange={(e) => onFormDataChange({ ...formData, parentNotificationMethod: e.target.value })}
                        >
                            <option value="phone">Phone</option>
                            <option value="email">Email</option>
                            <option value="in_person">In Person</option>
                            <option value="letter">Letter</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                )}
            </div>

            <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                    {isEdit ? 'Update Incident' : 'Create Incident'}
                </button>
            </div>
        </form>
    );
};

export default BehaviorIncidentForm;
