import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  HiOutlineArrowLeft,
  HiOutlineChatAlt2,
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineGlobe,
  HiOutlineLockClosed,
  HiOutlineMicrophone,
  HiOutlinePlay,
  HiOutlineQuestionMarkCircle,
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineSparkles,
  HiOutlineStop,
  HiOutlineX,
} from "react-icons/hi";
import { useVoiceTutor } from "./useVoiceTutor.js";
import { flatLessons } from "./flatLessons.js";
import { creditCopy } from "./creditCopy.js";
import { pagesWindow } from "./pagesWindow.js";
import "./VoiceTutorPage.css";

const WAIT_KEYS = ["join", "words", "board"];
const JOIN_TONES = ["teal", "amber", "indigo"];
const FILTER_AFTER = 12;

const Wave = () => (
  <span className="vt-wave" aria-hidden="true">
    <i />
    <i />
    <i />
    <i />
    <i />
  </span>
);

export default function VoiceTutorPage() {
  const { t, i18n } = useTranslation(["tutor"]);
  const {
    home,
    loading,
    outlineLoading,
    subjectId,
    session,
    starting,
    error,
    phase,
    preparing,
    speakingIndex,
    listeningStartedAt,
    listenSeconds,
    shortTap,
    soundFailed,
    micStatus,
    micOpen,
    textOnly,
    tapToToggle,
    setTapToToggle,
    canRetry,
    chooseSubject,
    startSession,
    resumeSession,
    endActiveSession,
    leaveSession,
    startListening,
    stopListening,
    answerByText,
    retrySend,
    replay,
    stopPlayback,
    checkMic,
    dismissError,
    dismissSoundFailed,
  } = useVoiceTutor();
  const [lessonId, setLessonId] = useState(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [checkingMic, setCheckingMic] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearch("");
      return undefined;
    }
    const timer = setTimeout(() => setSearch(trimmed), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const lessonRows = useMemo(
    () => flatLessons(home?.outline || [], search),
    [home?.outline, search],
  );
  const lessonCount = useMemo(
    () =>
      (home?.outline || []).reduce(
        (sum, unit) =>
          sum +
          (unit.lessons?.length || 0) +
          (unit.chapters || []).reduce(
            (inner, chapter) => inner + (chapter.lessons?.length || 0),
            0,
          ),
        0,
      ),
    [home?.outline],
  );

  const pickLesson = useCallback((id) => setLessonId(id), []);
  const runMicCheck = useCallback(async () => {
    setCheckingMic(true);
    try {
      await checkMic();
    } finally {
      setCheckingMic(false);
    }
  }, [checkMic]);

  const credits = session?.voice?.credits ?? home?.voice?.wallet?.credits ?? 0;
  const price = session?.voice?.price ?? home?.voice?.price ?? 0;
  const wallet = creditCopy({ credits, price });
  const direction = i18n.dir?.() === "rtl" ? "rtl" : "ltr";

  if (loading) {
    return (
      <div className="vt-page vt-loading" aria-live="polite">
        <div className="spinner" />
        <p>{t("tutor:voice.loading")}</p>
      </div>
    );
  }

  if (!home) {
    return (
      <div className="vt-page">
        <div className="vt-blocked">
          <HiOutlineSparkles size={32} aria-hidden="true" />
          <h1>{t("tutor:voice.unavailable")}</h1>
          <p>{error || t("tutor:voice.errors.load")}</p>
          <Link className="btn btn-secondary btn-sm" to="/portal/tutor">
            <HiOutlineArrowLeft size={15} aria-hidden="true" />
            {t("tutor:voice.backToTutor")}
          </Link>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <Board
        session={session}
        direction={direction}
        error={error}
        phase={phase}
        preparing={preparing}
        speakingIndex={speakingIndex}
        listeningStartedAt={listeningStartedAt}
        listenSeconds={listenSeconds}
        shortTap={shortTap}
        soundFailed={soundFailed}
        micOpen={micOpen}
        textOnly={textOnly}
        tapToToggle={tapToToggle}
        setTapToToggle={setTapToToggle}
        canRetry={canRetry}
        onLeave={leaveSession}
        onStart={startListening}
        onStop={stopListening}
        onReplay={replay}
        onStopPlayback={stopPlayback}
        onAnswer={answerByText}
        onRetry={retrySend}
        onDismissError={dismissError}
        onDismissSound={dismissSoundFailed}
      />
    );
  }

  const ready =
    home.voice?.ready !== false &&
    Boolean(subjectId) &&
    Boolean(lessonId) &&
    wallet.canAsk &&
    !starting;

  return (
    <div className="vt-page vt-entry">
      <header className="vt-head">
        <div className="vt-head-row">
          <Link
            className="vt-back"
            to="/portal/tutor"
            aria-label={t("tutor:voice.backToTutor")}
          >
            <HiOutlineArrowLeft size={17} aria-hidden="true" />
          </Link>
          <div className="vt-head-title">
            <strong>{t("tutor:voice.title")}</strong>
          </div>
          <ol className="vt-head-steps">
            {["pick", "talk", "board"].map((key, index) => (
              <li key={key} className="vt-head-step">
                <span className="vt-head-step-num" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="vt-head-step-text">
                  <b>{t(`tutor:voice.how.${key}`)}</b>
                  <span>{t(`tutor:voice.how.${key}Body`)}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="vt-head-meta">
            <span className="vt-premium">{t("tutor:voice.premium")}</span>
            <span
              className={`vt-credits${wallet.credits === 0 ? " is-empty" : ""}`}
            >
              {t("tutor:voice.creditsChip", { n: wallet.credits })}
              <span className="vt-about">
                {t("tutor:voice.aboutMessages", { n: wallet.messages })}
              </span>
            </span>
          </div>
        </div>
      </header>

      {home.access?.allowed === false && (
        <div className="vt-blocked">
          <HiOutlineLockClosed size={24} aria-hidden="true" />
          <h2>{t("tutor:blocked.title")}</h2>
          <p>
            {t(`tutor:blocked.${home.access.reason}`, {
              defaultValue: t("tutor:blocked.default"),
            })}
          </p>
        </div>
      )}

      {home.access?.allowed !== false && (
        <div className="vt-main">
          {(error || home.voice?.problem) && (
            <div className="vt-error" role="alert">
              <span>{error || home.voice.problem}</span>
              {error && (
                <button
                  type="button"
                  className="vt-error-x"
                  aria-label={t("tutor:voice.dismiss")}
                  onClick={dismissError}
                >
                  <HiOutlineX size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {home.activeSession && (
            <div className="vt-resume">
              <div className="vt-resume-text">
                <strong dir="auto">
                  {home.activeSession.lessonLabel ||
                    home.activeSession.subjectName}
                </strong>
                <span>{home.activeSession.subjectName}</span>
              </div>
              <div className="vt-resume-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={starting}
                  onClick={() => resumeSession(home.activeSession.id)}
                >
                  <HiOutlineRefresh size={14} aria-hidden="true" />
                  {t("tutor:voice.continueLesson", {
                    lesson:
                      home.activeSession.lessonLabel ||
                      home.activeSession.subjectName,
                  })}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={starting}
                  onClick={() => endActiveSession(home.activeSession.id)}
                >
                  {t("tutor:voice.startNew")}
                </button>
              </div>
            </div>
          )}

          <div
            className="vt-subjects"
            role="group"
            aria-label={t("tutor:pickSubject")}
          >
            {home.subjects.map((row) => (
              <button
                key={row.id}
                type="button"
                aria-pressed={row.id === subjectId}
                className={`vt-subject-tab${row.id === subjectId ? " is-active" : ""}`}
                onClick={() => {
                  chooseSubject(row.id);
                  setLessonId(null);
                  setQuery("");
                  setSearch("");
                }}
              >
                {row.name}
              </button>
            ))}
          </div>

          <div className="vt-lessons" aria-busy={outlineLoading}>
            {lessonCount > FILTER_AFTER && (
              <label className="vt-filter">
                <HiOutlineSearch size={14} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("tutor:voice.filterLessons")}
                  aria-label={t("tutor:voice.filterLessons")}
                />
              </label>
            )}
            {outlineLoading && (
              <p className="vt-muted vt-list-note">
                {t("tutor:loadingLessons")}
              </p>
            )}
            {!outlineLoading && !subjectId && (
              <p className="vt-muted vt-list-note">
                {t("tutor:voice.chooseSubject")}
              </p>
            )}
            {!outlineLoading && subjectId && lessonCount === 0 && (
              <p className="vt-muted vt-list-note">{t("tutor:noLessons")}</p>
            )}
            {!outlineLoading &&
              subjectId &&
              lessonCount > 0 &&
              lessonRows.length === 0 && (
                <p className="vt-muted vt-list-note">{t("tutor:noLessons")}</p>
              )}
            {subjectId &&
              lessonRows.map((row) => {
                if (row.kind === "unit") {
                  return (
                    <p key={row.key} className="vt-group">
                      <span>{t("tutor:unit", { n: row.unitNumber })}</span>
                      {row.unitTitle && <em dir="auto">{row.unitTitle}</em>}
                    </p>
                  );
                }
                if (row.kind === "chapter") {
                  return (
                    <p key={row.key} className="vt-group is-chapter">
                      <span>
                        {t("tutor:chapter", { n: row.chapterNumber })}
                      </span>
                      {row.chapterTitle && (
                        <em dir="auto">{row.chapterTitle}</em>
                      )}
                    </p>
                  );
                }
                return (
                  <LessonRow
                    key={row.key}
                    row={row}
                    selected={row.lesson.id === lessonId}
                    onPick={pickLesson}
                  />
                );
              })}
          </div>

          <div className="vt-start">
            <button
              type="button"
              className="vt-start-btn"
              disabled={!ready}
              onClick={() => startSession(lessonId)}
            >
              <HiOutlineMicrophone size={17} aria-hidden="true" />
              {starting ? t("tutor:voice.starting") : t("tutor:voice.start")}
            </button>
            {wallet.canAsk === false ? (
              <p className="vt-foot-note is-warn">
                {t("tutor:voice.needCredits", {
                  price: wallet.price,
                  credits: wallet.credits,
                })}
              </p>
            ) : lessonId ? (
              <p className="vt-foot-note">
                {t("tutor:voice.priceNote", {
                  price: wallet.price,
                  credits: wallet.credits,
                })}
              </p>
            ) : (
              <p className="vt-foot-note">{t("tutor:voice.pickFirst")}</p>
            )}

            <div className="vt-mic-check">
              <button
                type="button"
                className="vt-link-btn"
                disabled={checkingMic}
                onClick={runMicCheck}
              >
                <HiOutlineMicrophone size={14} aria-hidden="true" />
                {t("tutor:voice.micCheck")}
              </button>
              {micStatus === "ready" && (
                <span className="vt-mic-ok">
                  <HiOutlineCheck size={13} aria-hidden="true" />
                  {t("tutor:voice.micReady")}
                </span>
              )}
              {["blocked", "missing", "unsupported"].includes(micStatus) && (
                <div className="vt-mic-help" role="status">
                  <p>
                    {micStatus === "missing"
                      ? t("tutor:voice.micNotFound")
                      : micStatus === "unsupported"
                        ? t("tutor:voice.errors.micUnsupported")
                        : t("tutor:voice.micBlocked")}
                  </p>
                  {micStatus === "blocked" && (
                    <ul>
                      <li>{t("tutor:voice.micBlockedSteps.chrome")}</li>
                      <li>{t("tutor:voice.micBlockedSteps.safari")}</li>
                    </ul>
                  )}
                  <p className="vt-foot-note">
                    {t("tutor:voice.textOnlyNote")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One picker row. Its props stay stable so typing in the filter does not redraw the list. */
const LessonRow = memo(function LessonRow({ row, selected, onPick }) {
  const { t } = useTranslation(["tutor"]);
  const lesson = row.lesson;
  return (
    <button
      type="button"
      className={`vt-lesson${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      onClick={() => onPick(lesson.id)}
    >
      <span className="vt-lesson-num">{lesson.lessonNumber}</span>
      <span className="vt-lesson-main">
        <strong dir="auto">{lesson.title}</strong>
        {row.chapterNumber != null && (
          <span>{t("tutor:chapter", { n: row.chapterNumber })}</span>
        )}
      </span>
      <span className="vt-lesson-mark" aria-hidden="true">
        {selected ? (
          <HiOutlineCheck size={15} />
        ) : (
          <HiOutlineChevronRight size={15} />
        )}
      </span>
    </button>
  );
});

function Board({
  session,
  direction,
  error,
  phase,
  preparing,
  speakingIndex,
  listeningStartedAt,
  listenSeconds,
  shortTap,
  soundFailed,
  micOpen,
  textOnly,
  tapToToggle,
  setTapToToggle,
  canRetry,
  onLeave,
  onStart,
  onStop,
  onReplay,
  onStopPlayback,
  onAnswer,
  onRetry,
  onDismissError,
  onDismissSound,
}) {
  const { t } = useTranslation(["tutor"]);
  // One page per tutor turn, each paired with what the student said to get it.
  const pages = useMemo(() => {
    const rows = [];
    let said = null;
    for (const message of session.messages || []) {
      if (message.role === "student") {
        said = message;
        continue;
      }
      rows.push({ id: String(rows.length), tutor: message, said });
      said = null;
    }
    return rows;
  }, [session.messages]);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hidden, setHidden] = useState(false);

  // The server sends one clip per board part: lead, each block, then follow-up.
  const spokenStep =
    phase === "speaking" && Number.isInteger(speakingIndex)
      ? speakingIndex
      : null;
  const wallet = creditCopy({
    credits: session.voice?.credits ?? 0,
    price: session.voice?.price ?? 0,
    creditsSpent: session.creditsSpent ?? 0,
  });
  const price = wallet.price;
  const outOfCredit = session.voice?.canAsk === false || !wallet.canAsk;
  const statusKey = outOfCredit ? "outOfCredit" : phase;
  const holding = phase === "listening";
  const thinking = phase === "thinking";
  const playing = phase === "speaking" || preparing;
  const blocked = thinking || outOfCredit;
  const languageName = t(
    `tutor:voice.language.${session.language === "ar" ? "ar" : "en"}`,
  );
  const pageWindow = pagesWindow(pages, expanded);

  useEffect(() => {
    const onVisibility = () => setHidden(Boolean(document.hidden));
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!confirming) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  const mainRef = useRef(null);
  const latestRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const [atLatest, setAtLatest] = useState(true);

  const scrollToLatest = useCallback(() => {
    const container = mainRef.current;
    const target = latestRef.current;
    if (!container || !target) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    container.scrollTo({
      top: Math.max(0, target.offsetTop - 8),
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  // A new page (or the waiting page) pushes the old ones up and lands on a clean board.
  // A reply replacing the waiting page keeps the count, so a student reading back is not yanked down.
  const pageCount = pages.length + (thinking ? 1 : 0);
  useEffect(() => {
    scrollToLatest();
  }, [pageCount, scrollToLatest]);

  const expandEarlier = useCallback(() => {
    const container = mainRef.current;
    if (container) {
      pendingScrollRef.current = container.scrollHeight - container.scrollTop;
    }
    setExpanded(true);
  }, []);

  // Expanding above the reader keeps their place instead of dropping them down.
  useLayoutEffect(() => {
    const container = mainRef.current;
    const pending = pendingScrollRef.current;
    if (!container || pending == null) return;
    pendingScrollRef.current = null;
    container.scrollTop = container.scrollHeight - pending;
  }, [expanded]);

  const onFeedScroll = useCallback((event) => {
    const el = event.currentTarget;
    setAtLatest(el.scrollTop + el.clientHeight >= el.scrollHeight - 140);
  }, []);

  const announcement =
    phase === "listening"
      ? t("tutor:voice.status.listening")
      : phase === "thinking"
        ? t("tutor:voice.status.thinking")
        : phase === "speaking"
          ? t("tutor:voice.status.speaking")
          : (session.messages || []).length
            ? t("tutor:voice.announce.ready")
            : "";
  const reason = thinking
    ? t("tutor:voice.why.wait")
    : outOfCredit
      ? t("tutor:voice.why.noCredit")
      : "";
  const orbLabel = thinking
    ? t("tutor:voice.status.thinking")
    : outOfCredit
      ? t("tutor:voice.status.outOfCredit")
      : holding
        ? t("tutor:voice.releaseSend")
        : t("tutor:voice.holdToTalk");

  return (
    <div
      className="vt-page vt-board"
      dir={direction}
      data-hidden={hidden ? "true" : undefined}
    >
      <p className="vt-sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <header className="vt-rail">
        <span className="vt-context">
          <span className="vt-globe" aria-hidden="true">
            <HiOutlineGlobe size={14} />
          </span>
          <span className="vt-lang">{languageName}</span>
          <span className="vt-sep" aria-hidden="true">
            ·
          </span>
          <span className="vt-rail-lesson">
            {session.lesson?.label || t("tutor:lessonsTitle")}
          </span>
        </span>
        <span className="vt-spacer" />
        {micOpen && !textOnly && (
          <span className="vt-mic-ready">
            <i aria-hidden="true" />
            <span>{t("tutor:voice.micReady")}</span>
          </span>
        )}
        <span className={`vt-chip${outOfCredit ? " is-empty" : ""}`}>
          <HiOutlineChatAlt2 size={13} aria-hidden="true" />
          {t("tutor:voice.messagesLeft", { n: wallet.messages })}
        </span>
        <button
          type="button"
          className="vt-exit"
          onClick={() => setConfirming(true)}
          aria-label={t("tutor:voice.endSession")}
        >
          <HiOutlineX size={16} aria-hidden="true" />
          <span className="vt-exit-text">{t("tutor:voice.endSession")}</span>
        </button>
      </header>

      <div className="vt-feed-wrap">
        {error && (
          <div className="vt-error vt-feed-error" role="alert">
            <span>{error}</span>
            {canRetry && (
              <button
                type="button"
                className="vt-retry"
                disabled={thinking}
                onClick={onRetry}
              >
                <HiOutlineRefresh size={13} aria-hidden="true" />
                {t("tutor:voice.retrySend")}
              </button>
            )}
            <button
              type="button"
              className="vt-error-x"
              aria-label={t("tutor:voice.dismiss")}
              onClick={onDismissError}
            >
              <HiOutlineX size={13} aria-hidden="true" />
            </button>
          </div>
        )}

        {soundFailed && (
          <div className="vt-notice" role="status">
            <div className="vt-notice-text">
              <strong>{t("tutor:voice.soundFailedTitle")}</strong>
              <p>{t("tutor:voice.soundFailedBody")}</p>
            </div>
            <button type="button" className="vt-notice-play" onClick={onReplay}>
              <HiOutlinePlay size={14} aria-hidden="true" />
              {t("tutor:voice.play")}
            </button>
            <button
              type="button"
              className="vt-notice-x"
              aria-label={t("tutor:voice.dismiss")}
              onClick={onDismissSound}
            >
              <HiOutlineX size={13} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="vt-board-main" ref={mainRef} onScroll={onFeedScroll}>
          {pageWindow.canExpand && (
            <button
              type="button"
              className="vt-earlier"
              onClick={expandEarlier}
            >
              {t("tutor:voice.earlierPages", { n: pageWindow.hiddenCount })}
            </button>
          )}

          {pageWindow.visible.map((page, index) => {
            const latest = !thinking && index === pageWindow.visible.length - 1;
            return (
              <FeedPage
                key={page.id}
                page={page}
                picked=""
                latest={latest}
                pageRef={latest ? latestRef : null}
                spokenStep={latest ? spokenStep : null}
                blocked={latest ? blocked : false}
                outOfCredit={latest ? outOfCredit : false}
                onAnswer={onAnswer}
              />
            );
          })}

          {thinking && (
            <section className="vt-feed-page is-latest" ref={latestRef}>
              <Waiting />
            </section>
          )}

          {outOfCredit && (
            <div className="vt-empty">
              <span className="vt-empty-icon" aria-hidden="true">
                <HiOutlineLockClosed size={20} />
              </span>
              <div className="vt-empty-text">
                <strong>
                  {wallet.reason === "ranOut"
                    ? t("tutor:voice.outOfCreditTitle")
                    : t("tutor:voice.notEnoughCredits")}
                </strong>
                <p>{t("tutor:voice.outOfCreditBody", { price })}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setConfirming(true)}
              >
                {t("tutor:voice.pickAnother")}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`vt-jump${atLatest ? "" : " is-visible"}`}
          onClick={scrollToLatest}
          tabIndex={atLatest ? -1 : 0}
          aria-hidden={atLatest}
        >
          <HiOutlineChevronDown size={15} aria-hidden="true" />
          {t("tutor:voice.backToLatest")}
        </button>
      </div>

      <footer className="vt-dock">
        {shortTap && (
          <p className="vt-hint" role="status">
            {t("tutor:voice.holdLonger")}
          </p>
        )}
        {holding && (
          <RecordingTimer
            startedAt={listeningStartedAt}
            limit={listenSeconds}
          />
        )}
        {preparing && (
          <span className="vt-preparing" aria-hidden="true">
            {t("tutor:voice.preparingVoice")}
          </span>
        )}

        {textOnly ? (
          <div className="vt-text-dock">
            <p className="vt-text-note">{t("tutor:voice.textOnlyNote")}</p>
            <AnswerBox
              disabled={thinking || outOfCredit}
              label={t("tutor:voice.typeYourAnswer")}
              onSend={onAnswer}
            />
            <div className="vt-text-actions">
              <button
                type="button"
                className="vt-replay"
                onClick={onReplay}
                disabled={thinking}
              >
                {t("tutor:voice.replayHint")}
              </button>
              {playing && (
                <button
                  type="button"
                  className="vt-stop"
                  onClick={() => onStopPlayback()}
                >
                  <HiOutlineStop size={13} aria-hidden="true" />
                  {t("tutor:voice.stop")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="vt-dock-side">
              {!tapToToggle && (
                <>
                  <kbd className="vt-kbd">Ctrl</kbd>
                  <span>
                    {holding
                      ? t("tutor:voice.status.listening")
                      : t("tutor:voice.holdToTalk")}
                  </span>
                </>
              )}
              <label className="vt-tap-toggle">
                <input
                  type="checkbox"
                  checked={tapToToggle}
                  onChange={(event) => setTapToToggle(event.target.checked)}
                />
                <span>{t("tutor:voice.tapToggle")}</span>
              </label>
            </div>
            <div className={`vt-orb-wrap is-${statusKey}`}>
              <span className="vt-halo" aria-hidden="true" />
              <span className="vt-halo second" aria-hidden="true" />
              <button
                type="button"
                className="vt-orb"
                disabled={blocked}
                aria-label={orbLabel}
                aria-describedby={reason ? "vt-mic-why" : undefined}
                onPointerDown={(event) => {
                  if (tapToToggle) return;
                  event.preventDefault();
                  // Keep the press even if the finger or mouse drifts off the orb:
                  // the sentence ends when the student lets go, not when they slip.
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  onStart();
                }}
                onPointerUp={(event) => {
                  if (tapToToggle) return;
                  event.preventDefault();
                  onStop();
                }}
                onPointerCancel={() => {
                  if (!tapToToggle && holding) onStop();
                }}
                onClick={(event) => {
                  if (!tapToToggle) return;
                  // Keyboard activation is handled once by the window listener.
                  if (event.detail === 0) return;
                  if (holding) onStop();
                  else onStart();
                }}
                onKeyDown={(event) => {
                  if (tapToToggle) return;
                  if (
                    (event.key === " " || event.key === "Enter") &&
                    !event.repeat
                  ) {
                    event.preventDefault();
                    onStart();
                  }
                }}
                onKeyUp={(event) => {
                  if (tapToToggle) return;
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    onStop();
                  }
                }}
                onContextMenu={(event) => event.preventDefault()}
              >
                {thinking ? (
                  <span className="vt-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <HiOutlineMicrophone size={30} aria-hidden="true" />
                )}
              </button>
            </div>
            <div className="vt-dock-side is-right">
              {reason && (
                <span id="vt-mic-why" className="vt-why">
                  {reason}
                </span>
              )}
              {playing ? (
                <button
                  type="button"
                  className="vt-stop"
                  onClick={() => onStopPlayback()}
                >
                  <HiOutlineStop size={13} aria-hidden="true" />
                  {t("tutor:voice.stop")}
                </button>
              ) : (
                <span>{t("tutor:voice.releaseSend")}</span>
              )}
              <span className="vt-dot-sep" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className="vt-replay"
                onClick={onReplay}
                disabled={thinking}
              >
                {t("tutor:voice.replayHint")}
              </button>
            </div>
          </>
        )}
      </footer>

      {confirming && (
        <div className="vt-confirm-layer">
          <div
            className="vt-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vt-confirm-title"
          >
            <strong id="vt-confirm-title">
              {t("tutor:voice.endConfirmTitle")}
            </strong>
            <p>{t("tutor:voice.endConfirmBody")}</p>
            <div className="vt-confirm-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                autoFocus
                onClick={() => setConfirming(false)}
              >
                {t("tutor:voice.keepGoing")}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onLeave}
              >
                {t("tutor:voice.endLesson")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Owns its own interval so a tick never re-renders the board. */
function RecordingTimer({ startedAt, limit }) {
  const { t } = useTranslation(["tutor"]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const remaining = Math.max(0, limit - seconds);
  return (
    <span className="vt-rec-pill" aria-hidden="true">
      <i className="vt-rec-dot" />
      <Wave />
      {remaining > 0 && remaining <= 5
        ? t("tutor:voice.sendingIn", { n: remaining })
        : t("tutor:voice.listeningTimer", { seconds, limit })}
    </span>
  );
}

/**
 * One tutor turn as a page. The newest page reveals itself with the voice and takes
 * answers; older pages stay put above it, read-only, so the student can scroll back.
 */
const FeedPage = memo(function FeedPage({
  page,
  picked,
  latest,
  pageRef,
  spokenStep,
  blocked,
  outOfCredit,
  onAnswer,
}) {
  const { t } = useTranslation(["tutor"]);
  const message = page.tutor;
  const points = Array.isArray(message?.points) ? message.points : [];
  const blocks =
    Array.isArray(message?.blocks) && message.blocks.length
      ? message.blocks
      : points.length
        ? [{ type: "bullets", items: points }]
        : [];
  const followUp = message?.followUp || "";
  const options = Array.isArray(message?.options) ? message.options : [];
  const asksChoice = message?.questionType === "mcq";
  // Sessions saved before options existed put their choices in a steps block.
  const legacyChoices = asksChoice && options.length === 0;
  const asksYesNo = message?.questionType === "yesno";
  const totalSteps = 1 + blocks.length + (followUp ? 1 : 0);
  const revealActive = latest && spokenStep !== null && spokenStep < totalSteps;
  const stepClass = (index) => {
    if (!revealActive) return "";
    if (index < spokenStep) return " is-past";
    if (index === spokenStep) return " is-active";
    return " is-upcoming";
  };
  const interactive = latest && !outOfCredit;
  const lead = message?.lead || message?.text || t("tutor:voice.board.hello");
  const emphasis = message?.emphasis || "";
  const markAt = emphasis ? lead.indexOf(emphasis) : -1;

  return (
    <section
      ref={pageRef}
      className={`vt-feed-page${latest ? " is-latest" : " is-archived"}`}
      aria-current={latest ? "true" : undefined}
    >
      {page.said?.text && (
        <div className="vt-your-words">
          <span className="vt-your-words-tag">
            <HiOutlineMicrophone size={11} aria-hidden="true" />
            {t("tutor:voice.youSaid")}
          </span>
          <q dir="auto">{page.said.text}</q>
        </div>
      )}

      <div
        className={`vt-turn${blocks.length ? "" : " is-solo"}${
          revealActive ? " is-revealing" : ""
        }`}
        dir="auto"
      >
        <h2 className={`vt-lead${stepClass(0)}`}>
          {markAt < 0 ? (
            lead
          ) : (
            <>
              {lead.slice(0, markAt)}
              <mark>{emphasis}</mark>
              {lead.slice(markAt + emphasis.length)}
            </>
          )}
        </h2>
        {blocks.length > 0 && (
          <div className="vt-side">
            {blocks.map((block, index) => (
              <Block
                key={`${block.type}-${index}`}
                block={block}
                stateClass={stepClass(index + 1)}
                choices={legacyChoices && block.type === "steps"}
                disabled={!interactive || blocked}
                picked={picked}
                onChoose={onAnswer}
              />
            ))}
          </div>
        )}
      </div>

      {followUp && !(latest && outOfCredit) && (
        <div className={`vt-check${stepClass(blocks.length + 1)}`}>
          <span className="vt-check-icon" aria-hidden="true">
            <HiOutlineQuestionMarkCircle size={17} />
          </span>
          <div className="vt-check-text">
            <strong>{t("tutor:voice.yourTurn")}</strong>
            <p dir="auto">{followUp}</p>
            {options.length > 0 && (
              <Choices
                items={options}
                picked={picked}
                disabled={!interactive || blocked}
                onChoose={onAnswer}
              />
            )}
            {interactive && asksYesNo && (
              <YesNo disabled={blocked} onSend={onAnswer} />
            )}
            {interactive && !asksChoice && !asksYesNo && (
              <AnswerBox disabled={blocked} onSend={onAnswer} />
            )}
          </div>
        </div>
      )}
    </section>
  );
});

/** Two taps for a yes/no check; the student can still hold the mic to say why. */
const YesNo = memo(function YesNo({ disabled, onSend }) {
  const { t } = useTranslation(["tutor"]);
  return (
    <div
      className="vt-yesno"
      role="group"
      aria-label={t("tutor:voice.yesNoLabel")}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSend(t("tutor:voice.yes"))}
      >
        {t("tutor:voice.yes")}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSend(t("tutor:voice.no"))}
      >
        {t("tutor:voice.no")}
      </button>
      <span className="vt-yesno-hint">{t("tutor:voice.yesNoHint")}</span>
    </div>
  );
});

/** The turn the model is still shaping: human copy and where the blocks will land. */
function Waiting() {
  const { t } = useTranslation(["tutor"]);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => (current + 1) % WAIT_KEYS.length),
      2400,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="vt-waiting" aria-live="polite">
      <span className="vt-wait-pill">
        {t(`tutor:voice.waiting.${WAIT_KEYS[step]}`)}
        <span className="vt-wait-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
      <div className="vt-ghosts" aria-hidden="true">
        <i className="w1" />
        <i className="w2" />
        <i className="w3" />
      </div>
    </div>
  );
}

/** A typed answer for short and matching questions. */
const AnswerBox = memo(function AnswerBox({ disabled, label, onSend }) {
  const { t } = useTranslation(["tutor"]);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const text = label || t("tutor:voice.answerPlaceholder");

  const submit = async (event) => {
    event.preventDefault();
    const answer = value.trim();
    if (!answer || disabled || sending) return;
    setSending(true);
    let sent = null;
    try {
      sent = await onSend(answer);
    } finally {
      setSending(false);
    }
    // The words stay in the field when the send fails, so nothing is lost.
    if (sent) setValue("");
  };

  return (
    <form className="vt-answer" onSubmit={submit}>
      <input
        type="text"
        value={value}
        maxLength={500}
        disabled={disabled || sending}
        placeholder={text}
        aria-label={text}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" disabled={disabled || sending || !value.trim()}>
        {t("tutor:voice.sendAnswer")}
      </button>
    </form>
  );
});

/** Lettered answer buttons; the question itself is never one of them. */
const Choices = memo(function Choices({
  items,
  picked = "",
  disabled = false,
  onChoose,
  stateClass = "",
  bubble = false,
}) {
  return (
    <div
      className={`vt-choices${bubble ? " vt-bubble" : ""}${stateClass}`}
      role="group"
    >
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          className={`vt-choice${picked && picked === String(item) ? " is-picked" : ""}`}
          disabled={disabled}
          onClick={() => onChoose(String(item))}
        >
          <b aria-hidden="true">{String.fromCharCode(65 + index)}</b>
          <span>{item}</span>
        </button>
      ))}
    </div>
  );
});

/** One typed block. Lists keep their shape; a contrast gets one tint per word. */
const Block = memo(function Block({
  block,
  stateClass = "",
  choices = false,
  disabled = false,
  picked = "",
  onChoose,
}) {
  const { t } = useTranslation(["tutor"]);
  if (choices) {
    const items = Array.isArray(block.items) ? block.items : [];
    if (!items.length) return null;
    return (
      <Choices
        items={items}
        picked={picked}
        disabled={disabled}
        onChoose={onChoose}
        stateClass={stateClass}
        bubble
      />
    );
  }

  if (block.type === "bullets" || block.type === "steps") {
    const items = Array.isArray(block.items) ? block.items : [];
    if (!items.length) return null;
    const List = block.type === "steps" ? "ol" : "ul";
    return (
      <div className={`vt-bubble vt-${block.type}${stateClass}`}>
        <List>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </List>
      </div>
    );
  }
  if (block.type === "contrast") {
    const items = Array.isArray(block.items) ? block.items : [];
    if (!items.length) return null;
    return (
      <div className={`vt-contrast${stateClass}`}>
        {items.map((item, index) => (
          <div
            key={index}
            className={`vt-join is-${JOIN_TONES[index % JOIN_TONES.length]}`}
          >
            <span className="vt-join-word">{item.word}</span>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "compare") {
    const items = Array.isArray(block.items) ? block.items : [];
    if (items.length < 2) return null;
    return (
      <div className={`vt-compare${stateClass}`}>
        {items.map((item, index) => (
          <div
            key={index}
            className={`vt-compare-col is-${JOIN_TONES[index % JOIN_TONES.length]}`}
          >
            <strong>{item.heading}</strong>
            <ul>
              {(item.points || []).map((point, pointIndex) => (
                <li key={pointIndex}>{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "timeline") {
    const items = Array.isArray(block.items) ? block.items : [];
    if (items.length < 2) return null;
    return (
      <div className={`vt-bubble vt-timeline${stateClass}`}>
        <span className="vt-block-label">
          {t("tutor:voice.blockLabels.timeline")}
        </span>
        <ol>
          {items.map((item, index) => (
            <li key={index}>
              <b>{item.label}</b>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (block.type === "recap") {
    const items = Array.isArray(block.items) ? block.items : [];
    if (!items.length) return null;
    return (
      <div className={`vt-bubble vt-recap${stateClass}`}>
        <span className="vt-block-label">
          {t("tutor:voice.blockLabels.recap")}
        </span>
        <ul>
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (block.type === "evidence") {
    if (!block.text) return null;
    return (
      <div className={`vt-bubble vt-evidence${stateClass}`}>
        <span className="vt-block-label">
          {t("tutor:voice.blockLabels.evidence")}
        </span>
        <blockquote>{block.text}</blockquote>
        {block.source && <cite>{block.source}</cite>}
      </div>
    );
  }
  if (block.type === "mistake") {
    if (!block.text || !block.fix) return null;
    return (
      <div className={`vt-bubble vt-mistake${stateClass}`}>
        <span className="vt-block-label">
          {t("tutor:voice.blockLabels.mistake")}
        </span>
        <p className="vt-mistake-slip">{block.text}</p>
        <p className="vt-mistake-fix">
          <b>{t("tutor:voice.blockLabels.mistakeFix")}</b> {block.fix}
        </p>
      </div>
    );
  }
  if (block.type === "math") {
    if (!block.text) return null;
    return (
      <div className={`vt-bubble vt-math${stateClass}`}>
        <span
          className="vt-math-line"
          dir="ltr"
          role="math"
          aria-label={block.spoken || block.text}
        >
          {block.text}
        </span>
      </div>
    );
  }
  if (!block.text) return null;
  return (
    <div className={`vt-bubble vt-${block.type}${stateClass}`}>
      <span className="vt-block-label">
        {t(`tutor:voice.blockLabels.${block.type}`)}
      </span>
      <p>{block.text}</p>
    </div>
  );
});
