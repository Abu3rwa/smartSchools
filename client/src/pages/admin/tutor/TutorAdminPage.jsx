import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  HiOutlineAcademicCap,
  HiOutlineBookOpen,
  HiOutlineCog,
  HiOutlineCreditCard,
  HiOutlineLightningBolt,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlineUsers
} from 'react-icons/hi';
import { useTutorAdmin } from './hooks/useTutorAdmin.js';
import { useTutorCredits } from './hooks/useTutorCredits.js';
import { useTutorLessons } from './hooks/useTutorLessons.js';
import TutorCsvImportPanel from './TutorCsvImportPanel.jsx';
import './TutorAdminPage.css';

const errorText = (error) => error?.response?.data?.message || '';

const TAB_KEYS = ['overview', 'access', 'credits', 'lessons'];

export default function TutorAdminPage() {
  const { t, i18n } = useTranslation(['tutor']);
  const { overview, loading, reload, savingSettings, saveSettings, setClassStatus } = useTutorAdmin();
  const { grade, setGrade, subjectId, setSubjectId, subjects, standards, lessons, subject, loadingSubjects, loadingLessons, importing, importLessons, removeLesson } = useTutorLessons({
    gradeOptions: overview?.gradeOptions || []
  });
  const credits = useTutorCredits({
    defaultCredits: overview?.settings?.defaultCredits ?? 30,
    initialReserve: overview?.reserve?.credits ?? 0
  });

  const [draft, setDraft] = useState(null);
  const [changingClass, setChangingClass] = useState('');
  const [tab, setTab] = useState('overview');
  const tabRefs = useRef([]);

  const settings = overview?.settings || null;
  const num = (value) => Number(value || 0).toLocaleString(i18n.language);

  useEffect(() => {
    if (settings) setDraft({ ...settings });
  }, [settings]);

  const dirty = Boolean(
    draft
    && settings
    && (
      draft.enabled !== settings.enabled
      || draft.practiceEnabled !== settings.practiceEnabled
      || Number(draft.defaultCredits) !== settings.defaultCredits
    )
  );

  const saveDraft = async () => {
    try {
      await saveSettings({
        enabled: Boolean(draft.enabled),
        practiceEnabled: Boolean(draft.practiceEnabled),
        defaultCredits: Number(draft.defaultCredits)
      });
      toast.success(t('tutor:admin.settings.saved'));
    } catch (error) {
      toast.error(errorText(error) || t('tutor:admin.settings.saveFailed'));
    }
  };

  const changeStatus = async (classId, status) => {
    setChangingClass(classId);
    try {
      await setClassStatus(classId, status);
      toast.success(t('tutor:admin.classes.updated'));
    } catch (error) {
      toast.error(errorText(error) || t('tutor:admin.classes.updateFailed'));
    } finally {
      setChangingClass('');
    }
  };

  const focusTab = (index) => {
    setTab(TAB_KEYS[index]);
    tabRefs.current[index]?.focus();
  };

  const onTabKeyDown = (event, index) => {
    if (event.key === 'Home') {
      event.preventDefault();
      focusTab(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusTab(TAB_KEYS.length - 1);
      return;
    }
    const rtl = i18n.dir() === 'rtl';
    let step = 0;
    if (event.key === 'ArrowRight') step = rtl ? -1 : 1;
    else if (event.key === 'ArrowLeft') step = rtl ? 1 : -1;
    if (!step) return;
    event.preventDefault();
    focusTab((index + step + TAB_KEYS.length) % TAB_KEYS.length);
  };

  if (loading) {
    return (
      <div className="ta-page ta-loading" aria-live="polite">
        <div className="spinner" />
        <p>{t('tutor:admin.loading')}</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="ta-page">
        <div className="ta-state">
          <p>{t('tutor:admin.loadFailed')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
            <HiOutlineRefresh size={15} aria-hidden="true" />
            {t('tutor:retry')}
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'overview', Icon: HiOutlineCog },
    { key: 'access', Icon: HiOutlineUsers, badge: overview.classes.length },
    { key: 'credits', Icon: HiOutlineLightningBolt },
    { key: 'lessons', Icon: HiOutlineBookOpen, badge: loadingLessons ? 0 : lessons.length }
  ];

  return (
    <div className="ta-page">
      <header className="ta-head">
        <div>
          <h1>{t('tutor:admin.title')}</h1>
          <p>{t('tutor:admin.subtitle')}</p>
        </div>
        <span className={`ta-chip${overview.settings.enabled ? ' is-on' : ''}`}>
          {overview.settings.enabled ? t('tutor:admin.enabledOn') : t('tutor:admin.enabledOff')}
        </span>
      </header>

      <nav className="ta-tabs" role="tablist" aria-label={t('tutor:admin.tabs.aria')}>
        {tabs.map(({ key, Icon, badge }, index) => {
          const active = tab === key;
          const label = t(`tutor:admin.tabs.${key}`);
          const unsaved = key === 'overview' && dirty;
          return (
            <button
              key={key}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              id={`ta-tab-${key}`}
              aria-selected={active}
              aria-controls={`ta-panel-${key}`}
              aria-label={unsaved ? `${label} — ${t('tutor:admin.settings.unsaved')}` : label}
              tabIndex={active ? 0 : -1}
              className={`ta-tab${active ? ' is-active' : ''}`}
              onClick={() => setTab(key)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
              {badge > 0 && <span className="ta-tab-badge">{badge}</span>}
              {unsaved && <span className="ta-tab-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>

      {dirty && tab !== 'overview' && (
        <div className="ta-dirty-bar" role="status">
          <span>{t('tutor:admin.settings.unsaved')}</span>
          <span className="ta-dirty-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={saveDraft} disabled={savingSettings}>
              {savingSettings ? t('tutor:admin.settings.saving') : t('tutor:admin.settings.save')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setDraft({ ...settings })}
              disabled={savingSettings}
            >
              {t('tutor:admin.settings.discard')}
            </button>
          </span>
        </div>
      )}

      <section
        className="ta-panel"
        role="tabpanel"
        id={`ta-panel-${tab}`}
        aria-labelledby={`ta-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'overview' && (
          <>
            <section className="ta-stats" aria-label={t('tutor:admin.stats.title')}>
              <div className="ta-stat">
                <HiOutlineLightningBolt size={18} aria-hidden="true" />
                <span className="ta-stat-value">{overview.totals.credits}</span>
                <span className="ta-stat-label">{t('tutor:admin.stats.creditsLeft')}</span>
              </div>
              <div className="ta-stat">
                <HiOutlineCreditCard size={18} aria-hidden="true" />
                <span className="ta-stat-value">{overview.totals.spent}</span>
                <span className="ta-stat-label">{t('tutor:admin.stats.creditsSpent')}</span>
              </div>
              <div className="ta-stat">
                <HiOutlineUsers size={18} aria-hidden="true" />
                <span className="ta-stat-value">{overview.totals.studentsWithWallet}</span>
                <span className="ta-stat-label">{t('tutor:admin.stats.wallets')}</span>
              </div>
            </section>

            {draft && (
              <section className="ta-card" aria-labelledby="ta-settings-title">
                <header className="ta-card-head">
                  <h2 id="ta-settings-title">{t('tutor:admin.settings.title')}</h2>
                  <p>{t('tutor:admin.settings.hint')}</p>
                </header>

                <div className="ta-switches">
                  <label className="ta-switch">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.enabled)}
                      onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                    />
                    <span>
                      <strong>{t('tutor:admin.settings.enabled')}</strong>
                      <small>{t('tutor:admin.settings.enabledHint')}</small>
                    </span>
                  </label>
                  <label className="ta-switch">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.practiceEnabled)}
                      onChange={(event) => setDraft({ ...draft, practiceEnabled: event.target.checked })}
                    />
                    <span>
                      <strong>{t('tutor:admin.settings.practice')}</strong>
                      <small>{t('tutor:admin.settings.practiceHint')}</small>
                    </span>
                  </label>
                </div>

                <div className="ta-numbers">
                  <label>
                    <span>{t('tutor:admin.settings.defaultCredits')}</span>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={draft.defaultCredits}
                      onChange={(event) => setDraft({ ...draft, defaultCredits: event.target.value })}
                    />
                    <small>{t('tutor:admin.settings.defaultCreditsHint')}</small>
                  </label>
                </div>

                <div className="ta-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={saveDraft}
                    disabled={!dirty || savingSettings}
                  >
                    {savingSettings ? t('tutor:admin.settings.saving') : t('tutor:admin.settings.save')}
                  </button>
                  {dirty && <span className="ta-hint">{t('tutor:admin.settings.unsaved')}</span>}
                </div>
              </section>
            )}
          </>
        )}

        {tab === 'access' && (
          <section className="ta-card" aria-labelledby="ta-classes-title">
            <header className="ta-card-head">
              <h2 id="ta-classes-title">{t('tutor:admin.classes.title')}</h2>
              <p>{t('tutor:admin.classes.hint')}</p>
            </header>

            {overview.classes.length === 0 ? (
              <p className="ta-hint">{t('tutor:admin.classes.empty')}</p>
            ) : (
              <div className="ta-table-wrap">
                <table className="ta-table">
                  <thead>
                    <tr>
                      <th>{t('tutor:admin.classes.name')}</th>
                      <th>{t('tutor:admin.classes.grade')}</th>
                      <th className="ta-col-num">{t('tutor:admin.classes.students')}</th>
                      <th>{t('tutor:admin.classes.access')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.classes.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.grade}</td>
                        <td className="ta-col-num">{row.students}</td>
                        <td>
                          <select
                            value={row.status}
                            onChange={(event) => changeStatus(row.id, event.target.value)}
                            disabled={changingClass === row.id}
                          >
                            <option value="on">{t('tutor:admin.classes.on')}</option>
                            <option value="paused">{t('tutor:admin.classes.paused')}</option>
                            <option value="locked">{t('tutor:admin.classes.locked')}</option>
                          </select>
                          <small className="ta-status-hint">
                            {t(`tutor:admin.classes.statusHint.${row.status}`)}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'credits' && (
          <section className="ta-card ta-credits-card" aria-labelledby="ta-credits-title">
            <header className="ta-card-head">
              <h2 id="ta-credits-title">{t('tutor:admin.credits.title')}</h2>
              <p>{t('tutor:admin.credits.hint')}</p>
            </header>

            <div className="ta-credits-grid">
              <div className="ta-credits-controls">
                <div className="ta-kind-switch" role="group" aria-label={t('tutor:admin.credits.kindLabel')}>
                  <button
                    type="button"
                    className={credits.kind === 'questions' ? 'is-active' : ''}
                    aria-pressed={credits.kind === 'questions'}
                    onClick={() => credits.setKind('questions')}
                  >
                    {t('tutor:admin.credits.kindQuestions')}
                  </button>
                  <button
                    type="button"
                    className={credits.kind === 'voice' ? 'is-active' : ''}
                    aria-pressed={credits.kind === 'voice'}
                    onClick={() => credits.setKind('voice')}
                  >
                    {t('tutor:admin.credits.kindVoice')}
                  </button>
                </div>

                <div className="ta-toolbar ta-toolbar-fields">
                  <label>
                    <span>{t('tutor:admin.credits.class')}</span>
                    <select value={credits.classId} onChange={(event) => credits.setClassId(event.target.value)}>
                      <option value="">{t('tutor:admin.credits.pickClass')}</option>
                      {overview.classes.map((row) => (
                        <option key={row.id} value={row.id}>{row.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t(credits.kind === 'voice' ? 'tutor:admin.credits.voiceAmount' : 'tutor:admin.credits.amount')}</span>
                    <input
                      type="number"
                      min={credits.kind === 'voice' ? '1' : '0'}
                      max="1000"
                      value={credits.amount}
                      placeholder={String(overview.settings.defaultCredits)}
                      onChange={(event) => credits.setAmount(event.target.value)}
                    />
                  </label>
                </div>
                <p className="ta-hint">
                  {credits.kind === 'voice'
                    ? t('tutor:admin.credits.voiceAmountHint')
                    : t('tutor:admin.credits.amountHint', { n: overview.settings.defaultCredits })}
                </p>

                {credits.kind === 'voice' && (
                  <div className={`ta-reserve${credits.reserveNotice ? ' is-short' : ''}`}>
                    <div className="ta-reserve-head">
                      <span className="ta-reserve-label">{t('tutor:admin.credits.reserveLabel')}</span>
                      <strong className="ta-reserve-value">
                        {t('tutor:admin.credits.reserveValue', { n: num(credits.reserve) })}
                      </strong>
                    </div>
                    <p className="ta-reserve-hint">{t('tutor:admin.credits.reserveHint')}</p>
                    {credits.classId && credits.classCost !== null && credits.students.length > 0 && (
                      <p className={`ta-reserve-line${credits.classShort ? ' is-short' : ''}`}>
                        {t('tutor:admin.credits.reserveClassCost', {
                          students: num(credits.students.length),
                          each: num(credits.amountValue),
                          total: num(credits.classCost)
                        })}
                      </p>
                    )}
                    {credits.selected.length > 0 && credits.selectedCost !== null && (
                      <p className={`ta-reserve-line${credits.selectedShort ? ' is-short' : ''}`}>
                        {t('tutor:admin.credits.reserveSelectedCost', {
                          students: num(credits.selected.length),
                          each: num(credits.amountValue),
                          total: num(credits.selectedCost)
                        })}
                      </p>
                    )}
                    {credits.reserveNotice === 'partial' && (
                      <p className="ta-reserve-alert" role="alert">{t('tutor:admin.credits.voiceReserveShort')}</p>
                    )}
                    {credits.reserveNotice === 'short' && (
                      <p className="ta-reserve-alert" role="alert">{t('tutor:admin.credits.reserveNotEnough')}</p>
                    )}
                  </div>
                )}

                <div className="ta-grant-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={credits.distribute}
                    disabled={!credits.classId || credits.busy || credits.classShort}
                  >
                    {t('tutor:admin.credits.giveClass')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={credits.giveSelected}
                    disabled={!credits.selected.length || credits.busy || credits.selectedShort}
                  >
                    {t('tutor:admin.credits.giveSelected', { n: credits.selected.length })}
                  </button>
                </div>
              </div>

              <div className="ta-credits-students">
                {!credits.classId && <p className="ta-hint">{t('tutor:admin.credits.pickClassHint')}</p>}
                {credits.classId && credits.loading && <p className="ta-hint">{t('tutor:admin.credits.loadingStudents')}</p>}
                {credits.classId && !credits.loading && credits.students.length === 0 && (
                  <p className="ta-hint">{t('tutor:admin.credits.noStudents')}</p>
                )}

                {credits.classId && !credits.loading && credits.students.length > 0 && (
              <div className="ta-table-wrap">
                <table className="ta-table">
                  <thead>
                    <tr>
                      <th className="ta-col-check">
                        <input
                          type="checkbox"
                          checked={credits.selected.length > 0 && credits.selected.length === credits.students.length}
                          onChange={credits.toggleAll}
                          aria-label={t('tutor:admin.credits.selectAll')}
                        />
                      </th>
                      <th>{t('tutor:admin.credits.student')}</th>
                      <th>{t('tutor:admin.credits.studentId')}</th>
                      <th>{t('tutor:admin.credits.level')}</th>
                      <th className="ta-col-num">{t('tutor:admin.credits.balance')}</th>
                      <th className="ta-col-num">{t('tutor:admin.credits.voiceBalance')}</th>
                      <th>{t('tutor:admin.credits.status')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {credits.students.map((student) => (
                      <tr key={student.id} className={student.wallet?.paused ? 'is-paused' : ''}>
                        <td className="ta-col-check">
                          <input
                            type="checkbox"
                            checked={credits.selected.includes(student.id)}
                            onChange={() => credits.toggleSelected(student.id)}
                            aria-label={student.name}
                          />
                        </td>
                        <td>{student.name}</td>
                        <td className="ta-muted">{student.studentId || '—'}</td>
                        <td>
                          <select
                            className="ta-level-select"
                            value={student.languageLevel || ''}
                            disabled={credits.busy}
                            onChange={(event) => credits.setLevel(student.id, event.target.value || null)}
                            aria-label={t('tutor:admin.credits.levelFor', { name: student.name })}
                          >
                            <option value="">{t('tutor:admin.credits.levelAuto')}</option>
                            <option value="support">{t('tutor:admin.credits.levelSupport')}</option>
                            <option value="on_level">{t('tutor:admin.credits.levelOn')}</option>
                            <option value="stretch">{t('tutor:admin.credits.levelStretch')}</option>
                          </select>
                        </td>
                        <td className="ta-col-num ta-strong">{student.wallet?.credits ?? 0}</td>
                        <td className="ta-col-num">{student.voiceCredits ?? 0}</td>
                        <td>
                          {student.wallet?.paused
                            ? t('tutor:admin.credits.pausedState')
                            : t('tutor:admin.credits.activeState')}
                        </td>
                        <td className="ta-col-action">
                          <button
                            type="button"
                            className="ta-link-btn"
                            disabled={credits.busy}
                            onClick={() => credits.togglePause(student.id, !student.wallet?.paused)}
                          >
                            {student.wallet?.paused
                              ? t('tutor:admin.credits.resume')
                              : t('tutor:admin.credits.pause')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === 'lessons' && (
          <>
            <section className="ta-card" aria-labelledby="ta-lessons-title">
              <header className="ta-card-head">
                <h2 id="ta-lessons-title">{t('tutor:admin.lessons.title')}</h2>
                <p>{t('tutor:admin.lessons.hint')}</p>
              </header>

              <div className="ta-toolbar">
                <label>
                  <span>{t('tutor:admin.lessons.grade')}</span>
                  <select value={grade} onChange={(event) => setGrade(event.target.value)}>
                    {(overview.gradeOptions.length ? overview.gradeOptions : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map((value) => (
                      <option key={value} value={value}>{t('tutor:admin.lessons.gradeValue', { n: value })}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t('tutor:admin.lessons.subject')}</span>
                  <select
                    value={subjectId}
                    onChange={(event) => setSubjectId(event.target.value)}
                    disabled={loadingSubjects}
                  >
                    {subjects.length === 0 && <option value="">{t('tutor:admin.lessons.noSubjects')}</option>}
                    {subjects.map((row) => (
                      <option key={row.id} value={row.id}>{row.name}</option>
                    ))}
                  </select>
                </label>
                <span className="ta-hint ta-standards-hint">
                  {t('tutor:admin.lessons.standardsOnFile', { n: standards.length })}
                </span>
              </div>

              {loadingLessons && <p className="ta-hint">{t('tutor:admin.lessons.loading')}</p>}
              {!loadingLessons && lessons.length === 0 && (
                <p className="ta-hint">{t('tutor:admin.lessons.empty')}</p>
              )}

              {!loadingLessons && lessons.length > 0 && (
                <div className="ta-table-wrap">
                  <table className="ta-table">
                    <thead>
                      <tr>
                        <th className="ta-col-num">#</th>
                        <th>{t('tutor:admin.lessons.lesson')}</th>
                        <th>{t('tutor:admin.lessons.unitChapter')}</th>
                        <th>{t('tutor:admin.lessons.standards')}</th>
                        <th className="ta-col-num">{t('tutor:admin.lessons.words')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lessons.map((row) => (
                        <tr key={row.id}>
                          <td className="ta-col-num ta-muted">{row.lessonNumber}</td>
                          <td className="ta-strong">{row.title}</td>
                          <td className="ta-muted">
                            {[row.unitTitle, row.chapterTitle].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="ta-muted ta-codes">{row.standards.join(', ') || '—'}</td>
                          <td className="ta-col-num ta-muted">{row.words}</td>
                          <td className="ta-col-action">
                            <button
                              type="button"
                              className="ta-icon-btn"
                              aria-label={t('tutor:admin.lessons.removeAria', { title: row.title })}
                              onClick={() => removeLesson(row.id)}
                            >
                              <HiOutlineTrash size={16} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="ta-footnote">
                <HiOutlineAcademicCap size={14} aria-hidden="true" />
                {t('tutor:admin.lessons.footnote')}
              </p>
            </section>

            <TutorCsvImportPanel
              grade={grade}
              subject={subject}
              standards={standards}
              importing={importing}
              onImport={importLessons}
            />

            <p className="ta-footnote">
              <HiOutlineBookOpen size={14} aria-hidden="true" />
              {t('tutor:admin.lessons.sampleNote')}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
