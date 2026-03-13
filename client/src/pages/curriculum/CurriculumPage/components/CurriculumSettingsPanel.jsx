import { useTranslation } from 'react-i18next';

const CurriculumSettingsPanel = ({
  settings,
  setSettings,
  onSave,
  canManageSettings,
  saving,
}) => {
  const { t } = useTranslation(['curriculum']);
  const templates = Array.isArray(settings?.templates) ? settings.templates : [];
  const activeTemplate = templates.find((template) => template.key === settings?.activeTemplateKey) || templates[0] || null;

  const updateSettings = (path, value) => {
    setSettings((prev) => {
      const next = { ...prev };
      let cursor = next;
      for (let index = 0; index < path.length - 1; index += 1) {
        const key = path[index];
        cursor[key] = cursor[key] ? { ...cursor[key] } : {};
        cursor = cursor[key];
      }
      cursor[path[path.length - 1]] = value;
      return next;
    });
  };

  const updateActiveTemplateField = (fieldKey, patch) => {
    setSettings((prev) => ({
      ...prev,
      templates: (prev.templates || []).map((template) => {
        if (template.key !== prev.activeTemplateKey) return template;
        return {
          ...template,
          fields: (template.fields || []).map((field) => (
            field.key === fieldKey ? { ...field, ...patch } : field
          )),
        };
      }),
    }));
  };

  if (!canManageSettings) {
    return (
      <div className="curriculum-settings-panel">
        <h2>{t('settings.title')}</h2>
        <p>{t('settings.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="curriculum-settings-panel">
      <div className="panel-header">
        <h2>{t('settings.title')}</h2>
        <button type="button" onClick={onSave} disabled={saving}>{saving ? t('shared.saving') : t('settings.save')}</button>
      </div>

      <div className="form-grid">
        <label className="checkbox">
          <input type="checkbox" checked={settings?.enabled !== false} onChange={(event) => updateSettings(['enabled'], event.target.checked)} />
          {t('settings.enableModule')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings?.ai?.enabled !== false} onChange={(event) => updateSettings(['ai', 'enabled'], event.target.checked)} />
          {t('settings.enableAiImport')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings?.ai?.allowFileImport !== false} onChange={(event) => updateSettings(['ai', 'allowFileImport'], event.target.checked)} />
          {t('settings.allowFileImport')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings?.ai?.allowGoogleDocsImport !== false} onChange={(event) => updateSettings(['ai', 'allowGoogleDocsImport'], event.target.checked)} />
          {t('settings.allowGoogleDocsImport')}
        </label>
        <label>
          {t('settings.aiMaxFileSize')}
          <input
            type="number"
            min={1}
            max={50}
            value={settings?.ai?.maxFileSizeMb ?? 10}
            onChange={(event) => updateSettings(['ai', 'maxFileSizeMb'], Number(event.target.value))}
          />
        </label>
        <label>
          {t('settings.periodType')}
          <select
            value={settings?.mapStructure?.periodType || 'term'}
            onChange={(event) => updateSettings(['mapStructure', 'periodType'], event.target.value)}
          >
            <option value="term">{t('shared.periodTypes.term')}</option>
            <option value="quarter">{t('shared.periodTypes.quarter')}</option>
            <option value="semester">{t('shared.periodTypes.semester')}</option>
            <option value="custom">{t('shared.periodTypes.custom')}</option>
          </select>
        </label>
        <label>
          {t('settings.granularity')}
          <select
            value={settings?.mapStructure?.granularity || 'unit_week'}
            onChange={(event) => updateSettings(['mapStructure', 'granularity'], event.target.value)}
          >
            <option value="term_only">{t('shared.granularity.term_only')}</option>
            <option value="unit">{t('shared.granularity.unit')}</option>
            <option value="week">{t('shared.granularity.week')}</option>
            <option value="unit_week">{t('shared.granularity.unit_week')}</option>
            <option value="strand_unit">{t('shared.granularity.strand_unit')}</option>
          </select>
        </label>
        <label>
          {t('settings.approvalFlow')}
          <select
            value={settings?.approvalFlow || 'draft_review_publish'}
            onChange={(event) => updateSettings(['approvalFlow'], event.target.value)}
          >
            <option value="draft_review_publish">{t('settings.approvalFlows.draft_review_publish')}</option>
            <option value="draft_publish">{t('settings.approvalFlows.draft_publish')}</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings?.workflow?.reviewEnabled !== false}
            onChange={(event) => updateSettings(['workflow', 'reviewEnabled'], event.target.checked)}
          />
          {t('settings.reviewWorkflowEnabled')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings?.workflow?.approvalRequired !== false}
            onChange={(event) => updateSettings(['workflow', 'approvalRequired'], event.target.checked)}
          />
          {t('settings.approvalRequired')}
        </label>
      </div>

      <div className="form-grid">
        <label>
          {t('settings.periodLabel')}
          <input
            value={settings?.terminology?.period || ''}
            onChange={(event) => updateSettings(['terminology', 'period'], event.target.value)}
          />
        </label>
        <label>
          {t('settings.sectionLabel')}
          <input
            value={settings?.terminology?.section || ''}
            onChange={(event) => updateSettings(['terminology', 'section'], event.target.value)}
          />
        </label>
        <label>
          {t('settings.itemLabel')}
          <input
            value={settings?.terminology?.item || ''}
            onChange={(event) => updateSettings(['terminology', 'item'], event.target.value)}
          />
        </label>
        <label>
          {t('settings.standardsLabel')}
          <input
            value={settings?.terminology?.standards || ''}
            onChange={(event) => updateSettings(['terminology', 'standards'], event.target.value)}
          />
        </label>
        <label>
          {t('settings.performanceTaskLabel')}
          <input
            value={settings?.terminology?.performanceTask || ''}
            onChange={(event) => updateSettings(['terminology', 'performanceTask'], event.target.value)}
          />
        </label>
      </div>

      <div className="form-grid">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings?.exports?.allowCsv !== false}
            onChange={(event) => updateSettings(['exports', 'allowCsv'], event.target.checked)}
          />
          {t('settings.enableCsvExport')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings?.exports?.allowPdf !== false}
            onChange={(event) => updateSettings(['exports', 'allowPdf'], event.target.checked)}
          />
          {t('settings.enablePdfExport')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings?.exports?.allowHtml !== false}
            onChange={(event) => updateSettings(['exports', 'allowHtml'], event.target.checked)}
          />
          {t('settings.enableHtmlExport')}
        </label>
      </div>

      {activeTemplate && (
        <div className="template-fields-panel">
          <h3>{t('settings.activeTemplateFields')}</h3>
          {(activeTemplate.fields || []).map((field) => (
            <div key={field.key} className="template-field-row">
              <div>
                <strong>{field.key}</strong>
                <input
                  value={field.label || ''}
                  onChange={(event) => updateActiveTemplateField(field.key, { label: event.target.value })}
                />
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={field.enabled !== false}
                  onChange={(event) => updateActiveTemplateField(field.key, { enabled: event.target.checked })}
                />
                {t('settings.visible')}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={field.required === true}
                  onChange={(event) => updateActiveTemplateField(field.key, { required: event.target.checked })}
                />
                {t('settings.required')}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CurriculumSettingsPanel;
