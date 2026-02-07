import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import './ReportTemplates.css';

const ReportTemplates = () => {
  const { token } = useSelector((state) => state.auth);
  
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'monthly',
    language: 'english',
    customPrompt: '',
    variables: []
  });
  const [filters, setFilters] = useState({
    type: '',
    language: ''
  });
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [token, filters]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.type) params.append('type', filters.type);
      if (filters.language) params.append('language', filters.language);

      const response = await fetch(`/api/reports/templates?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      type: 'monthly',
      language: 'english',
      customPrompt: '',
      variables: []
    });
    setShowModal(true);
  };

  const handleOpenEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      type: template.type,
      language: template.language,
      customPrompt: template.customPrompt,
      variables: template.variables || []
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const url = editingTemplate
        ? `/api/reports/templates/${editingTemplate._id}`
        : '/api/reports/templates';
      
      const method = editingTemplate ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: `Template ${editingTemplate ? 'updated' : 'created'} successfully!` });
        setShowModal(false);
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to save template' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save template' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;

    try {
      const response = await fetch(`/api/reports/templates/${templateId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'Template deleted successfully!' });
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to delete template' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete template' });
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const filteredTemplates = templates.filter(template => {
    if (filters.type && template.type !== filters.type) return false;
    if (filters.language && template.language !== filters.language) return false;
    return true;
  });

  const reportTypes = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'custom', label: 'Custom' }
  ];

  const languages = [
    { value: 'english', label: 'English' },
    { value: 'arabic', label: 'Arabic' },
    { value: 'bilingual', label: 'Bilingual' }
  ];

  return (
    <div className="templates-container">
      <div className="templates-header">
        <div>
          <h1>Report Templates</h1>
          <p>Create and manage custom AI report templates</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreate}>
          + Create Template
        </button>
      </div>

      {message && (
        <div className={message.type === 'success' ? 'success-toast' : 'error-toast'}>
          {message.text}
        </div>
      )}

      <div className="templates-filters">
        <div className="filter-group">
          <label>Report Type</label>
          <select value={filters.type} onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}>
            <option value="">All Types</option>
            {reportTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Language</label>
          <select value={filters.language} onChange={(e) => setFilters(prev => ({ ...prev, language: e.target.value }))}>
            <option value="">All Languages</option>
            {languages.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading templates...</span>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="empty-state">
          <h3>No templates found</h3>
          <p>Create your first template to get started</p>
        </div>
      ) : (
        <div className="templates-grid">
          {filteredTemplates.map(template => (
            <div key={template._id} className="template-card">
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
                <button className="btn btn-sm btn-outline" onClick={() => handleOpenEdit(template)}>
                  Edit
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => handleDelete(template._id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editingTemplate ? 'Edit Template' : 'Create Template'}</h2>
            
            <div className="form-group">
              <label>Template Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="e.g., Monthly Progress Report"
              />
            </div>

            <div className="form-group">
              <label>Report Type</label>
              <select name="type" value={formData.type} onChange={handleInputChange}>
                {reportTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Language</label>
              <select name="language" value={formData.language} onChange={handleInputChange}>
                {languages.map(lang => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Custom Prompt</label>
              <textarea
                name="customPrompt"
                value={formData.customPrompt}
                onChange={handleInputChange}
                placeholder="Enter custom AI prompt for this template..."
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSave}
                disabled={saving || !formData.name || !formData.customPrompt}
              >
                {saving ? 'Saving...' : (editingTemplate ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportTemplates;
