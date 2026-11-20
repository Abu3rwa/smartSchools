import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import skillpathService from "../../../services/skillpathService";
import {
  dropIndexForPoint,
  encodeMatchingResponse,
  encodeMultiSelectResponse,
  encodeOrderingResponse,
  expectedTextFor,
  matchingComplete,
  moveItem,
  normalizeWireType,
  rightAvailability,
  toggleId
} from "./utils/skillpathResponses";
import "../../skillpath/skillpath.css";

const CheckIcon = () => (
  <svg className="sp-feedback__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="var(--success-500)" />
    <path d="M7.5 12.4l3 3 6-6.4" stroke="#06281c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CrossIcon = () => (
  <svg className="sp-feedback__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="var(--error-500)" />
    <path d="M8.5 8.5l7 7m0-7l-7 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const OptionMark = ({ kind }) => {
  if (!kind) return null;
  return (
    <svg className="sp-option__mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {kind === "correct" ? (
        <path d="M4 10.5l4 4 8-8.5" stroke="var(--success-500)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M5 5l10 10M15 5L5 15" stroke="var(--error-500)" strokeWidth="2.4" strokeLinecap="round" />
      )}
    </svg>
  );
};

const AccuracyRing = ({ percent }) => {
  const size = 148;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, Math.max(0, (percent || 0) / 100));
  return (
    <div className="sp-summary__ring">
      <svg width={size} height={size} aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-color)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--success-500)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div className="sp-ring__label">
        <strong>{percent === null || percent === undefined ? "—" : `${percent}%`}</strong>
      </div>
    </div>
  );
};

