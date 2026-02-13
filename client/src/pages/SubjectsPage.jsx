import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchSubjects, selectSubjects, selectSubjectsLoading, selectSubjectsError, createSubject, updateSubject, deleteSubject } from '../store/slices/subjectSlice';
import { selectIsAdmin } from '../store/slices/authSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineBookOpen, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './SubjectsPage.css';

const SubjectsPage = () => {
    const dispatch = useDispatch();
    const subjects = useSelector(selectSubjects);
    const loading = useSelector(selectSubjectsLoading);
    const error = useSelector(selectSubjectsError);
    const isAdmin = useSelector(selectIsAdmin);

    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        description: '',
        dailyMaxMarks: 10,
        maxMarks: 100,
        passingMarks: 40,
        type: 'core'
    });

    useEffect(() => {
        dispatch(fetchSubjects());
    }, [dispatch]);

    const filteredSubjects = subjects.filter(subject =>
        subject.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        subject.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            let result;
            if (editingId) {
                result = await dispatch(updateSubject({ id: editingId, data: formData }));
            } else {
                result = await dispatch(createSubject(formData));
            }

            if (createSubject.fulfilled.match(result) || updateSubject.fulfilled.match(result)) {
                toast.success(`Subject ${editingId ? 'updated' : 'created'} successfully!`);
                handleCloseModal();
            } else {
                toast.error(result.payload || `Failed to ${editingId ? 'update' : 'create'} subject`);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (subject) => {
        setEditingId(subject._id);
        setFormData({
            name: subject.name,
            code: subject.code,
            description: subject.description || '',
            dailyMaxMarks: subject.dailyMaxMarks,
            maxMarks: subject.maxMarks,
            passingMarks: subject.passingMarks,
            type: subject.type
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this subject?')) {
            const result = await dispatch(deleteSubject(id));
            if (deleteSubject.fulfilled.match(result)) {
                toast.success('Subject deleted successfully');
            } else {
                toast.error(result.payload || 'Failed to delete subject');
            }
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingId(null);
        setFormData({
            name: '',
            code: '',
            description: '',
            dailyMaxMarks: 10,
            maxMarks: 100,
            passingMarks: 40,
            type: 'core'
        });
    };

    return (
        <div className="subjects-page">
            <div className="page-header">
                <div>
                    <h1>Subjects</h1>
                    <p className="text-muted">Manage curriculum subjects and grading criteria</p>
                </div>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <HiOutlinePlus size={20} />
                        Add Subject
                    </button>
                )}
            </div>

            <div className="search-bar" style={{ maxWidth: 400, marginBottom: 'var(--spacing-xl)' }}>
                <HiOutlineSearch className="search-icon" />
                <input
                    type="text"
                    placeholder="Search subjects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="loading-container">
                    <div className="spinner"></div>
                </div>
            ) : error ? (
                <div className="error-container">
                    <p className="error-message">{error}</p>
                    <button className="btn btn-primary" onClick={() => dispatch(fetchSubjects())}>
                        Retry
                    </button>
                </div>
            ) : (
                <div className="subjects-grid">
                    {filteredSubjects.map((subject, index) => (
                        <div
                            key={subject._id}
                            className="subject-card animate-fadeIn"
                            style={{ animationDelay: `${index * 0.03}s` }}
                        >
                            {isAdmin && (
                                <div className="subject-actions-overlay">
                                    <button onClick={() => handleEdit(subject)} className="btn-icon" title="Edit">
                                        <HiOutlinePencil />
                                    </button>
                                    <button onClick={() => handleDelete(subject._id)} className="btn-icon text-danger" title="Delete">
                                        <HiOutlineTrash />
                                    </button>
                                </div>
                            )}
                            <div className="subject-icon">
                                <HiOutlineBookOpen size={24} />
                            </div>
                            <div className="subject-main">
                                <h3>{subject.name}</h3>
                                <p className="subject-code">{subject.code}</p>
                            </div>
                            <div className="subject-meta">
                                <span className={`badge badge-${subject.type === 'core' ? 'primary' : 'info'}`}>
                                    {subject.type}
                                </span>
                                <span className="marks-info">
                                    Daily: {subject.dailyMaxMarks} | Max: {subject.maxMarks}
                                </span>
                            </div>
                        </div>
                    ))}
                    {filteredSubjects.length === 0 && (
                        <div className="empty-state">
                            <HiOutlineBookOpen size={48} />
                            <p>No subjects found</p>
                        </div>
                    )}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? 'Edit Subject' : 'Add New Subject'}</h3>
                            <button className="modal-close" onClick={handleCloseModal}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Subject Name *</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            placeholder="e.g., Mathematics"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Code *</label>
                                        <input
                                            type="text"
                                            value={formData.code}
                                            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                            required
                                            placeholder="e.g., MATH"
                                            maxLength={6}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={3}
                                        placeholder="Brief description of the subject"
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Daily Max Marks</label>
                                        <input
                                            type="number"
                                            value={formData.dailyMaxMarks}
                                            onChange={(e) => setFormData({ ...formData, dailyMaxMarks: parseFloat(e.target.value) || 0 })}
                                            min={0.5}
                                            max={50}
                                            step={0.5}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Exam Max Marks</label>
                                        <input
                                            type="number"
                                            value={formData.maxMarks}
                                            onChange={(e) => setFormData({ ...formData, maxMarks: parseFloat(e.target.value) || 0 })}
                                            min={1}
                                            max={200}
                                            step={0.5}
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Passing Marks</label>
                                        <input
                                            type="number"
                                            value={formData.passingMarks}
                                            onChange={(e) => setFormData({ ...formData, passingMarks: parseFloat(e.target.value) || 0 })}
                                            min={0.5}
                                            max={formData.maxMarks}
                                            step={0.5}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Type</label>
                                        <select
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        >
                                            <option value="core">Core</option>
                                            <option value="elective">Elective</option>
                                            <option value="extra">Extra-curricular</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Saving...' : (editingId ? 'Update Subject' : 'Add Subject')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubjectsPage;
