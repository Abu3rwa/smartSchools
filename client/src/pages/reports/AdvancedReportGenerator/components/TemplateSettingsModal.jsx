import { useState, useEffect } from 'react';
import api from '../../../../config/api';
import { SOURCES, SECTIONS } from '../constants';

// Teacher is the default scope: a school-wide template silently changing what
// another teacher's reports look like is exactly the surprise we want to avoid.
const emptyForm = () => ({
  name: '',
  scope: 'teacher',
  classId: '',
  isDefault: false,
  sources: SOURCES.filter(s => s.default).map(s => s.key),
  sections: SECTIONS.map(s => ({ key: s.key, enabled: true, maxWords: s.defaultMaxWords })),
  templatePrompt: '',
  defaultLanguage: 'en',
  secondaryLanguage: ''
});

const TemplateSettingsModal = ({ open, onClose, profiles, onProfilesChange, classes = [], canUseSchoolScope = false }) => {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setCreating(false);
      setError(null);
    }
  }, [open]);

  const handleEdit = (profile) => {
    setEditing(profile);
    setCreating(false);
    setForm({
      name: profile.name,
      // Scope is fixed at creation (the server does not accept changes to it).
      scope: profile.scope,
      classId: profile.classId || '',
      isDefault: !!profile.isDefault,
      sources: profile.sources || [],
      sections: profile.sections || SECTIONS.map(s => ({ key: s.key, enabled: true, maxWords: s.defaultMaxWords })),
      templatePrompt: profile.templatePrompt || '',
      defaultLanguage: profile.defaultLanguage || 'en',
      secondaryLanguage: profile.secondaryLanguage || ''
    });
  };

  const handleCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (form.scope === 'class' && !form.classId) {
      setError('Choose which class this template applies to.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const res = await api.put(`/reports/profiles/${editing._id}`, form);
        if (res.data?.success) {
          onProfilesChange(profiles.map(p => p._id === editing._id ? res.data.data : p));
          setEditing(null);
        } else {
          setError(res.data?.message || 'Failed to update template');
        }
      } else {
        const res = await api.post('/reports/profiles', form);
        if (res.data?.success) {
          onProfilesChange([...profiles, res.data.data]);
          setCreating(false);
        } else {
          setError(res.data?.message || 'Failed to create template');
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      const res = await api.delete(`/reports/profiles/${id}`);
      if (res.data?.success) {
        onProfilesChange(profiles.filter(p => p._id !== id));
        if (editing?._id === id) setEditing(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete template');
    }
  };

  const handleSourceToggle = (key) => {
    setForm(prev => ({
      ...prev,
      sources: prev.sources.includes(key)
        ? prev.sources.filter(s => s !== key)
        : [...prev.sources, key]
    }));
  };

  const handleSectionToggle = (key) => {
    setForm(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.key === key ? { ...s, enabled: !s.enabled } : s
      )
    }));
  };

  const handleSectionWords = (key, maxWords) => {
    setForm(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.key === key ? { ...s, maxWords: parseInt(maxWords, 10) || 50 } : s
      )
    }));
  };

  if (!open) return null;

  const isFormOpen = editing || creating;

  return (
    <div className="rg-modal-overlay" onClick={onClose}>
      <div className="rg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rg-modal-head">
          <h2>{isFormOpen ? (editing ? 'Edit Template' : 'New Template') : 'Report Templates'}</h2>
          <button type="button" className="rg-btn rg-btn-ghost" onClick={onClose} title="Close">✕</button>
        </div>

        {!isFormOpen ? (
          <>
            <div className="rg-modal-body">
              {profiles.length === 0 ? (
                <p className="rg-empty-text">No templates yet. Create one to set default sources, sections, and prompts.</p>
              ) : (
                <div className="rg-template-list">
                  {profiles.map((p) => (
                    <div key={p._id} className="rg-template-card">
                      <div className="rg-template-info">
                        <h4>{p.name}</h4>
                        <p>{p.scope} · {p.sources?.length || 0} sources · {p.sections?.length || 0} sections</p>
                      </div>
                      <div className="rg-template-actions">
                        <button type="button" className="rg-btn rg-btn-secondary" onClick={() => handleEdit(p)}>Edit</button>
                        <button type="button" className="rg-btn rg-btn-ghost" onClick={() => handleDelete(p._id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rg-modal-foot">
              <button type="button" className="rg-btn rg-btn-primary" onClick={handleCreate}>+ New Template</button>
            </div>
          </>
        ) : (
          <>
            <div className="rg-modal-body">
              {error && <div className="rg-notice is-error">{error}</div>}

              <div className="rg-field">
                <label className="rg-label" htmlFor="tpl-name">Template Name</label>
                <input
                  id="tpl-name"
                  className="rg-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Monthly Progress Report"
                />
              </div>

              <div className="rg-field">
                <label className="rg-label" htmlFor="tpl-scope">Scope</label>
                <select
                  id="tpl-scope"
                  className="rg-select"
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  disabled={!!editing}
                  title={editing ? 'Scope is fixed once a template is created.' : 'Who this template applies to'}
                >
                  {canUseSchoolScope && <option value="school">School-wide</option>}
                  <option value="teacher">Teacher</option>
                  <option value="class">Class</option>
                </select>
                {editing && (
                  <p className="rg-hint">Scope is fixed once a template is created — make a new template to change it.</p>
                )}
                {!canUseSchoolScope && (
                  <p className="rg-hint">Only your own or class templates. School-wide templates are for administrators.</p>
                )}
              </div>

              {form.scope === 'class' && (
                <div className="rg-field">
                  <label className="rg-label" htmlFor="tpl-class">Applies to Class</label>
                  <select
                    id="tpl-class"
                    className="rg-select"
                    value={form.classId}
                    onChange={(e) => setForm({ ...form, classId: e.target.value })}
                  >
                    <option value="">Select a class…</option>
                    {classes.map((cls) => (
                      <option key={cls._id} value={cls._id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="rg-field">
                <label className="rg-source-item">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  />
                  <span className="rg-source-name">Use as the default for this scope</span>
                </label>
                <p className="rg-hint">
                  The generator preselects the default template instead of “Default (no profile)”.
                  Only one template can be the default per scope.
                </p>
              </div>

              <div className="rg-field">
                <label className="rg-label">Data Sources</label>
                <div className="rg-source-grid">
                  {SOURCES.map((source) => (
                    <label key={source.key} className="rg-source-item">
                      <input
                        type="checkbox"
                        checked={form.sources.includes(source.key)}
                        onChange={() => handleSourceToggle(source.key)}
                      />
                      <span className="rg-source-name">{source.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rg-field">
                <label className="rg-label">Report Sections</label>
                <div className="rg-section-list">
                  {SECTIONS.map((section) => {
                    const current = form.sections.find(s => s.key === section.key);
                    return (
                      <div key={section.key} className="rg-section-row">
                        <label className="rg-source-item" style={{ flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={current?.enabled ?? true}
                            onChange={() => handleSectionToggle(section.key)}
                          />
                          <span className="rg-source-name">{section.label}</span>
                        </label>
                        <input
                          type="number"
                          className="rg-words-input"
                          value={current?.maxWords ?? section.defaultMaxWords}
                          onChange={(e) => handleSectionWords(section.key, e.target.value)}
                          min={50}
                          max={500}
                          title={`Max words for ${section.label}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rg-field">
                <label className="rg-label" htmlFor="tpl-prompt">Template Prompt (Optional)</label>
                <textarea
                  id="tpl-prompt"
                  className="rg-textarea"
                  value={form.templatePrompt}
                  onChange={(e) => setForm({ ...form, templatePrompt: e.target.value })}
                  placeholder="Custom instructions for the AI when generating reports with this template..."
                  rows={4}
                />
              </div>

              <div className="rg-field">
                <label className="rg-label" htmlFor="tpl-lang">Default Language</label>
                <select
                  id="tpl-lang"
                  className="rg-select"
                  value={form.defaultLanguage}
                  onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
            </div>
            <div className="rg-modal-foot">
              <button type="button" className="rg-btn rg-btn-ghost" onClick={() => { setEditing(null); setCreating(false); }}>
                Cancel
              </button>
              <button type="button" className="rg-btn rg-btn-primary" onClick={handleSave} disabled={saving || !form.name}>
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TemplateSettingsModal;
