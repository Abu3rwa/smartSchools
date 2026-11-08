import {
  LANGUAGE_OPTIONS,
  REPORT_TYPE_OPTIONS,
  SOURCES,
  SECTIONS,
  DRAFT_STATUSES
} from './constants';
import StudentSelectionSection from './components/StudentSelectionSection';
import ReportConfigurationSection from './components/ReportConfigurationSection';
import EmailRecipientsSection from './components/EmailRecipientsSection';
import CustomPromptSection from './components/CustomPromptSection';
import TeacherRemarkSection from './components/TeacherRemarkSection';
import ReportPreview from './components/ReportPreview';
import TemplateSettingsModal from './components/TemplateSettingsModal';
import useAdvancedReportGenerator from './hooks/useAdvancedReportGenerator';
import {
  actionsFor,
  canUseSchoolScope as userCanUseSchoolScope,
  deliveryRowCopy,
  deliveryRowDot,
  deliveryRows,
  statusChip
} from './reportDeliveryUi';
import { useSelector } from 'react-redux';
import './AdvancedReportGenerator.css';

const AdvancedReportGenerator = () => {
  const { user } = useSelector((state) => state.auth);
  const {
    students,
    classes,
    subjects,
    formData,
    generating,
    report,
    error,
    draft,
    draftStatus,
    dataExpanded,
    setDataExpanded,
    profiles,
    setProfiles,
    regenerateOpen,
    setRegenerateOpen,
    settingsOpen,
    setSettingsOpen,
    handleInputChange,
    handleProfileSelect,
    handleGenerateDraft,
    handleApproveDraft,
    handleSendDraft,
    handleUpdateDraftContent,
    handleTeacherRemarkBlur,
    handleReopenDraft,
    handleRetryFailedEmails,
    handleCheckDelivery,
    handleRegenerate,
    resetGeneratedReport,
    emailPreview,
    retryEmailPreview,
    sendError,
    deliveryInfo
  } = useAdvancedReportGenerator();

  const chip = statusChip(draftStatus);
  const actions = actionsFor(draftStatus);
  const canUseSchoolScope = userCanUseSchoolScope(user);

  return (
    <div className="rg-page">
      {/* Header */}
      <div className="rg-head">
        <div className="rg-head-title">
          <p className="rg-eyebrow">Reports</p>
          <h1>Advanced Report Generator</h1>
          <p className="rg-sub">Evidence-based student reports with multi-source data and bilingual output.</p>
        </div>
        <button
          type="button"
          className="rg-btn rg-btn-secondary"
          onClick={() => setSettingsOpen(true)}
          title="Manage templates and settings"
        >
          ⚙ Settings
        </button>
      </div>

      {/* Top bar with profile + status */}
      {(draft || formData.profileId) && (
        <div className="rg-topbar">
          <span className="rg-topbar-profile">
            {profiles.find(p => p._id === formData.profileId)?.name || 'Default Profile'}
          </span>
          {chip && (
            <span className={`rg-chip ${chip.cls}`}>{chip.label}</span>
          )}
        </div>
      )}

      {/* Two-pane layout */}
      <div className="rg-layout">
        {/* Left: Configure */}
        <div className="rg-configure">
          {/* Template */}
          <div className="rg-panel">
            <div className="rg-panel-head">
              <h3>Template</h3>
              <span className="rg-hint">Profile sets defaults</span>
            </div>
            <div className="rg-field">
              <label className="rg-label" htmlFor="profileId">Report Profile</label>
              <select
                id="profileId"
                className="rg-select"
                value={formData.profileId}
                onChange={(e) => handleProfileSelect(e.target.value)}
              >
                <option value="">Default (no profile)</option>
                {profiles.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Student */}
          <StudentSelectionSection
            students={students}
            classes={classes}
            subjects={subjects}
            formData={formData}
            onChange={handleInputChange}
          />

          {/* Configuration */}
          <ReportConfigurationSection
            reportTypes={REPORT_TYPE_OPTIONS}
            languages={LANGUAGE_OPTIONS}
            formData={formData}
            onChange={handleInputChange}
          />

          {/* Data Sources */}
          <div className="rg-panel">
            <div className="rg-panel-head">
              <h3>Data Sources</h3>
              <span className="rg-hint">{formData.sources.length} of {SOURCES.length} active</span>
            </div>
            <div className="rg-source-grid">
              {SOURCES.map((source) => {
                const ev = report?.evidence?.sources?.[source.key];
                return (
                  <label key={source.key} className="rg-source-item">
                    <input
                      type="checkbox"
                      name="sources"
                      value={source.key}
                      checked={formData.sources.includes(source.key)}
                      onChange={handleInputChange}
                    />
                    <span className="rg-source-name">{source.label}</span>
                    {ev && (
                      <span
                        className={`rg-dot ${
                          ev.status === 'failed' ? 'is-red'
                          : ev.status === 'no_data' ? 'is-grey'
                          : ev.trend === 'improving' ? 'is-green'
                          : ev.trend === 'declining' ? 'is-red'
                          : 'is-amber'
                        }`}
                        title={
                          ev.status === 'failed' ? `Could not be read: ${ev.error || 'unknown error'}`
                            : ev.status === 'no_data' ? 'No records in this period'
                            : `${ev.recordCount} records`
                        }
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Report Sections */}
          <div className="rg-panel">
            <div className="rg-panel-head">
              <h3>Report Sections</h3>
              <span className="rg-hint">Word limits per section</span>
            </div>
            <div className="rg-section-list">
              {SECTIONS.map((section, idx) => (
                <div key={section.key} className="rg-section-row">
                  <label className="rg-source-item" style={{ flex: 1 }}>
                    <input
                      type="checkbox"
                      name={`sections.${idx}.enabled`}
                      checked={formData.sections[idx]?.enabled ?? true}
                      onChange={handleInputChange}
                    />
                    <span className="rg-source-name">{section.label}</span>
                  </label>
                  <input
                    type="number"
                    className="rg-words-input"
                    name={`sections.${idx}.maxWords`}
                    value={formData.sections[idx]?.maxWords ?? section.defaultMaxWords}
                    onChange={handleInputChange}
                    min={50}
                    max={500}
                    title={`Max words for ${section.label}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <EmailRecipientsSection
            formData={formData}
            onChange={handleInputChange}
            locked={!!draft && draftStatus !== DRAFT_STATUSES.DRAFT}
          />

          {/* Custom Prompt */}
          <CustomPromptSection value={formData.customPrompt} onChange={handleInputChange} />

          {/* Teacher's own note to the family */}
          <TeacherRemarkSection
            value={formData.teacherRemark}
            onChange={handleInputChange}
            onBlur={handleTeacherRemarkBlur}
            locked={!!draft && draftStatus !== DRAFT_STATUSES.DRAFT}
          />

          {/* Data Used */}
          {report?.evidence && (
            <div className="rg-panel">
              <button
                type="button"
                className="rg-data-toggle"
                onClick={() => setDataExpanded(!dataExpanded)}
              >
                <h3>Data Used</h3>
                <span className={`rg-chevron ${dataExpanded ? 'is-open' : ''}`}>▾</span>
              </button>

              {dataExpanded ? (
                <div className="rg-data-body">
                  <p className="rg-data-summary">
                    {report.evidence.totalRecordCount} records from {report.evidence.availableSources.length} source(s)
                  </p>
                  {report.evidence.failedSources?.length > 0 && (
                    <p className="rg-notice is-warn">
                      {report.evidence.failedSources.length} selected source(s) could not be read,
                      so this report was built without them.
                    </p>
                  )}
                  {Object.entries(report.evidence.sources).map(([key, val]) => (
                    <div
                      key={key}
                      className="rg-data-row"
                      title={val.status === 'failed' ? val.error || 'Unknown error' : undefined}
                    >
                      <span className={`rg-dot ${
                        val.status === 'failed' ? 'is-red'
                          : val.status === 'no_data' ? 'is-grey'
                          : 'is-green'
                      }`} />
                      <span>{SOURCES.find(s => s.key === key)?.label || key}</span>
                      <span className="rg-count">
                        {val.status === 'failed' ? 'Could not be read'
                          : val.status === 'no_data' ? 'No records this period'
                          : `${val.recordCount} records`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rg-data-collapsed">
                  {report.evidence.availableSources.map((key) => (
                    <span key={key} className="rg-dot is-green" title={`${key}: available`} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Regenerate confirmation */}
          {regenerateOpen && (
            <div className="rg-panel">
              <p className="rg-notice is-warn">
                Regenerating will create a new draft. Your edits to the current draft will be lost.
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="rg-btn rg-btn-ghost" onClick={() => setRegenerateOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="rg-btn rg-btn-primary" onClick={handleRegenerate}>
                  Regenerate
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rg-notice is-error">
              {error}
            </div>
          )}

          {/* Action bar */}
          <div className="rg-actions">
            {!draft && (
              <button
                type="button"
                className="rg-btn rg-btn-primary"
                onClick={handleGenerateDraft}
                disabled={generating || !formData.studentId}
              >
                {generating ? (
                  <>
                    <span className="rg-spinner" />
                    Generating…
                  </>
                ) : 'Generate Draft'}
              </button>
            )}

            {draft && actions.canApprove && (
              <>
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={() => setRegenerateOpen(true)}
                  disabled={generating}
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  className="rg-btn rg-btn-success"
                  onClick={handleApproveDraft}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <span className="rg-spinner" />
                      Approving…
                    </>
                  ) : 'Approve'}
                </button>
              </>
            )}

            {draft && actions.canSend && (
              <>
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={handleReopenDraft}
                  disabled={generating}
                  title="Edit the draft again before sending"
                >
                  Reopen
                </button>
                <button
                  type="button"
                  className="rg-btn rg-btn-success"
                  onClick={handleSendDraft}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <span className="rg-spinner" />
                      Sending…
                    </>
                  ) : draftStatus === DRAFT_STATUSES.FAILED ? 'Try Sending Again' : 'Send to Recipients'}
                </button>
              </>
            )}

            {draft && actions.canRetryFailed && (
              <>
                <span className="rg-sent-label">Some recipients did not receive the report</span>
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={handleReopenDraft}
                  disabled={generating}
                >
                  Reopen
                </button>
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={() => handleCheckDelivery()}
                  disabled={generating}
                  title="Reads the recorded provider outcome — this never sends anything"
                >
                  Check delivery status
                </button>
                <button
                  type="button"
                  className="rg-btn rg-btn-success"
                  onClick={handleRetryFailedEmails}
                  disabled={generating}
                  title="Resends only to the addresses that definitely failed"
                >
                  {generating ? 'Retrying…' : 'Retry failed recipients'}
                </button>
              </>
            )}

            {draft && draftStatus === DRAFT_STATUSES.UNKNOWN && (
              <>
                <span className="rg-sent-label">Delivery could not be confirmed</span>
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={() => handleCheckDelivery()}
                  disabled={generating}
                  title="Reads the recorded provider outcome — this never sends anything"
                >
                  Check delivery status
                </button>
              </>
            )}

            {actions.isSent && (
              <>
                <span className="rg-sent-label">✓ Report sent successfully</span>
                <button
                  type="button"
                  className="rg-btn rg-btn-secondary"
                  onClick={resetGeneratedReport}
                >
                  Start a new report
                </button>
              </>
            )}
          </div>
          {sendError && (
            <p className="rg-send-error">{sendError}</p>
          )}
          {deliveryRows(deliveryInfo).length > 0 && (
            <div className="rg-panel">
              <div className="rg-panel-head">
                <h3>Delivery</h3>
                <span className="rg-hint">Per address, as recorded</span>
              </div>
              {deliveryRows(deliveryInfo).map((row, idx) => (
                <div key={row.email || idx} className="rg-data-row">
                  <span className={`rg-dot ${deliveryRowDot(row)}`} />
                  <span>{row.name || row.email || row.recipientType}</span>
                  <span className="rg-count">{deliveryRowCopy(row)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="rg-preview-col">
          {report ? (
            <ReportPreview
              generating={generating}
              emailPreview={emailPreview}
              draftStatus={draftStatus}
              onContentChange={handleUpdateDraftContent}
              onRetryPreview={retryEmailPreview}
              rawHtml={report.report}
            />
          ) : (
            <div className="rg-preview-panel">
              <div className="rg-preview-head">
                <h3>Report Preview</h3>
              </div>
              <div className="rg-empty">
                <div className="rg-empty-icon">📄</div>
                <p>Select a student and generate a draft to see the preview here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <TemplateSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profiles={profiles}
        onProfilesChange={setProfiles}
        classes={classes}
        canUseSchoolScope={canUseSchoolScope}
      />
    </div>
  );
};

export default AdvancedReportGenerator;
