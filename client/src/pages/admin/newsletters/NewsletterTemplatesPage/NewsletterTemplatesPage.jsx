import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchTemplates,
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  setDefaultTemplate,
  selectTemplates,
  selectTemplatesLoading,
} from '../../../../store/slices/newsletterTemplateSlice';
import TemplateEditor from './TemplateEditor';
import { toast } from 'react-hot-toast';
import './NewsletterTemplatesPage.css';

const BLOCK_ICONS = {
  header: '🎨',
  text: '📝',
  image: '🖼️',
  subjects: '📚',
  divider: '➖',
  callout: '💡',
  two_column: '▐▌',
  footer: '📎',
};

function defaultSections() {
  return [
    { id: 'header-1', type: 'header', order: 0, visible: true, heading: 'Weekly Newsletter', subheading: 'School: {schoolName}\nClass: {classLabel}\nWeek: {weekLabel}', content: '', imageUrl: '', imageAlt: '', iconEmoji: '', leftContent: '', rightContent: '', style: {} },
    { id: 'subjects-1', type: 'subjects', order: 1, visible: true, heading: '', subheading: '', content: '', imageUrl: '', imageAlt: '', iconEmoji: '', leftContent: '', rightContent: '', style: {} },
    { id: 'footer-1', type: 'footer', order: 2, visible: true, heading: '', subheading: '', content: '', imageUrl: '', imageAlt: '', iconEmoji: '', leftContent: '', rightContent: '', style: {} },
  ];
}

function TemplateCard({ template, onEdit, onDuplicate, onDelete, onSetDefault }) {
  const previewHtml = buildMiniPreviewHtml(template);
  return (
    <div className={`nt-card${template.isDefault ? ' nt-card--default' : ''}`} onClick={() => onEdit(template)}>
      <div className="nt-card-actions" onClick={(e) => e.stopPropagation()}>
        {!template.isDefault && (
          <button title="Set as default" onClick={() => onSetDefault(template._id)}>⭐</button>
        )}
        <button title="Duplicate" onClick={() => onDuplicate(template._id)}>📋</button>
        <button className="nt-danger" title="Delete" onClick={() => onDelete(template._id)}>🗑️</button>
      </div>
      <div className="nt-card-preview">
        <iframe title="preview" srcDoc={previewHtml} sandbox="" loading="lazy" />
      </div>
      <div className="nt-card-body">
        <div className="nt-card-name">{template.name}</div>
        <div className="nt-card-desc">{template.description || 'No description'}</div>
        <div className="nt-card-badges">
          {template.isDefault && <span className="nt-badge nt-badge--primary">Default</span>}
          <span className="nt-badge">{(template.sections || []).length} blocks</span>
          <span className="nt-badge">{template.globalStyle?.headerStyle || 'gradient'}</span>
        </div>
      </div>
    </div>
  );
}

