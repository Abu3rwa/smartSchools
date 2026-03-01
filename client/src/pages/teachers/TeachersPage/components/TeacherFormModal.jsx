const TeacherFormModal = ({
    open,
    mode,
    formData,
    setFormData,
    departments,
    subjects,
    submitting,
    onClose,
    onSubmit
}) => {
    if (!open) return null;

    const isEdit = mode === 'edit';

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{isEdit ? 'Edit Teacher' : 'Add New Teacher'}</h3>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={onSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label>First Name *</label>
                                <input
                                    type="text"
                                    value={formData.firstName}
                                    onChange={(event) => setFormData({ ...formData, firstName: event.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Last Name *</label>
                                <input
                                    type="text"
                                    value={formData.lastName}
                                    onChange={(event) => setFormData({ ...formData, lastName: event.target.value })}
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
                                    onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Department</label>
                                <select
                                    value={formData.department}
                                    onChange={(event) => setFormData({ ...formData, department: event.target.value })}
                                >
                                    <option value="">— No department —</option>
                                    {departments.map((department) => (
                                        <option key={department._id} value={department._id}>{department.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Qualification</label>
                                <input
                                    type="text"
                                    value={formData.qualification}
                                    onChange={(event) => setFormData({ ...formData, qualification: event.target.value })}
                                    placeholder="e.g., B.Ed, M.Sc"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Subjects (hold Ctrl to select multiple)</label>
                            <select
                                multiple
                                value={formData.subjects}
                                onChange={(event) => setFormData({
                                    ...formData,
                                    subjects: Array.from(event.target.selectedOptions, (option) => option.value)
                                })}
                                style={{ height: 120 }}
                            >
                                {subjects.map((subject) => (
                                    <option key={subject._id} value={subject._id}>
                                        {subject.name} ({subject.code})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Teacher' : 'Add Teacher')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TeacherFormModal;