const SkillPathPlayPage = () => {
  const { t, i18n } = useFeatureNamespaces(["skillpath"]);
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({
    loading: true,
    error: null,
    session: null,
    packTitle: "",
    packLanguage: "en"
  });
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [multiIds, setMultiIds] = useState([]);
  const [pairSel, setPairSel] = useState({});
  const [orderIds, setOrderIds] = useState([]);
  const [pickedRight, setPickedRight] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const [hoverLeft, setHoverLeft] = useState(null);
  const [dragOrderId, setDragOrderId] = useState(null);
  const submissions = useRef({});
  const inputRef = useRef(null);
  const nextRef = useRef(null);
  const chipDrag = useRef(null);
  const chipMoved = useRef(false);
  const orderDrag = useRef(null);
  const orderListRef = useRef(null);

  const complete = useCallback(async () => {
    try {
      const data = await skillpathService.completeSession(sessionId);
      setSummary(data);
      return data;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error?.response?.data?.message || t("errors.complete")
      }));
      return null;
    }
  }, [sessionId, t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await skillpathService.getSession(sessionId);
        if (cancelled) return;
        const answeredIds = new Set((data.session.answered || []).map((answer) => answer.itemId));
        const nextIndex = data.session.items.findIndex((item) => !answeredIds.has(item.externalId));
        setState({
          loading: false,
          error: null,
          session: data.session,
          packTitle: data.packTitle,
          packLanguage: data.packLanguage
        });
        if (data.session.status === "completed") {
          await complete();
        } else {
          setIndex(nextIndex === -1 ? data.session.items.length - 1 : nextIndex);
        }
      } catch (error) {
        if (cancelled) return;
        setState({
          loading: false,
          error: error?.response?.data?.message || t("errors.loadPlay"),
          session: null,
          packTitle: "",
          packLanguage: "en"
        });
      }
    };
    load();
    return () => { cancelled = true; };
  }, [sessionId, complete, t]);

  const session = state.session;
  const items = session?.items || [];
  const current = items[index];
  const answered = session?.answered || [];
  const answeredMap = useMemo(
    () => new Map((session?.answered || []).map((answer) => [answer.itemId, answer.correct])),
    [session?.answered]
  );
  const answeredCount = answered.length;
  const currentType = normalizeWireType(current?.type);

  useEffect(() => {
    setSelected("");
    setDraft("");
    setMultiIds([]);
    setPairSel({});
    setPickedRight(null);
    setOrderIds((current?.orderingItems || []).map((entry) => entry.id));
  }, [current?.externalId, current?.orderingItems]);

  useEffect(() => {
    if (!feedback && (currentType === "fill_in_blank" || currentType === "numeric_response") && inputRef.current) {
      inputRef.current.focus();
    }
    if (feedback && nextRef.current) {
      nextRef.current.focus();
    }
  }, [feedback, index, currentType]);

  const submit = async (response) => {
    if (!current || submitting || feedback) return;
    const itemId = current.externalId;
    if (!submissions.current[itemId]) {
      submissions.current[itemId] = (globalThis.crypto?.randomUUID?.()
        || `sub-${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 60);
    }
    setSubmitting(true);
    try {
      const data = await skillpathService.answerSession(sessionId, {
        itemId,
        response,
        submissionId: submissions.current[itemId]
      });
      setFeedback({
        correct: data.attempt.correct,
        expected: data.expected,
        explanation: data.explanation
      });
      setState((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          answered: [...(prev.session.answered || []), data.attempt],
          answeredCount: data.progress.answered,
          correctCount: data.progress.correct
        }
      }));
    } catch (error) {
      if (error?.response?.status === 409) {
        setFeedback({ correct: null, conflict: true });
      } else {
        setState((prev) => ({
          ...prev,
          error: error?.response?.data?.message || t("errors.saveAnswer")
        }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const chooseOption = (optionId) => {
    if (feedback) return;
    setSelected(optionId);
    submit(optionId);
  };

  const chooseTrueFalse = (value) => {
    if (feedback) return;
    setSelected(value);
    submit(value);
  };

  const submitMulti = () => {
    if (multiIds.length) submit(encodeMultiSelectResponse(multiIds));
  };

  const submitMatching = () => {
    if (matchingComplete(current?.matchingLefts, pairSel)) {
      submit(encodeMatchingResponse(current.matchingLefts, pairSel));
    }
  };

  const submitOrdering = () => {
    if (orderIds.length) submit(encodeOrderingResponse(orderIds));
  };

  const assignPair = (left, right) => {
    setPairSel((prev) => ({ ...prev, [left]: right }));
    setPickedRight(null);
  };

  const pickRight = (right) => {
    if (chipMoved.current) {
      chipMoved.current = false;
      return;
    }
    if (feedback || submitting) return;
    setPickedRight((prev) => (prev === right ? null : right));
  };

  const placeRight = (left) => {
    if (feedback || submitting) return;
    if (pickedRight) {
      assignPair(left, pickedRight);
    } else if (pairSel[left]) {
      setPairSel((prev) => {
        const nextPairs = { ...prev };
        delete nextPairs[left];
        return nextPairs;
      });
    }
  };

  const chipPointerDown = (event, right) => {
    if (feedback || submitting) return;
    chipMoved.current = false;
    chipDrag.current = { right, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const chipPointerMove = (event) => {
    const drag = chipDrag.current;
    if (!drag) return;
    if (!chipMoved.current && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
      chipMoved.current = true;
    }
    if (!chipMoved.current) return;
    setDragGhost({ right: drag.right, x: event.clientX, y: event.clientY });
    const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-left]");
    setHoverLeft(slot?.getAttribute("data-left") || null);
  };

  const chipPointerUp = (event) => {
    const drag = chipDrag.current;
    chipDrag.current = null;
    setDragGhost(null);
    setHoverLeft(null);
    if (!drag || !chipMoved.current) return;
    const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-left]");
    const left = slot?.getAttribute("data-left");
    if (left) assignPair(left, drag.right);
  };

  const chipPointerCancel = () => {
    chipDrag.current = null;
    chipMoved.current = false;
    setDragGhost(null);
    setHoverLeft(null);
  };

  const moveOrder = (from, to) => {
    setOrderIds((prev) => moveItem(prev, from, to));
  };

  const orderPointerDown = (event, id) => {
    if (feedback || submitting) return;
    if (event.target.closest("button")) return;
    orderDrag.current = { id };
    setDragOrderId(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const orderPointerMove = (event) => {
    const drag = orderDrag.current;
    if (!drag || !orderListRef.current) return;
    const rows = [...orderListRef.current.querySelectorAll("[data-order-id]")];
    const rects = rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { top: box.top, height: box.height };
    });
    const target = dropIndexForPoint(rects, event.clientY);
    setOrderIds((prev) => {
      const from = prev.indexOf(drag.id);
      return from === -1 || from === target ? prev : moveItem(prev, from, target);
    });
  };

  const orderPointerUp = () => {
    orderDrag.current = null;
    setDragOrderId(null);
  };

  const next = async () => {
    setFeedback(null);
    setSelected("");
    setDraft("");
    const nextIndex = index + 1;
    if (nextIndex >= items.length) {
      const data = await complete();
      if (!data) return;
      return;
    }
    setIndex(nextIndex);
  };

  const exit = () => {
    if (summary || session?.status === "completed") {
      navigate("/portal/skillpath");
      return;
    }
    if (window.confirm(t("play.confirmExit"))) {
      navigate("/portal/skillpath");
    }
  };

  if (state.loading) {
    return <div className="sp-page sp-loading">{t("common.loading")}</div>;
  }

  if (state.error && !session) {
    return (
      <div className="sp-page">
        <div className="sp-error">{state.error}</div>
        <Link className="sp-btn" to="/portal/skillpath">{t("common.back")}</Link>
      </div>
    );
  }

  if (summary || session?.status === "completed" && summary) {
    const result = summary?.summary || {};
    return (
      <div className="sp-summary" dir={i18n.dir()}>
        <span className="sp-chip sp-chip--done">{t("play.summary.kicker")}</span>
        <h2>{t("play.summary.title")}</h2>
        <AccuracyRing percent={result.accuracy} />
        <div className="sp-summary__stats">
          <div className="sp-stat">
            <strong>{t("play.summary.correctOf", { correct: result.correct, total: result.total })}</strong>
            <span>{t("play.summary.answers")}</span>
          </div>
          <div className="sp-stat">
            <strong dir="ltr">+{result.xpEarned || 0}</strong>
            <span>{t("home.xp")}</span>
          </div>
          <div className="sp-stat">
            <strong>{summary?.profile?.streakWeeks || 0}</strong>
            <span>{t("home.streakWeeks")}</span>
          </div>
        </div>
        {summary?.week ? (
          <p className="sp-play__foot-note">
            {t("home.weekGoal", {
              done: summary.week.daysThisWeek,
              goal: summary.profile?.weeklyGoalDays || 3
            })}
          </p>
        ) : null}
        {summary?.profile?.badges?.length ? (
          <div className="sp-summary__badges">
            {summary.profile.badges.map((badge) => (
              <span key={badge} className="sp-badge">{t(`badges.${badge}`, { defaultValue: badge })}</span>
            ))}
          </div>
        ) : null}
        <p className="sp-play__foot-note">{t("play.xpNote")}</p>
        <div className="sp-actions" style={{ justifyContent: "center" }}>
          <Link className="sp-btn sp-btn--primary" to="/portal/skillpath">{t("play.summary.backHome")}</Link>
          <Link className="sp-btn" to="/portal/skillpath/leaderboard">{t("board.title")}</Link>
          <Link className="sp-btn" to="/portal/skillpath/progress">{t("play.summary.viewProgress")}</Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="sp-page">
        <div className="sp-empty">{t("play.noItems")}</div>
      </div>
    );
  }

  const answeredCorrectForCurrent = feedback?.correct;
  const showAnswers = session?.showAnswersAfter !== false;
  let expectedText = feedback?.expected ? expectedTextFor(current, feedback.expected) : "";
  if (currentType === "true_false" && feedback?.expected) {
    expectedText = t(feedback.expected === "true" ? "play.true" : "play.false");
  }

  return (
    <div className="sp-play" dir={i18n.dir()}>
      <div className="sp-play__top">
        <button type="button" className="sp-btn sp-btn--ghost" onClick={exit}>
          {t("play.exit")}
        </button>
        <h2 dir="auto">{state.packTitle || t("home.title")}</h2>
        <span className="sp-play__count">
          {t("play.questionOf", { current: index + 1, total: items.length })}
        </span>
      </div>

      <div className="sp-dots" aria-hidden="true">
        {items.map((item, dotIndex) => {
          const answeredState = answeredMap.get(item.externalId);
          let className = "";
          if (feedback && dotIndex === index) {
            className += answeredCorrectForCurrent ? "is-correct" : answeredCorrectForCurrent === false ? "is-wrong" : "";
          } else if (answeredState === true) className = "is-correct";
          else if (answeredState === false) className = "is-wrong";
          if (dotIndex === index) className += " is-current";
          return <i key={item.externalId} className={className.trim()} />;
        })}
      </div>

      {state.error ? <div className="sp-error">{state.error}</div> : null}

      <div className="sp-question">
        <p className="sp-question__prompt" dir="auto">{current.prompt}</p>

        {currentType === "multiple_choice" ? (
          <div className="sp-options" role="group" aria-label={t("play.chooseOne")}>
            {current.options.map((option, optionIndex) => {
              let className = "sp-option";
              let mark = null;
              if (feedback) {
                if (option.id === feedback.expected) { className += " is-correct"; mark = "correct"; }
                else if (option.id === selected) { className += " is-wrong"; mark = "wrong"; }
              } else if (selected === option.id) {
                className += " is-selected";
              }
              return (
                <button
                  key={option.id}
                  type="button"
                  className={className}
                  disabled={Boolean(feedback) || submitting}
                  onClick={() => chooseOption(option.id)}
                >
                  <span className="sp-option__key">{String.fromCharCode(65 + optionIndex)}</span>
                  <span dir="auto">{option.text}</span>
                  <OptionMark kind={mark} />
                </button>
              );
            })}
          </div>
        ) : null}

        {currentType === "true_false" ? (
          <div className="sp-tf" role="group" aria-label={t("play.chooseOne")}>
            {["true", "false"].map((value) => {
              let className = "sp-option sp-tf__btn";
              let mark = null;
              if (feedback) {
                if (value === feedback.expected) { className += " is-correct"; mark = "correct"; }
                else if (value === selected) { className += " is-wrong"; mark = "wrong"; }
              }
              return (
                <button
                  key={value}
                  type="button"
                  className={className}
                  disabled={Boolean(feedback) || submitting}
                  onClick={() => chooseTrueFalse(value)}
                >
                  <span dir="auto">{t(value === "true" ? "play.true" : "play.false")}</span>
                  <OptionMark kind={mark} />
                </button>
              );
            })}
          </div>
        ) : null}

        {currentType === "multiple_select" ? (
          <div className="sp-multi">
            <p className="sp-play__foot-note">{t("play.multiHint")}</p>
            <div className="sp-options" role="group" aria-label={t("play.multiHint")}>
              {current.options.map((option, optionIndex) => {
                const checked = multiIds.includes(option.id);
                let className = "sp-option";
                let mark = null;
                if (feedback) {
                  if (feedback.correct && checked) { className += " is-correct"; mark = "correct"; }
                } else if (checked) {
                  className += " is-selected";
                }
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={className}
                    aria-pressed={checked}
                    disabled={Boolean(feedback) || submitting}
                    onClick={() => setMultiIds((prev) => toggleId(prev, option.id))}
                  >
                    <span className="sp-option__key">{String.fromCharCode(65 + optionIndex)}</span>
                    <span dir="auto">{option.text}</span>
                    <OptionMark kind={mark} />
                  </button>
                );
              })}
            </div>
            {!feedback ? (
              <button
                type="button"
                className="sp-btn sp-btn--primary"
                disabled={!multiIds.length || submitting}
                onClick={submitMulti}
              >
                {submitting ? t("play.checking") : t("play.submit")}
              </button>
            ) : null}
          </div>
        ) : null}

        {currentType === "matching" ? (
          <div className="sp-match">
            <p className="sp-play__foot-note">{t("play.matchHint")}</p>
            <div className="sp-match__pool" role="group" aria-label={t("play.matchPick")}>
              {(current.matchingRights || []).map((right, rightIndex) => {
                const available = rightAvailability(current.matchingRights, pairSel)(right);
                return (
                  <button
                    key={`${rightIndex}-${right}`}
                    type="button"
                    className={`sp-match__chip${pickedRight === right ? " is-picked" : ""}${!available ? " is-used" : ""}`}
                    disabled={Boolean(feedback) || submitting || !available}
                    onPointerDown={(event) => chipPointerDown(event, right)}
                    onPointerMove={chipPointerMove}
                    onPointerUp={chipPointerUp}
                    onPointerCancel={chipPointerCancel}
                    onClick={() => pickRight(right)}
                  >
                    <span dir="auto">{right}</span>
                  </button>
                );
              })}
            </div>
            <div className="sp-match__slots">
              {(current.matchingLefts || []).map((left) => {
                const filled = Boolean(pairSel[left]);
                let className = "sp-match__slot";
                if (filled) className += " is-filled";
                if (hoverLeft === left) className += " is-hover";
                if (feedback && feedback.correct) className += " is-correct";
                return (
                  <div key={left} className="sp-match__row" data-left={left}>
                    <span className="sp-match__left" dir="auto">{left}</span>
                    <button
                      type="button"
                      className={className}
                      disabled={Boolean(feedback) || submitting}
                      onClick={() => placeRight(left)}
                    >
                      {filled ? <span dir="auto">{pairSel[left]}</span> : t("play.matchTap")}
                    </button>
                  </div>
                );
              })}
            </div>
            {!feedback ? (
              <button
                type="button"
                className="sp-btn sp-btn--primary"
                disabled={!matchingComplete(current.matchingLefts, pairSel) || submitting}
                onClick={submitMatching}
              >
                {submitting ? t("play.checking") : t("play.submit")}
              </button>
            ) : null}
            {dragGhost ? (
              <div className="sp-match__ghost" style={{ left: dragGhost.x, top: dragGhost.y }} aria-hidden="true">
                <span dir="auto">{dragGhost.right}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentType === "ordering" ? (
          <div className="sp-order-wrap">
            <p className="sp-play__foot-note">{t("play.orderHint")}</p>
            <div className={`sp-order${feedback && feedback.correct ? " is-correct" : ""}`} ref={orderListRef}>
              {orderIds.map((id, orderIndex) => {
                const entry = (current.orderingItems || []).find((candidate) => candidate.id === id);
                return (
                  <div
                    key={id}
                    className={`sp-order__row${dragOrderId === id ? " is-dragging" : ""}`}
                    data-order-id={id}
                    onPointerDown={(event) => orderPointerDown(event, id)}
                    onPointerMove={orderPointerMove}
                    onPointerUp={orderPointerUp}
                    onPointerCancel={orderPointerUp}
                  >
                    <span className="sp-order__pos">{orderIndex + 1}</span>
                    <span className="sp-order__text" dir="auto">{entry?.text || ""}</span>
                    {!feedback ? (
                      <span className="sp-order__moves">
                        <button
                          type="button"
                          className="sp-btn sp-btn--ghost"
                          aria-label={t("editor.moveUp")}
                          disabled={orderIndex === 0 || submitting}
                          onClick={() => moveOrder(orderIndex, orderIndex - 1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="sp-btn sp-btn--ghost"
                          aria-label={t("editor.moveDown")}
                          disabled={orderIndex === orderIds.length - 1 || submitting}
                          onClick={() => moveOrder(orderIndex, orderIndex + 1)}
                        >
                          ↓
                        </button>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {!feedback ? (
              <button
                type="button"
                className="sp-btn sp-btn--primary"
                disabled={!orderIds.length || submitting}
                onClick={submitOrdering}
              >
                {submitting ? t("play.checking") : t("play.submit")}
              </button>
            ) : null}
          </div>
        ) : null}

        {currentType === "fill_in_blank" || currentType === "numeric_response" ? (
          <form
            className="sp-answer"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) submit(draft.trim());
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              dir="auto"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              disabled={Boolean(feedback) || submitting}
              className={feedback ? (feedback.correct ? "is-correct" : "is-wrong") : ""}
              placeholder={currentType === "numeric_response" ? t("play.typeNumber") : t("play.typeAnswer")}
              aria-label={currentType === "numeric_response" ? t("play.typeNumber") : t("play.typeAnswer")}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={(event) => event.preventDefault()}
            />
            {!feedback ? (
              <button type="submit" className="sp-btn sp-btn--primary" disabled={!draft.trim() || submitting}>
                {submitting ? t("play.checking") : t("play.submit")}
              </button>
            ) : null}
          </form>
        ) : null}

        {feedback ? (
          <div className={`sp-feedback ${feedback.correct ? "sp-feedback--correct" : "sp-feedback--wrong"}`} role="status">
            {feedback.correct ? <CheckIcon /> : <CrossIcon />}
            <div>
              <strong>
                {feedback.correct
                  ? t("play.correct")
                  : feedback.conflict
                    ? t("play.alreadyAnswered")
                    : t("play.notQuite")}
              </strong>
              {!feedback.correct && showAnswers && expectedText ? (
                <span>{t("play.correctAnswer", { answer: expectedText })}</span>
              ) : null}
              {showAnswers && feedback.explanation ? <span dir="auto">{feedback.explanation}</span> : null}
              {!showAnswers && !feedback.conflict ? <span>{t("play.answerRecorded")}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="sp-play__foot">
        <span className="sp-play__foot-note">
          {t("play.answeredCount", { answered: answeredCount, total: items.length })}
        </span>
        {feedback ? (
          <button ref={nextRef} type="button" className="sp-btn sp-btn--primary" onClick={next}>
            {index + 1 >= items.length ? t("play.seeResults") : t("play.next")}
          </button>
        ) : (
          <span className="sp-play__foot-note">{t("play.feedbackNote")}</span>
        )}
      </div>
    </div>
  );
};

export default SkillPathPlayPage;
