import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  HiOutlineArrowLeft,
  HiOutlineChatAlt2,
  HiOutlineCheck,
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
    chooseSubject,
    startSession,
    leaveSession,
    startListening,
    stopListening,
    replay,
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
        canRecord={canRecord}
        listenSeconds={home.voice?.listenSeconds || 30}
        onLeave={leaveSession}
        onStart={startListening}
        onStop={stopListening}
        onReplay={replay}
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
  canRecord,
  listenSeconds,
  onLeave,
  onStart,
  onStop,
  onReplay,
  t,
}) {
  const messages = session.messages || [];
  const lastStudent =
    [...messages].reverse().find((message) => message.role === "student") ||
    null;
  const lastTutor =
    [...messages].reverse().find((message) => message.role === "tutor") || null;
  const points = Array.isArray(lastTutor?.points) ? lastTutor.points : [];
  const blocks =
    Array.isArray(lastTutor?.blocks) && lastTutor.blocks.length
      ? lastTutor.blocks
      : points.length
        ? [{ type: "bullets", items: points }]
        : [];
  const credits = session.voice?.credits ?? 0;
  const price = session.voice?.price ?? 0;
  const canAsk = session.voice?.canAsk !== false;
  const left = price > 0 ? Math.floor(credits / price) : 0;
  const outOfCredit = !canAsk;
  const statusKey = outOfCredit ? "outOfCredit" : phase;
  const holding = phase === "listening";
  const thinking = phase === "thinking";
  const blocked = !canRecord || thinking || outOfCredit;
  const lead =
    lastTutor?.lead || lastTutor?.text || t("tutor:voice.board.hello");
  const emphasis = lastTutor?.emphasis || "";
  const markAt = emphasis ? lead.indexOf(emphasis) : -1;
  const languageName = t(
    `tutor:voice.language.${session.language === "ar" ? "ar" : "en"}`,
  );

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

      <div className="vt-board-main">
        {error && (
          <p className="vt-error" role="alert">
            {error}
          </p>
        )}

        {/* {lastStudent?.text && (
          <div className="vt-your-words">
            <span className="vt-your-words-tag">
              <HiOutlineMicrophone size={11} aria-hidden="true" />
              {t("tutor:voice.youSaid")}
            </span>
            <q>{lastStudent.text}</q>
            <span className="vt-converted">
              {t("tutor:voice.convertedShort")}
            </span>
          </div>
        )} */}

        {thinking ? (
          <Waiting t={t} />
        ) : (
          <div className={`vt-turn${blocks.length ? "" : " is-solo"}`}>
            <h2 className="vt-lead">
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
                  <Block key={`${block.type}-${index}`} block={block} t={t} />
                ))}
              </div>
            )}
          </div>
        )}

        {!outOfCredit && lastTutor?.followUp && !thinking && (
          <div className="vt-check">
            <span className="vt-check-icon" aria-hidden="true">
              <HiOutlineQuestionMarkCircle size={17} />
            </span>
            <div className="vt-check-text">
              <strong>{t("tutor:voice.yourTurn")}</strong>
              <p>{lastTutor.followUp}</p>
            </div>
          </div>
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

/** One typed block. Lists keep their shape; a contrast gets one tint per word. */
function Block({ block, t }) {
  if (block.type === "bullets" || block.type === "steps") {
    const items = Array.isArray(block.items) ? block.items : [];
    if (!items.length) return null;
    const List = block.type === "steps" ? "ol" : "ul";
    return (
      <div className={`vt-bubble vt-${block.type}`}>
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
      <div className="vt-contrast">
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
  if (!block.text) return null;
  return (
    <div className={`vt-bubble vt-${block.type}`}>
      <span className="vt-block-label">
        {t(`tutor:voice.blockLabels.${block.type}`)}
      </span>
      <p>{block.text}</p>
    </div>
  );
}
