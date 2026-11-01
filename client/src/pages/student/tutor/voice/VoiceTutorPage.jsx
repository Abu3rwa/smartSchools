import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  HiOutlineQuestionMarkCircle,
  HiOutlineSparkles,
  HiOutlineX,
} from "react-icons/hi";
import { useVoiceTutor } from "./useVoiceTutor.js";
import "./VoiceTutorPage.css";

const WAIT_KEYS = ["join", "words", "board"];
const JOIN_TONES = ["teal", "amber", "indigo"];

const flatLessons = (outline = []) => {
  const rows = [];
  for (const unit of outline) {
    for (const lesson of unit.lessons || []) {
      rows.push({ ...lesson, chapterNumber: null });
    }
    for (const chapter of unit.chapters || []) {
      for (const lesson of chapter.lessons || []) {
        rows.push({ ...lesson, chapterNumber: chapter.chapterNumber });
      }
    }
  }
  return rows;
};

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
  const { t } = useTranslation(["tutor"]);
  const {
    home,
    loading,
    outlineLoading,
    subjectId,
    session,
    starting,
    error,
    phase,
    seconds,
    speakingIndex,
    chooseSubject,
    startSession,
    leaveSession,
    startListening,
    stopListening,
    replay,
    answerByText,
    canRecord,
  } = useVoiceTutor();
  const [lessonId, setLessonId] = useState(null);

  const credits = session?.voice?.credits ?? home?.voice?.wallet?.credits ?? 0;
  const price = session?.voice?.price ?? home?.voice?.price ?? 0;
  const lessons = useMemo(
    () => flatLessons(home?.outline || []),
    [home?.outline],
  );

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
        error={error}
        phase={phase}
        seconds={seconds}
        speakingIndex={speakingIndex}
        canRecord={canRecord}
        listenSeconds={home.voice?.listenSeconds || 30}
        onLeave={leaveSession}
        onStart={startListening}
        onStop={stopListening}
        onReplay={replay}
        onAnswer={answerByText}
        t={t}
      />
    );
  }

  const ready =
    home.voice?.ready !== false &&
    Boolean(subjectId) &&
    Boolean(lessonId) &&
    canRecord;

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
          <div className="vt-head-steps">
            {["pick", "talk", "board"].map((key, index) => (
              <li key={key} className="vt-head-step">
                {/* <span className="vt-head-step-num" aria-hidden="true">
                  {index + 1}
                </span> */}
                <span className="vt-head-step-text">
                  <b>{t(`tutor:voice.how.${key}`)}</b>
                  {/* <span>{t(`tutor:voice.how.${key}Body`)}</span> */}
                </span>
              </li>
            ))}
          </div>
          <div className="vt-head-meta">
            <span className="vt-premium">{t("tutor:voice.premium")}</span>
            <span className={`vt-credits${credits === 0 ? " is-empty" : ""}`}>
              {t("tutor:voice.creditsChip", { n: credits })}
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
            <p className="vt-error" role="alert">
              {error || home.voice.problem}
            </p>
          )}

          <div
            className="vt-subjects"
            role="tablist"
            aria-label={t("tutor:pickSubject")}
          >
            {home.subjects.map((row) => (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={row.id === subjectId}
                className={`vt-subject-tab${row.id === subjectId ? " is-active" : ""}`}
                onClick={() => {
                  chooseSubject(row.id);
                  setLessonId(null);
                }}
              >
                {row.name}
              </button>
            ))}
          </div>

          <div className="vt-lessons">
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
            {!outlineLoading && subjectId && lessons.length === 0 && (
              <p className="vt-muted vt-list-note">{t("tutor:noLessons")}</p>
            )}
            {subjectId &&
              lessons.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`vt-lesson${row.id === lessonId ? " is-selected" : ""}`}
                  aria-pressed={row.id === lessonId}
                  onClick={() => setLessonId(row.id)}
                >
                  <span className="vt-lesson-num">{row.lessonNumber}</span>
                  <span className="vt-lesson-main">
                    <strong>{row.title}</strong>
                    {row.chapterNumber != null && (
                      <span>
                        {t("tutor:chapter", { n: row.chapterNumber })}
                      </span>
                    )}
                  </span>
                  <span className="vt-lesson-mark" aria-hidden="true">
                    {row.id === lessonId ? (
                      <HiOutlineCheck size={15} />
                    ) : (
                      <HiOutlineChevronRight size={15} />
                    )}
                  </span>
                </button>
              ))}
          </div>

          <div className="vt-start">
            <button
              type="button"
              className="vt-start-btn"
              disabled={!ready || starting}
              onClick={() => startSession(lessonId)}
            >
              <HiOutlineMicrophone size={17} aria-hidden="true" />
              {starting ? t("tutor:voice.starting") : t("tutor:voice.start")}
            </button>
            {!canRecord && (
              <p className="vt-foot-note is-warn">
                {t("tutor:voice.errors.micUnsupported")}
              </p>
            )}
            {canRecord && !lessonId && (
              <p className="vt-foot-note">{t("tutor:voice.pickFirst")}</p>
            )}
            {canRecord && lessonId && (
              <p className="vt-foot-note">
                {t("tutor:voice.priceNote", { price, credits })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Board({
  session,
  error,
  phase,
  seconds,
  speakingIndex,
  canRecord,
  listenSeconds,
  onLeave,
  onStart,
  onStop,
  onReplay,
  onAnswer,
  t,
}) {
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
  // The server sends one clip per board part: lead, each block, then follow-up.
  const spokenStep =
    phase === "speaking" && Number.isInteger(speakingIndex)
      ? speakingIndex
      : null;
  const credits = session.voice?.credits ?? 0;
  const price = session.voice?.price ?? 0;
  const canAsk = session.voice?.canAsk !== false;
  const left = price > 0 ? Math.floor(credits / price) : 0;
  const outOfCredit = !canAsk;
  const statusKey = outOfCredit ? "outOfCredit" : phase;
  const holding = phase === "listening";
  const thinking = phase === "thinking";
  const blocked = !canRecord || thinking || outOfCredit;
  const languageName = t(
    `tutor:voice.language.${session.language === "ar" ? "ar" : "en"}`,
  );

  const mainRef = useRef(null);
  const latestRef = useRef(null);
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

  const onFeedScroll = useCallback((event) => {
    const el = event.currentTarget;
    setAtLatest(el.scrollTop + el.clientHeight >= el.scrollHeight - 140);
  }, []);

  return (
    <div className="vt-page vt-board" dir="auto">
      <header className="vt-rail">
        <span className="vt-context">
          <span className="vt-globe" aria-hidden="true">
            <HiOutlineGlobe size={14} />
          </span>
          <span className="vt-lang">{languageName}</span>
          <span className="vt-sep" aria-hidden="true">
            ·
          </span>
          <span className="vt-lesson">
            {session.lesson?.label || t("tutor:lessonsTitle")}
          </span>
        </span>
        <span className="vt-spacer" />
        <span className={`vt-chip${outOfCredit ? " is-empty" : ""}`}>
          <HiOutlineChatAlt2 size={13} aria-hidden="true" />
          {t("tutor:voice.messagesLeft", { n: left })}
        </span>
        <button
          type="button"
          className="vt-exit"
          onClick={onLeave}
          aria-label={t("tutor:voice.endSession")}
        >
          <HiOutlineX size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="vt-feed-wrap">
        {error && (
          <p className="vt-error vt-feed-error" role="alert">
            {error}
          </p>
        )}

        <div className="vt-board-main" ref={mainRef} onScroll={onFeedScroll}>
          {pages.map((page, index) => {
            const latest = !thinking && index === pages.length - 1;
            return (
              <FeedPage
                key={page.id}
                page={page}
                picked={pages[index + 1]?.said?.text || ""}
                latest={latest}
                pageRef={latest ? latestRef : null}
                spokenStep={latest ? spokenStep : null}
                blocked={blocked}
                outOfCredit={outOfCredit}
                onAnswer={onAnswer}
                t={t}
              />
            );
          })}

          {thinking && (
            <section className="vt-feed-page is-latest" ref={latestRef}>
              <Waiting t={t} />
            </section>
          )}

          {outOfCredit && (
            <div className="vt-empty">
              <span className="vt-empty-icon" aria-hidden="true">
                <HiOutlineLockClosed size={20} />
              </span>
              <div className="vt-empty-text">
                <strong>{t("tutor:voice.outOfCreditTitle")}</strong>
                <p>{t("tutor:voice.outOfCreditBody", { price })}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onLeave}
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
        {holding && (
          <span className="vt-rec-pill" aria-live="polite">
            <i className="vt-rec-dot" aria-hidden="true" />
            <Wave />
            {t("tutor:voice.listeningTimer", { seconds, limit: listenSeconds })}
          </span>
        )}
        <div className="vt-dock-side">
          <kbd className="vt-kbd">Ctrl</kbd>
          <span>
            {holding
              ? t("tutor:voice.status.listening")
              : t("tutor:voice.holdToTalk")}
          </span>
        </div>
        <div className={`vt-orb-wrap is-${statusKey}`}>
          <span className="vt-halo" aria-hidden="true" />
          <span className="vt-halo second" aria-hidden="true" />
          <button
            type="button"
            className="vt-orb"
            disabled={blocked}
            aria-label={
              holding
                ? t("tutor:voice.releaseSend")
                : t("tutor:voice.holdToTalk")
            }
            onPointerDown={(event) => {
              event.preventDefault();
              // Keep the press even if the finger or mouse drifts off the orb:
              // the sentence ends when the student lets go, not when they slip.
              event.currentTarget.setPointerCapture?.(event.pointerId);
              onStart();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              onStop();
            }}
            onPointerCancel={() => {
              if (holding) onStop();
            }}
            onKeyDown={(event) => {
              if (
                (event.key === " " || event.key === "Enter") &&
                !event.repeat
              ) {
                event.preventDefault();
                onStart();
              }
            }}
            onKeyUp={(event) => {
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
          <span>{t("tutor:voice.releaseSend")}</span>
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
      </footer>
    </div>
  );
}

/**
 * One tutor turn as a page. The newest page reveals itself with the voice and takes
 * answers; older pages stay put above it, read-only, so the student can scroll back.
 */
function FeedPage({
  page,
  picked,
  latest,
  pageRef,
  spokenStep,
  blocked,
  outOfCredit,
  onAnswer,
  t,
}) {
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
          <q>{page.said.text}</q>
        </div>
      )}

      <div
        className={`vt-turn${blocks.length ? "" : " is-solo"}${
          revealActive ? " is-revealing" : ""
        }`}
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
                t={t}
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
            <p>{followUp}</p>
            {options.length > 0 && (
              <Choices
                items={options}
                picked={picked}
                disabled={!interactive || blocked}
                onChoose={onAnswer}
              />
            )}
            {interactive && asksYesNo && (
              <YesNo t={t} disabled={blocked} onSend={onAnswer} />
            )}
            {interactive && !asksChoice && !asksYesNo && (
              <AnswerBox t={t} disabled={blocked} onSend={onAnswer} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Two taps for a yes/no check; the student can still hold the mic to say why. */
function YesNo({ t, disabled, onSend }) {
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
}

/** The turn the model is still shaping: human copy and where the blocks will land. */
function Waiting({ t }) {
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
function AnswerBox({ t, disabled, onSend }) {
  const [value, setValue] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const answer = value.trim();
    if (!answer || disabled) return;
    setValue("");
    onSend(answer);
  };
  return (
    <form className="vt-answer" onSubmit={submit}>
      <input
        type="text"
        value={value}
        maxLength={500}
        disabled={disabled}
        placeholder={t("tutor:voice.answerPlaceholder")}
        aria-label={t("tutor:voice.answerPlaceholder")}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        {t("tutor:voice.sendAnswer")}
      </button>
    </form>
  );
}

/** Lettered answer buttons; the question itself is never one of them. */
function Choices({
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
}

/** One typed block. Lists keep their shape; a contrast gets one tint per word. */
function Block({
  block,
  t,
  stateClass = "",
  choices = false,
  disabled = false,
  picked = "",
  onChoose,
}) {
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
}