function buildMiniPreviewHtml(template) {
  const g = template.globalStyle || {};
  const primary = g.primaryColor || '#0d9488';
  const secondary = g.secondaryColor || '#0f766e';
  const bg = g.backgroundColor || '#ffffff';
  const font = g.fontFamily || 'Arial, sans-serif';
  const sections = (template.sections || []).filter((s) => s.visible !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const blockHtmls = sections.map((block) => {
    switch (block.type) {
      case 'header':
        return `<div style="padding:12px;border-radius:8px;background:linear-gradient(135deg,${primary},${secondary});color:#fff;font-weight:800;font-size:14px;">${block.heading || 'Newsletter'}<div style="font-size:9px;opacity:0.8;margin-top:2px;">${(block.subheading || '').replace(/\n/g, ' · ')}</div></div>`;
      case 'text':
        return `<div style="font-size:10px;color:#334155;line-height:1.4;padding:4px 0;">${(block.content || 'Text content…').slice(0, 120)}</div>`;
      case 'subjects':
        return `<div style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:9px;color:#64748b;">📚 Subject sections appear here</div>`;
      case 'divider':
        return '<hr style="border:0;border-top:1px solid #e2e8f0;margin:6px 0;" />';
      case 'callout':
        return `<div style="border-left:3px solid ${primary};padding:6px 8px;background:#f8fafc;font-size:9px;">${block.iconEmoji || '💡'} ${(block.content || 'Callout…').slice(0, 80)}</div>`;
      case 'image':
        return `<div style="text-align:center;font-size:9px;color:#94a3b8;">🖼️ Image</div>`;
      case 'two_column':
        return `<div style="display:flex;gap:6px;font-size:9px;color:#334155;"><div style="flex:1;background:#f8fafc;padding:4px;border-radius:4px;">${(block.leftContent || 'Left').slice(0, 40)}</div><div style="flex:1;background:#f8fafc;padding:4px;border-radius:4px;">${(block.rightContent || 'Right').slice(0, 40)}</div></div>`;
      case 'footer':
        return `<div style="font-size:8px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:4px;">${(block.content || 'Footer text…').slice(0, 60)}</div>`;
      default:
        return '';
    }
  });

  return `<!DOCTYPE html><html><head><style>body{margin:0;padding:10px;font-family:${font};background:${bg};}</style></head><body>${blockHtmls.join('<div style="height:6px;"></div>')}</body></html>`;
}

export default function NewsletterTemplatesPage() {
  const dispatch = useDispatch();
  const templates = useSelector(selectTemplates);
  const loading = useSelector(selectTemplatesLoading);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    dispatch(fetchTemplates());
  }, [dispatch]);

  const handleCreate = useCallback(async () => {
    try {
      const result = await dispatch(
        createTemplate({
          name: 'Untitled Template',
          description: '',
          sections: defaultSections(),
          globalStyle: {},
          isDefault: templates.length === 0,
        })
      ).unwrap();
      setEditingId(result._id);
    } catch (err) {
      toast.error(err || 'Failed to create template');
    }
  }, [dispatch, templates.length]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      await dispatch(deleteTemplate(id)).unwrap();
      toast.success('Template deleted');
    } catch (err) {
      toast.error(err || 'Failed to delete');
    }
  }, [dispatch]);

  const handleDuplicate = useCallback(async (id) => {
    try {
      await dispatch(duplicateTemplate(id)).unwrap();
      toast.success('Template duplicated');
    } catch (err) {
      toast.error(err || 'Failed to duplicate');
    }
  }, [dispatch]);

  const handleSetDefault = useCallback(async (id) => {
    try {
      await dispatch(setDefaultTemplate(id)).unwrap();
      toast.success('Default template updated');
    } catch (err) {
      toast.error(err || 'Failed to set default');
    }
  }, [dispatch]);

  const handleEdit = useCallback((template) => {
    setEditingId(template._id);
  }, []);

  const handleBack = useCallback(() => {
    setEditingId(null);
    dispatch(fetchTemplates());
  }, [dispatch]);

  /* ── Editor view ────────────────────────────────────────────── */
  if (editingId) {
    return <TemplateEditor templateId={editingId} onBack={handleBack} />;
  }

  /* ── List view ──────────────────────────────────────────────── */
  return (
    <div className="nt-page">
      <div className="nt-header">
        <div>
          <h2>Newsletter Templates</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Design beautiful newsletter layouts that parents will love
          </p>
        </div>
        <div className="nt-header-actions">
          <button className="nt-btn nt-btn--primary" onClick={handleCreate}>
            + New Template
          </button>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 32 }}><span className="nt-spinner" /></div>}

      {!loading && templates.length === 0 && (
        <div className="nt-empty">
          <div className="nt-empty-icon">📰</div>
          <h3>No templates yet</h3>
          <p>Create your first newsletter template to get started.</p>
          <button className="nt-btn nt-btn--primary" style={{ marginTop: 12 }} onClick={handleCreate}>
            + Create Template
          </button>
        </div>
      )}

      {!loading && templates.length > 0 && (
        <div className="nt-grid">
          {templates.map((t) => (
            <TemplateCard
              key={t._id}
              template={t}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}
    </div>
  );
}
