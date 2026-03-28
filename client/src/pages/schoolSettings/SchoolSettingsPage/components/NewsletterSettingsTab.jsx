const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly (Every 2 Weeks)' },
  { value: 'monthly', label: 'Monthly' },
];

const NewsletterSettingsTab = ({ settings, loading, saving, departments, onChange, onSave }) => {
  const data = settings?.data || {};
  const overrides = data.departmentOverrides || [];

  const handleAddOverride = () => {
    onChange({
      departmentOverrides: [
        ...overrides,
        { department: '', frequency: '', aiMinWords: '', aiMaxWords: '' },
      ],
    });
  };

  const handleUpdateOverride = (index, patch) => {
    const updated = overrides.map((o, i) => (i === index ? { ...o, ...patch } : o));
    onChange({ departmentOverrides: updated });
  };

  const handleRemoveOverride = (index) => {
    onChange({ departmentOverrides: overrides.filter((_, i) => i !== index) });
  };

  return (
    <div className="card admissions-promotion-settings-card">
      <div className="tab-header">
        <div>
          <h3>Newsletter Settings</h3>
          <span>Configure newsletter frequency and AI-generated word limits for your school.</span>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Loading settings...</p>
      ) : (
        <>
          <div className="settings-section" style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 12 }}>School-Wide Defaults</h4>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Newsletter Frequency</label>
              <select
                className="form-control"
                value={data.frequency || 'weekly'}
                onChange={(e) => onChange({ frequency: e.target.value })}
                style={{ maxWidth: 260 }}
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <small className="form-text text-muted">
                How often newsletters are generated and sent to parents.
              </small>
            </div>

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
              <div className="form-group" style={{ flex: '0 0 200px' }}>
                <label className="form-label">AI Min Words</label>
                <input
                  type="number"
                  className="form-control"
                  min={30}
                  max={500}
                  value={data.aiMinWords ?? 100}
                  onChange={(e) => onChange({ aiMinWords: Number(e.target.value) })}
                />
                <small className="form-text text-muted">Minimum words (30–500)</small>
              </div>
              <div className="form-group" style={{ flex: '0 0 200px' }}>
                <label className="form-label">AI Max Words</label>
                <input
                  type="number"
                  className="form-control"
                  min={50}
                  max={600}
                  value={data.aiMaxWords ?? 120}
                  onChange={(e) => onChange({ aiMaxWords: Number(e.target.value) })}
                />
                <small className="form-text text-muted">Maximum words (50–600)</small>
              </div>
            </div>
          </div>

          <div className="settings-section" style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 12 }}>Department Overrides</h4>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
              Optionally override frequency or word limits for specific departments.
            </p>

            {overrides.map((override, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-end',
                  marginBottom: 12,
                  padding: 12,
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Department</label>
                  <select
                    className="form-control"
                    value={override.department?._id || override.department || ''}
                    onChange={(e) => handleUpdateOverride(index, { department: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {(departments || []).map((d) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '0 0 150px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Frequency</label>
                  <select
                    className="form-control"
                    value={override.frequency || ''}
                    onChange={(e) => handleUpdateOverride(index, { frequency: e.target.value || undefined })}
                  >
                    <option value="">Same as school</option>
                    {FREQUENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '0 0 100px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Min Words</label>
                  <input
                    type="number"
                    className="form-control"
                    min={30}
                    max={500}
                    value={override.aiMinWords || ''}
                    placeholder="—"
                    onChange={(e) => handleUpdateOverride(index, { aiMinWords: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
                <div className="form-group" style={{ flex: '0 0 100px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Max Words</label>
                  <input
                    type="number"
                    className="form-control"
                    min={50}
                    max={600}
                    value={override.aiMaxWords || ''}
                    placeholder="—"
                    onChange={(e) => handleUpdateOverride(index, { aiMaxWords: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
                <button
                  className="btn btn-sm btn-outline-danger"
                  style={{ height: 36, alignSelf: 'flex-end' }}
                  onClick={() => handleRemoveOverride(index)}
                  title="Remove override"
                >
                  ×
                </button>
              </div>
            ))}

            <button className="btn btn-sm btn-outline-primary" onClick={handleAddOverride}>
              + Add Department Override
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16 }}>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? 'Saving...' : 'Save Newsletter Settings'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default NewsletterSettingsTab;
