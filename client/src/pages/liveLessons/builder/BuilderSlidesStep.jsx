import { useMemo, useState } from "react";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineClock,
  HiOutlineEllipsisHorizontal,
  HiOutlinePencilSquare,
  HiOutlineSparkles,
} from "react-icons/hi2";
import {
  allItemsReady,
  costCredits,
  countWords,
  describeItemAnswer,
  formatNumber,
  itemStatusKey,
  progressStats,
  typeLabelKey,
} from "./liveLessonBuilderForm.js";
import BuilderSlidePreview from "./BuilderSlidePreview.jsx";
import { sourceChips } from "../liveLessonSourceChip.js";

const BuilderSlidesStep = ({
  draft,
  setup,
  items,
  activeIndex,
  onSelect,
  onMove,
  onEdit,
  onEnhance,
  onRegenerate,
  onUndo,
  onStop,
  onApprove,
  onOpenPlan,
  onGenerate,
  onRetryItem,
  generatingIds = [],
  generating = false,
  stopRequested = false,
  busy = false,
  regeneratingItemId = "",
  quote,
  maxRegens = 3,
  t,
  locale,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const active = items[activeIndex] || items[0] || null;
  const stats = progressStats(items);
  const ready = allItemsReady(items);
  const generatingCount = generatingIds.length;
  const remaining = items.filter(
    (item) => item.status !== "ready" && !generatingIds.includes(item.itemId),
  ).length;
  const activeStatus = active && generatingIds.includes(active.itemId)
    ? "generating"
    : active?.status || "outlined";
  const activeSlide = draft?.previewSlides?.[activeIndex] || null;
  const chips = sourceChips(draft?.setup, t, locale);
  const activeWords = useMemo(() => {
    if (!activeSlide) return 0;
    return countWords(
      [
        activeSlide.title,
        activeSlide.body,
        ...(activeSlide.examples || []),
        activeSlide.speakerNotes,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }, [activeSlide]);
  const answerTexts = useMemo(
    () => describeItemAnswer(activeSlide?.question),
    [activeSlide],
  );
  const regenCost = quote?.regenerate?.chargedCents;
  const statusTone =
    activeStatus === "ready"
      ? "is-ready"
      : activeStatus === "failed" || activeStatus === "stale"
        ? "is-warn"
        : "is-waiting";
  const statusKey = itemStatusKey(activeStatus === "generating" ? "outlined" : activeStatus);
  const statusLabel =
    activeStatus === "generating"
      ? t("slides.generating")
      : t(statusKey);
  const failureCode = active?.failure?.code || "";
  const failureKey = `slides.failure.${failureCode}`;
  const failureLabel = failureCode
    ? t(failureKey, { defaultValue: "" })
    : "";
  const failureText =
    failureCode && failureLabel !== failureKey
      ? failureLabel
      : t("slides.failedSlide");

  return (
    <section className="llb-screen" aria-label={t("steps.slides.label")}>
      <div className="llb-screen-heading">
        <div>
          <h2>{t("slides.heading")}</h2>
          <p>{t("slides.copy")}</p>
        </div>
        <div className="llb-heading-aside">
          <span className="llb-soft-chip">
            <strong>{formatNumber(stats.ready, locale)}</strong>
            {t("slides.readySuffix")}
          </span>
          <span className="llb-soft-chip">
            <strong>{formatNumber(remaining, locale)}</strong>
            {t("slides.remainingSuffix")}
          </span>
          {generatingCount > 0 && (
            <span className="llb-soft-chip">
              <strong>{formatNumber(generatingCount, locale)}</strong>
              {t("slides.generatingSuffix")}
            </span>
          )}
          {stats.failed > 0 && (
            <span className="llb-soft-chip">
              <strong>{formatNumber(stats.failed, locale)}</strong>
              {t("slides.failedSuffix")}
            </span>
          )}
          {chips.map((chip, index) => (
            <span
              className="llb-soft-chip llb-source-chip"
              key={`${index}:${chip}`}
              title={chip}
            >
              <span className="llb-source-chip-text">{chip}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="llb-slides-layout">
        <aside className="llb-filmstrip">
          <div className="llb-film-head">
            <strong>{t("slides.filmTitle")}</strong>
            <span>{t("slides.filmCount", { count: items.length })}</span>
          </div>
          <div className="llb-film-list" role="listbox" aria-label={t("slides.filmTitle")}>
            {items.map((item, index) => {
              const isGenerating = generatingIds.includes(item.itemId);
              const status = isGenerating ? "generating" : item.status;
              const isCurrent = index === activeIndex;
              // Every teaching slide is a designed dark-gradient slide now.
              const isDark = item.kind === "slide";
              return (
                <div key={item.itemId}>
                  {index > 0 &&
                    status === "outlined" &&
                    (generatingIds.includes(items[index - 1].itemId) ||
                      items[index - 1].status === "ready") && (
                      <div className="llb-film-group">
                        {t("slides.filmRemaining")}
                      </div>
                    )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    className={isCurrent ? "llb-film-item is-current" : "llb-film-item"}
                    onClick={() => onSelect(index)}
                  >
                    <span
                      className={[
                        "llb-film-thumb",
                        isDark ? "is-dark" : "",
                        item.kind === "question" ? "is-question" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="llb-tline" />
                      <span className="llb-tline is-short" />
                    </span>
                    <span className="llb-film-copy">
                      <span className="llb-film-title" dir="auto">
                        {item.outline?.title || t(typeLabelKey(item))}
                      </span>
                      <span className="llb-film-state">
                        <span
                          className={`llb-state-dot is-${status === "outlined" ? "waiting" : status === "stale" ? "failed" : status}`}
                        />
                        {status === "ready" && isCurrent
                          ? t("slides.viewing")
                          : status === "generating"
                            ? t("slides.generating")
                            : t(itemStatusKey(status))}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="llb-preview-panel">
          <div className="llb-slide-toolbar">
            <div className="llb-preview-title">
              <strong>
                {t("slides.slideOf", {
                  index: activeIndex + 1,
                  total: items.length,
                })}
              </strong>
              {active && <span>{t(typeLabelKey(active))}</span>}
            </div>
            <div className="llb-preview-tools">
              <span className={`llb-status-pill ${statusTone}`}>
                <span
                  className={`llb-state-dot is-${activeStatus === "generating" ? "generating" : activeStatus === "ready" ? "ready" : activeStatus === "failed" || activeStatus === "stale" ? "failed" : "waiting"}`}
                />
                {statusLabel}
              </span>
              <button
                type="button"
                className="llb-icon-button"
                aria-label={t("plan.moveUp")}
                disabled={!active || busy || activeIndex === 0}
                onClick={() => onMove(active.itemId, activeIndex - 1)}
              >
                <HiOutlineChevronUp className="llb-ic-sm" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="llb-icon-button"
                aria-label={t("plan.moveDown")}
                disabled={!active || busy || activeIndex >= items.length - 1}
                onClick={() => onMove(active.itemId, activeIndex + 1)}
              >
                <HiOutlineChevronDown className="llb-ic-sm" aria-hidden="true" />
              </button>
              <span className="llb-menu-wrap">
                <button
                  type="button"
                  className="llb-icon-button"
                  aria-label={t("slides.more")}
                  aria-expanded={menuOpen}
                  disabled={!active}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <HiOutlineEllipsisHorizontal className="llb-ic-sm" aria-hidden="true" />
                </button>
                {menuOpen && active && (
                  <div className="llb-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="llb-command-row"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(active, activeIndex);
                      }}
                    >
                      <HiOutlinePencilSquare className="llb-ic-sm" aria-hidden="true" />
                      {t("slides.editText")}
                    </button>
                    {active.status !== "outlined" && !generatingIds.includes(active.itemId) && (
                      <button
                        type="button"
                        role="menuitem"
                        className="llb-command-row"
                        disabled={Boolean(regeneratingItemId)}
                        onClick={() => {
                          setMenuOpen(false);
                          onRegenerate(active);
                        }}
                      >
                        <HiOutlineArrowPath className="llb-ic-sm" aria-hidden="true" />
                        {t("slides.regenerateItem")}
                      </button>
                    )}
                    {active.canUndo && (
                      <button
                        type="button"
                        role="menuitem"
                        className="llb-command-row"
                        disabled={Boolean(regeneratingItemId)}
                        onClick={() => {
                          setMenuOpen(false);
                          onUndo(active);
                        }}
                      >
                        <HiOutlineArrowLeft className="llb-ic-sm llb-arrow" aria-hidden="true" />
                        {t("slides.undoItem")}
                      </button>
                    )}
                    {active.status === "failed" && (
                      <button
                        type="button"
                        role="menuitem"
                        className="llb-command-row"
                        disabled={Boolean(regeneratingItemId) || generating}
                        onClick={() => {
                          setMenuOpen(false);
                          onRetryItem(active);
                        }}
                      >
                        <HiOutlineArrowPath className="llb-ic-sm" aria-hidden="true" />
                        {t("slides.retryItem")}
                      </button>
                    )}
                  </div>
                )}
              </span>
            </div>
          </div>

          <BuilderSlidePreview
            slide={activeSlide}
            index={activeIndex}
            total={items.length}
            language={setup.language}
            itemStatus={activeStatus}
            t={t}
          />

          {activeStatus === "failed" && active && (
            <div className="llb-failure-bar" role="alert">
              <span>{failureText}</span>
              <button
                type="button"
                className="llb-btn llb-btn-secondary llb-btn-sm"
                disabled={busy || generating}
                onClick={() => onRetryItem(active)}
              >
                <HiOutlineArrowPath className="llb-ic-sm" aria-hidden="true" />
                {t("slides.retryItem")}
              </button>
            </div>
          )}

          <div className="llb-preview-caption">
            <span>{t("slides.studentView")}</span>
            <span>{t("slides.captionNote")}</span>
          </div>
        </div>

        <aside className="llb-inspector">
          <div className="llb-inspector-section">
            <div className="llb-inspector-title">
              {t("slides.details")}
              <span>{t("slides.version", { version: active?.rev ?? 1 })}</span>
            </div>
            <div className="llb-detail-row">
              <span>{t("slides.statusLabel")}</span>
              <strong>{statusLabel}</strong>
            </div>
            <div className="llb-detail-row">
              <span>{t("slides.positionLabel")}</span>
              <strong>
                {activeIndex + 1} / {items.length}
              </strong>
            </div>
            <div className="llb-detail-row">
              <span>{t("slides.wordsLabel")}</span>
              <strong>{formatNumber(activeWords, locale)}</strong>
            </div>
            <div className="llb-detail-row">
              <span>{t("slides.rendererLabel")}</span>
              <strong>
                {active?.kind === "slide"
                  ? t("slides.rendererDesigned")
                  : t("slides.rendererNative")}
              </strong>
            </div>
            <div className="llb-inspector-actions">
              <button
                type="button"
                className="llb-btn llb-btn-secondary llb-btn-sm"
                disabled={!active || busy}
                onClick={() => onEdit(active, activeIndex)}
              >
                <HiOutlinePencilSquare className="llb-ic-sm" aria-hidden="true" />
                {t("slides.editText")}
              </button>
              <button type="button" className="llb-mini-link" onClick={onOpenPlan}>
                {t("slides.openPlan")}
              </button>
            </div>
          </div>

          <div className="llb-inspector-section">
            <div className="llb-inspector-title">
              {t("slides.speakerNotes")}
              <span>{t("slides.teacherOnly")}</span>
            </div>
            <div className="llb-note-box">
              {activeSlide?.speakerNotes
                ? activeSlide.speakerNotes
                : t("slides.noNotes")}
            </div>
            {answerTexts.length > 0 && (
              <div className="llb-note-box">
                <strong>{t("slides.answerKey")}</strong>
                <br />
                {answerTexts.join(" · ")}
              </div>
            )}
          </div>

          <div className="llb-inspector-section llb-enhance">
            <div className="llb-inspector-title">
              {t("slides.enhanceTitle")}
              <span>
                {regenCost === undefined || regenCost === null
                  ? t("slides.enhanceOpen")
                  : t("dialogs.enhance.cost", {
                      credits: formatNumber(costCredits(regenCost), locale),
                    })}
              </span>
            </div>
            <p>{t("slides.enhanceCopy")}</p>
            <div className="llb-preset-chips">
              {["simpler", "visual", "shorter", "example"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="llb-preset-chip"
                  disabled={!active || busy}
                  onClick={() => onEnhance(active, preset)}
                >
                  {t(`dialogs.enhance.preset${preset.charAt(0).toUpperCase()}${preset.slice(1)}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="llb-btn llb-btn-secondary llb-btn-sm"
              disabled={!active || busy}
              onClick={() => onEnhance(active, "")}
            >
              <HiOutlineSparkles className="llb-ic-sm" aria-hidden="true" />
              {t("slides.enhanceOpen")}
            </button>
            <div className="llb-enhance-cost">
              <span>
                {t("slides.regenUsed", {
                  used: formatNumber(active?.regenCount || 0, locale),
                  max: formatNumber(maxRegens, locale),
                })}
              </span>
            </div>
          </div>
        </aside>
      </div>

      <div className="llb-footer">
        <div className="llb-footer-context">
          <div className="llb-pause-note">
            <span>
              <strong>{t("slides.pauseStrong")}</strong> {t("slides.pauseBody")}
            </span>
          </div>
          <div className="llb-progress">
            <div
              className="llb-progress-track"
              role="progressbar"
              aria-label={t("slides.progressLabel")}
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={stats.ready}
            >
              <div
                className="llb-progress-fill"
                style={{ width: `${stats.percent}%` }}
              />
            </div>
            <div className="llb-progress-copy">
              <strong>
                {t("slides.progress", {
                  ready: formatNumber(stats.ready, locale),
                  total: formatNumber(items.length, locale),
                })}
              </strong>
              {generatingCount > 0 && (
                <>
                  <span className="llb-dot-divider">·</span>
                  {t("slides.progressGenerating", {
                    count: formatNumber(generatingCount, locale),
                  })}
                </>
              )}
              {stats.failed > 0 && (
                <>
                  <span className="llb-dot-divider">·</span>
                  {t("slides.failedChip", {
                    count: formatNumber(stats.failed, locale),
                  })}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="llb-footer-actions">
          {generating && (
            <button
              type="button"
              className="llb-btn llb-btn-secondary"
              disabled={stopRequested}
              onClick={onStop}
            >
              <HiOutlineClock className="llb-ic-sm" aria-hidden="true" />
              {stopRequested ? t("slides.stopRequested") : t("slides.stop")}
            </button>
          )}
          {!generating && !ready && (
            <button
              type="button"
              className="llb-btn llb-btn-secondary"
              disabled={busy}
              onClick={onGenerate}
            >
              <HiOutlineArrowPath className="llb-ic-sm" aria-hidden="true" />
              {t("slides.retry")}
            </button>
          )}
          <button
            type="button"
            className="llb-btn llb-btn-primary"
            disabled={!ready || busy}
            title={!ready ? t("slides.approveHint") : undefined}
            onClick={onApprove}
          >
            {t("slides.approve")}
          </button>
        </div>
      </div>
    </section>
  );
};

export default BuilderSlidesStep;
