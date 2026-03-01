import { SUBJECT_TYPES } from '../constants';

const SubjectFormModal = ({
    open,
    editingId,
    formData,
    setFormData,
    submitting,
    onClose,
    onSubmit
}) => {
    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editingId ? 'Edit Subject' : 'Add New Subject'}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={onSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Subject Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                                    required
                                    placeholder="e.g., Mathematics"
                                />
                            </div>
                            <div className="form-group">
                                <label>Code *</label>
                                <input
                                    type="text"
                                    value={formData.code}
                                    onChange={(event) => setFormData({ ...formData, code: event.target.value.toUpperCase() })}
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
                                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
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
                                    onChange={(event) => setFormData({ ...formData, dailyMaxMarks: parseFloat(event.target.value) || 0 })}
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
                                    onChange={(event) => setFormData({ ...formData, maxMarks: parseFloat(event.target.value) || 0 })}
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
                                    onChange={(event) => setFormData({ ...formData, passingMarks: parseFloat(event.target.value) || 0 })}
                                    min={0.5}
                                    max={formData.maxMarks}
                                    step={0.5}
                                />
                            </div>
                            <div className="form-group">
                                <label>Type</label>
                                <select
                                    value={formData.type}
                                    onChange={(event) => setFormData({ ...formData, type: event.target.value })}
                                >
                                    {SUBJECT_TYPES.map((typeOption) => (
                                        <option key={typeOption.value} value={typeOption.value}>
                                            {typeOption.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : (editingId ? 'Update Subject' : 'Add Subject')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SubjectFormModal;
