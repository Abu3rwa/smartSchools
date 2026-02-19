import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineDocumentText,
  HiOutlineRefresh,
  HiOutlineSave,
  HiOutlineSparkles,
} from 'react-icons/hi';
import {
  getAdminLandingContent,
  resetLandingContent,
  updateLandingContent,
} from '../../services/landingContentService';
import { landingPageDefaults } from '../../config/landingPageDefaults';
import './AdminDashboardPage.css';

const toPrettyJson = (value) => JSON.stringify(value, null, 2);

const AdminLandingPageEditor = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [editorText, setEditorText] = useState(toPrettyJson(landingPageDefaults));
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);

  const lastUpdatedLabel = useMemo(() => {
    if (!updatedAt) return 'Not published yet';
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) return 'Not published yet';
    return date.toLocaleString();
  }, [updatedAt]);

  const loadContent = async () => {
    setLoading(true);
    try {
      const data = await getAdminLandingContent();
      const nextContent = data?.content || landingPageDefaults;
      setEditorText(toPrettyJson(nextContent));
      setUpdatedAt(data?.updatedAt || null);
      setUpdatedBy(data?.updatedBy || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load landing content');
      setEditorText(toPrettyJson(landingPageDefaults));
      setUpdatedAt(null);
      setUpdatedBy(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, []);

  const parseEditorText = () => {
    try {
      const parsed = JSON.parse(editorText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Landing content must be a JSON object');
      }
      return parsed;
    } catch (error) {
      throw new Error(error?.message || 'Invalid JSON payload');
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = parseEditorText();
      setEditorText(toPrettyJson(parsed));
      toast.success('JSON formatted');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsed = parseEditorText();
      const data = await updateLandingContent(parsed);
      setEditorText(toPrettyJson(data?.content || parsed));
      setUpdatedAt(data?.updatedAt || null);
      setUpdatedBy(data?.updatedBy || null);
      toast.success('Landing page published');
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to save landing content');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset landing page content to defaults?')) return;
    setResetting(true);
    try {
      const data = await resetLandingContent();
      setEditorText(toPrettyJson(data?.content || landingPageDefaults));
      setUpdatedAt(data?.updatedAt || null);
      setUpdatedBy(data?.updatedBy || null);
      toast.success('Landing page reset to defaults');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reset landing content');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard-header">
        <div>
          <h1>Landing Page Content</h1>
          <p className="admin-dashboard-subtitle">
            Edit and publish dynamic landing content for all visitors.
          </p>
        </div>
        <div className="admin-dashboard-date">
          Last published: {lastUpdatedLabel}
          {updatedBy ? ` by ${updatedBy.firstName || ''} ${updatedBy.lastName || ''}`.trim() : ''}
        </div>
      </div>

      <div className="admin-section">
        <div className="admin-section-header">
          <h2>
            <HiOutlineDocumentText size={18} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            JSON Content Editor
          </h2>
          <div className="admin-actions">
            <button className="admin-action-btn" onClick={handleFormatJson} disabled={loading || saving || resetting}>
              <HiOutlineSparkles size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Format
            </button>
            <button className="admin-action-btn" onClick={loadContent} disabled={loading || saving || resetting}>
              <HiOutlineRefresh size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Reload
            </button>
            <button className="admin-action-btn" onClick={handleReset} disabled={loading || saving || resetting}>
              Reset Defaults
            </button>
            <button className="admin-action-btn primary" onClick={handleSave} disabled={loading || saving || resetting}>
              <HiOutlineSave size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {saving ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>

        <div style={{ padding: 'var(--spacing-lg)' }}>
          <p className="admin-section-subtitle" style={{ marginBottom: 'var(--spacing-md)' }}>
            Keep the same top-level keys and section structure. Unknown keys are ignored on save.
          </p>
          <textarea
            value={editorText}
            onChange={(event) => setEditorText(event.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: 520,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              padding: 'var(--spacing-md)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.85rem',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              resize: 'vertical',
            }}
            disabled={loading || resetting}
          />
        </div>
      </div>
    </div>
  );
};

export default AdminLandingPageEditor;

