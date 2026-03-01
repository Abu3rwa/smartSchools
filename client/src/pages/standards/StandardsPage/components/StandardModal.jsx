import StandardForm from './StandardForm';

const StandardModal = ({
    showModal,
    editingId,
    formData,
    onFormDataChange,
    subjects,
    submitting,
    onSubmit,
    onClose
}) => {
    if (!showModal) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editingId ? 'Edit Standard' : 'Add New Standard'}</h3>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <form onSubmit={onSubmit}>
                    <StandardForm
                        formData={formData}
                        onFormDataChange={onFormDataChange}
                        subjects={subjects}
                    />
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Saving...' : editingId ? 'Update Standard' : 'Add Standard'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StandardModal;
