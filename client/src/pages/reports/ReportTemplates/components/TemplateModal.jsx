const TemplateModal = ({
  isOpen,
  editingTemplate,
  formData,
  reportTypes,
  languages,
  onClose,
  onInputChange,
  onSave,
  saving
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{editingTemplate ? 'Edit Template' : 'Create Template'}</h2>

        <div className="form-group">
          <label>Template Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={onInputChange}
            placeholder="e.g., Monthly Progress Report"
          />
        </div>

        <div className="form-group">
          <label>Report Type</label>
          <select name="type" value={formData.type} onChange={onInputChange}>
            {reportTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Language</label>
          <select name="language" value={formData.language} onChange={onInputChange}>
            {languages.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Custom Prompt</label>
          <textarea
            name="customPrompt"
            value={formData.customPrompt}
            onChange={onInputChange}
            placeholder="Enter custom AI prompt for this template..."
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={saving || !formData.name || !formData.customPrompt}
          >
            {saving ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateModal;