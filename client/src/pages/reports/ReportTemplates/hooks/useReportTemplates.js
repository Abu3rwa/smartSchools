import { useCallback, useEffect, useMemo, useState } from 'react';
import { createEmptyTemplateForm, DEFAULT_FILTERS } from '../constants';

const normalizeLanguageValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'english') return 'en';
  if (normalized === 'arabic') return 'ar';
  return normalized;
};

const useReportTemplates = ({ token }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState(createEmptyTemplateForm());
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
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
  }, [filters.language, filters.type, token]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreate = useCallback(() => {
    setEditingTemplate(null);
    setFormData(createEmptyTemplateForm());
    setShowModal(true);
  }, []);

  const openEdit = useCallback((template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      type: template.type,
      language: normalizeLanguageValue(template.language),
      customPrompt: template.customPrompt,
      variables: template.variables || []
    });
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleInputChange = useCallback((event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSave = useCallback(async () => {
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
  }, [editingTemplate, fetchTemplates, formData, token]);

  const handleDelete = useCallback(async (templateId) => {
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
  }, [fetchTemplates, token]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      if (filters.type && template.type !== filters.type) return false;
      if (
        filters.language &&
        normalizeLanguageValue(template.language) !== normalizeLanguageValue(filters.language)
      ) {
        return false;
      }
      return true;
    });
  }, [filters.language, filters.type, templates]);

  return {
    templates,
    filteredTemplates,
    loading,
    showModal,
    editingTemplate,
    formData,
    filters,
    message,
    saving,
    setFilters,
    setShowModal,
    handleInputChange,
    handleSave,
    handleDelete,
    openCreate,
    openEdit,
    closeModal
  };
};

export default useReportTemplates;
