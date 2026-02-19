import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectUser } from '../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import api from '../config/api';
import toast from 'react-hot-toast';
import {
    HiOutlinePlus,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineExclamation,
    HiOutlineChatAlt,
    HiOutlineClipboardList
} from 'react-icons/hi';
import './BehaviorManagementPage.css';

const BehaviorManagementPage = () => {
    const user = useSelector(selectUser);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [viewMode, setViewMode] = useState(false);
    const [filters, setFilters] = useState({
        incidentType: '',
        category: '',
        severity: '',
        status: '',
        startDate: '',
        endDate: ''
    });
    const [students, setStudents] = useState([]);
    const [classes, setClasses] = useState([]);
    const [formData, setFormData] = useState({
        student: '',
        class: '',
        incidentType: 'minor_infraction',
        category: 'disruptive',
        severity: 'low',
        title: '',
        description: '',
        incidentDate: new Date().toISOString().split('T')[0],
        location: 'classroom',
        locationDetails: '',
        actionTaken: 'verbal_warning',
        actionDetails: '',
        followUpRequired: false,
        followUpDate: '',
        parentNotified: false,
        parentNotificationMethod: 'phone'
    });
    const selectedStudentProfile = students.find((student) => student._id === formData.student);

    useEffect(() => {
        fetchIncidents();
        fetchStudents();
        fetchClasses();
    }, [filters, academicYear]);

    const fetchIncidents = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) params.append(key, value);
            });
            if (!filters.startDate && !filters.endDate && academicYear) {
                params.append('academicYear', academicYear);
            }
            
            const response = await api.get(`/student-behavior?${params}`);
            if (response.data.success) {
                setIncidents(response.data.data.incidents);
            }
        } catch (error) {
            toast.error('Failed to load behavior incidents');
        } finally {
            setLoading(false);
        }
    };

    const fetchStudents = async () => {
        try {
            const response = await api.get('/students', {
                params: {
                    status: 'active',
                    limit: 500,
                    academicYear
                }
            });
            if (response.data.success) {
                setStudents(response.data.data.students);
            }
        } catch (error) {
            console.error('Failed to load students');
        }
    };

    const getStudentClassId = (student) => {
        if (!student?.currentClass) return '';
        return typeof student.currentClass === 'object'
            ? student.currentClass._id
            : student.currentClass;
    };

    const formatStudentClassLabel = (student) => {
        const studentClass = student?.currentClass;
        if (!studentClass || typeof studentClass !== 'object') return 'Not assigned';
        const parts = [
            studentClass.name,
            studentClass.grade ? `Grade ${studentClass.grade}` : null,
            studentClass.section ? `Section ${studentClass.section}` : null
        ].filter(Boolean);
        return parts.join(' • ');
    };

    const handleStudentChange = (event) => {
        const nextStudentId = event.target.value;
        const nextStudent = students.find((student) => student._id === nextStudentId);
        const nextClassId = getStudentClassId(nextStudent);

        setFormData((prev) => ({
            ...prev,
            student: nextStudentId,
            class: nextClassId || ''
        }));
    };

    const fetchClasses = async () => {
        try {
            const response = await api.get('/classes', {
                params: {
                    academicYear
                }
            });
            if (response.data.success) {
                setClasses(response.data.data.classes);
            }
        } catch (error) {
            console.error('Failed to load classes');
        }
    };

    const handleCreateIncident = () => {
        setSelectedIncident(null);
        setViewMode(false);
        setFormData({
            student: '',
            class: '',
            incidentType: 'minor_infraction',
            category: 'disruptive',
            severity: 'low',
            title: '',
            description: '',
            incidentDate: new Date().toISOString().split('T')[0],
            location: 'classroom',
            locationDetails: '',
            actionTaken: 'verbal_warning',
            actionDetails: '',
            followUpRequired: false,
            followUpDate: '',
            parentNotified: false,
            parentNotificationMethod: 'phone'
        });
        setShowModal(true);
    };

    const handleViewIncident = async (incident) => {
        try {
            const response = await api.get(`/student-behavior/${incident._id}`);
            if (response.data.success) {
                setSelectedIncident(response.data.data.incident);
                setViewMode(true);
                setShowModal(true);
            }
        } catch (error) {
            toast.error('Failed to load incident details');
        }
    };

    const handleEditIncident = (incident) => {
        setSelectedIncident(incident);
        setViewMode(false);
        setFormData({
            student: incident.student._id,
            class: incident.class?._id || '',
            incidentType: incident.incidentType,
            category: incident.category,
            severity: incident.severity,
            title: incident.title,
            description: incident.description,
            incidentDate: incident.incidentDate.split('T')[0],
            location: incident.location,
            locationDetails: incident.locationDetails || '',
            actionTaken: incident.actionTaken,
            actionDetails: incident.actionDetails || '',
            followUpRequired: incident.followUpRequired,
            followUpDate: incident.followUpDate ? incident.followUpDate.split('T')[0] : '',
            parentNotified: incident.parentNotified,
            parentNotificationMethod: incident.parentNotificationMethod || 'phone'
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (selectedIncident && !viewMode) {
                // Update
                const response = await api.put(`/student-behavior/${selectedIncident._id}`, formData);
                if (response.data.success) {
                    toast.success('Incident updated successfully');
                    setShowModal(false);
                    fetchIncidents();
                }
            } else {
                // Create
                const response = await api.post('/student-behavior', formData);
                if (response.data.success) {
                    toast.success('Incident created successfully');
                    setShowModal(false);
                    fetchIncidents();
                }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save incident');
        }
    };

    const handleResolve = async (incidentId) => {
        if (!window.confirm('Mark this incident as resolved?')) return;
        
        try {
            const response = await api.patch(`/student-behavior/${incidentId}/resolve`);
            if (response.data.success) {
                toast.success('Incident marked as resolved');
                fetchIncidents();
            }
        } catch (error) {
            toast.error('Failed to resolve incident');
        }
    };

    const handleDelete = async (incidentId) => {
        if (!window.confirm('Are you sure you want to delete this incident?')) return;
        
        try {
            const response = await api.delete(`/student-behavior/${incidentId}`);
            if (response.data.success) {
                toast.success('Incident deleted successfully');
                fetchIncidents();
            }
        } catch (error) {
            toast.error('Failed to delete incident');
        }
    };

    const getSeverityBadge = (severity) => {
        const colors = {
            low: 'badge-success',
            medium: 'badge-warning',
            high: 'badge-danger',
            critical: 'badge-critical'
        };
        return colors[severity] || 'badge-secondary';
    };

    const getStatusBadge = (status) => {
        const colors = {
            open: 'badge-danger',
            in_progress: 'badge-warning',
            resolved: 'badge-success',
            closed: 'badge-secondary'
        };
        return colors[status] || 'badge-secondary';
    };

    const getIncidentTypeIcon = (type) => {
        if (type === 'positive') return <HiOutlineCheck className="text-success" />;
        if (type === 'major_infraction') return <HiOutlineExclamation className="text-danger" />;
        return <HiOutlineX className="text-warning" />;
    };

    return (
        <div className="behavior-management-page">
            <div className="page-header">
                <div>
                    <h1>Behavior Management</h1>
                    <p>Track and manage student behavior incidents</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreateIncident}>
                    <HiOutlinePlus /> Report Incident
                </button>
            </div>

            {/* Filters */}
            <div className="filters-card">
                <div className="filters-grid">
                    <div className="form-group">
                        <label>Incident Type</label>
                        <select
                            value={filters.incidentType}
                            onChange={(e) => setFilters({ ...filters, incidentType: e.target.value })}
                        >
                            <option value="">All Types</option>
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
                        <label>Severity</label>
                        <select
                            value={filters.severity}
                            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                        >
                            <option value="">All Severities</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Status</label>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        >
                            <option value="">All Statuses</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Start Date</label>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label>End Date</label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Incidents List */}
            {loading ? (
                <div className="loading">Loading incidents...</div>
            ) : incidents.length === 0 ? (
                <div className="empty-state">
                    <HiOutlineClipboardList size={48} />
                    <h3>No incidents found</h3>
                    <p>Start by reporting a behavior incident</p>
                </div>
            ) : (
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
                                    onClick={() => handleViewIncident(incident)}
                                >
                                    <HiOutlineEye /> View
                                </button>
                                <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => handleEditIncident(incident)}
                                >
                                    <HiOutlinePencil /> Edit
                                </button>
                                {incident.status !== 'resolved' && incident.status !== 'closed' && (
                                    <button
                                        className="btn btn-sm btn-success"
                                        onClick={() => handleResolve(incident._id)}
                                    >
                                        <HiOutlineCheck /> Resolve
                                    </button>
                                )}
                                {user?.role === 'admin' && (
                                    <button
                                        className="btn btn-sm btn-danger"
                                        onClick={() => handleDelete(incident._id)}
                                    >
                                        <HiOutlineTrash /> Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>
                                {viewMode ? 'View Incident' : selectedIncident ? 'Edit Incident' : 'Report New Incident'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
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
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    <div className="form-grid">
                                        <div className="form-group">
                                            <label>Student *</label>
                                            <select
                                                value={formData.student}
                                                onChange={handleStudentChange}
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
                                                onChange={(e) => setFormData({ ...formData, class: e.target.value })}
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
                                                onChange={(e) => setFormData({ ...formData, incidentType: e.target.value })}
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
                                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
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
                                                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
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
                                                onChange={(e) => setFormData({ ...formData, incidentDate: e.target.value })}
                                                required
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Location *</label>
                                            <select
                                                value={formData.location}
                                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
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
                                                onChange={(e) => setFormData({ ...formData, actionTaken: e.target.value })}
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
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Brief title for the incident"
                                            required
                                            maxLength={200}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Description *</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                                            onChange={(e) => setFormData({ ...formData, locationDetails: e.target.value })}
                                            placeholder="Specific location details"
                                            maxLength={200}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Action Details</label>
                                        <textarea
                                            value={formData.actionDetails}
                                            onChange={(e) => setFormData({ ...formData, actionDetails: e.target.value })}
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
                                                onChange={(e) => setFormData({ ...formData, followUpRequired: e.target.checked })}
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
                                                onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                                            />
                                        </div>
                                    )}

                                    <div className="form-group checkbox-group">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={formData.parentNotified}
                                                onChange={(e) => setFormData({ ...formData, parentNotified: e.target.checked })}
                                            />
                                            Parent Notified
                                        </label>
                                    </div>

                                    {formData.parentNotified && (
                                        <div className="form-group">
                                            <label>Notification Method</label>
                                            <select
                                                value={formData.parentNotificationMethod}
                                                onChange={(e) => setFormData({ ...formData, parentNotificationMethod: e.target.value })}
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
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        {selectedIncident ? 'Update Incident' : 'Create Incident'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BehaviorManagementPage;
