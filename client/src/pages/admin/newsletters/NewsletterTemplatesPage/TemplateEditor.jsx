import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchTemplate,
  updateTemplate,
  selectCurrentTemplate,
  selectTemplatesSaving,
  selectTemplatesLoading,
} from '../../../../store/slices/newsletterTemplateSlice';
import newsletterTemplateService from '../../../../services/newsletterTemplateService';
import { toast } from 'react-hot-toast';
import './NewsletterTemplatesPage.css';

/* ── Block type metadata ──────────────────────────────────────── */
const BLOCK_TYPES = [
  { type: 'header', icon: '🎨', label: 'Header' },
  { type: 'text', icon: '📝', label: 'Text' },
  { type: 'image', icon: '🖼️', label: 'Image' },
  { type: 'subjects', icon: '📚', label: 'Subjects' },
  { type: 'divider', icon: '➖', label: 'Divider' },
  { type: 'callout', icon: '💡', label: 'Callout' },
  { type: 'two_column', icon: '▐▌', label: 'Two Columns' },
  { type: 'footer', icon: '📎', label: 'Footer' },
  { type: 'hero_banner', icon: '🏔️', label: 'Hero Banner' },
  { type: 'image_grid', icon: '🖼️', label: 'Image Grid' },
  { type: 'events_list', icon: '📅', label: 'Events List' },
  { type: 'spotlight', icon: '⭐', label: 'Spotlight' },
  { type: 'button', icon: '🔘', label: 'Button' },
  { type: 'heading', icon: '🔤', label: 'Heading' },
  { type: 'three_column', icon: '▐▌▐', label: 'Three Columns' },
  { type: 'spacer', icon: '↕️', label: 'Spacer' },
  { type: 'social_links', icon: '🔗', label: 'Social Links' },
  { type: 'contact_info', icon: '📞', label: 'Contact Info' },
];

const HEADER_STYLES = [
  { value: 'gradient', label: 'Gradient' },
  { value: 'solid', label: 'Solid Color' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'banner', label: 'Banner' },
];

const FONT_OPTIONS = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: "'Georgia', serif", label: 'Georgia' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet' },
  { value: "'Verdana', sans-serif", label: 'Verdana' },
  { value: "'Palatino', serif", label: 'Palatino' },
  { value: "'Tahoma', sans-serif", label: 'Tahoma' },
  { value: "'Segoe UI', sans-serif", label: 'Segoe UI' },
];

/* ── Helpers ──────────────────────────────────────────────────── */
let _blockCounter = 0;
function newBlockId() {
  _blockCounter += 1;
  return `block-${Date.now()}-${_blockCounter}`;
}

function newBlock(type) {
  const base = { id: newBlockId(), type, order: 0, visible: true, heading: '', subheading: '', content: '', imageUrl: '', imageAlt: '', iconEmoji: '', leftContent: '', rightContent: '', middleContent: '', style: {} };
  if (type === 'header') { base.heading = 'Weekly Newsletter'; base.subheading = '{schoolName} · {classLabel} · {weekLabel}'; }
  if (type === 'callout') { base.iconEmoji = '💡'; base.content = 'Important note for parents…'; }
  if (type === 'footer') { base.content = 'This email was sent by the school. If you have questions, please contact the school office.'; }
  if (type === 'text') { base.content = 'Write your content here…'; }
  if (type === 'hero_banner') { base.heading = 'Welcome Back!'; base.subheading = 'This week at {schoolName}'; base.style = { backgroundImageUrl: '', overlayOpacity: '0.5' }; }
  if (type === 'image_grid') { base.images = [{ url: '', alt: '' }, { url: '', alt: '' }]; }
  if (type === 'events_list') { base.events = [{ date: '', title: 'School Event', description: 'Event details…' }]; }
  if (type === 'spotlight') { base.heading = 'Student/Teacher Name'; base.role = 'Student'; base.quote = 'A short quote or description…'; base.avatarUrl = ''; }
  if (type === 'button') { base.buttonLabel = 'Learn More'; base.buttonUrl = ''; base.buttonStyle = 'filled'; }
  if (type === 'heading') { base.heading = 'Section Title'; }
  if (type === 'three_column') { base.leftContent = 'Column 1'; base.middleContent = 'Column 2'; base.rightContent = 'Column 3'; }
  if (type === 'spacer') { base.spacerHeight = '24'; }
  if (type === 'social_links') { base.socialLinks = { facebook: '', twitter: '', instagram: '', youtube: '', linkedin: '', website: '', tiktok: '' }; }
  if (type === 'contact_info') { base.contactInfo = { phone: '', email: '', address: '', hours: '' }; }
  return base;
}

/* ── Color input component ────────────────────────────────────── */
function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label>{label}</label>
      <div className="nt-color-field">
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input type="text" value={value || ''} placeholder="#000000" onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

