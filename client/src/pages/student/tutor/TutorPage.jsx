import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineAcademicCap,
  HiOutlineArrowLeft,
  HiOutlineBadgeCheck,
  HiOutlineChatAlt2,
  HiOutlineChevronRight,
  HiOutlineClock,
  HiOutlineLightBulb,
  HiOutlineLightningBolt,
  HiOutlineLockClosed,
  HiOutlineMenu,
  HiOutlinePause,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineX
} from 'react-icons/hi';
import { useTutorPage } from './useTutorPage.js';
import './TutorPage.css';

const ACCESS_ICON = {
  school_off: HiOutlineLockClosed,
  class_locked: HiOutlineLockClosed,
  class_paused: HiOutlinePause,
  wallet_paused: HiOutlinePause
};

const LessonRow = ({ lesson, active, onPick }) => (
  <button
    type="button"
    className={`tt-lesson${active ? ' is-active' : ''}`}
    onClick={() => onPick(lesson.id)}
  >
    <span className="tt-lesson-num">{lesson.lessonNumber}</span>
    <span className="tt-lesson-title">{lesson.title}</span>
    {active && <HiOutlineBadgeCheck size={16} aria-hidden="true" />}
  </button>
);

export default function TutorPage() {
  const { t } = useTranslation(['tutor']);
  const {
    home,
    loading,
    subjectId,
    subjectLoading,
    messages,
    practiceSets,
    asking,
    error,
    practice,
    practiceResult,
    practiceBusy,
    chooseSubject,
    ask,
    startPractice,
    submitPractice,
    clearPractice,
    reload
  } = useTutorPage();

  const [draft, setDraft] = useState('');
  const [lessonId, setLessonId] = useState(null);
  const [railOpen, setRailOpen] = useState(false);
  const [answers, setAnswers] = useState({});
  const pickLesson = (id) => { setLessonId(id); setRailOpen(false); };
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length, asking]);

  const subject = home?.subject || null;
  const credits = home?.wallet?.credits ?? 0;
  const allowed = home?.access?.allowed !== false;
  const canAsk = allowed && credits > 0 && !asking && Boolean(subjectId);
  const AccessIcon = ACCESS_ICON[home?.access?.reason] || HiOutlineSparkles;

  const lastPractice = useMemo(
    () => practiceSets.find((set) => set.status === 'submitted'),
    [practiceSets]
  );

  // When the tutor is waiting on the student, the box asks for a try, not a new question.
  const waitingOnStudent = useMemo(() => {
    const lastTutor = [...messages].reverse().find((message) => message.role === 'tutor');
    return lastTutor?.stage === 'prompt' || lastTutor?.stage === 'hint' ? lastTutor.stage : '';
  }, [messages]);

  const placeholder = credits === 0
    ? t('tutor:composer.noCredit')
    : waitingOnStudent
      ? t(`tutor:composer.${waitingOnStudent === 'hint' ? 'hintReply' : 'tryReply'}`)
      : t('tutor:composer.placeholder', { subject: subject?.name || '' });

  // While the tutor waits on a try, the composer says so and the button names the act.
  const turnCue = asking ? '' : waitingOnStudent;

  // The box grows with the answer up to about five lines, then scrolls.
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [draft]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !canAsk) return;
    setDraft('');
    await ask(text, lessonId);
    inputRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const openPractice = async () => {
    setAnswers({});
    await startPractice(lessonId);
  };

  const answer = (index, choice) => setAnswers((current) => ({ ...current, [index]: choice }));

  const allAnswered = practice
    ? practice.questions.every((question) => Number.isInteger(answers[question.index]))
    : false;

  if (loading) {
    return (
      <div className="tt-page tt-loading" aria-live="polite">
        <div className="spinner" />
        <p>{t('tutor:loading')}</p>
      </div>
    );
  }

  if (!home) {
    return (
      <div className="tt-page">
        <div className="tt-blocked">
          <HiOutlineSparkles size={34} aria-hidden="true" />
          <h1>{t('tutor:unavailableTitle')}</h1>
          <p>{error || t('tutor:errors.load')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
            <HiOutlineRefresh size={15} aria-hidden="true" />
            {t('tutor:retry')}
          </button>
        </div>
      </div>
    );
  }

  /* Step 1 — the subject decides the whole scope. */
  if (!subjectId) {
    return (
      <div className="tt-page tt-page--home">
        <header className="tt-head tt-head--home">
          <span className="tt-hero-icon" aria-hidden="true"><HiOutlineSparkles size={26} /></span>
          <div className="tt-head-main">
            <h1>{t('tutor:title')}</h1>
            <p className="tt-sub">{t('tutor:subtitle')}</p>
          </div>
          <span className={`tt-chip${credits === 0 ? ' is-empty' : credits <= 3 ? ' is-low' : ''}`}>
            <HiOutlineLightningBolt size={15} aria-hidden="true" />
            {t('tutor:credits.left', { n: credits })}
          </span>
        </header>

        {home.access?.allowed === false && (
          <div className="tt-blocked">
            <AccessIcon size={30} aria-hidden="true" />
            <h2>{t('tutor:blocked.title')}</h2>
            <p>{t(`tutor:blocked.${home.access.reason}`, { defaultValue: t('tutor:blocked.default') })}</p>
          </div>
        )}

        {home.access?.allowed !== false && (
          <>
            <section aria-labelledby="tt-subjects-title">
              <h2 id="tt-subjects-title" className="tt-section-title">{t('tutor:pickSubject')}</h2>
              {home.subjects.length === 0 && (
                <div className="tt-empty">
                  <HiOutlineAcademicCap size={32} aria-hidden="true" />
                  <p>{t('tutor:noSubjects')}</p>
                </div>
              )}
              <div className="tt-subjects">
                {home.subjects.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`tt-subject tt-subject--${index % 4}`}
                    onClick={() => chooseSubject(item.id)}
                  >
                    <span className="tt-subject-icon" aria-hidden="true"><HiOutlineAcademicCap size={22} /></span>
                    <span className="tt-subject-name">{item.name}</span>
                    <span className="tt-subject-meta">{t('tutor:lessonCount', { n: item.lessons })}</span>
                    <HiOutlineChevronRight size={16} aria-hidden="true" className="tt-subject-go" />
                  </button>
                ))}
              </div>
            </section>

            {creditLine(home, t)}
            {lastPractice && (
              <p className="tt-last-practice">
                <HiOutlineBadgeCheck size={15} aria-hidden="true" />
                {t('tutor:practice.lastScore', { score: lastPractice.score, total: lastPractice.total })}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  /* Step 2 — one subject: lessons on the side, conversation in the middle. */
  return (
    <div className="tt-page tt-page--chat">
      <header className="tt-head tt-head--mini">
        <button
          type="button"
          className="tt-back"
          onClick={() => { chooseSubject(''); setLessonId(null); }}
        >
          <HiOutlineArrowLeft size={15} aria-hidden="true" />
          {t('tutor:changeSubject')}
        </button>
        <div className="tt-head-main">
          <h1>{subject?.name || t('tutor:title')}</h1>
        </div>
        <span className={`tt-chip${credits === 0 ? ' is-empty' : credits <= 3 ? ' is-low' : ''}`}>
          <HiOutlineLightningBolt size={15} aria-hidden="true" />
          {t('tutor:credits.left', { n: credits })}
        </span>
        <button type="button" className="tt-rail-toggle" onClick={() => setRailOpen(true)}>
          <HiOutlineMenu size={16} aria-hidden="true" />
          {t('tutor:lessonsTitle')}
        </button>
      </header>

      <div className="tt-body">
        <section className="tt-chat" aria-label={t('tutor:chatTitle')}>
          <div className="tt-thread" ref={threadRef}>
            {home.access?.allowed === false && (
              <div className="tt-blocked tt-blocked--inline">
                <AccessIcon size={22} aria-hidden="true" />
                <div>
                  <strong>{t('tutor:blocked.title')}</strong>
                  <p>{t(`tutor:blocked.${home.access.reason}`, { defaultValue: t('tutor:blocked.default') })}</p>
                </div>
              </div>
            )}
            {messages.length === 0 && !practice && (
              <div className="tt-hello">
                <span className="tt-hello-icon" aria-hidden="true"><HiOutlineChatAlt2 size={22} /></span>
                <h2>{t('tutor:hello.title', { subject: subject?.name || '' })}</h2>
                <p>{t('tutor:hello.body')}</p>
                <ol className="tt-steps">
                  {['one', 'two', 'three'].map((key) => (
                    <li key={key}>{t(`tutor:hello.steps.${key}`)}</li>
                  ))}
                </ol>
                <div className="tt-prompts">
                  {['askExplain', 'askExample', 'askCheck'].map((key) => (
                    <button key={key} type="button" onClick={() => { setDraft(t(`tutor:hello.prompts.${key}`)); inputRef.current?.focus(); }}>
                      {t(`tutor:hello.prompts.${key}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <article key={message.id} className={`tt-msg is-${message.role}`}>
                {message.role === 'tutor' && (
                  <span className="tt-avatar" aria-hidden="true"><HiOutlineSparkles size={18} /></span>
                )}
                <div className="tt-msg-body">
                  {message.role === 'student' && <span className="tt-msg-by">{t('tutor:you')}</span>}
                  {message.role === 'tutor' && message.stage && message.stage !== 'answer' && (
                    <span className={`tt-stage is-${message.stage}`}>{t(`tutor:stage.${message.stage}`)}</span>
                  )}
                  <div className="tt-bubble">
                    {message.text.split(/\n{2,}/).map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                  {message.role === 'tutor' && message.lessons?.length > 0 && (
                    <p className="tt-source">
                      {t('tutor:answeredFrom')}
                      {message.lessons.map((lesson) => lesson.label).join(' · ')}
                    </p>
                  )}
                </div>
              </article>
            ))}

            {asking && (
              <article className="tt-msg is-tutor">
                <span className="tt-avatar" aria-hidden="true"><HiOutlineSparkles size={18} /></span>
                <div className="tt-bubble tt-typing" aria-live="polite">
                  <span /><span /><span />
                  <em>{t('tutor:thinking')}</em>
                </div>
              </article>
            )}

            {practice && (
              <div className="tt-practice-card">
                <header>
                  <div>
                    <h3>{practiceResult ? t('tutor:practice.resultTitle') : t('tutor:practice.title')}</h3>
                    <p>
                      {practiceResult
                        ? t('tutor:practice.resultLine', { score: practiceResult.score, total: practiceResult.total })
                        : t('tutor:practice.intro')}
                    </p>
                  </div>
                  <button type="button" className="tt-close" onClick={clearPractice} aria-label={t('tutor:practice.close')}>×</button>
                </header>

                {practice.questions.map((question) => {
                  const chosen = answers[question.index];
                  const settled = Boolean(practiceResult);
                  const mine = practiceResult?.questions?.[question.index];
                  return (
                    <fieldset key={question.index} className="tt-question">
                      <legend>{t('tutor:practice.question', { n: question.index + 1 })}</legend>
                      <p className="tt-question-text">{question.question}</p>
                      <div className="tt-options">
                        {question.options.map((option, optionIndex) => {
                          const isMine = settled ? mine?.choiceIndex === optionIndex : chosen === optionIndex;
                          const isKey = settled && mine?.correctIndex === optionIndex;
                          return (
                            <label
                              key={optionIndex}
                              className={`tt-option${isMine ? ' is-chosen' : ''}${isKey ? ' is-correct' : ''}`}
                            >
                              <input
                                type="radio"
                                name={`q-${question.index}`}
                                value={optionIndex}
                                checked={isMine}
                                disabled={settled}
                                onChange={() => answer(question.index, optionIndex)}
                              />
                              <span>{option}</span>
                            </label>
                          );
                        })}
                      </div>
                      {settled && mine?.explanation && (
                        <p className="tt-explain">{mine.explanation}</p>
                      )}
                    </fieldset>
                  );
                })}

                {!practiceResult && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm tt-submit"
                    disabled={!allAnswered || practiceBusy}
                    onClick={() => submitPractice(practice.questions.map((question) => answers[question.index]))}
                  >
                    {practiceBusy ? t('tutor:practice.checking') : t('tutor:practice.submit')}
                  </button>
                )}
                {practiceResult && (
                  <p className="tt-practice-done">
                    <HiOutlineBadgeCheck size={15} aria-hidden="true" />
                    {t('tutor:practice.done')}
                  </p>
                )}
              </div>
            )}
          </div>

          {error && <p className="tt-error" role="alert">{error}</p>}

          {allowed && (
            <div className={`tt-composer${turnCue ? ' is-turn' : ''}`}>
              {credits === 0 ? (
                <p className="tt-composer-cue is-muted">
                  <HiOutlineClock size={14} aria-hidden="true" />
                  {t('tutor:composer.noCredit')}
                </p>
              ) : turnCue ? (
                <p className="tt-composer-cue">
                  <HiOutlineLightBulb size={14} aria-hidden="true" />
                  {t(turnCue === 'hint' ? 'tutor:composer.turnHint' : 'tutor:composer.turnPrompt')}
                </p>
              ) : null}
              <div className="tt-composer-row">
                <textarea
                  ref={inputRef}
                  value={draft}
                  rows={2}
                  maxLength={1500}
                  placeholder={placeholder}
                  disabled={credits === 0 || asking}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  aria-label={placeholder}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={!canAsk || !draft.trim()}>
                  {asking
                    ? t('tutor:composer.sending')
                    : turnCue
                      ? t('tutor:composer.sendTry')
                      : t('tutor:composer.send')}
                </button>
              </div>
            </div>
          )}
        </section>

        {railOpen && (
          <button
            type="button"
            className="tt-rail-backdrop"
            aria-label={t('tutor:closeLessons')}
            onClick={() => setRailOpen(false)}
          />
        )}
        <aside className={`tt-side${railOpen ? ' is-open' : ''}`} aria-label={t('tutor:lessonsTitle')}>
          <div className="tt-side-drawer-head">
            <h2>{t('tutor:lessonsTitle')}</h2>
            <button
              type="button"
              className="tt-rail-close"
              aria-label={t('tutor:closeLessons')}
              onClick={() => setRailOpen(false)}
            >
              <HiOutlineX size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="tt-side-subject">
            <button
              type="button"
              className="tt-back"
              onClick={() => { chooseSubject(''); setLessonId(null); }}
            >
              <HiOutlineArrowLeft size={15} aria-hidden="true" />
              {t('tutor:changeSubject')}
            </button>
            <h1>{subject?.name || t('tutor:title')}</h1>
            <span className={`tt-chip${credits === 0 ? ' is-empty' : credits <= 3 ? ' is-low' : ''}`}>
              <HiOutlineLightningBolt size={15} aria-hidden="true" />
              {t('tutor:credits.left', { n: credits })}
            </span>
            {(credits === 0 || credits <= 3) && (
              <p className="tt-side-note">
                {credits === 0
                  ? t('tutor:credits.usedAll')
                  : t('tutor:credits.low', { n: credits })}
              </p>
            )}
          </div>

          <div className="tt-side-head">
            <h2>{t('tutor:lessonsTitle')}</h2>
            <button
              type="button"
              className={`tt-all-lessons${lessonId ? '' : ' is-active'}`}
              onClick={() => setLessonId(null)}
            >
              {t('tutor:allLessons')}
            </button>
          </div>
          {subjectLoading && <p className="tt-muted">{t('tutor:loadingLessons')}</p>}
          {!subjectLoading && home.outline?.length === 0 && (
            <p className="tt-muted">{t('tutor:noLessons')}</p>
          )}
          <div className="tt-outline">
            {(home.outline || []).map((unit) => (
              <div key={`${unit.unitNumber ?? 'flat'}`} className="tt-unit">
                {unit.unitNumber != null && (
                  <p className="tt-unit-title">
                    <span>{t('tutor:unit', { n: unit.unitNumber })}</span>
                    {unit.unitTitle}
                  </p>
                )}
                {unit.lessons.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} active={lessonId === lesson.id} onPick={pickLesson} />
                ))}
                {unit.chapters.map((chapter) => (
                  <div key={`${unit.unitNumber}-${chapter.chapterNumber}`} className="tt-chapter">
                    <p className="tt-chapter-title">
                      <span>{t('tutor:chapter', { n: chapter.chapterNumber })}</span>
                      {chapter.chapterTitle}
                    </p>
                    {chapter.lessons.map((lesson) => (
                      <LessonRow key={lesson.id} lesson={lesson} active={lessonId === lesson.id} onPick={pickLesson} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {home.practiceEnabled && allowed && (
            <button type="button" className="tt-practice-btn" onClick={openPractice} disabled={practiceBusy || credits === 0}>
              <HiOutlineLightningBolt size={16} aria-hidden="true" />
              {t('tutor:practice.start')}
            </button>
          )}
          {practiceSets.length > 0 && (
            <div className="tt-practice-history">
              <h3>{t('tutor:practice.history')}</h3>
              {practiceSets.slice(0, 4).map((set) => (
                <p key={set.id}>
                  <HiOutlineBadgeCheck size={13} aria-hidden="true" />
                  {set.status === 'submitted'
                    ? t('tutor:practice.scoreLine', { score: set.score, total: set.total })
                    : t('tutor:practice.openSet')}
                </p>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function creditLine(home, t) {
  const credits = home.wallet?.credits ?? 0;
  if (credits === 0) {
    return (
      <p className="tt-notice" role="status">
        <HiOutlineClock size={15} aria-hidden="true" />
        {t('tutor:credits.usedAll')}
      </p>
    );
  }
  if (credits <= 3) {
    return (
      <p className="tt-notice is-soft" role="status">
        <HiOutlineLightningBolt size={15} aria-hidden="true" />
        {t('tutor:credits.low', { n: credits })}
      </p>
    );
  }
  return <p className="tt-muted tt-credit-line">{t('tutor:credits.carryOver')}</p>;
}
