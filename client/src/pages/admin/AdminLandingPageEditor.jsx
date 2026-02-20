import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineDocumentText,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineSave,
  HiOutlineSparkles,
  HiOutlineTrash,
  HiOutlineViewGrid,
} from 'react-icons/hi';
import {
  getAdminLandingContent,
  resetLandingContent,
  updateLandingContent,
} from '../../services/landingContentService';
import { landingPageDefaults } from '../../config/landingPageDefaults';
import './AdminDashboardPage.css';
import './AdminLandingPageEditor.css';

const FEATURE_ICON_OPTIONS = [
  'gradebook',
  'attendance',
  'substitute',
  'analytics',
  'security',
  'mobile',
];

const toPrettyJson = (value) => JSON.stringify(value, null, 2);
const cloneContent = (value) => JSON.parse(JSON.stringify(value));

const getValueAtPath = (source, path) =>
  path.reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), source);

const setValueAtPath = (source, path, value) => {
  if (!path.length) return value;
  const [first, ...rest] = path;
  const base = Array.isArray(source) ? [...source] : { ...(source || {}) };
  base[first] = rest.length ? setValueAtPath(base[first], rest, value) : value;
  return base;
};

const createEmptyFeature = () => ({
  iconKey: 'gradebook',
  title: 'New feature',
  description: 'Describe this feature briefly.',
});

const createEmptyPlan = () => ({
  name: 'New plan',
  price: '$0',
  period: '/month',
  description: '',
  features: [],
  featured: false,
  ctaLabel: 'Learn more',
  ctaAction: 'register',
});

const createEmptyFaq = () => ({
  question: 'New question',
  answer: 'Provide a clear answer.',
});

const createEmptyTestimonial = () => ({
  quote: 'Write a short testimonial.',
  name: 'Name',
  role: 'Role',
  initials: 'NA',
});

