import { useState, useEffect } from 'react';
import api from '../config/api';
import toast from 'react-hot-toast';
import {
    HiOutlinePlus,
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineArrowUp,
    HiOutlineArrowDown
} from 'react-icons/hi';
import './LessonPlanCriteria.css';

const LessonPlanCriteria = () => {
    const [criteria, setCriteria] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        weight: 3,
        minScore: 60,
        isRequired: true,
        evaluationPrompt: ''
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchCriteria();
    }, []);

    const fetchCriteria = async () => {
        setLoading(true);
        try {
            const response = await api.get('/lesson-plan-criteria');
            setCriteria(response.data || []);
        } catch (error) {
            toast.error('Failed to load criteria');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleInitializeDefaults = async () => {
        if (!window.confirm('Initialize default lesson plan criteria? This will create 6 standard criteria.')) {
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/lesson-plan-criteria/initialize-defaults');
            toast.success(response.data.message || 'Default criteria created');
            fetchCriteria();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to initialize defaults');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (criterion = null) => {
        if (criterion) {
            setEditingId(criterion._id);
            setFormData({
                name: criterion.name,
                description: criterion.description || '',
                weight: criterion.weight,
                minScore: criterion.minScore,
                isRequired: criterion.isRequired,
                evaluationPrompt: criterion.evaluationPrompt || ''
            });
        } else {
            setEditingId(null);
            setFormData({
                name: '',
                description: '',
                weight: 3,
                minScore: 60,
                isRequired: true,
                evaluationPrompt: ''
            });
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingId(null);
        setFormData({
            name: '',
            description: '',
            weight: 3,
            minScore: 60,
            isRequired: true,
            evaluationPrompt: ''
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            if (editingId) {
                await api.put(`/lesson-plan-criteria/${editingId}`, formData);
                toast.success('Criterion updated successfully');
            } else {
                await api.post('/lesson-plan-criteria', formData);
                toast.success('Criterion created successfully');
            }
            handleCloseModal();
            fetchCriteria();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save criterion');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete criterion "${name}"? This will deactivate it.`)) {
            return;
        }

        try {
            await api.delete(`/lesson-plan-criteria/${id}`);
            toast.success('Criterion deleted');
            fetchCriteria();
        } catch (error) {
            toast.error('Failed to delete criterion');
        }
    };

    const handleMoveUp = async (index) => {
        if (index === 0) return;
        
        const newCriteria = [...criteria];
        [newCriteria[index - 1], newCriteria[index]] = [newCriteria[index], newCriteria[index - 1]];
        
        await reorderCriteria(newCriteria);
    };

    const handleMoveDown = async (index) => {
        if (index === criteria.length - 1) return;
        
        const newCriteria = [...criteria];
        [newCriteria[index], newCriteria[index + 1]] = [newCriteria[index + 1], newCriteria[index]];
        
        await reorderCriteria(newCriteria);
    };

    const reorderCriteria = async (newOrder) => {
        const criteriaIds = newOrder.map(c => c._id);
        
        try {
            await api.patch('/lesson-plan-criteria/reorder', { criteriaIds });
            setCriteria(newOrder);
            toast.success('Order updated');
        } catch (error) {
            toast.error('Failed to reorder criteria');
            fetchCriteria();
        }
    };

    return (
        <div className="lesson-plan-criteria">
            <div className="criteria-header">
                <div>
                    <h3>Lesson Plan Evaluation Criteria</h3>
                    <p className="text-muted">
                        Define the criteria used to evaluate teacher lesson plans. 
                        AI will assess submitted plans against these standards.
                    </p>
                </div>
                <div className="criteria-actions">
                    {criteria.length === 0 && (
                        <button 
                            className="btn btn-secondary" 
                            onClick={handleInitializeDefaults}
                            disabled={loading}
                        >
                            Initialize Defaults
                        </button>
                    )}
                    <button 
                        className="btn btn-primary" 
                        onClick={() => handleOpenModal()}
                    >
                        <HiOutlinePlus size={18} />
                        Add Criterion
                    </button>
                </div>
            </div>

            {loading && <div className="loading">Loading criteria...</div>}

            {!loading && criteria.length === 0 && (
                <div className="empty-state">
                    <p>No evaluation criteria configured yet.</p>
                    <p className="text-muted">
                        Click "Initialize Defaults" to create 6 standard criteria, or add your own custom criteria.
                    </p>
                </div>
            )}

            {!loading && criteria.length > 0 && (
                <div className="criteria-list">
                    {criteria.map((criterion, index) => (
                        <div key={criterion._id} className="criterion-card">
                            <div className="criterion-header">
                                <div className="criterion-title">
                                    <span className="criterion-order">{index + 1}</span>
                                    <h4>{criterion.name}</h4>
                                    {criterion.isRequired && (
                                        <span className="badge badge-required">Required</span>
                                    )}
                                </div>
                                <div className="criterion-actions">
                                    <button
                                        className="btn-icon"
                                        onClick={() => handleMoveUp(index)}
                                        disabled={index === 0}
                                        title="Move up"
                                    >
                                        <HiOutlineArrowUp size={18} />
                                    </button>
                                    <button
                                        className="btn-icon"
                                        onClick={() => handleMoveDown(index)}
                                        disabled={index === criteria.length - 1}
                                        title="Move down"
                                    >
                                        <HiOutlineArrowDown size={18} />
                                    </button>
                                    <button
                                        className="btn-icon"
                                        onClick={() => handleOpenModal(criterion)}
                                        title="Edit"
                                    >
                                        <HiOutlinePencil size={18} />
                                    </button>
                                    <button
                                        className="btn-icon btn-danger"
                                        onClick={() => handleDelete(criterion._id, criterion.name)}
                                        title="Delete"
                                    >
                                        <HiOutlineTrash size={18} />
                                    </button>
                                </div>
                            </div>

                            {criterion.description && (
                                <p className="criterion-description">{criterion.description}</p>
                            )}

                            <div className="criterion-meta">
                                <div className="meta-item">
                                    <span className="meta-label">Weight:</span>
                                    <span className="meta-value">{criterion.weight}/5</span>
                                </div>
                                <div className="meta-item">
                                    <span className="meta-label">Min Score:</span>
                                    <span className="meta-value">{criterion.minScore}%</span>
                                </div>
                            </div>

                            {criterion.evaluationPrompt && (
                                <details className="criterion-prompt">
                                    <summary>Evaluation Guidance</summary>
                                    <p>{criterion.evaluationPrompt}</p>
                                </details>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? 'Edit Criterion' : 'Add Criterion'}</h3>
                            <button className="btn-close" onClick={handleCloseModal}>
                                <HiOutlineX size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Learning Objectives"
                                    required
                                    maxLength={100}
                                />
                            </div>

                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Brief description of what this criterion evaluates"
                                    rows={2}
                                    maxLength={500}
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Weight (1-5) *</label>
                                    <input
                                        type="number"
                                        value={formData.weight}
                                        onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                                        min={1}
                                        max={5}
                                        required
                                    />
                                    <small className="text-muted">Higher weight = more important</small>
                                </div>

                                <div className="form-group">
                                    <label>Minimum Score (%) *</label>
                                    <input
                                        type="number"
                                        value={formData.minScore}
                                        onChange={(e) => setFormData({ ...formData, minScore: parseInt(e.target.value) })}
                                        min={0}
                                        max={100}
                                        required
                                    />
                                    <small className="text-muted">Required to pass</small>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.isRequired}
                                        onChange={(e) => setFormData({ ...formData, isRequired: e.target.checked })}
                                    />
                                    <span>This criterion is required</span>
                                </label>
                                <small className="text-muted">
                                    Required criteria must meet minimum score for plan approval
                                </small>
                            </div>

                            <div className="form-group">
                                <label>Evaluation Guidance</label>
                                <textarea
                                    value={formData.evaluationPrompt}
                                    onChange={(e) => setFormData({ ...formData, evaluationPrompt: e.target.value })}
                                    placeholder="Instructions for AI on how to evaluate this criterion"
                                    rows={3}
                                    maxLength={1000}
                                />
                                <small className="text-muted">
                                    Help the AI understand what to look for when evaluating this criterion
                                </small>
                            </div>

                            <div className="modal-footer">
                                <button 
                                    type="button" 
                                    className="btn btn-secondary" 
                                    onClick={handleCloseModal}
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="btn btn-primary"
                                    disabled={submitting}
                                >
                                    {submitting ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LessonPlanCriteria;
