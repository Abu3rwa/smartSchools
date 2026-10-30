import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { addDays, format } from 'date-fns';

import api from '../../../../config/api';
import { AI_LANGUAGE_OPTIONS, buildRequestedLanguages, toLegacyLanguageValue } from '../../../../constants/aiLanguages';

import './ChildLettersPanel.css';

const WORD_TARGETS = [60, 90, 120, 150, 200, 250];
const SOURCE_KEYS = ['classwork', 'spelling', 'upcomingTest', 'reading', 'writing'];
const DEFAULT_SOURCES = ['classwork', 'spelling', 'upcomingTest'];
const FILTER_KEYS = ['all', 'draft', 'ready', 'sent'];

const STATUS_CLASS = {
  draft: 'is-draft',
  submitted: 'is-submitted',
  approved: 'is-approved',
  rejected: 'is-rejected',
};

const weekEndOf = (weekStart) => format(addDays(new Date(weekStart), 6), 'yyyy-MM-dd');
const wordCountOf = (text) => (text || '').trim().split(/\s+/).filter(Boolean).length;

export default function ChildLettersPanel({ classId, academicYear, weekStart }) {
  const { t } = useTranslation(['newsletters']);

  const [periodStart, setPeriodStart] = useState(weekStart);
  const [periodEnd, setPeriodEnd] = useState(() => weekEndOf(weekStart));
  const [wordTarget, setWordTarget] = useState(90);
  const [sources, setSources] = useState(DEFAULT_SOURCES);
  const [students, setStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [studentQuery, setStudentQuery] = useState('');
  const [note, setNote] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('en');
  const [secondaryLanguage, setSecondaryLanguage] = useState('');
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [draftText, setDraftText] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [filter, setFilter] = useState('all');
  const [bulkSigning, setBulkSigning] = useState(false);

  useEffect(() => {
    setPeriodStart(weekStart);
    setPeriodEnd(weekEndOf(weekStart));
  }, [weekStart, classId]);

  const loadStudents = useCallback(async () => {
    if (!classId) return;
    try {
      const res = await api.get('/newsletters/child-letters/students', { params: { classId } });
      const rows = res.data.data.students || [];
      setStudents(rows);
      setSelectedStudentIds(rows.map((row) => row._id));
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.toasts.studentsFailed'));
    }
  }, [classId, t]);

  const loadLetters = useCallback(async () => {
    if (!classId) return;
    try {
      setLoading(true);
      const res = await api.get('/newsletters/child-letters', {
        params: { classId, academicYear, weekStart, periodStart },
      });
      setLetters(res.data.data.letters || []);
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [academicYear, classId, periodStart, t, weekStart]);

  useEffect(() => { loadStudents(); }, [loadStudents]);
  useEffect(() => { loadLetters(); }, [loadLetters]);

  useEffect(() => {
    if (!previewHtml) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setPreviewHtml(''); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewHtml]);

  const toggleSource = (key) => {
    setSources((prev) => (prev.includes(key) ? prev.filter((row) => row !== key) : [...prev, key]));
  };

  const toggleStudent = (id) => {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const selectAllStudents = () => setSelectedStudentIds(students.map((row) => row._id));
  const clearStudents = () => setSelectedStudentIds([]);
  const allSelected = students.length > 0 && selectedStudentIds.length === students.length;

  const visibleStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((row) => row.name.toLowerCase().includes(q));
  }, [students, studentQuery]);

  const counts = useMemo(() => {
    const byStatus = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
    let sent = 0;
    for (const letter of letters) {
      if (letter.sentAt) sent += 1;
      else if (byStatus[letter.status] !== undefined) byStatus[letter.status] += 1;
    }
    return { ...byStatus, sent };
  }, [letters]);

  const filteredLetters = useMemo(() => {
    if (filter === 'all') return letters;
    if (filter === 'sent') return letters.filter((row) => row.sentAt);
    if (filter === 'ready') return letters.filter((row) => row.status === 'approved' && !row.sentAt);
    return letters.filter((row) => row.status === 'draft' && !row.sentAt);
  }, [letters, filter]);

  const draftCount = letters.filter((row) => row.status === 'draft' && !row.sentAt).length;

  const onGenerate = async () => {
    if (!classId) {
      toast.error(t('newsletters:teacher.toasts.selectClassSubject'));
      return;
    }
    if (!selectedStudentIds.length) {
      toast.error(t('newsletters:childLetters.setup.pickStudents'));
      return;
    }
    try {
      setGenerating(true);
      const requestedLanguages = buildRequestedLanguages(primaryLanguage, secondaryLanguage);
      const normalized = requestedLanguages.length > 0 ? requestedLanguages : ['en'];
      const res = await api.post('/newsletters/child-letters/generate', {
        classId,
        academicYear,
        weekStart,
        periodStart,
        periodEnd,
        wordTarget,
        sources,
        studentIds: selectedStudentIds,
        customNote: note,
        requestedLanguages: normalized,
        primaryLanguage,
        secondaryLanguage,
        language: toLegacyLanguageValue(normalized),
      });
      const data = res.data.data;
      toast.success(
        t('newsletters:childLetters.toasts.generated', {
          generated: data.generated,
          failed: data.failed,
          skipped: data.skipped,
        })
      );
      if (data.overCap) {
        toast(t('newsletters:childLetters.toasts.overCap', { value: data.overCap }));
      }
      await loadLetters();
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.toasts.generateFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (letter) => {
    setEditingId(letter._id);
    setDraftText(letter.content || '');
    setDraftNote(letter.teacherNote || '');
  };

  const onSave = async (letter) => {
    try {
      setSaving(true);
      await api.patch(`/newsletters/child-letters/${letter._id}/content`, {
        content: draftText,
        teacherNote: draftNote,
      });
      toast.success(t('newsletters:teacher.toasts.draftUpdated'));
      setEditingId('');
      await loadLetters();
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:teacher.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onSignOff = async (letter) => {
    try {
      await api.post(`/newsletters/child-letters/${letter._id}/submit`);
      toast.success(t('newsletters:childLetters.toasts.signedOff'));
      await loadLetters();
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:teacher.toasts.submitFailed'));
    }
  };

  const onSignOffAll = async () => {
    const drafts = letters.filter((row) => row.status === 'draft' && !row.sentAt);
    if (!drafts.length) return;
    try {
      setBulkSigning(true);
      let done = 0;
      for (const letter of drafts) {
        await api.post(`/newsletters/child-letters/${letter._id}/submit`);
        done += 1;
      }
      toast.success(t('newsletters:childLetters.toasts.bulkSignedOff', { value: done }));
      await loadLetters();
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:teacher.toasts.submitFailed'));
      await loadLetters();
    } finally {
      setBulkSigning(false);
    }
  };

  const onPreview = async (letter) => {
    try {
      const res = await api.get(`/newsletters/child-letters/${letter._id}/preview`);
      setPreviewHtml(res.data.data.htmlContent);
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.toasts.previewFailed'));
    }
  };

  const onDownloadPdf = async (letter) => {
    try {
      const res = await api.get(`/newsletters/child-letters/${letter._id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `weekly-letter-${(letter.studentName || 'student').replace(/\s+/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.toasts.pdfFailed'));
    }
  };

  const editorWords = wordCountOf(draftText);

  return (
    <div className="clp">
      <div className="clp-grid">
        <section className="clp-card clp-setup">
          <h3>{t('newsletters:childLetters.setup.title')}</h3>
          <p className="clp-hint">{t('newsletters:childLetters.setup.hint')}</p>

          <div className="clp-row">
            <label className="clp-field">
              <span>{t('newsletters:childLetters.setup.from')}</span>
              <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            </label>
            <label className="clp-field">
              <span>{t('newsletters:childLetters.setup.to')}</span>
              <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
            </label>
            <label className="clp-field">
              <span>{t('newsletters:childLetters.setup.words')}</span>
              <select value={wordTarget} onChange={(event) => setWordTarget(Number(event.target.value))}>
                {WORD_TARGETS.map((value) => (
                  <option key={value} value={value}>{t('newsletters:childLetters.setup.wordsOption', { value })}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="clp-block">
            <div className="clp-label">
              <span>{t('newsletters:childLetters.setup.include')}</span>
            </div>
            <div className="clp-chips">
              {SOURCE_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`clp-chip${sources.includes(key) ? ' is-on' : ''}`}
                  onClick={() => toggleSource(key)}
                  aria-pressed={sources.includes(key)}
                >
                  {t(`newsletters:childLetters.sources.${key}`)}
                </button>
              ))}
            </div>
            <div className="clp-hint">{t('newsletters:childLetters.setup.includeHint')}</div>
          </div>

          <div className="clp-block">
            <div className="clp-label">
              <span>{t('newsletters:childLetters.students.title')}</span>
              <span className="clp-label-meta">
                {t('newsletters:childLetters.students.selected', {
                  selected: selectedStudentIds.length,
                  total: students.length,
                })}
              </span>
            </div>
            {students.length > 6 ? (
              <input
                type="search"
                className="clp-search"
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder={t('newsletters:childLetters.students.search')}
                aria-label={t('newsletters:childLetters.students.search')}
              />
            ) : null}
            <div className="clp-chips clp-chips-students">
              {visibleStudents.map((student) => (
                <button
                  key={student._id}
                  type="button"
                  className={`clp-chip${selectedStudentIds.includes(student._id) ? ' is-on' : ''}`}
                  onClick={() => toggleStudent(student._id)}
                  aria-pressed={selectedStudentIds.includes(student._id)}
                >
                  {student.name}
                </button>
              ))}
              {students.length === 0 ? (
                <span className="clp-hint">{t('newsletters:childLetters.students.empty')}</span>
              ) : visibleStudents.length === 0 ? (
                <span className="clp-hint">{t('newsletters:childLetters.students.noMatch')}</span>
              ) : null}
            </div>
            {students.length > 0 ? (
              <div className="clp-inline">
                <button type="button" className="clp-link" onClick={selectAllStudents} disabled={allSelected}>
                  {t('newsletters:childLetters.students.selectAll')}
                </button>
                <button type="button" className="clp-link" onClick={clearStudents} disabled={!selectedStudentIds.length}>
                  {t('newsletters:childLetters.students.clear')}
                </button>
              </div>
            ) : null}
          </div>

          <div className="clp-row">
            <label className="clp-field">
              <span>{t('newsletters:teacher.fields.primaryLanguage')}</span>
              <select
                value={primaryLanguage}
                onChange={(event) => {
                  const next = event.target.value;
                  setPrimaryLanguage(next);
                  if (next === secondaryLanguage) setSecondaryLanguage('');
                }}
              >
                {AI_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="clp-field">
              <span>{t('newsletters:teacher.fields.secondaryLanguage')}</span>
              <select value={secondaryLanguage} onChange={(event) => setSecondaryLanguage(event.target.value)}>
                <option value="">{t('newsletters:teacher.common.none')}</option>
                {AI_LANGUAGE_OPTIONS
                  .filter((option) => option.value !== primaryLanguage)
                  .map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
              </select>
            </label>
          </div>

          <label className="clp-field clp-field-wide">
            <span>{t('newsletters:childLetters.setup.note')}</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('newsletters:childLetters.setup.notePlaceholder')}
              rows={3}
            />
          </label>

          <div className="clp-actions">
            <button type="button" className="clp-btn is-primary" onClick={onGenerate} disabled={generating || !classId}>
              {generating ? t('newsletters:childLetters.actions.generating') : t('newsletters:childLetters.actions.generate')}
            </button>
            <button type="button" className="clp-btn" onClick={loadLetters} disabled={loading}>
              {t('newsletters:childLetters.actions.refresh')}
            </button>
          </div>
          <p className="clp-privacy">{t('newsletters:childLetters.setup.privacy')}</p>
        </section>

        <section className="clp-card">
          <div className="clp-card-head">
            <h3>{t('newsletters:childLetters.list.title')}</h3>
            <span className="clp-counts">
              {t('newsletters:childLetters.list.counts', counts)}
            </span>
          </div>
          <p className="clp-hint">{t('newsletters:childLetters.list.readyHint')}</p>

          {letters.length > 0 ? (
            <div className="clp-filters" role="tablist">
              {FILTER_KEYS.map((key) => {
                const count = key === 'all' ? letters.length
                  : key === 'sent' ? counts.sent
                  : key === 'ready' ? counts.approved
                  : counts.draft;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    className={`clp-filter${filter === key ? ' is-active' : ''}`}
                    onClick={() => setFilter(key)}
                  >
                    {t(`newsletters:childLetters.list.filter.${key}`)}
                    <span className="clp-filter-count">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {draftCount > 0 ? (
            <div className="clp-bulk">
              <button type="button" className="clp-btn is-primary" onClick={onSignOffAll} disabled={bulkSigning}>
                {bulkSigning ? t('newsletters:childLetters.list.signingOff') : t('newsletters:childLetters.list.signOffAll', { value: draftCount })}
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="clp-muted">{t('newsletters:teacher.common.loadingLessonPlans')}</div>
          ) : letters.length === 0 ? (
            <div className="clp-muted">{t('newsletters:childLetters.list.empty')}</div>
          ) : filteredLetters.length === 0 ? (
            <div className="clp-muted">{t('newsletters:childLetters.list.emptyFiltered')}</div>
          ) : (
            <div className="clp-list">
              {filteredLetters.map((letter) => (
                <article className="clp-item" key={letter._id}>
                  <header className="clp-item-head">
                    <strong className="clp-name">{letter.studentName || t('newsletters:childLetters.list.studentFallback')}</strong>
                    <span className={`clp-status ${letter.sentAt ? 'is-sent' : STATUS_CLASS[letter.status] || ''}`}>
                      {t(`newsletters:childLetters.status.${letter.sentAt ? 'sent' : letter.status}`)}
                    </span>
                    <span className="clp-words">
                      {t('newsletters:teacher.status.words', { count: letter.wordCount || 0 })}
                    </span>
                  </header>

                  {letter.sentAt ? (
                    <div className="clp-sent-meta">
                      {t('newsletters:childLetters.list.sentOn', { date: format(new Date(letter.sentAt), 'd MMM yyyy, HH:mm') })}
                    </div>
                  ) : null}

                  {editingId === letter._id ? (
                    <>
                      <textarea
                        className="clp-editor"
                        value={draftText}
                        onChange={(event) => setDraftText(event.target.value)}
                        rows={8}
                      />
                      <div className="clp-editor-meta">
                        <span className={`clp-word-count${editorWords > wordTarget * 1.3 ? ' is-over' : ''}`}>
                          {t('newsletters:childLetters.list.editorWords', { words: editorWords, target: wordTarget })}
                        </span>
                        <span className="clp-hint">{t('newsletters:childLetters.list.editHint')}</span>
                      </div>
                      <label className="clp-field clp-field-wide clp-note-field">
                        <span>{t('newsletters:childLetters.list.noteLabel')}</span>
                        <textarea
                          value={draftNote}
                          onChange={(event) => setDraftNote(event.target.value)}
                          placeholder={t('newsletters:childLetters.list.notePlaceholder')}
                          maxLength={300}
                          rows={2}
                        />
                      </label>
                      <div className="clp-hint">{t('newsletters:childLetters.list.noteHelp')}</div>
                      <div className="clp-actions">
                        <button type="button" className="clp-btn is-primary" disabled={saving} onClick={() => onSave(letter)}>
                          {saving ? t('newsletters:teacher.common.saving') : t('newsletters:teacher.actions.saveDraft')}
                        </button>
                        <button type="button" className="clp-btn" onClick={() => setEditingId('')}>
                          {t('newsletters:childLetters.actions.cancel')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="clp-body">{letter.previewContent}</p>
                      {letter.teacherNote ? (
                        <div className="clp-note-view">
                          <span className="clp-note-label">{t('newsletters:childLetters.list.yourNote')}</span>
                          <p className="clp-note-text">{letter.teacherNote}</p>
                        </div>
                      ) : null}
                      <div className="clp-actions">
                        <button type="button" className="clp-btn" onClick={() => startEdit(letter)} disabled={!!letter.sentAt}>
                          {t('newsletters:childLetters.actions.edit')}
                        </button>
                        <button type="button" className="clp-btn" onClick={() => onPreview(letter)}>
                          {t('newsletters:childLetters.actions.preview')}
                        </button>
                        <button type="button" className="clp-btn" onClick={() => onDownloadPdf(letter)}>
                          {t('newsletters:childLetters.actions.pdf')}
                        </button>
                        <button
                          type="button"
                          className="clp-btn is-primary"
                          disabled={letter.status === 'approved' || !!letter.sentAt}
                          onClick={() => onSignOff(letter)}
                        >
                          {letter.status === 'approved'
                            ? t('newsletters:childLetters.actions.signedOff')
                            : t('newsletters:childLetters.actions.signOff')}
                        </button>
                      </div>
                    </>
                  )}

                  {letter.lastSendError ? (
                    <div className="clp-error">{letter.lastSendError}</div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {previewHtml ? (
        <div
          className="clp-preview-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(event) => { if (event.target === event.currentTarget) setPreviewHtml(''); }}
        >
          <div className="clp-preview">
            <div className="clp-preview-head">
              <strong>{t('newsletters:childLetters.preview.title')}</strong>
              <button type="button" className="clp-btn" onClick={() => setPreviewHtml('')}>
                {t('newsletters:childLetters.preview.close')}
              </button>
            </div>
            <iframe title={t('newsletters:childLetters.preview.title')} srcDoc={previewHtml} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
