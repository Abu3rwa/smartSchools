import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../../store/slices/authSlice';
import { selectCurrentAcademicYear } from '../../../../store/slices/uiSlice';
import api from '../../../../config/api';
import toast from 'react-hot-toast';
import { getStudentClassId } from '../utils/behaviorPresentation.jsx';

const useBehaviorManagementData = () => {
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

    return {
        user,
        incidents,
        loading,
        showModal,
        setShowModal,
        selectedIncident,
        viewMode,
        filters,
        setFilters,
        students,
        classes,
        formData,
        setFormData,
        selectedStudentProfile,
        handleStudentChange,
        handleCreateIncident,
        handleViewIncident,
        handleEditIncident,
        handleSubmit,
        handleResolve,
        handleDelete
    };
};

export default useBehaviorManagementData;
