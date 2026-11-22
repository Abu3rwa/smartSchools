import { useState } from "react";
import {
  HiOutlineArrowPath,
  HiOutlineChevronDown,
  HiOutlineSparkles,
  HiOutlineTrash,
} from "react-icons/hi2";
import { formatNumber } from "../builder/liveLessonBuilderForm.js";

const STATUS_KEYS = {
  setup: "drafts.setup",
  outline: "drafts.outline",
  content: "drafts.content",
};

const COLLAPSED_COUNT = 3;

/**
 * Unfinished AI drafts above the library. The server owns the list and its
 * expiry; the strip only offers Resume and Discard for the owner's own drafts.
 * Rows stay one line tall so the lesson list keeps the page.
 */
const AiDraftsStrip = ({
  drafts,
  discardingId,
  onResume,
  onDiscard,
  t,
  locale,
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!drafts.length) return null;
  const overflow = drafts.length > COLLAPSED_COUNT;
  const visible = expanded ? drafts : drafts.slice(0, COLLAPSED_COUNT);

  return (
    <section
      className={`live-ai-drafts${expanded ? " is-expanded" : ""}`}
      aria-label={t("drafts.title")}
    >
      <div className="live-ai-drafts-head">
        <span className="live-ai-drafts-label">
          <HiOutlineSparkles aria-hidden="true" />
          {t("drafts.title")}
          <span className="live-ai-drafts-count">
            {formatNumber(drafts.length, locale)}
          </span>
        </span>
        {overflow && (
          <button
            type="button"
            className="live-ai-drafts-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded
              ? t("drafts.showLess")
              : t("drafts.showAll", {
                  count: formatNumber(drafts.length, locale),
                })}
            <HiOutlineChevronDown
              className={expanded ? "is-flipped" : ""}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      <div className="live-ai-draft-cards">
        {visible.map((draft) => {
          const title = draft.title?.trim() || t("head.untitled");
          const updated = draft.updatedAt
            ? new Date(draft.updatedAt).toLocaleDateString(locale)
            : "";
          const progress =
            draft.status === "content"
              ? t("slides.progress", {
                  ready: formatNumber(draft.readyCount || 0, locale),
                  total: formatNumber(draft.itemCount || 0, locale),
                })
              : draft.status === "outline"
                ? t("drafts.items", {
                    count: formatNumber(draft.itemCount || 0, locale),
                  })
                : "";
          const discarding = String(discardingId) === String(draft._id);
          return (
            <div className="live-ai-draft-card" key={draft._id}>
              <button
                type="button"
                className="live-ai-draft-open"
                title={t("drafts.resume")}
                onClick={() => onResume(draft)}
              >
                <HiOutlineArrowPath
                  className="live-ai-draft-arrow"
                  aria-hidden="true"
                />
                <span className="live-ai-draft-title">{title}</span>
                <span className="live-ai-draft-meta">
                  {t(STATUS_KEYS[draft.status] || "drafts.setup")}
                  {progress ? ` · ${progress}` : ""}
                  {updated ? ` · ${updated}` : ""}
                </span>
              </button>
              <button
                type="button"
                className="live-ai-draft-discard"
                disabled={discarding}
                aria-label={t("drafts.discard")}
                title={t("drafts.discard")}
                onClick={() => onDiscard(draft)}
              >
                <HiOutlineTrash aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default AiDraftsStrip;
