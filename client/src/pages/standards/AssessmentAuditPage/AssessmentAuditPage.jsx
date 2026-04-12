import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchSettings, updateSettings, fetchAuditLogs, exportAuditLogs,
} from '../../../store/slices/standardAssessmentSlice';
import './AssessmentAuditPage.css';

const MAIN_TABS = { SETTINGS: 'settings', AUDIT: 'audit' };
const SETTINGS_SECTIONS = ['pool', 'progressSend', 'narrative', 'liveEdit', 'comms'];

const AssessmentAuditPage = ({ embedded }) => {
  const dispatch = useDispatch();
  const auditLogs = useSelector((state) => state.standardAssessment.auditLogs);

  const [mainTab, setMainTab] = useState(MAIN_TABS.SETTINGS);
  const [settingsSection, setSettingsSection] = useState('pool');
  const [settings, setSettings] = useState({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Audit filters
  const [auditFilters, setAuditFilters] = useState({
    action: '', dateFrom: '', dateTo: '', page: 1,
  });

  const loadSettings = async (section) => {
    setSettingsLoading(true);
    try {
      const result = await dispatch(fetchSettings(section)).unwrap();
      setSettings(result || {});
      setDirty(false);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to load settings');
    }
    setSettingsLoading(false);
  };

  useEffect(() => {
    if (mainTab === MAIN_TABS.SETTINGS) {
      loadSettings(settingsSection);
    }
  }, [mainTab, settingsSection]);

  useEffect(() => {
    if (mainTab === MAIN_TABS.AUDIT) {
      dispatch(fetchAuditLogs(auditFilters));
    }
  }, [mainTab, auditFilters, dispatch]);

  const handleSettingChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSaveSettings = async () => {
    try {
      await dispatch(updateSettings({ section: settingsSection, updates: settings })).unwrap();
      setDirty(false);
      setSuccessMsg('Settings saved');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to save settings');
    }
  };

  const handleExport = async () => {
    try {
      const result = await dispatch(exportAuditLogs(auditFilters)).unwrap();
      // Download CSV
      const blob = new Blob([result], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err?.message || 'Export failed');
    }
  };

  const renderSettingRow = (key, label, hint, type = 'toggle', options = null) => (
    <div className="setting-row" key={key}>
      <div className="setting-label">
        {label}
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className="setting-control">
        {type === 'toggle' && (
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={!!settings[key]}
              onChange={(e) => handleSettingChange(key, e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        )}
        {type === 'number' && (
          <input
            type="number"
            value={settings[key] ?? ''}
            onChange={(e) => handleSettingChange(key, parseInt(e.target.value, 10) || 0)}
          />
        )}
        {type === 'text' && (
          <input
            type="text"
            value={settings[key] ?? ''}
            onChange={(e) => handleSettingChange(key, e.target.value)}
          />
        )}
        {type === 'select' && options && (
          <select value={settings[key] ?? ''} onChange={(e) => handleSettingChange(key, e.target.value)}>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </div>
    </div>
  );

  const renderPoolSettings = () => (
    <div className="setting-group">
      <h4>Pool Library Settings</h4>
      {renderSettingRow('maxQuestionsPerAssessment', 'Max Questions Per Assessment', 'Maximum questions when creating from pool', 'number')}
      {renderSettingRow('minQuestions', 'Min Questions', 'Minimum questions required', 'number')}
      {renderSettingRow('visibilityScope', 'Visibility Scope', 'Who can see pool questions', 'select', ['school', 'grade', 'teacher'])}
      {renderSettingRow('allowCrossSubject', 'Allow Cross-Subject Browsing', null, 'toggle')}
      {renderSettingRow('allowCrossGrade', 'Allow Cross-Grade Browsing', null, 'toggle')}
      {renderSettingRow('requireApprovalBeforePool', 'Require Approval Before Pooling', null, 'toggle')}
      {renderSettingRow('duplicateControl', 'Duplicate Control', 'How duplicates are handled', 'select', ['warn', 'block', 'allow'])}
    </div>
  );

  const renderProgressSendSettings = () => (
    <div className="setting-group">
      <h4>Progress Send Settings</h4>
      {renderSettingRow('allowSendUnfinished', 'Allow Sending Unfinished Rows', null, 'toggle')}
      {renderSettingRow('maxSendsPerDay', 'Max Sends Per Day', 'Rate limit per student per day', 'number')}
      {renderSettingRow('cooldownMinutes', 'Cooldown (minutes)', 'Minimum gap between sends', 'number')}
      {renderSettingRow('ccTeacher', 'CC Teacher on Send', null, 'toggle')}
      {renderSettingRow('maxTeacherNoteLength', 'Max Teacher Note Length', null, 'number')}
      {renderSettingRow('maskRawScores', 'Mask Raw Scores', 'Show mastery bands instead of percentages', 'toggle')}
    </div>
  );

  const renderNarrativeSettings = () => (
    <div className="setting-group">
      <h4>Narrative Report Settings</h4>
      {renderSettingRow('requireApproval', 'Require Approval Before Send', null, 'toggle')}
      {renderSettingRow('maxGenerationsPerDay', 'Max AI Generations Per Day', null, 'number')}
      {renderSettingRow('maxStandards', 'Max Standards Per Narrative', null, 'number')}
      {renderSettingRow('minEvidenceThreshold', 'Min Evidence Threshold', 'Minimum attempts before generating', 'number')}
      {renderSettingRow('maxNarrativeLength', 'Max Narrative Length (chars)', null, 'number')}
      {renderSettingRow('profanityFilterEnabled', 'Profanity Filter', null, 'toggle')}
      {renderSettingRow('draftExpiryHours', 'Draft Expiry (hours)', null, 'number')}
      {renderSettingRow('editDriftWarningThreshold', 'Edit Drift Warning (%)', null, 'number')}
    </div>
  );

  const renderLiveEditSettings = () => (
    <div className="setting-group">
      <h4>Live Edit Settings</h4>
      {renderSettingRow('allowContentEditAfterStart', 'Allow Content Edit After Start', null, 'toggle')}
      {renderSettingRow('maxRevisionsPerAssignment', 'Max Revisions Per Assignment', null, 'number')}
      {renderSettingRow('lockWindowHours', 'Lock Window (hours)', 'Lock editing after creation', 'number')}
      {renderSettingRow('notifyStudentsOnRevision', 'Notify Students on Revision', null, 'toggle')}
      {renderSettingRow('allowQuestionAdd', 'Allow Adding Questions', null, 'toggle')}
      {renderSettingRow('allowQuestionRemove', 'Allow Removing Questions', null, 'toggle')}
    </div>
  );

  const renderCommsSettings = () => (
    <div className="setting-group">
      <h4>Communications Settings</h4>
      {renderSettingRow('emailBrandingEnabled', 'Custom Email Branding', null, 'toggle')}
      {renderSettingRow('quietHoursStart', 'Quiet Hours Start', 'HH:MM format', 'text')}
      {renderSettingRow('quietHoursEnd', 'Quiet Hours End', 'HH:MM format', 'text')}
      {renderSettingRow('defaultLanguage', 'Default Language', null, 'select', ['en', 'ar', 'es', 'fr'])}
    </div>
  );

  const sectionRenderers = {
    pool: renderPoolSettings,
    progressSend: renderProgressSendSettings,
    narrative: renderNarrativeSettings,
    liveEdit: renderLiveEditSettings,
    comms: renderCommsSettings,
  };

  return (
    <div className={embedded ? 'audit-settings-page audit-settings-page--embedded' : 'audit-settings-page'}>
      <div className="audit-settings-header">
        <h1>Assessment Admin</h1>
      </div>

      {successMsg && <div className="success-banner">{successMsg}</div>}
      {errorMsg && (
        <div className="error-banner">
          {errorMsg}
          <button onClick={() => setErrorMsg('')} style={{ marginLeft: 8, cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}>×</button>
        </div>
      )}

      <div className="main-tabs">
        <button className={mainTab === MAIN_TABS.SETTINGS ? 'active' : ''} onClick={() => setMainTab(MAIN_TABS.SETTINGS)}>Settings</button>
        <button className={mainTab === MAIN_TABS.AUDIT ? 'active' : ''} onClick={() => setMainTab(MAIN_TABS.AUDIT)}>Audit Logs</button>
      </div>

      {/* Settings Tab */}
      {mainTab === MAIN_TABS.SETTINGS && (
        <div className="settings-panel">
          <div className="settings-section-tabs">
            {SETTINGS_SECTIONS.map((s) => (
              <button
                key={s}
                className={settingsSection === s ? 'active' : ''}
                onClick={() => setSettingsSection(s)}
              >
                {s === 'progressSend' ? 'Progress Send' : s === 'liveEdit' ? 'Live Edit' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {settingsLoading ? (
            <div className="loading-state">Loading settings...</div>
          ) : (
            <>
              {sectionRenderers[settingsSection]?.()}
              <div className="settings-actions">
                <button className="btn-secondary" onClick={() => loadSettings(settingsSection)} disabled={!dirty}>
                  Discard
                </button>
                <button className="btn-primary" onClick={handleSaveSettings} disabled={!dirty}>
                  Save Changes
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Audit Log Tab */}
      {mainTab === MAIN_TABS.AUDIT && (
        <div className="audit-panel">
          <div className="audit-filters">
            <select
              value={auditFilters.action}
              onChange={(e) => setAuditFilters((p) => ({ ...p, action: e.target.value, page: 1 }))}
            >
              <option value="">All Actions</option>
              <option value="pool_browse">Pool Browse</option>
              <option value="pool_create">Pool Create</option>
              <option value="progress_send">Progress Send</option>
              <option value="narrative_generate">Narrative Generate</option>
              <option value="narrative_approve">Narrative Approve</option>
              <option value="narrative_send">Narrative Send</option>
              <option value="assessment_edit">Assessment Edit</option>
              <option value="revision_create">Revision Create</option>
              <option value="revision_publish">Revision Publish</option>
              <option value="settings_change">Settings Change</option>
            </select>
            <input
              type="date"
              value={auditFilters.dateFrom}
              onChange={(e) => setAuditFilters((p) => ({ ...p, dateFrom: e.target.value, page: 1 }))}
            />
            <input
              type="date"
              value={auditFilters.dateTo}
              onChange={(e) => setAuditFilters((p) => ({ ...p, dateTo: e.target.value, page: 1 }))}
            />
            <button className="btn-outline" onClick={handleExport}>Export CSV</button>
          </div>

          {auditLogs.loading ? (
            <div className="loading-state">Loading audit logs...</div>
          ) : auditLogs.list.length === 0 ? (
            <div className="empty-state">
              <h3>No audit logs found</h3>
              <p>Actions will appear here as users interact with assessment features.</p>
            </div>
          ) : (
            <>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>User</th>
                    <th>Target</th>
                    <th>Date</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.list.map((log) => (
                    <tr key={log._id}>
                      <td><span className="action-badge">{log.action?.replace(/_/g, ' ')}</span></td>
                      <td>{log.performedBy?.name || log.performedBy || '—'}</td>
                      <td>
                        {log.student?.name || log.assignment?.title || log.narrativeReport || '—'}
                      </td>
                      <td>{new Date(log.createdAt).toLocaleString()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.ipAddress || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditLogs.pagination && auditLogs.pagination.pages > 1 && (
                <div className="pagination-bar">
                  <button
                    disabled={auditFilters.page <= 1}
                    onClick={() => setAuditFilters((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    Previous
                  </button>
                  <span>Page {auditLogs.pagination.page} of {auditLogs.pagination.pages}</span>
                  <button
                    disabled={auditFilters.page >= auditLogs.pagination.pages}
                    onClick={() => setAuditFilters((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AssessmentAuditPage;