/* ── Global Style Editor ──────────────────────────────────────── */
function GlobalStyleEditor({ globalStyle, onChange }) {
  const g = globalStyle || {};
  const set = (key, val) => onChange({ ...g, [key]: val });

  const [tab, setTab] = useState('colors');

  return (
    <div className="nt-block-editor">
      <div className="nt-style-tabs">
        <button className={`nt-style-tab${tab === 'colors' ? ' active' : ''}`} onClick={() => setTab('colors')}>Colors</button>
        <button className={`nt-style-tab${tab === 'typography' ? ' active' : ''}`} onClick={() => setTab('typography')}>Type</button>
        <button className={`nt-style-tab${tab === 'layout' ? ' active' : ''}`} onClick={() => setTab('layout')}>Layout</button>
        <button className={`nt-style-tab${tab === 'header' ? ' active' : ''}`} onClick={() => setTab('header')}>Header</button>
        <button className={`nt-style-tab${tab === 'footer' ? ' active' : ''}`} onClick={() => setTab('footer')}>Footer</button>
      </div>

      {tab === 'colors' && (
        <>
          <ColorField label="Primary Color" value={g.primaryColor} onChange={(v) => set('primaryColor', v)} />
          <ColorField label="Secondary Color" value={g.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
          <ColorField label="Background" value={g.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
          <ColorField label="Body Text" value={g.bodyTextColor} onChange={(v) => set('bodyTextColor', v)} />
          <ColorField label="Accent" value={g.accentColor} onChange={(v) => set('accentColor', v)} />
          <ColorField label="Card Background" value={g.cardBackgroundColor} onChange={(v) => set('cardBackgroundColor', v)} />
          <ColorField label="Card Border" value={g.cardBorderColor} onChange={(v) => set('cardBorderColor', v)} />
          <ColorField label="Divider" value={g.dividerColor} onChange={(v) => set('dividerColor', v)} />
        </>
      )}

      {tab === 'typography' && (
        <>
          <div>
            <label>Body Font</label>
            <select value={g.fontFamily || ''} onChange={(e) => set('fontFamily', e.target.value)}>
              <option value="">Default (Arial)</option>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label>Heading Font</label>
            <select value={g.headingFontFamily || ''} onChange={(e) => set('headingFontFamily', e.target.value)}>
              <option value="">Same as body</option>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label>Base Font Size</label>
            <input type="text" value={g.baseFontSize || ''} placeholder="14px" onChange={(e) => set('baseFontSize', e.target.value)} />
          </div>
          <div>
            <label>Heading Font Size</label>
            <input type="text" value={g.headingFontSize || ''} placeholder="20px" onChange={(e) => set('headingFontSize', e.target.value)} />
          </div>
          <div>
            <label>Line Height</label>
            <input type="text" value={g.lineHeight || ''} placeholder="1.6" onChange={(e) => set('lineHeight', e.target.value)} />
          </div>
        </>
      )}

      {tab === 'layout' && (
        <>
          <div>
            <label>Max Width</label>
            <input type="text" value={g.maxWidth || ''} placeholder="680px" onChange={(e) => set('maxWidth', e.target.value)} />
          </div>
          <div>
            <label>Content Padding</label>
            <input type="text" value={g.contentPadding || ''} placeholder="24px" onChange={(e) => set('contentPadding', e.target.value)} />
          </div>
          <div>
            <label>Section Spacing</label>
            <input type="text" value={g.sectionSpacing || ''} placeholder="16px" onChange={(e) => set('sectionSpacing', e.target.value)} />
          </div>
          <div>
            <label>Border Radius</label>
            <input type="text" value={g.borderRadius || ''} placeholder="12px" onChange={(e) => set('borderRadius', e.target.value)} />
          </div>
        </>
      )}

      {tab === 'header' && (
        <>
          <div>
            <label>Header Style</label>
            <select value={g.headerStyle || 'gradient'} onChange={(e) => set('headerStyle', e.target.value)}>
              {HEADER_STYLES.map((hs) => <option key={hs.value} value={hs.value}>{hs.label}</option>)}
            </select>
          </div>
          <ColorField label="Header Background" value={g.headerBackgroundColor} onChange={(v) => set('headerBackgroundColor', v)} />
          <ColorField label="Header Text" value={g.headerTextColor} onChange={(v) => set('headerTextColor', v)} />
          <div>
            <label>Header Border Radius</label>
            <input type="text" value={g.headerBorderRadius || ''} placeholder="12px" onChange={(e) => set('headerBorderRadius', e.target.value)} />
          </div>
          <label className="nt-toggle">
            <input type="checkbox" checked={g.showLogo !== false} onChange={(e) => set('showLogo', e.target.checked)} />
            Show Logo
          </label>
          {g.showLogo !== false && (
            <>
              <div>
                <label>Logo Position</label>
                <select value={g.logoPosition || 'right'} onChange={(e) => set('logoPosition', e.target.value)}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div>
                <label>Logo Max Height</label>
                <input type="text" value={g.logoMaxHeight || ''} placeholder="40px" onChange={(e) => set('logoMaxHeight', e.target.value)} />
              </div>
            </>
          )}
        </>
      )}

      {tab === 'footer' && (
        <>
          <label className="nt-toggle">
            <input type="checkbox" checked={g.showFooter !== false} onChange={(e) => set('showFooter', e.target.checked)} />
            Show Footer
          </label>
          <ColorField label="Footer Text Color" value={g.footerTextColor} onChange={(v) => set('footerTextColor', v)} />
          <div>
            <label>Default Footer Text</label>
            <textarea value={g.footerText || ''} placeholder="Footer text…" onChange={(e) => set('footerText', e.target.value)} />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Block Property Editor ────────────────────────────────────── */
function BlockEditor({ block, onChange, onUploadImage, isUploadingImage = false }) {
  if (!block) return null;
  const set = (key, val) => onChange({ ...block, [key]: val });
  const setStyle = (key, val) => onChange({ ...block, style: { ...block.style, [key]: val } });
  const uploadLabel = isUploadingImage ? 'Uploading...' : 'Upload From Device';

  const uploadTo = async (event, assign) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUploadImage) return;
    const uploadedUrl = await onUploadImage(file);
    if (uploadedUrl) assign(uploadedUrl);
  };

  return (
    <div className="nt-block-editor">
      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>
        {BLOCK_TYPES.find((bt) => bt.type === block.type)?.icon} {BLOCK_TYPES.find((bt) => bt.type === block.type)?.label || block.type}
      </div>

      <label className="nt-toggle">
        <input type="checkbox" checked={block.visible !== false} onChange={(e) => set('visible', e.target.checked)} />
        Visible
      </label>

      {(block.type === 'header') && (
        <>
          <div><label>Heading</label><input type="text" value={block.heading || ''} onChange={(e) => set('heading', e.target.value)} /></div>
          <div><label>Subheading</label><textarea value={block.subheading || ''} onChange={(e) => set('subheading', e.target.value)} placeholder="Use {schoolName}, {classLabel}, {weekLabel}" /></div>
        </>
      )}

      {(block.type === 'text' || block.type === 'callout' || block.type === 'footer') && (
        <div><label>Content</label><textarea value={block.content || ''} rows={4} onChange={(e) => set('content', e.target.value)} /></div>
      )}

      {block.type === 'callout' && (
        <div><label>Emoji Icon</label><input type="text" value={block.iconEmoji || ''} onChange={(e) => set('iconEmoji', e.target.value)} placeholder="💡" /></div>
      )}

      {block.type === 'image' && (
        <>
          <div><label>Image URL</label><input type="url" value={block.imageUrl || ''} onChange={(e) => set('imageUrl', e.target.value)} /></div>
          <div>
            <label>Upload Image</label>
            <input type="file" accept="image/*" disabled={isUploadingImage} onChange={(e) => uploadTo(e, (url) => set('imageUrl', url))} />
            <small style={{ color: 'var(--text-secondary)' }}>{uploadLabel}</small>
          </div>
          <div><label>Alt Text</label><input type="text" value={block.imageAlt || ''} onChange={(e) => set('imageAlt', e.target.value)} /></div>
        </>
      )}

      {block.type === 'two_column' && (
        <>
          <div><label>Left Column</label><textarea value={block.leftContent || ''} rows={3} onChange={(e) => set('leftContent', e.target.value)} /></div>
          <div><label>Right Column</label><textarea value={block.rightContent || ''} rows={3} onChange={(e) => set('rightContent', e.target.value)} /></div>
        </>
      )}

      {block.type === 'three_column' && (
        <>
          <div><label>Left Column</label><textarea value={block.leftContent || ''} rows={3} onChange={(e) => set('leftContent', e.target.value)} /></div>
          <div><label>Middle Column</label><textarea value={block.middleContent || ''} rows={3} onChange={(e) => set('middleContent', e.target.value)} /></div>
          <div><label>Right Column</label><textarea value={block.rightContent || ''} rows={3} onChange={(e) => set('rightContent', e.target.value)} /></div>
        </>
      )}

      {block.type === 'hero_banner' && (
        <>
          <div><label>Heading</label><input type="text" value={block.heading || ''} onChange={(e) => set('heading', e.target.value)} /></div>
          <div><label>Subheading</label><input type="text" value={block.subheading || ''} onChange={(e) => set('subheading', e.target.value)} /></div>
          <div><label>Background Image URL</label><input type="url" value={block.style?.backgroundImageUrl || ''} onChange={(e) => setStyle('backgroundImageUrl', e.target.value)} /></div>
          <div>
            <label>Upload Background Image</label>
            <input type="file" accept="image/*" disabled={isUploadingImage} onChange={(e) => uploadTo(e, (url) => setStyle('backgroundImageUrl', url))} />
            <small style={{ color: 'var(--text-secondary)' }}>{uploadLabel}</small>
          </div>
          <div>
            <label>Overlay Opacity (0–1)</label>
            <input type="number" step="0.1" min="0" max="1" value={block.style?.overlayOpacity || '0.5'} onChange={(e) => setStyle('overlayOpacity', e.target.value)} />
          </div>
        </>
      )}

      {block.type === 'image_grid' && (
        <>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Add 2–4 image URLs:</p>
          {(block.images || []).map((img, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <label>Image {i + 1} URL</label>
              <input type="url" value={img.url || ''} onChange={(e) => {
                const imgs = [...(block.images || [])];
                imgs[i] = { ...imgs[i], url: e.target.value };
                set('images', imgs);
              }} />
              <label>Upload Image {i + 1}</label>
              <input
                type="file"
                accept="image/*"
                disabled={isUploadingImage}
                onChange={(e) => uploadTo(e, (url) => {
                  const imgs = [...(block.images || [])];
                  imgs[i] = { ...imgs[i], url };
                  set('images', imgs);
                })}
              />
              <label>Alt</label>
              <input type="text" value={img.alt || ''} onChange={(e) => {
                const imgs = [...(block.images || [])];
                imgs[i] = { ...imgs[i], alt: e.target.value };
                set('images', imgs);
              }} />
            </div>
          ))}
          {(block.images || []).length < 4 && (
            <button className="nt-btn" style={{ fontSize: '0.78rem' }} onClick={() => set('images', [...(block.images || []), { url: '', alt: '' }])}>+ Add Image</button>
          )}
          {(block.images || []).length > 2 && (
            <button className="nt-btn" style={{ fontSize: '0.78rem', marginLeft: 4 }} onClick={() => set('images', (block.images || []).slice(0, -1))}>− Remove Last</button>
          )}
        </>
      )}

      {block.type === 'events_list' && (
        <>
          {(block.events || []).map((ev, i) => (
            <div key={i} style={{ marginBottom: 12, padding: 8, border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 6 }}>
              <div><label>Date</label><input type="text" value={ev.date || ''} placeholder="Mar 25" onChange={(e) => {
                const evts = [...(block.events || [])];
                evts[i] = { ...evts[i], date: e.target.value };
                set('events', evts);
              }} /></div>
              <div><label>Title</label><input type="text" value={ev.title || ''} onChange={(e) => {
                const evts = [...(block.events || [])];
                evts[i] = { ...evts[i], title: e.target.value };
                set('events', evts);
              }} /></div>
              <div><label>Description</label><input type="text" value={ev.description || ''} onChange={(e) => {
                const evts = [...(block.events || [])];
                evts[i] = { ...evts[i], description: e.target.value };
                set('events', evts);
              }} /></div>
            </div>
          ))}
          <button className="nt-btn" style={{ fontSize: '0.78rem' }} onClick={() => set('events', [...(block.events || []), { date: '', title: '', description: '' }])}>+ Add Event</button>
          {(block.events || []).length > 1 && (
            <button className="nt-btn" style={{ fontSize: '0.78rem', marginLeft: 4 }} onClick={() => set('events', (block.events || []).slice(0, -1))}>− Remove Last</button>
          )}
        </>
      )}

      {block.type === 'spotlight' && (
        <>
          <div><label>Name</label><input type="text" value={block.heading || ''} onChange={(e) => set('heading', e.target.value)} /></div>
          <div><label>Role</label><input type="text" value={block.role || ''} placeholder="Student / Teacher" onChange={(e) => set('role', e.target.value)} /></div>
          <div><label>Quote</label><textarea value={block.quote || ''} rows={3} onChange={(e) => set('quote', e.target.value)} /></div>
          <div><label>Avatar URL</label><input type="url" value={block.avatarUrl || ''} onChange={(e) => set('avatarUrl', e.target.value)} /></div>
          <div>
            <label>Upload Avatar</label>
            <input type="file" accept="image/*" disabled={isUploadingImage} onChange={(e) => uploadTo(e, (url) => set('avatarUrl', url))} />
            <small style={{ color: 'var(--text-secondary)' }}>{uploadLabel}</small>
          </div>
        </>
      )}

      {block.type === 'button' && (
        <>
          <div><label>Button Label</label><input type="text" value={block.buttonLabel || ''} onChange={(e) => set('buttonLabel', e.target.value)} /></div>
          <div><label>Button URL</label><input type="url" value={block.buttonUrl || ''} onChange={(e) => set('buttonUrl', e.target.value)} /></div>
          <div>
            <label>Button Style</label>
            <select value={block.buttonStyle || 'filled'} onChange={(e) => set('buttonStyle', e.target.value)}>
              <option value="filled">Filled</option>
              <option value="outline">Outline</option>
              <option value="pill">Pill</option>
            </select>
          </div>
        </>
      )}

      {block.type === 'heading' && (
        <div><label>Heading Text</label><input type="text" value={block.heading || ''} onChange={(e) => set('heading', e.target.value)} /></div>
      )}

      {block.type === 'spacer' && (
        <div><label>Height (px)</label><input type="number" min="4" max="120" value={block.spacerHeight || '24'} onChange={(e) => set('spacerHeight', e.target.value)} /></div>
      )}

      {block.type === 'social_links' && (
        <>
          {['facebook', 'twitter', 'instagram', 'youtube', 'linkedin', 'website', 'tiktok'].map((key) => (
            <div key={key}>
              <label>{key.charAt(0).toUpperCase() + key.slice(1)} URL</label>
              <input type="url" value={(block.socialLinks || {})[key] || ''} onChange={(e) => set('socialLinks', { ...(block.socialLinks || {}), [key]: e.target.value })} />
            </div>
          ))}
        </>
      )}

      {block.type === 'contact_info' && (
        <>
          <div><label>Phone</label><input type="text" value={(block.contactInfo || {}).phone || ''} onChange={(e) => set('contactInfo', { ...(block.contactInfo || {}), phone: e.target.value })} /></div>
          <div><label>Email</label><input type="email" value={(block.contactInfo || {}).email || ''} onChange={(e) => set('contactInfo', { ...(block.contactInfo || {}), email: e.target.value })} /></div>
          <div><label>Address</label><input type="text" value={(block.contactInfo || {}).address || ''} onChange={(e) => set('contactInfo', { ...(block.contactInfo || {}), address: e.target.value })} /></div>
          <div><label>Hours</label><input type="text" value={(block.contactInfo || {}).hours || ''} onChange={(e) => set('contactInfo', { ...(block.contactInfo || {}), hours: e.target.value })} /></div>
        </>
      )}

      {block.type === 'subjects' && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          This block automatically renders each subject's approved newsletter section. No content to edit — it pulls from teacher submissions.
        </p>
      )}

      {block.type === 'divider' && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          A horizontal line separator. Style it using global divider color.
        </p>
      )}

      {/* Per-block style overrides */}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Style Overrides</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <ColorField label="Background" value={block.style?.backgroundColor} onChange={(v) => setStyle('backgroundColor', v)} />
          <ColorField label="Text Color" value={block.style?.textColor} onChange={(v) => setStyle('textColor', v)} />
          <div>
            <label>Text Align</label>
            <select value={block.style?.textAlign || ''} onChange={(e) => setStyle('textAlign', e.target.value)}>
              <option value="">Default</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div><label>Padding</label><input type="text" value={block.style?.padding || ''} placeholder="e.g. 12px 16px" onChange={(e) => setStyle('padding', e.target.value)} /></div>
          <div><label>Border Radius</label><input type="text" value={block.style?.borderRadius || ''} placeholder="e.g. 8px" onChange={(e) => setStyle('borderRadius', e.target.value)} /></div>
          <div><label>Font Size</label><input type="text" value={block.style?.fontSize || ''} placeholder="e.g. 16px" onChange={(e) => setStyle('fontSize', e.target.value)} /></div>
          <div>
            <label>Font Weight</label>
            <select value={block.style?.fontWeight || ''} onChange={(e) => setStyle('fontWeight', e.target.value)}>
              <option value="">Default</option>
              <option value="400">Normal (400)</option>
              <option value="600">Semi-bold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">Extra-bold (800)</option>
            </select>
          </div>
        </div>
      </details>
    </div>
  );
}

/* ── Preview renderer (client-side mirror of server renderer) ─── */
function buildPreviewHtml(template) {
  const g = template.globalStyle || {};
  const primary = g.primaryColor || '#0d9488';
  const secondary = g.secondaryColor || '#0f766e';
  const bg = g.backgroundColor || '#ffffff';
  const bodyColor = g.bodyTextColor || '#334155';
  const footerColor = g.footerTextColor || '#94a3b8';
  const cardBg = g.cardBackgroundColor || '#f8fafc';
  const cardBorder = g.cardBorderColor || '#e2e8f0';
  const dividerCol = g.dividerColor || '#e2e8f0';
  const accent = g.accentColor || primary;
  const font = g.fontFamily || 'Arial, Helvetica, sans-serif';
  const headingFont = g.headingFontFamily || font;
  const baseFontSize = g.baseFontSize || '14px';
  const headingFontSize = g.headingFontSize || '20px';
  const lineHeight = g.lineHeight || '1.6';
  const maxWidth = g.maxWidth || '680px';
  const contentPadding = g.contentPadding || '24px';
  const sectionSpacing = g.sectionSpacing || '16px';
  const borderRadius = g.borderRadius || '12px';
  const headerRadius = g.headerBorderRadius || '12px';
  const headerStyle = g.headerStyle || 'gradient';
  const showLogo = g.showLogo !== false;
  const logoPos = g.logoPosition || 'right';
  const logoMaxH = g.logoMaxHeight || '40px';

  const headerBgs = {
    gradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
    solid: g.headerBackgroundColor || primary,
    minimal: '#ffffff',
    banner: `linear-gradient(90deg, ${primary} 0%, ${secondary} 100%)`,
  };
  const headerBg = headerBgs[headerStyle] || headerBgs.gradient;
  const headerTextCol = headerStyle === 'minimal' ? bodyColor : (g.headerTextColor || '#ffffff');

  const blocks = [...(template.sections || [])].filter((b) => b.visible !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const interpolate = (text) => String(text ?? '')
    .replace(/\{classLabel\}/gi, 'Grade 5 - Green')
    .replace(/\{weekLabel\}/gi, '3/24/2026 – 3/28/2026')
    .replace(/\{schoolName\}/gi, 'Al-Noor Academy');

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const md2 = (t) => esc(t).replace(/\n/g, '<br/>');

  const sampleSubjects = [
    { name: 'Mathematics', content: 'This week we explored fractions and equivalent fractions. Students practiced converting between mixed numbers and improper fractions through hands-on activities.' },
    { name: 'English Language Arts', content: 'We focused on narrative writing and identifying story elements. Students wrote creative short stories with clear beginning, middle, and end.' },
    { name: 'Science', content: 'Our topic was the water cycle. Students observed evaporation experiments and created detailed diagrams showing precipitation and condensation.' },
  ];

  const htmlBlocks = blocks.map((rawBlock) => {
    const b = { ...rawBlock, content: interpolate(rawBlock.content), heading: interpolate(rawBlock.heading), subheading: interpolate(rawBlock.subheading), leftContent: interpolate(rawBlock.leftContent), rightContent: interpolate(rawBlock.rightContent), middleContent: interpolate(rawBlock.middleContent) };
    const bs = b.style || {};

    switch (b.type) {
      case 'header': {
        const logoAlign = { left: 'flex-start', center: 'center', right: 'flex-end' }[logoPos] || 'flex-end';
        const logoHtml = showLogo ? `<div style="display:flex;align-items:center;justify-content:${logoAlign};"><div style="width:${esc(logoMaxH)};height:${esc(logoMaxH)};background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;">Logo</div></div>` : '';
        return `<div style="padding:16px ${esc(contentPadding)};border-radius:${esc(headerRadius)};background:${headerBg};">
          <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;">
            <div style="flex:1;">
              <div style="font-size:${esc(headingFontSize)};font-weight:800;color:${esc(headerTextCol)};font-family:${esc(headingFont)};">${esc(b.heading || 'Newsletter')}</div>
              ${b.subheading ? `<div style="margin-top:4px;font-size:13px;color:${esc(headerTextCol)};opacity:0.85;">${md2(b.subheading)}</div>` : ''}
            </div>
            ${logoHtml}
          </div>
        </div>`;
      }
      case 'text': {
        const style = [bs.backgroundColor && `background:${esc(bs.backgroundColor)}`, `color:${esc(bs.textColor || bodyColor)}`, `font-size:${esc(bs.fontSize || baseFontSize)}`, `line-height:${esc(lineHeight)}`, bs.textAlign && `text-align:${esc(bs.textAlign)}`, bs.padding && `padding:${esc(bs.padding)}`, bs.borderRadius && `border-radius:${esc(bs.borderRadius)}`].filter(Boolean).join(';');
        return `<div style="${style}">${md2(b.content || '')}</div>`;
      }
      case 'image':
        if (!b.imageUrl) return `<div style="text-align:center;padding:24px;background:${esc(cardBg)};border:2px dashed ${esc(cardBorder)};border-radius:8px;color:#94a3b8;font-size:13px;">🖼️ Image placeholder — add a URL in the editor</div>`;
        return `<div style="text-align:${esc(bs.textAlign || 'center')};"><img src="${esc(b.imageUrl)}" alt="${esc(b.imageAlt || '')}" style="max-width:100%;border-radius:8px;" /></div>`;
      case 'subjects':
        return sampleSubjects.map((sub) => `<div style="margin:${esc(sectionSpacing)} 0;padding:14px;background:${esc(cardBg)};border:1px solid ${esc(cardBorder)};border-radius:${esc(borderRadius)};">
  <div style="font-weight:700;color:${esc(accent)};margin-bottom:6px;font-family:${esc(headingFont)};">${esc(sub.name)}</div>
  <div style="color:${esc(bodyColor)};line-height:${esc(lineHeight)};font-size:${esc(baseFontSize)};">${esc(sub.content)}</div>
</div>`).join('\n');
      case 'divider':
        return `<hr style="border:0;border-top:1px solid ${esc(dividerCol)};margin:${esc(sectionSpacing)} 0;" />`;
      case 'callout':
        return `<div style="border-left:4px solid ${esc(accent)};padding:14px 16px;background:${esc(bs.backgroundColor || cardBg)};border-radius:${esc(bs.borderRadius || borderRadius)};color:${esc(bs.textColor || bodyColor)};font-size:${esc(bs.fontSize || baseFontSize)};line-height:${esc(lineHeight)};"><span style="font-size:18px;margin-right:6px;">${esc(b.iconEmoji || '💡')}</span>${md2(b.content || '')}</div>`;
      case 'two_column':
        return `<div style="display:flex;gap:16px;color:${esc(bs.textColor || bodyColor)};font-size:${esc(bs.fontSize || baseFontSize)};"><div style="flex:1;line-height:${esc(lineHeight)};">${md2(b.leftContent || '')}</div><div style="flex:1;line-height:${esc(lineHeight)};">${md2(b.rightContent || '')}</div></div>`;
      case 'three_column':
        return `<div style="display:flex;gap:16px;color:${esc(bs.textColor || bodyColor)};font-size:${esc(bs.fontSize || baseFontSize)};"><div style="flex:1;line-height:${esc(lineHeight)};">${md2(b.leftContent || '')}</div><div style="flex:1;line-height:${esc(lineHeight)};">${md2(b.middleContent || '')}</div><div style="flex:1;line-height:${esc(lineHeight)};">${md2(b.rightContent || '')}</div></div>`;
      case 'hero_banner': {
        const bgImg = bs.backgroundImageUrl ? `background-image:url('${esc(bs.backgroundImageUrl)}');background-size:cover;background-position:center;` : `background:linear-gradient(135deg,${esc(primary)} 0%,${esc(secondary)} 100%);`;
        const overlay = `rgba(0,0,0,${esc(bs.overlayOpacity || '0.5')})`;
        return `<div style="${bgImg}border-radius:${esc(borderRadius)};overflow:hidden;position:relative;">
          <div style="background:${overlay};padding:32px ${esc(contentPadding)};text-align:center;">
            <div style="font-size:${esc(headingFontSize)};font-weight:800;color:#fff;font-family:${esc(headingFont)};">${esc(b.heading || '')}</div>
            ${b.subheading ? `<div style="margin-top:8px;font-size:14px;color:#fff;opacity:0.9;">${md2(b.subheading)}</div>` : ''}
          </div>
        </div>`;
      }
      case 'image_grid': {
        const imgs = b.images || [];
        const imgHtml = imgs.filter(im => im.url).map(im => `<div style="flex:1;min-width:120px;"><img src="${esc(im.url)}" alt="${esc(im.alt || '')}" style="width:100%;border-radius:8px;display:block;" /></div>`).join('');
        return imgHtml ? `<div style="display:flex;gap:12px;flex-wrap:wrap;">${imgHtml}</div>` : `<div style="text-align:center;padding:24px;background:${esc(cardBg)};border:2px dashed ${esc(cardBorder)};border-radius:8px;color:#94a3b8;font-size:13px;">🖼️ Image Grid — add URLs in editor</div>`;
      }
      case 'events_list': {
        const evts = b.events || [];
        if (!evts.length) return `<div style="color:${esc(bodyColor)};font-size:13px;">No events added.</div>`;
        return evts.map(ev => `<div style="display:flex;gap:12px;margin-bottom:10px;align-items:flex-start;">
          <div style="min-width:50px;background:${esc(accent)};color:#fff;border-radius:8px;padding:8px;text-align:center;font-weight:700;font-size:12px;">${esc(ev.date || '—')}</div>
          <div><div style="font-weight:700;color:${esc(bodyColor)};font-size:${esc(baseFontSize)};">${esc(ev.title || '')}</div><div style="color:${esc(bodyColor)};opacity:0.8;font-size:12px;margin-top:2px;">${esc(ev.description || '')}</div></div>
        </div>`).join('');
      }
      case 'spotlight': {
        const avatarHtml = b.avatarUrl
          ? `<img src="${esc(b.avatarUrl)}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;" />`
          : `<div style="width:64px;height:64px;border-radius:50%;background:${esc(accent)};color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;">${esc((b.heading || '?')[0])}</div>`;
        return `<div style="display:flex;gap:16px;align-items:center;padding:16px;background:${esc(bs.backgroundColor || cardBg)};border-radius:${esc(borderRadius)};border:1px solid ${esc(cardBorder)};">
          ${avatarHtml}
          <div>
            <div style="font-weight:700;font-size:${esc(baseFontSize)};color:${esc(bodyColor)};">${esc(b.heading || '')}</div>
            ${b.role ? `<div style="font-size:12px;color:${esc(accent)};margin-top:2px;">${esc(b.role)}</div>` : ''}
            ${b.quote ? `<div style="margin-top:6px;font-style:italic;color:${esc(bodyColor)};font-size:13px;">"${esc(b.quote)}"</div>` : ''}
          </div>
        </div>`;
      }
      case 'button': {
        const btnStyle = b.buttonStyle || 'filled';
        const btnStyles = {
          filled: `background:${esc(accent)};color:#fff;border:none;`,
          outline: `background:transparent;color:${esc(accent)};border:2px solid ${esc(accent)};`,
          pill: `background:${esc(accent)};color:#fff;border:none;border-radius:50px;`,
        };
        return `<div style="text-align:center;padding:8px 0;">
          <a href="${esc(b.buttonUrl || '#')}" style="display:inline-block;padding:12px 28px;text-decoration:none;font-weight:700;font-size:14px;border-radius:8px;${btnStyles[btnStyle] || btnStyles.filled}">${esc(b.buttonLabel || 'Button')}</a>
        </div>`;
      }
      case 'heading':
        return `<div style="font-size:${esc(headingFontSize)};font-weight:700;color:${esc(bs.textColor || accent)};font-family:${esc(headingFont)};text-align:${esc(bs.textAlign || 'left')};">${esc(b.heading || '')}</div>`;
      case 'spacer':
        return `<div style="height:${esc(b.spacerHeight || '24')}px;"></div>`;
      case 'social_links': {
        const links = b.socialLinks || {};
        const labels = { facebook: '📘 Facebook', twitter: '🐦 Twitter', instagram: '📷 Instagram', youtube: '▶️ YouTube', linkedin: '💼 LinkedIn', website: '🌐 Website', tiktok: '🎵 TikTok' };
        const items = Object.entries(links).filter(([, v]) => v).map(([k, v]) => `<a href="${esc(v)}" style="color:${esc(accent)};text-decoration:none;font-size:13px;margin:0 8px;">${labels[k] || k}</a>`);
        return items.length ? `<div style="text-align:center;padding:8px 0;">${items.join(' ')}</div>` : `<div style="text-align:center;color:#94a3b8;font-size:13px;">Add social links in editor</div>`;
      }
      case 'contact_info': {
        const ci = b.contactInfo || {};
        const parts = [ci.phone && `📞 ${esc(ci.phone)}`, ci.email && `✉️ ${esc(ci.email)}`, ci.address && `📍 ${esc(ci.address)}`, ci.hours && `🕐 ${esc(ci.hours)}`].filter(Boolean);
        return `<div style="text-align:center;color:${esc(bs.textColor || bodyColor)};font-size:13px;line-height:2;">${parts.join('<br/>')}</div>`;
      }
      case 'footer': {
        const text = b.content || g.footerText || '';
        if (g.showFooter === false && !b.content) return '';
        return `<div style="margin-top:${esc(sectionSpacing)};padding-top:12px;border-top:1px solid ${esc(dividerCol)};color:${esc(footerColor)};font-size:12px;">${md2(text)}</div>`;
      }
      default:
        return '';
    }
  });

  // Add default footer if missing
  const hasFooter = blocks.some((b) => b.type === 'footer');
  if (!hasFooter && g.showFooter !== false) {
    const ft = g.footerText || 'This email was sent by the school.';
    htmlBlocks.push(`<div style="margin-top:${sectionSpacing};padding-top:12px;border-top:1px solid ${dividerCol};color:${footerColor};font-size:12px;">${esc(ft)}</div>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;}</style></head><body><div style="font-family:${esc(font)};max-width:${esc(maxWidth)};margin:0 auto;padding:${esc(contentPadding)};background:${esc(bg)};">${htmlBlocks.filter(Boolean).join(`<div style="height:${esc(sectionSpacing)};"></div>`)}</div></body></html>`;
}

function buildPreviewErrorHtml(error) {
  const message = String(error?.message || 'Failed to render preview');
  const safeMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;font-family:Arial, Helvetica, sans-serif;background:#fff7ed;color:#9a3412;"><h3 style="margin:0 0 8px 0;">Preview unavailable</h3><p style="margin:0;">${safeMessage}</p></body></html>`;
}

/* ── Main Editor Component ────────────────────────────────────── */
export default function TemplateEditor({ templateId, onBack }) {
  const dispatch = useDispatch();
  const saved = useSelector(selectCurrentTemplate);
  const saving = useSelector(selectTemplatesSaving);
  const loading = useSelector(selectTemplatesLoading);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState([]);
  const [globalStyle, setGlobalStyle] = useState({});
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('blocks'); // blocks | style
  const [dirty, setDirty] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Load template
  useEffect(() => {
    dispatch(fetchTemplate(templateId));
  }, [dispatch, templateId]);

  // Populate local state from fetched template
  useEffect(() => {
    if (saved && saved._id === templateId) {
      setName(saved.name || '');
      setDescription(saved.description || '');
      setSections(saved.sections || []);
      setGlobalStyle(saved.globalStyle || {});
      setDirty(false);
    }
  }, [saved, templateId]);

  // Live preview
  const previewHtml = useMemo(() => {
    try {
      return buildPreviewHtml({ sections, globalStyle });
    } catch (error) {
      return buildPreviewErrorHtml(error);
    }
  }, [sections, globalStyle]);

  const uploadImage = useCallback(async (file) => {
    if (!file) return '';
    try {
      setUploadingImage(true);
      const response = await newsletterTemplateService.uploadImage(file);
      const uploadedUrl = response?.data?.url || '';
      if (!uploadedUrl) {
        throw new Error('Image upload failed');
      }
      toast.success('Image uploaded');
      return uploadedUrl;
    } catch (error) {
      toast.error(error?.message || 'Failed to upload image');
      return '';
    } finally {
      setUploadingImage(false);
    }
  }, []);

  // Active block
  const activeBlock = useMemo(() => sections.find((s) => s.id === activeBlockId) || null, [sections, activeBlockId]);

  /* ── Section mutations ──────────────────────────────────────── */
  const markDirty = useCallback(() => setDirty(true), []);

  const addBlock = useCallback((type) => {
    const block = newBlock(type);
    setSections((prev) => {
      const ordered = [...prev];
      block.order = ordered.length;
      ordered.push(block);
      return ordered;
    });
    setActiveBlockId(block.id);
    markDirty();
  }, [markDirty]);

  const updateBlock = useCallback((updated) => {
    setSections((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    markDirty();
  }, [markDirty]);

  const removeBlock = useCallback((id) => {
    setSections((prev) => prev.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })));
    if (activeBlockId === id) setActiveBlockId(null);
    markDirty();
  }, [activeBlockId, markDirty]);

  const moveBlock = useCallback((id, direction) => {
    setSections((prev) => {
      const arr = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const idx = arr.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((b, i) => ({ ...b, order: i }));
    });
    markDirty();
  }, [markDirty]);

  /* ── Save ───────────────────────────────────────────────────── */
  const handleSave = useCallback(async () => {
    try {
      await dispatch(updateTemplate({
        id: templateId,
        data: { name, description, sections, globalStyle },
      })).unwrap();
      setDirty(false);
      toast.success('Template saved');
    } catch (err) {
      toast.error(err || 'Failed to save');
    }
  }, [dispatch, templateId, name, description, sections, globalStyle]);

  if (loading && !saved) {
    return <div className="nt-page" style={{ textAlign: 'center', padding: 48 }}><span className="nt-spinner" /></div>;
  }

  const sortedBlocks = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="nt-page" style={{ padding: 0 }}>
      {/* Toolbar */}
      <div className="nt-toolbar">
        <button className="nt-btn" onClick={onBack}>← Back</button>
        <div className="nt-toolbar-name">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); markDirty(); }}
            placeholder="Template name…"
          />
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => { setDescription(e.target.value); markDirty(); }}
          placeholder="Description…"
          style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px', fontSize: '0.82rem', maxWidth: 220, background: 'var(--bg-card, #fff)', color: 'var(--text-primary)' }}
        />
        <button className="nt-btn nt-btn--primary" disabled={saving || !dirty} onClick={handleSave}>
          {saving ? <span className="nt-spinner" /> : 'Save'}
        </button>
      </div>

      {/* Editor body */}
      <div className="nt-editor">
        {/* Sidebar */}
        <div className="nt-editor-sidebar">
          {/* Sidebar tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
            <button
              className={`nt-style-tab${sidebarTab === 'blocks' ? ' active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setSidebarTab('blocks')}
            >Blocks</button>
            <button
              className={`nt-style-tab${sidebarTab === 'style' ? ' active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setSidebarTab('style')}
            >Global Style</button>
          </div>

          {sidebarTab === 'blocks' && (
            <>
              {/* Add block palette */}
              <div className="nt-sidebar-section">
                <h3>Add Block</h3>
                <div className="nt-block-palette">
                  {BLOCK_TYPES.map((bt) => (
                    <button key={bt.type} className="nt-block-btn" onClick={() => addBlock(bt.type)}>
                      <span>{bt.icon}</span>
                      <span>{bt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Block list */}
              <div className="nt-sidebar-section">
                <h3>Layout ({sortedBlocks.length} blocks)</h3>
                <div className="nt-block-list">
                  {sortedBlocks.map((block) => (
                    <div
                      key={block.id}
                      className={`nt-block-item${activeBlockId === block.id ? ' nt-block-item--active' : ''}`}
                      onClick={() => setActiveBlockId(block.id)}
                      style={{ opacity: block.visible === false ? 0.4 : 1 }}
                    >
                      <span className="nt-block-item-icon">
                        {BLOCK_TYPES.find((bt) => bt.type === block.type)?.icon || '❓'}
                      </span>
                      <span className="nt-block-item-label">
                        {BLOCK_TYPES.find((bt) => bt.type === block.type)?.label || block.type}
                      </span>
                      <span className="nt-block-item-actions">
                        <button title="Move up" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, -1); }}>↑</button>
                        <button title="Move down" onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 1); }}>↓</button>
                        <button title="Remove" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}>×</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active block editor */}
              {activeBlock && (
                <div className="nt-sidebar-section">
                  <h3>Edit Block</h3>
                  <BlockEditor block={activeBlock} onChange={updateBlock} onUploadImage={uploadImage} isUploadingImage={uploadingImage} />
                </div>
              )}
            </>
          )}

          {sidebarTab === 'style' && (
            <div className="nt-sidebar-section">
              <h3>Global Styles</h3>
              <GlobalStyleEditor
                globalStyle={globalStyle}
                onChange={(gs) => { setGlobalStyle(gs); markDirty(); }}
              />
            </div>
          )}
        </div>

        {/* Canvas / Preview */}
        <div className="nt-editor-canvas">
          <div className="nt-editor-canvas-inner">
            <iframe title="template-preview" srcDoc={previewHtml} sandbox="allow-same-origin" style={{ width: '100%', minHeight: 600, border: 'none' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
