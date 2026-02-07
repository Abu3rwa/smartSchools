import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchTeachers, selectTeachers, selectTeachersLoading, createTeacher, updateTeacher, deleteTeacher, assignMultipleClassesToTeacher, removeClassFromTeacher } from '../store/slices/teacherSlice';
import { fetchSubjects, selectSubjects } from '../store/slices/subjectSlice';
import { fetchClasses, selectClasses } from '../store/slices/classSlice';
import { selectIsAdmin } from '../store/slices/authSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineMail, HiOutlinePhone, HiOutlineTrash, HiOutlineUserGroup, HiOutlinePencil, HiOutlineEye } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './TeachersPage.css';

const TeachersPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const teachers = useSelector(selectTeachers);
    const subjects = useSelector(selectSubjects);
    const classes = useSelector(selectClasses);
    const loading = useSelector(selectTeachersLoading);
    const isAdmin = useSelector(selectIsAdmin);

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedTeacher, setSelectedTeacher] = useState(null);
    const [editingTeacher, setEditingTeacher] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: 'Teacher@123',
        department: 'General',
        qualification: '',
        subjects: []
    });
    const [assignments, setAssignments] = useState([{ classId: '', subjectId: '', isClassTeacher: false }]);

    useEffect(() => {
        dispatch(fetchTeachers());
        dispatch(fetchSubjects());
        dispatch(fetchClasses());
    }, [dispatch]);

    const filteredTeachers = teachers.filter(teacher => {
        const fullName = `${teacher.user?.firstName} ${teacher.user?.lastName}`.toLowerCase();
        return fullName.includes(searchTerm.toLowerCase()) ||
            teacher.employeeId?.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await dispatch(createTeacher(formData));
            if (createTeacher.fulfilled.match(result)) {
                toast.success('Teacher created successfully!');
                setShowModal(false);
                setFormData({
                    firstName: '', lastName: '', email: '', phone: '',
                    password: 'Teacher@123', department: 'General', qualification: '', subjects: []
                });
            } else {
                toast.error(result.payload || 'Failed to create teacher');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (teacher) => {
        setEditingTeacher(teacher);
        setFormData({
            firstName: teacher.user?.firstName || '',
            lastName: teacher.user?.lastName || '',
            email: teacher.user?.email || '',
            phone: teacher.user?.phone || '',
            department: teacher.department || 'General',
            qualification: teacher.qualification || '',
            subjects: teacher.subjects?.map(s => s._id) || []
        });
        setShowEditModal(true);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await dispatch(updateTeacher({ 
                id: editingTeacher._id, 
                teacherData: formData 
            }));
            if (updateTeacher.fulfilled.match(result)) {
                toast.success('Teacher updated successfully!');
                setShowEditModal(false);
                setEditingTeacher(null);
                setFormData({
                    firstName: '', lastName: '', email: '', phone: '',
                    password: 'Teacher@123', department: 'General', qualification: '', subjects: []
                });
            } else {
                toast.error(result.payload || 'Failed to update teacher');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (teacher) => {
        if (!window.confirm(`Are you sure you want to delete ${teacher.user?.firstName} ${teacher.user?.lastName}?`)) {
            return;
        }
        
        try {
            const result = await dispatch(deleteTeacher(teacher._id));
            if (deleteTeacher.fulfilled.match(result)) {
                toast.success('Teacher deleted successfully!');
            } else {
                toast.error(result.payload || 'Failed to delete teacher');
            }
        } catch (error) {
            toast.error('Failed to delete teacher');
        }
    };

    const handleOpenAssignModal = (teacher) => {
        setSelectedTeacher(teacher);
        setAssignments([{ classId: '', subjectId: '', isClassTeacher: false }]);
        setShowAssignModal(true);
    };

    const handleAddAssignmentRow = () => {
        setAssignments([...assignments, { classId: '', subjectId: '', isClassTeacher: false }]);
    };

    const handleRemoveAssignmentRow = (index) => {
        setAssignments(assignments.filter((_, i) => i !== index));
    };

    const handleAssignmentChange = (index, field, value) => {
        const updatedAssignments = [...assignments];
        updatedAssignments[index][field] = value;
        setAssignments(updatedAssignments);
    };

    const handleAssignClasses = async (e) => {
        e.preventDefault();

        // Validate assignments
        const validAssignments = assignments.filter(a => a.classId && a.subjectId);
        if (validAssignments.length === 0) {
            toast.error('Please select at least one class and subject');
            return;
        }

        setSubmitting(true);
        try {
            const result = await dispatch(assignMultipleClassesToTeacher({
                teacherId: selectedTeacher._id,
                assignments: validAssignments
            }));

            if (assignMultipleClassesToTeacher.fulfilled.match(result)) {
                toast.success('Classes assigned successfully!');
                setShowAssignModal(false);
                setSelectedTeacher(null);
                setAssignments([{ classId: '', subjectId: '', isClassTeacher: false }]);
            } else {
                toast.error(result.payload || 'Failed to assign classes');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveClassAssignment = async (teacherId, assignmentId) => {
        if (!window.confirm('Are you sure you want to remove this class assignment?')) {
            return;
        }

        const result = await dispatch(removeClassFromTeacher({
            teacherId,
            assignmentId
        }));

        if (removeClassFromTeacher.fulfilled.match(result)) {
            toast.success('Class assignment removed successfully');
        } else {
            toast.error(result.payload || 'Failed to remove class assignment');
        }
    };

    return (
        <div className="teachers-page">
            <div className="page-header">
                <div>
                    <h1>Teachers</h1>
                    <p className="text-muted">Manage teaching staff and class assignments</p>
                </div>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <HiOutlinePlus size={20} />
                        Add Teacher
                    </button>
                )}
            </div>

            <div className="search-bar" style={{ maxWidth: 400, marginBottom: 'var(--spacing-xl)' }}>
                <HiOutlineSearch className="search-icon" />
                <input
                    type="text"
                    placeholder="Search teachers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Employee ID</th>
                                <th>Email</th>
                                <th>Subjects</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTeachers.map((teacher, index) => (
                                <tr key={teacher._id} className="animate-fadeIn" style={{ animationDelay: `${index * 0.05}s` }}>
                                    <td>
                                        <div className="teacher-name-cell">
                                            <div className="teacher-avatar">
                                                {teacher.user?.firstName?.charAt(0)}{teacher.user?.lastName?.charAt(0)}
                                            </div>
                                            <span>{teacher.user?.firstName} {teacher.user?.lastName}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="employee-id-badge">{teacher.employeeId}</span>
                                    </td>
                                    <td>
                                        <div className="contact-cell">
                                            <HiOutlineMail />
                                            <span>{teacher.user?.email}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="subjects-cell">
                                            {teacher.subjects?.slice(0, 3).map(subject => (
                                                <span key={subject._id} className="subject-tag">{subject.code}</span>
                                            ))}
                                            {teacher.subjects?.length > 3 && (
                                                <span className="subject-tag more">+{teacher.subjects.length - 3}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="actions-cell">
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => navigate(`/portal/teachers/${teacher._id}`)}
                                                title="View Details"
                                            >
                                                <HiOutlineEye size={16} />
                                                View
                                            </button>
                                            {isAdmin && (
                                                <>
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => handleEdit(teacher)}
                                                        title="Edit Teacher"
                                                    >
                                                        <HiOutlinePencil size={16} />
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => handleOpenAssignModal(teacher)}
                                                        title="Assign Classes"
                                                    >
                                                        <HiOutlineUserGroup size={16} />
                                                        Assign
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleDelete(teacher)}
                                                        title="Delete Teacher"
                                                    >
                                                        <HiOutlineTrash size={16} />
                                                        Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredTeachers.length === 0 && (
                        <div className="empty-state">
                            <p>No teachers found</p>
                        </div>
                    )}
                </div>
            )}

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Add New Teacher</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>First Name *</label>
                                        <input
                                            type="text"
                                            value={formData.firstName}
                                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Last Name *</label>
                                        <input
                                            type="text"
                                            value={formData.lastName}
                                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Email *</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Phone</label>
                                        <input
                                            type="tel"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Department</label>
                                        <input
                                            type="text"
                                            value={formData.department}
                                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Qualification</label>
                                        <input
                                            type="text"
                                            value={formData.qualification}
                                            onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                                            placeholder="e.g., B.Ed, M.Sc"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Subjects (hold Ctrl to select multiple)</label>
                                    <select
                                        multiple
                                        value={formData.subjects}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            subjects: Array.from(e.target.selectedOptions, opt => opt.value)
                                        })}
                                        style={{ height: 120 }}
                                    >
                                        {subjects.map(subject => (
                                            <option key={subject._id} value={subject._id}>
                                                {subject.name} ({subject.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Creating...' : 'Add Teacher'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && editingTeacher && (
                <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit Teacher</h3>
                            <button className="modal-close" onClick={() => setShowEditModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleUpdate}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>First Name *</label>
                                        <input
                                            type="text"
                                            value={formData.firstName}
                                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Last Name *</label>
                                        <input
                                            type="text"
                                            value={formData.lastName}
                                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Email *</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Phone</label>
                                        <input
                                            type="tel"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Department</label>
                                        <input
                                            type="text"
                                            value={formData.department}
                                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Qualification</label>
                                        <input
                                            type="text"
                                            value={formData.qualification}
                                            onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                                            placeholder="e.g., B.Ed, M.Sc"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Subjects (hold Ctrl to select multiple)</label>
                                    <select
                                        multiple
                                        value={formData.subjects}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            subjects: Array.from(e.target.selectedOptions, opt => opt.value)
                                        })}
                                        style={{ height: 120 }}
                                    >
                                        {subjects.map(subject => (
                                            <option key={subject._id} value={subject._id}>
                                                {subject.name} ({subject.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Updating...' : 'Update Teacher'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Assign Classes Modal */}
            {showAssignModal && selectedTeacher && (
                <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Assign Classes to {selectedTeacher.user?.firstName} {selectedTeacher.user?.lastName}</h3>
                            <button className="modal-close" onClick={() => setShowAssignModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleAssignClasses}>
                            <div className="modal-body">
                                <div className="assignments-container">
                                    {assignments.map((assignment, index) => (
                                        <div key={index} className="assignment-row">
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Class *</label>
                                                    <select
                                                        value={assignment.classId}
                                                        onChange={(e) => handleAssignmentChange(index, 'classId', e.target.value)}
                                                        required
                                                    >
                                                        <option value="">Select a class</option>
                                                        {classes.map(cls => (
                                                            <option key={cls._id} value={cls._id}>
                                                                {cls.name} ({cls.academicYear})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label>Subject *</label>
                                                    <select
                                                        value={assignment.subjectId}
                                                        onChange={(e) => handleAssignmentChange(index, 'subjectId', e.target.value)}
                                                        required
                                                    >
                                                        <option value="">Select a subject</option>
                                                        {subjects.map(subject => (
                                                            <option key={subject._id} value={subject._id}>
                                                                {subject.name} ({subject.code})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={assignment.isClassTeacher}
                                                        onChange={(e) => handleAssignmentChange(index, 'isClassTeacher', e.target.checked)}
                                                    />
                                                    Set as Class Teacher
                                                </label>
                                            </div>
                                            {assignments.length > 1 && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleRemoveAssignmentRow(index)}
                                                >
                                                    <HiOutlineTrash size={14} /> Remove
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleAddAssignmentRow}
                                    style={{ marginTop: '1rem' }}
                                >
                                    <HiOutlinePlus size={16} /> Add Another Class
                                </button>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Assigning...' : 'Assign Classes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeachersPage;
