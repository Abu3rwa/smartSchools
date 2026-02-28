const TemplateCard = ({ template, onEdit, onDelete }) => (
  <div className="template-card">
    <div className="template-card-header">
      <h3>{template.name}</h3>
      <div className="template-badges">
        <span className="badge badge-type">{template.type}</span>
        <span className="badge badge-language">{template.language}</span>
      </div>
    </div>
    <div className="template-meta">
      <span>By: {template.createdBy?.firstName || 'System'}</span>
      <span>Used: {template.usageCount || 0} times</span>
    </div>
    <div className="template-preview">
      {template.customPrompt?.substring(0, 150)}...
    </div>
    <div className="template-actions">
      <button className="btn btn-sm btn-outline" onClick={() => onEdit(template)}>
        Edit
      </button>
      <button className="btn btn-sm btn-outline" onClick={() => onDelete(template._id)}>
        Delete
      </button>
    </div>
  </div>
);

export default TemplateCard;