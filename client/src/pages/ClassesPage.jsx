import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchClasses, selectClasses, selectClassesLoading, selectClassesError, createClass, updateClass, deleteClass } from '../store/slices/classSlice';
import { fetchDepartments, selectDepartments } from '../store/slices/departmentSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { selectIsAdmin } from '../store/slices/authSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineUserGroup, HiOutlineBookOpen, HiOutlineAcademicCap, HiOutlineTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './ClassesPage.css';

const ClassesPage = () => {
    const dispatch = useDispatch();
    const classes = useSelector(selectClasses);
    const departments = useSelector(selectDepartments);
    const loading = useSelector(selectClassesLoading);
    const error = useSelector(selectClassesError);
    const academicYear = useSelector(selectCurrentAcademicYear);
    const isAdmin = useSelector(selectIsAdmin);

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        grade: '',
        section: '',
        academicYear: academicYear,
        room: '',
        capacity: 40,
        department: ''
    });

    useEffect(() => {
        dispatch(fetchClasses({ academicYear }));
        dispatch(fetchDepartments());
    }, [dispatch, academicYear]);

    const filteredClasses = classes.filter(cls =>
        cls.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cls.grade?.toString().includes(searchTerm)
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await dispatch(createClass(formData));
            if (createClass.fulfilled.match(result)) {
                toast.success('Class created successfully!');
                setShowModal(false);
                setFormData({ grade: '', section: '', academicYear, room: '', capacity: 40, department: '' });
            } else {
                toast.error(result.payload || 'Failed to create class');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleActive = async (cls) => {
        const willActivate = cls.isActive === false;
        const actionLabel = willActivate ? 'activate' : 'deactivate';
        if (!window.confirm(`Are you sure you want to ${actionLabel} ${cls.name}?`)) {
            return;
        }

        const result = await dispatch(updateClass({
            id: cls._id,
            data: { isActive: willActivate }
        }));

        if (updateClass.fulfilled.match(result)) {
            toast.success(`Class ${willActivate ? 'activated' : 'deactivated'} successfully`);
        } else {
            toast.error(result.payload || `Failed to ${actionLabel} class`);
        }
    };

    const handleDeleteClass = async (cls) => {
        if (!window.confirm(`Delete ${cls.name}? This will deactivate the class and hide it from active workflows.`)) {
            return;
        }

        const result = await dispatch(deleteClass(cls._id));
        if (deleteClass.fulfilled.match(result)) {
            toast.success('Class deleted successfully');
        } else {
            toast.error(result.payload || 'Failed to delete class');
        }
    };

    return (
        <div className="classes-page">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1>Classes</h1>
                    <p className="text-muted">Manage your school classes and student enrollment</p>
                </div>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <HiOutlinePlus size={20} />
                        Add Class
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="search-bar">
                <HiOutlineSearch className="search-icon" />
                <input
                    type="text"
                    placeholder="Search classes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Classes Table */}
            {loading ? (
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            ) : error ? (
                <div className="error-container">
                    <p className="error-message">{error}</p>
                    <button className="btn btn-primary" onClick={() => dispatch(fetchClasses({ academicYear }))}>
                        Retry
                    </button>
                </div>
            ) : (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Grade</th>
                                <th>Section</th>
                                <th>Class Name</th>
                                <th>Department</th>
                                <th>Academic Year</th>
                                <th>Students</th>
                                <th>Subjects</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClasses.map((cls, index) => (
                                <tr key={cls._id} className="animate-fadeIn" style={{ animationDelay: `${index * 0.05}s` }}>
                                    <td>
                                        <span className="grade-badge">{cls.grade}</span>
                                    </td>
                                    <td>{cls.section || 'Main'}</td>
                                    <td>
                                        <Link to={`/portal/classes/${cls._id}`} className="class-link">
                                            {cls.name}
                                        </Link>
                                    </td>
                                    <td>{cls.department?.name ?? '—'}</td>
                                    <td>
                                        {cls.academicYear}
                                        {cls.isActive === false && (
                                            <span className="badge badge-secondary" style={{ marginLeft: 6 }}>Inactive</span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="stat-cell">
                                            <HiOutlineUserGroup />
                                            <span>{cls.studentCount || 0}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="stat-cell">
                                            <HiOutlineBookOpen />
                                            <span>{cls.subjects?.length || 0}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="actions-cell">
                                            <Link to={`/portal/classes/${cls._id}`} className="btn btn-sm btn-ghost">
                                                View
                                            </Link>
                                            {isAdmin && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handleToggleActive(cls)}
                                                    >
                                                        {cls.isActive === false ? 'Activate' : 'Deactivate'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleDeleteClass(cls)}
                                                    >
                                                        <HiOutlineTrash size={14} />
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
                    {filteredClasses.length === 0 && (
                        <div className="empty-state">
                            <HiOutlineAcademicCap size={48} />
                            <h3>No classes found</h3>
                            <p>Create a new class to get started</p>
                            {isAdmin && (
                                <button className="btn btn-primary mt-4" onClick={() => setShowModal(true)}>
                                    <HiOutlinePlus size={20} />
                                    <span>Create Class</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Create New Class</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Grade Level *</label>
                                        <select
                                            value={formData.grade}
                                            onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Grade</option>
                                            {[...Array(12)].map((_, i) => (
                                                <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Section</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., A, B, C"
                                            value={formData.section}
                                            onChange={(e) => setFormData({ ...formData, section: e.target.value.toUpperCase() })}
                                            maxLength={2}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Department</label>
                                        <select
                                            value={formData.department}
                                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                        >
                                            <option value="">— No department —</option>
                                            {departments.map((d) => (
                                                <option key={d._id} value={d._id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Room</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Room 101"
                                            value={formData.room}
                                            onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Capacity</label>
                                        <input
                                            type="number"
                                            value={formData.capacity}
                                            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                                            min={1}
                                            max={100}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Creating...' : 'Create Class'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClassesPage;
