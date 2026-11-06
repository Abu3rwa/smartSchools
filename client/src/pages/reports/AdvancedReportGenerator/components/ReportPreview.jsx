import { useState, useCallback } from 'react';
import { DRAFT_STATUSES } from '../constants';

const ReportPreview = ({
  generating,
  emailPreview,
  draftStatus,
  onContentChange,
  onRetryPreview,
  rawHtml
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(rawHtml || '');

  const handleStartEdit = useCallback(() => {
    setEditValue(rawHtml || '');
    setEditing(true);
  }, [rawHtml]);

  const handleSave = useCallback(() => {
    if (onContentChange) onContentChange(editValue);
    setEditing(false);
  }, [editValue, onContentChange]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setEditValue(rawHtml || '');
  }, [rawHtml]);

  const isEditable = draftStatus === DRAFT_STATUSES.DRAFT;
  const recipients = emailPreview?.recipients || [];

  return (
    <div className="rg-preview-panel">
      <div className="rg-preview-head">
        <h3>Email Preview</h3>
        <div style={{ display: 'flex', gap: '6px' }}>
          {isEditable && !editing && rawHtml && (
            <button
              type="button"
              className="rg-btn rg-btn-secondary"
              style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px' }}
              onClick={handleStartEdit}
            >
              Edit text
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                className="rg-btn rg-btn-ghost"
                style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px' }}
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rg-btn rg-btn-primary"
                style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px' }}
                onClick={handleSave}
              >
              Save
              </button>
            </>
          )}
        </div>
      </div>

      {emailPreview && (
        <div className="rg-email-meta">
          <div className="rg-email-meta-row">
            <span className="rg-email-meta-label">To</span>
            <span className="rg-email-meta-value">
              {recipients.length > 0
                ? recipients.map((r) => r.name || r.email).join(', ')
                : 'No recipients selected'}
            </span>
          </div>
          <div className="rg-email-meta-row">
            <span className="rg-email-meta-label">Subject</span>
            <span className="rg-email-meta-value">{emailPreview.subject}</span>
          </div>
          {recipients.length === 0 && (
            <p className="rg-email-meta-warning">
              This report cannot be delivered — choose at least one recipient below.
            </p>
          )}
        </div>
      )}

      <div className="rg-preview-body">
        {editing ? (
          <textarea
            className="rg-preview-edit"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            spellCheck={false}
          />
        ) : emailPreview ? (
          <iframe
            className="rg-email-frame"
            title="Email preview"
            sandbox=""
            srcDoc={emailPreview.html}
          />
        ) : generating ? (
          <div className="rg-loading">
            <span className="rg-spinner" />
            <span>Generating report...</span>
          </div>
        ) : rawHtml ? (
          <div className="rg-preview-empty">
            <p>The email preview could not be loaded, so the exact delivered copy is unverified.</p>
            <button
              type="button"
              className="rg-btn rg-btn-secondary"
              style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px' }}
              onClick={onRetryPreview}
            >
              Retry preview
            </button>
          </div>
        ) : (
          <div className="rg-preview-placeholder">
            <p>Generate a draft to see the exact email the family will receive.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPreview;