const AdminLandingPageEditor = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [mode, setMode] = useState('form');
  const [contentDraft, setContentDraft] = useState(cloneContent(landingPageDefaults));
  const [editorText, setEditorText] = useState(toPrettyJson(landingPageDefaults));
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);

  const lastUpdatedLabel = useMemo(() => {
    if (!updatedAt) return 'Not published yet';
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) return 'Not published yet';
    return date.toLocaleString();
  }, [updatedAt]);

  const syncDraft = (nextDraft) => {
    setContentDraft(nextDraft);
    setEditorText(toPrettyJson(nextDraft));
  };

  const updatePath = (path, value) => {
    setContentDraft((previous) => {
      const next = setValueAtPath(previous, path, value);
      setEditorText(toPrettyJson(next));
      return next;
    });
  };

  const updateArray = (path, updater) => {
    setContentDraft((previous) => {
      const currentArray = getValueAtPath(previous, path);
      const safeArray = Array.isArray(currentArray) ? [...currentArray] : [];
      const nextArray = updater(safeArray);
      const next = setValueAtPath(previous, path, nextArray);
      setEditorText(toPrettyJson(next));
      return next;
    });
  };

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

  const loadContent = async () => {
    setLoading(true);
    try {
      const data = await getAdminLandingContent();
      const nextContent = cloneContent(data?.content || landingPageDefaults);
      syncDraft(nextContent);
      setUpdatedAt(data?.updatedAt || null);
      setUpdatedBy(data?.updatedBy || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load landing content');
      syncDraft(cloneContent(landingPageDefaults));
      setUpdatedAt(null);
      setUpdatedBy(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, []);

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'json') {
      setEditorText(toPrettyJson(contentDraft));
      setMode('json');
      return;
    }

    try {
      const parsed = parseEditorText();
      syncDraft(parsed);
      setMode('form');
    } catch (error) {
      toast.error(`Fix JSON before switching to form mode: ${error.message}`);
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = parseEditorText();
      syncDraft(parsed);
      toast.success('JSON formatted');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = mode === 'json' ? parseEditorText() : contentDraft;
      const data = await updateLandingContent(payload);
      const savedContent = cloneContent(data?.content || payload);
      syncDraft(savedContent);
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
      const resetContent = cloneContent(data?.content || landingPageDefaults);
      syncDraft(resetContent);
      setUpdatedAt(data?.updatedAt || null);
      setUpdatedBy(data?.updatedBy || null);
      toast.success('Landing page reset to defaults');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reset landing content');
    } finally {
      setResetting(false);
    }
  };

  const handleCommaListChange = (path, rawValue) => {
    const list = rawValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    updatePath(path, list);
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
            {mode === 'form' ? (
              <HiOutlineViewGrid size={18} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            ) : (
              <HiOutlineDocumentText size={18} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            )}
            {mode === 'form' ? 'Form Editor' : 'JSON Editor'}
          </h2>

          <div className="admin-actions">
            <button
              className={`admin-action-btn ${mode === 'form' ? 'primary' : ''}`}
              onClick={() => handleModeChange('form')}
              disabled={loading || saving || resetting}
            >
              Form
            </button>
            <button
              className={`admin-action-btn ${mode === 'json' ? 'primary' : ''}`}
              onClick={() => handleModeChange('json')}
              disabled={loading || saving || resetting}
            >
              JSON
            </button>
            {mode === 'json' ? (
              <button className="admin-action-btn" onClick={handleFormatJson} disabled={loading || saving || resetting}>
                <HiOutlineSparkles size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Format
              </button>
            ) : null}
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
          {mode === 'form' ? (
            <div className="landing-cms-grid">
              <section className="landing-cms-card">
                <h3>Brand and Header</h3>
                <div className="landing-cms-field">
                  <label>Brand Name</label>
                  <input value={contentDraft.brand?.name || ''} onChange={(event) => updatePath(['brand', 'name'], event.target.value)} />
                </div>
                <div className="landing-cms-field">
                  <label>Tagline</label>
                  <input value={contentDraft.brand?.tagline || ''} onChange={(event) => updatePath(['brand', 'tagline'], event.target.value)} />
                </div>
                <div className="landing-cms-field-row">
                  <div className="landing-cms-field">
                    <label>Log In Label</label>
                    <input value={contentDraft.header?.loginLabel || ''} onChange={(event) => updatePath(['header', 'loginLabel'], event.target.value)} />
                  </div>
                  <div className="landing-cms-field">
                    <label>Start Label</label>
                    <input value={contentDraft.header?.startLabel || ''} onChange={(event) => updatePath(['header', 'startLabel'], event.target.value)} />
                  </div>
                </div>
                <div className="landing-cms-field-row">
                  <div className="landing-cms-field">
                    <label>SEO Organization Name</label>
                    <input value={contentDraft.seo?.organizationName || ''} onChange={(event) => updatePath(['seo', 'organizationName'], event.target.value)} />
                  </div>
                  <div className="landing-cms-field">
                    <label>Support Email</label>
                    <input value={contentDraft.brand?.supportEmail || ''} onChange={(event) => updatePath(['brand', 'supportEmail'], event.target.value)} />
                  </div>
                </div>
                <div className="landing-cms-field">
                  <label>SEO Description</label>
                  <textarea value={contentDraft.seo?.description || ''} onChange={(event) => updatePath(['seo', 'description'], event.target.value)} rows={3} />
                </div>
              </section>

              <section className="landing-cms-card">
                <h3>Hero Section</h3>
                <div className="landing-cms-field">
                  <label>Hero Title</label>
                  <input value={contentDraft.hero?.title || ''} onChange={(event) => updatePath(['hero', 'title'], event.target.value)} />
                </div>
                <div className="landing-cms-field">
                  <label>Hero Subtitle</label>
                  <textarea value={contentDraft.hero?.subtitle || ''} onChange={(event) => updatePath(['hero', 'subtitle'], event.target.value)} rows={3} />
                </div>
                <div className="landing-cms-field-row">
                  <div className="landing-cms-field">
                    <label>Primary CTA Label</label>
                    <input value={contentDraft.hero?.primaryCta?.label || ''} onChange={(event) => updatePath(['hero', 'primaryCta', 'label'], event.target.value)} />
                  </div>
                  <div className="landing-cms-field">
                    <label>Primary CTA Action</label>
                    <input value={contentDraft.hero?.primaryCta?.action || ''} onChange={(event) => updatePath(['hero', 'primaryCta', 'action'], event.target.value)} />
                  </div>
                </div>
                <div className="landing-cms-field-row">
                  <div className="landing-cms-field">
                    <label>Secondary CTA Label</label>
                    <input value={contentDraft.hero?.secondaryCta?.label || ''} onChange={(event) => updatePath(['hero', 'secondaryCta', 'label'], event.target.value)} />
                  </div>
                  <div className="landing-cms-field">
                    <label>Secondary CTA Action</label>
                    <input value={contentDraft.hero?.secondaryCta?.action || ''} onChange={(event) => updatePath(['hero', 'secondaryCta', 'action'], event.target.value)} />
                  </div>
                </div>
                <div className="landing-cms-field">
                  <label>Highlights (comma-separated)</label>
                  <input
                    value={(contentDraft.hero?.highlights || []).join(', ')}
                    onChange={(event) => handleCommaListChange(['hero', 'highlights'], event.target.value)}
                  />
                </div>
              </section>

              <section className="landing-cms-card">
                <h3>Features Section</h3>
                <div className="landing-cms-field">
                  <label>Section Title</label>
                  <input value={contentDraft.features?.title || ''} onChange={(event) => updatePath(['features', 'title'], event.target.value)} />
                </div>
                <div className="landing-cms-field">
                  <label>Section Subtitle</label>
                  <textarea value={contentDraft.features?.subtitle || ''} onChange={(event) => updatePath(['features', 'subtitle'], event.target.value)} rows={2} />
                </div>

                <div className="landing-cms-sublist">
                  {(contentDraft.features?.items || []).map((feature, index) => (
                    <div key={`feature-${index}`} className="landing-cms-subcard">
                      <div className="landing-cms-subcard-header">
                        <strong>Feature #{index + 1}</strong>
                        <button type="button" className="landing-cms-icon-btn" onClick={() => updateArray(['features', 'items'], (items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                          <HiOutlineTrash size={14} />
                        </button>
                      </div>
                      <div className="landing-cms-field-row">
                        <div className="landing-cms-field">
                          <label>Icon</label>
                          <select value={feature.iconKey || ''} onChange={(event) => updatePath(['features', 'items', index, 'iconKey'], event.target.value)}>
                            {FEATURE_ICON_OPTIONS.map((icon) => (
                              <option key={icon} value={icon}>{icon}</option>
                            ))}
                          </select>
                        </div>
                        <div className="landing-cms-field">
                          <label>Title</label>
                          <input value={feature.title || ''} onChange={(event) => updatePath(['features', 'items', index, 'title'], event.target.value)} />
                        </div>
                      </div>
                      <div className="landing-cms-field">
                        <label>Description</label>
                        <textarea value={feature.description || ''} onChange={(event) => updatePath(['features', 'items', index, 'description'], event.target.value)} rows={2} />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="landing-cms-inline-btn"
                  onClick={() => updateArray(['features', 'items'], (items) => [...items, createEmptyFeature()])}
                >
                  <HiOutlinePlus size={14} />
                  Add Feature
                </button>
              </section>

              <section className="landing-cms-card">
                <h3>Pricing Section</h3>
                <div className="landing-cms-field">
                  <label>Section Title</label>
                  <input value={contentDraft.pricing?.title || ''} onChange={(event) => updatePath(['pricing', 'title'], event.target.value)} />
                </div>
                <div className="landing-cms-sublist">
                  {(contentDraft.pricing?.plans || []).map((plan, index) => (
                    <div key={`plan-${index}`} className="landing-cms-subcard">
                      <div className="landing-cms-subcard-header">
                        <strong>{plan.name || `Plan #${index + 1}`}</strong>
                        <button type="button" className="landing-cms-icon-btn" onClick={() => updateArray(['pricing', 'plans'], (plans) => plans.filter((_, planIndex) => planIndex !== index))}>
                          <HiOutlineTrash size={14} />
                        </button>
                      </div>
                      <div className="landing-cms-field-row">
                        <div className="landing-cms-field">
                          <label>Name</label>
                          <input value={plan.name || ''} onChange={(event) => updatePath(['pricing', 'plans', index, 'name'], event.target.value)} />
                        </div>
                        <div className="landing-cms-field">
                          <label>Price</label>
                          <input value={plan.price || ''} onChange={(event) => updatePath(['pricing', 'plans', index, 'price'], event.target.value)} />
                        </div>
                      </div>
                      <div className="landing-cms-field-row">
                        <div className="landing-cms-field">
                          <label>CTA Label</label>
                          <input value={plan.ctaLabel || ''} onChange={(event) => updatePath(['pricing', 'plans', index, 'ctaLabel'], event.target.value)} />
                        </div>
                        <div className="landing-cms-field">
                          <label>CTA Action</label>
                          <input value={plan.ctaAction || ''} onChange={(event) => updatePath(['pricing', 'plans', index, 'ctaAction'], event.target.value)} />
                        </div>
                      </div>
                      <div className="landing-cms-field">
                        <label>Description</label>
                        <textarea value={plan.description || ''} onChange={(event) => updatePath(['pricing', 'plans', index, 'description'], event.target.value)} rows={2} />
                      </div>
                      <div className="landing-cms-field">
                        <label>Features (comma-separated)</label>
                        <input
                          value={(plan.features || []).join(', ')}
                          onChange={(event) => {
                            const value = event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean);
                            updatePath(['pricing', 'plans', index, 'features'], value);
                          }}
                        />
                      </div>
                      <label className="landing-cms-checkbox">
                        <input type="checkbox" checked={Boolean(plan.featured)} onChange={(event) => updatePath(['pricing', 'plans', index, 'featured'], event.target.checked)} />
                        Featured plan
                      </label>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="landing-cms-inline-btn"
                  onClick={() => updateArray(['pricing', 'plans'], (plans) => [...plans, createEmptyPlan()])}
                >
                  <HiOutlinePlus size={14} />
                  Add Plan
                </button>
              </section>

              <section className="landing-cms-card">
                <h3>Testimonials and FAQ</h3>
                <div className="landing-cms-sublist">
                  {(contentDraft.testimonials?.items || []).map((item, index) => (
                    <div key={`testimonial-${index}`} className="landing-cms-subcard">
                      <div className="landing-cms-subcard-header">
                        <strong>Testimonial #{index + 1}</strong>
                        <button type="button" className="landing-cms-icon-btn" onClick={() => updateArray(['testimonials', 'items'], (items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                          <HiOutlineTrash size={14} />
                        </button>
                      </div>
                      <div className="landing-cms-field-row">
                        <div className="landing-cms-field">
                          <label>Name</label>
                          <input value={item.name || ''} onChange={(event) => updatePath(['testimonials', 'items', index, 'name'], event.target.value)} />
                        </div>
                        <div className="landing-cms-field">
                          <label>Role</label>
                          <input value={item.role || ''} onChange={(event) => updatePath(['testimonials', 'items', index, 'role'], event.target.value)} />
                        </div>
                      </div>
                      <div className="landing-cms-field">
                        <label>Quote</label>
                        <textarea value={item.quote || ''} onChange={(event) => updatePath(['testimonials', 'items', index, 'quote'], event.target.value)} rows={2} />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="landing-cms-inline-btn"
                  onClick={() => updateArray(['testimonials', 'items'], (items) => [...items, createEmptyTestimonial()])}
                >
                  <HiOutlinePlus size={14} />
                  Add Testimonial
                </button>

                <div className="landing-cms-divider" />

                <div className="landing-cms-sublist">
                  {(contentDraft.faq?.items || []).map((item, index) => (
                    <div key={`faq-${index}`} className="landing-cms-subcard">
                      <div className="landing-cms-subcard-header">
                        <strong>FAQ #{index + 1}</strong>
                        <button type="button" className="landing-cms-icon-btn" onClick={() => updateArray(['faq', 'items'], (items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                          <HiOutlineTrash size={14} />
                        </button>
                      </div>
                      <div className="landing-cms-field">
                        <label>Question</label>
                        <input value={item.question || ''} onChange={(event) => updatePath(['faq', 'items', index, 'question'], event.target.value)} />
                      </div>
                      <div className="landing-cms-field">
                        <label>Answer</label>
                        <textarea value={item.answer || ''} onChange={(event) => updatePath(['faq', 'items', index, 'answer'], event.target.value)} rows={3} />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="landing-cms-inline-btn"
                  onClick={() => updateArray(['faq', 'items'], (items) => [...items, createEmptyFaq()])}
                >
                  <HiOutlinePlus size={14} />
                  Add FAQ
                </button>
              </section>

              <section className="landing-cms-card">
                <h3>Final CTA and Find School</h3>
                <div className="landing-cms-field">
                  <label>Final CTA Title</label>
                  <input value={contentDraft.finalCta?.title || ''} onChange={(event) => updatePath(['finalCta', 'title'], event.target.value)} />
                </div>
                <div className="landing-cms-field">
                  <label>Final CTA Subtitle</label>
                  <textarea value={contentDraft.finalCta?.subtitle || ''} onChange={(event) => updatePath(['finalCta', 'subtitle'], event.target.value)} rows={2} />
                </div>
                <div className="landing-cms-field-row">
                  <div className="landing-cms-field">
                    <label>Final CTA Button Label</label>
                    <input value={contentDraft.finalCta?.button?.label || ''} onChange={(event) => updatePath(['finalCta', 'button', 'label'], event.target.value)} />
                  </div>
                  <div className="landing-cms-field">
                    <label>Final CTA Action</label>
                    <input value={contentDraft.finalCta?.button?.action || ''} onChange={(event) => updatePath(['finalCta', 'button', 'action'], event.target.value)} />
                  </div>
                </div>
                <div className="landing-cms-divider" />
                <div className="landing-cms-field">
                  <label>Find School Title</label>
                  <input value={contentDraft.findSchool?.title || ''} onChange={(event) => updatePath(['findSchool', 'title'], event.target.value)} />
                </div>
                <div className="landing-cms-field">
                  <label>Find School Subtitle</label>
                  <textarea value={contentDraft.findSchool?.subtitle || ''} onChange={(event) => updatePath(['findSchool', 'subtitle'], event.target.value)} rows={2} />
                </div>
                <div className="landing-cms-field-row">
                  <div className="landing-cms-field">
                    <label>Search Placeholder</label>
                    <input value={contentDraft.findSchool?.searchPlaceholder || ''} onChange={(event) => updatePath(['findSchool', 'searchPlaceholder'], event.target.value)} />
                  </div>
                  <div className="landing-cms-field">
                    <label>Register CTA Label</label>
                    <input value={contentDraft.findSchool?.registerCtaLabel || ''} onChange={(event) => updatePath(['findSchool', 'registerCtaLabel'], event.target.value)} />
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLandingPageEditor;

