import { useState } from "react";
import {
  HiOutlineBars3,
  HiOutlineBookOpen,
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineEye,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlinePresentationChartBar,
  HiOutlineQuestionMarkCircle,
  HiOutlineUserGroup,
} from "react-icons/hi2";
import {
  QUESTION_KIND_OPTIONS,
  formatNumber,
  itemStatusKey,
  outlineCounts,
  questionKindCounts,
  typeLabelKey,
} from "./liveLessonBuilderForm.js";

const typeIcon = (item) => {
  if (item.kind === "question") return HiOutlineQuestionMarkCircle;
  switch (item.slideType) {
    case "goals":
      return HiOutlineCheck;
    case "content":
      return HiOutlineBookOpen;
    case "examples":
      return HiOutlineEye;
    case "activity":
      return HiOutlineUserGroup;
    default:
      return HiOutlinePresentationChartBar;
  }
};

const BuilderPlanStep = ({
  items,
  setup,
  onMove,
  onEdit,
  onDelete,
  onAdd,
  onRegenerate,
  busy,
  t,
  locale,
}) => {
  const [draggingId, setDraggingId] = useState("");
  const [dropIndex, setDropIndex] = useState(-1);
  const counts = outlineCounts(items);
  const kinds = questionKindCounts(items);
  const kindRows = QUESTION_KIND_OPTIONS.filter(
    (option) => (kinds[option.value] || 0) > 0,
  );
  const asked = {
    slides: Number(setup.slideCount) || 0,
    questions: Number(setup.questionCount) || 0,
  };
  const matches =
    counts.slides === asked.slides && counts.questions === asked.questions;
  const busyRows = Boolean(busy);
  // A fresh outline has no meaningful status yet; show chips once anything ran.
  const showStatus = items.some(
    (item) => item.status && item.status !== "outlined",
  );

  const drop = (index) => {
    setDropIndex(-1);
    if (!draggingId) return;
    onMove(draggingId, index);
    setDraggingId("");
  };

  return (
    <section className="llb-screen" aria-label={t("steps.plan.label")}>
      <div className="llb-screen-heading">
        <div>
          <h2>{t("plan.heading")}</h2>
          <p>{t("plan.copy")}</p>
        </div>
        <div className="llb-heading-aside">
          <span className="llb-soft-chip">
            <strong>{formatNumber(counts.slides, locale)}</strong>
            {t("plan.teachingSuffix")}
          </span>
          <span className="llb-soft-chip">
            <strong>{formatNumber(counts.questions, locale)}</strong>
            {t("plan.questionsSuffix")}
          </span>
          <span className="llb-soft-chip">{t("plan.autoSaved")}</span>
        </div>
      </div>

      <div className="llb-plan-layout">
        <div className="llb-panel llb-plan-list">
          <div className="llb-panel-header">
            <div>
              <h3>{t("plan.panelTitle")}</h3>
              <p>{t("plan.panelCopy")}</p>
            </div>
            <span className="llb-counter">
              {t("plan.counter", { count: items.length })}
            </span>
          </div>
          <div className="llb-plan-toolbar">
            <span>
              {t("plan.toolbar", {
                slides: formatNumber(counts.slides, locale),
                questions: formatNumber(counts.questions, locale),
              })}
            </span>
            <span>
              {t("plan.asked", {
                slides: formatNumber(asked.slides, locale),
                questions: formatNumber(asked.questions, locale),
              })}
            </span>
          </div>
          <div
            className="llb-plan-scroll"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (items.length) drop(items.length);
            }}
          >
            {items.map((item, index) => {
              const isQuestion = item.kind === "question";
              const TypeIcon = typeIcon(item);
              return (
                <div
                  key={item.itemId}
                  className={[
                    "llb-plan-row",
                    isQuestion ? "is-question" : "",
                    draggingId === item.itemId ? "is-dragging" : "",
                    dropIndex === index ? "is-drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  draggable={!busyRows}
                  onDragStart={() => setDraggingId(item.itemId)}
                  onDragEnd={() => {
                    setDraggingId("");
                    setDropIndex(-1);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    drop(index);
                  }}
                >
                  <span className="llb-row-index">{index + 1}</span>
                  <span className="llb-drag" aria-hidden="true">
                    <HiOutlineBars3 className="llb-ic-sm" />
                  </span>
                  <span
                    className={isQuestion ? "llb-row-type is-question" : "llb-row-type"}
                  >
                    <TypeIcon className="llb-ic-sm" aria-hidden="true" />
                    {t(typeLabelKey(item))}
                  </span>
                  <span className="llb-row-main">
                    <span className="llb-row-title" dir="auto">
                      {item.outline?.title}
                    </span>
                    {item.outline?.brief && (
                      <span className="llb-row-brief" dir="auto">
                        {item.outline.brief}
                      </span>
                    )}
                  </span>
                  {showStatus && (
                    <span
                      className={`llb-status-pill ${
                        item.status === "ready"
                          ? "is-ready"
                          : item.status === "failed" || item.status === "stale"
                            ? "is-warn"
                            : "is-waiting"
                      }`}
                    >
                      {t(itemStatusKey(item.status))}
                    </span>
                  )}
                  <span className="llb-row-actions">
                    <button
                      type="button"
                      className="llb-row-action"
                      aria-label={t("plan.moveUp")}
                      disabled={busyRows || index === 0}
                      onClick={() => onMove(item.itemId, index - 1)}
                    >
                      <HiOutlineChevronUp className="llb-ic-sm" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="llb-row-action"
                      aria-label={t("plan.moveDown")}
                      disabled={busyRows || index === items.length - 1}
                      onClick={() => onMove(item.itemId, index + 1)}
                    >
                      <HiOutlineChevronDown className="llb-ic-sm" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="llb-row-action"
                      aria-label={t("plan.edit")}
                      disabled={busyRows}
                      onClick={() => onEdit(item, index)}
                    >
                      <HiOutlinePencilSquare className="llb-ic-sm" aria-hidden="true" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="llb-plan-toolbar">
            <button
              type="button"
              className="llb-btn llb-btn-ghost llb-btn-sm"
              disabled={busyRows}
              onClick={() => onAdd("slide", items.length)}
            >
              <HiOutlinePlus className="llb-ic-sm" aria-hidden="true" />
              {t("plan.addSlide")}
            </button>
            <button
              type="button"
              className="llb-btn llb-btn-ghost llb-btn-sm"
              disabled={busyRows}
              onClick={() => onAdd("question", items.length)}
            >
              <HiOutlinePlus className="llb-ic-sm" aria-hidden="true" />
              {t("plan.addQuestion")}
            </button>
          </div>
        </div>

        <aside className="llb-plan-summary">
          <div className="llb-panel">
            <div className="llb-panel-header">
              <div>
                <h3>{t("plan.summaryTitle")}</h3>
                <p>{t("plan.summaryCopy")}</p>
              </div>
            </div>
            <div className="llb-summary-body">
              <div className="llb-summary-stat">
                <span>{t("plan.summaryTeaching")}</span>
                <strong>{formatNumber(counts.slides, locale)}</strong>
              </div>
              <div className="llb-summary-stat">
                <span>{t("plan.summaryQuestions")}</span>
                <strong>{formatNumber(counts.questions, locale)}</strong>
              </div>
              {kindRows.map((option) => (
                <div className="llb-summary-stat" key={option.value}>
                  <span>{t(option.labelKey)}</span>
                  <strong>{formatNumber(kinds[option.value] || 0, locale)}</strong>
                </div>
              ))}
              <div className={matches ? "llb-summary-note" : "llb-summary-note is-warn"}>
                <strong>{matches ? t("plan.matches") : t("plan.noMatch")}</strong>
                <br />
                {t(matches ? "plan.matchesBody" : "plan.noMatchBody", {
                  slides: formatNumber(asked.slides, locale),
                  questions: formatNumber(asked.questions, locale),
                })}
              </div>
            </div>
            <div className="llb-summary-actions">
              <button
                type="button"
                className="llb-btn llb-btn-secondary llb-btn-sm"
                disabled={busyRows}
                onClick={onRegenerate}
              >
                {t("plan.regenerate")}
              </button>
            </div>
          </div>
          <div className="llb-panel">
            <div className="llb-panel-header">
              <div>
                <h3>{t("plan.beforeTitle")}</h3>
              </div>
            </div>
            <div className="llb-summary-body">
              <div className="llb-summary-note is-warn">
                <strong>{t("plan.beforeStrong")}</strong>
                <br />
                {t("plan.beforeBody")}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default BuilderPlanStep;
