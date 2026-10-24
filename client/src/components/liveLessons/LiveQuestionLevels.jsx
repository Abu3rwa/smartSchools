import { useState } from "react";
import { HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";
import LiveQuestionEditor from "./LiveQuestionEditor.jsx";
import { createLiveVariantQuestion } from "../../utils/liveLessonQuestionDraft.js";
import "./LiveQuestionLevels.css";

const groupIdOf = (group) => String(group?._id || group?.id || "");

/**
 * The levelled half of a question slide: one variant per group, and a written note that everyone
 * outside those groups still answers the main question, because that is what the gateway does.
 */
const LiveQuestionLevels = ({ slide, groups = [], onChange, disabled = false }) => {
  const [pendingGroupId, setPendingGroupId] = useState("");
  const variants = slide.variants || [];
  const usedIds = new Set(variants.map((variant) => String(variant.groupId)));
  const freeGroups = groups.filter((group) => !usedIds.has(groupIdOf(group)));
  const selected = freeGroups.some((group) => groupIdOf(group) === pendingGroupId)
    ? pendingGroupId
    : "";
  const nameOf = (groupId) =>
    groups.find((group) => groupIdOf(group) === String(groupId))?.name || "a group";

  const patchVariant = (index, change) =>
    onChange(variants.map((variant, variantIndex) =>
      variantIndex === index ? { ...variant, ...change } : variant,
    ));

  const addLevel = () => {
    if (!selected) return;
    onChange([
      ...variants,
      { groupId: selected, question: createLiveVariantQuestion(slide.question) },
    ]);
    setPendingGroupId("");
  };

  return (
    <div className="live-levels">
      <div className="live-levels-header">
        <h4>Levelled questions</h4>
        <p>
          Every student who is not in one of these groups answers the question above.
        </p>
      </div>

      {variants.map((variant, index) => (
        <section className="live-level" key={`${variant.groupId}-${index}`}>
          <header className="live-level-header">
            <label className="live-level-group">
              Group
              <select
                value={String(variant.groupId)}
                onChange={(event) => patchVariant(index, { groupId: event.target.value })}
                disabled={disabled}
              >
                <option value={String(variant.groupId)}>
                  {variant.group || nameOf(variant.groupId)}
                </option>
                {freeGroups.map((group) => (
                  <option key={groupIdOf(group)} value={groupIdOf(group)}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            {!disabled && (
              <button
                type="button"
                className="live-question-remove"
                onClick={() =>
                  onChange(variants.filter((_, i) => i !== index))
                }
              >
                <HiOutlineXMark />
                <span>Remove level</span>
              </button>
            )}
          </header>
          <div className="live-level-question">
            <LiveQuestionEditor
              question={variant.question}
              onChange={(question) => patchVariant(index, { question })}
              disabled={disabled}
            />
          </div>
        </section>
      ))}

      {!disabled &&
        (groups.length ? (
          <div className="live-levels-add">
            <select
              value={selected}
              onChange={(event) => setPendingGroupId(event.target.value)}
              disabled={!freeGroups.length}
              aria-label="Group to level"
            >
              <option value="">
                {freeGroups.length ? "Choose a group…" : "Every group already has a level"}
              </option>
              {freeGroups.map((group) => (
                <option key={groupIdOf(group)} value={groupIdOf(group)}>
                  {group.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="live-secondary-button"
              onClick={addLevel}
              disabled={!selected}
            >
              <HiOutlinePlus /> Add level
            </button>
          </div>
        ) : (
          <p className="live-levels-empty">
            Make groups for this class below to send one slide different questions.
          </p>
        ))}
    </div>
  );
};

export default LiveQuestionLevels;
