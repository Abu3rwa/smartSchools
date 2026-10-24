import { useId } from "react";
import {
  HiOutlineArrowDown,
  HiOutlineArrowUp,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import {
  LIVE_QUESTION_KIND_LABELS,
  LIVE_QUESTION_KIND_ORDER,
  addLiveMatchingPair,
  addLiveOption,
  addLiveOrderingItem,
  changeLiveQuestionKind,
  isLiveChoiceKind,
  isLiveOptionKind,
  liveNumericModes,
  liveOptionLimit,
  livePairLimit,
  liveStepLimit,
  moveLiveOrderingItem,
  patchLiveNumericRule,
  removeLiveMatchingPair,
  removeLiveOption,
  removeLiveOrderingItem,
  syncLiveQuestionBlanks,
  toggleLiveCorrectOption,
} from "../../utils/liveLessonQuestionDraft.js";
import "./LiveQuestionEditor.css";

const NUMERIC_MODE_LABELS = {
  exact: "One exact value",
  tolerance: "A value with a tolerance",
  relative: "A value within a percentage",
  range: "Any value inside a range",
};

const optionTag = (id) => String(id).toUpperCase();

/**
 * Authoring fields for one live question. Every edit goes through the draft helpers, so the editor,
 * the tests and the CSV all agree on what each kind needs before the server sees it.
 */
const LiveQuestionEditor = ({ question, onChange, disabled = false }) => {
  const kind = question.kind;
  const radioGroup = useId();
  const patch = (change) => onChange({ ...question, ...change });
  // The blanks belong to the question text, so typing a token adds its answer row.
  const patchPrompt = (prompt) =>
    onChange(
      kind === "fill_in_blank"
        ? syncLiveQuestionBlanks({ ...question, prompt })
        : { ...question, prompt },
    );
  const patchOption = (index, change) =>
    patch({
      options: question.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...change } : option,
      ),
    });
  const patchPair = (index, change) =>
    patch({
      matchingPairs: question.matchingPairs.map((pair, pairIndex) =>
        pairIndex === index ? { ...pair, ...change } : pair,
      ),
    });
  const patchStep = (index, change) =>
    patch({
      orderingItems: question.orderingItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...change } : item,
      ),
    });
  const patchBlank = (blankId, acceptsText) =>
    patch({
      blanks: question.blanks.map((blank) =>
        blank.id === blankId ? { ...blank, acceptsText } : blank,
      ),
    });
  const rule = question.numericRule || {};

  return (
    <div className="live-question-editor">
      {!disabled && (
        <label className="live-edit-field">
          Answer type
          <select
            value={kind}
            onChange={(event) =>
              onChange(changeLiveQuestionKind(question, event.target.value))
            }
          >
            {LIVE_QUESTION_KIND_ORDER.map((option) => (
              <option key={option} value={option}>
                {LIVE_QUESTION_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="live-edit-field">
        Student question
        <input
          value={question.prompt}
          onChange={(event) => patchPrompt(event.target.value)}
          disabled={disabled}
          placeholder="What does the student see on the slide?"
        />
      </label>
      {kind === "fill_in_blank" && (
        <p className="live-question-hint">
          Write each blank in the question as {"{{b1}}"}. Every blank needs at least one accepted
          answer below.
        </p>
      )}

      {isLiveOptionKind(kind) && (
        <div className="live-question-rows">
          <p className="live-question-hint">
            {kind === "multi_select"
              ? "Tick every correct option — a multiple-answer question needs at least two."
              : "Mark the correct option."}
          </p>
          {question.options.map((option, index) => (
            <div className="live-question-row" key={option.id}>
              {isLiveChoiceKind(kind) ? (
                <input
                  type="radio"
                  className="live-question-answer"
                  name={radioGroup}
                  checked={question.correctOptionId === option.id}
                  onChange={() => patch({ correctOptionId: option.id })}
                  disabled={disabled}
                  aria-label={`Mark option ${optionTag(option.id)} correct`}
                />
              ) : (
                <input
                  type="checkbox"
                  className="live-question-answer"
                  checked={question.correctOptionIds.includes(option.id)}
                  onChange={() => onChange(toggleLiveCorrectOption(question, option.id))}
                  disabled={disabled}
                  aria-label={`Mark option ${optionTag(option.id)} correct`}
                />
              )}
              <label className="live-edit-field">
                Option {optionTag(option.id)}
                <input
                  value={option.text}
                  onChange={(event) => patchOption(index, { text: event.target.value })}
                  disabled={disabled}
                />
              </label>
              {!disabled &&
                kind !== "tf" &&
                question.options.length > liveOptionLimit.min && (
                  <button
                    type="button"
                    className="live-question-remove"
                    onClick={() => onChange(removeLiveOption(question, option.id))}
                  >
                    <HiOutlineXMark />
                    <span>Remove</span>
                  </button>
                )}
            </div>
          ))}
          {!disabled &&
            kind !== "tf" &&
            question.options.length < liveOptionLimit.max && (
              <button
                type="button"
                className="live-text-button live-question-add"
                onClick={() => onChange(addLiveOption(question))}
              >
                <HiOutlinePlus /> Add answer option
              </button>
            )}
        </div>
      )}

      {kind === "matching" && (
        <div className="live-question-rows">
          <p className="live-question-hint">
            Each term matches one answer, and a term can only appear once.
          </p>
          {question.matchingPairs.map((pair, index) => (
            <div className="live-question-row" key={`pair-${index}`}>
              <input
                value={pair.left}
                placeholder="Term"
                onChange={(event) => patchPair(index, { left: event.target.value })}
                disabled={disabled}
              />
              <input
                value={pair.right}
                placeholder="Its match"
                onChange={(event) => patchPair(index, { right: event.target.value })}
                disabled={disabled}
              />
              {!disabled && question.matchingPairs.length > livePairLimit.min && (
                <button
                  type="button"
                  className="live-question-remove"
                  onClick={() => onChange(removeLiveMatchingPair(question, index))}
                >
                  <HiOutlineXMark />
                  <span>Remove</span>
                </button>
              )}
            </div>
          ))}
          {!disabled && (
            <button
              type="button"
              className="live-text-button live-question-add"
              onClick={() => onChange(addLiveMatchingPair(question))}
            >
              <HiOutlinePlus /> Add pair
            </button>
          )}
        </div>
      )}

      {kind === "ordering" && (
        <div className="live-question-rows">
          <p className="live-question-hint">
            List the steps in the order the student should put them
            {` (${liveStepLimit.min}–${liveStepLimit.max})`}.
          </p>
          {question.orderingItems.map((item, index) => (
            <div className="live-question-row" key={`step-${index}`}>
              <span className="live-question-row-position">{index + 1}</span>
              <input
                value={item.text}
                placeholder={`Step ${index + 1}`}
                onChange={(event) => patchStep(index, { text: event.target.value })}
                disabled={disabled}
              />
              <div className="live-question-row-actions">
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      orderingItems: moveLiveOrderingItem(
                        question.orderingItems,
                        index,
                        -1,
                      ),
                    })
                  }
                  disabled={disabled || index === 0}
                  aria-label="Move step up"
                >
                  <HiOutlineArrowUp />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      orderingItems: moveLiveOrderingItem(
                        question.orderingItems,
                        index,
                        1,
                      ),
                    })
                  }
                  disabled={disabled || index === question.orderingItems.length - 1}
                  aria-label="Move step down"
                >
                  <HiOutlineArrowDown />
                </button>
                <button
                  type="button"
                  className="live-question-remove"
                  onClick={() => onChange(removeLiveOrderingItem(question, index))}
                  disabled={disabled || question.orderingItems.length <= liveStepLimit.min}
                  aria-label="Remove step"
                >
                  <HiOutlineXMark />
                </button>
              </div>
            </div>
          ))}
          {!disabled && question.orderingItems.length < liveStepLimit.max && (
            <button
              type="button"
              className="live-text-button live-question-add"
              onClick={() => onChange(addLiveOrderingItem(question))}
            >
              <HiOutlinePlus /> Add step
            </button>
          )}
        </div>
      )}

      {kind === "fill_in_blank" && (
        <div className="live-question-rows">
          {question.blanks.length === 0 && (
            <p className="live-question-hint">
              Add a blank in the question to get its answer row.
            </p>
          )}
          {question.blanks.map((blank) => (
            <label className="live-edit-field" key={blank.id}>
              Accepted answers for {blank.id}
              <input
                value={blank.acceptsText}
                placeholder="Nile~the Nile~nile"
                onChange={(event) => patchBlank(blank.id, event.target.value)}
                disabled={disabled}
              />
            </label>
          ))}
          {question.blanks.length > 0 && (
            <p className="live-question-hint">
              Separate the wordings a student may use with ~. Spelling and case are ignored.
            </p>
          )}
        </div>
      )}

      {kind === "numeric" && (
        <div className="live-question-grid">
          <label className="live-edit-field">
            Answer rule
            <select
              value={rule.mode || "exact"}
              onChange={(event) =>
                onChange(patchLiveNumericRule(question, { mode: event.target.value }))
              }
              disabled={disabled}
            >
              {liveNumericModes.map((mode) => (
                <option key={mode} value={mode}>
                  {NUMERIC_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          {rule.mode === "range" ? (
            <>
              <label className="live-edit-field">
                Lowest value
                <input
                  value={rule.min || ""}
                  onChange={(event) =>
                    onChange(patchLiveNumericRule(question, { min: event.target.value }))
                  }
                  disabled={disabled}
                />
              </label>
              <label className="live-edit-field">
                Highest value
                <input
                  value={rule.max || ""}
                  onChange={(event) =>
                    onChange(patchLiveNumericRule(question, { max: event.target.value }))
                  }
                  disabled={disabled}
                />
              </label>
            </>
          ) : (
            <>
              <label className="live-edit-field">
                Accepted value
                <input
                  value={rule.value || ""}
                  onChange={(event) =>
                    onChange(patchLiveNumericRule(question, { value: event.target.value }))
                  }
                  disabled={disabled}
                />
              </label>
              <label className="live-edit-field">
                {rule.mode === "relative" ? "Percentage allowed" : "Tolerance allowed"}
                <input
                  value={rule.tolerance || ""}
                  onChange={(event) =>
                    onChange(patchLiveNumericRule(question, { tolerance: event.target.value }))
                  }
                  disabled={disabled}
                />
              </label>
            </>
          )}
          <label className="live-edit-field">
            Unit
            <input
              value={rule.unit || ""}
              placeholder="cm"
              onChange={(event) =>
                onChange(patchLiveNumericRule(question, { unit: event.target.value }))
              }
              disabled={disabled}
            />
          </label>
          <label className="live-edit-field">
            Decimal places
            <input
              value={rule.decimalPlaces || ""}
              placeholder="any"
              onChange={(event) =>
                onChange(
                  patchLiveNumericRule(question, { decimalPlaces: event.target.value }),
                )
              }
              disabled={disabled}
            />
          </label>
          <div className="live-question-checks">
            <label className="live-question-check">
              <input
                type="checkbox"
                checked={rule.allowFractions === true}
                onChange={(event) =>
                  onChange(
                    patchLiveNumericRule(question, {
                      allowFractions: event.target.checked,
                    }),
                  )
                }
                disabled={disabled}
              />
              <span>Fractions are allowed</span>
            </label>
            <label className="live-question-check">
              <input
                type="checkbox"
                checked={rule.allowPercent === true}
                onChange={(event) =>
                  onChange(
                    patchLiveNumericRule(question, {
                      allowPercent: event.target.checked,
                    }),
                  )
                }
                disabled={disabled}
              />
              <span>A percent sign is allowed</span>
            </label>
          </div>
        </div>
      )}

      {kind === "text" && (
        <>
          <label className="live-edit-field">
            Guidance shown to students
            <textarea
              rows={2}
              value={question.guidance}
              placeholder="Two sentences, in your own words."
              onChange={(event) => patch({ guidance: event.target.value })}
              disabled={disabled}
            />
          </label>
          <label className="live-edit-field">
            What makes the answer correct
            <textarea
              rows={2}
              value={question.criteria}
              placeholder="Names both techniques and the difference between them."
              onChange={(event) => patch({ criteria: event.target.value })}
              disabled={disabled}
            />
          </label>
          <div className="live-question-grid">
            <label className="live-edit-field">
              Minimum words
              <input
                type="number"
                min={0}
                max={2000}
                value={question.minWords || ""}
                onChange={(event) =>
                  patch({ minWords: Number(event.target.value) || 0 })
                }
                disabled={disabled}
              />
            </label>
            <label className="live-edit-field">
              Maximum words
              <input
                type="number"
                min={0}
                max={2000}
                value={question.maxWords || ""}
                onChange={(event) =>
                  patch({ maxWords: Number(event.target.value) || 0 })
                }
                disabled={disabled}
              />
            </label>
          </div>
          <p className="live-question-hint">
            Written answers are graded by you in the review page, never automatically.
          </p>
        </>
      )}

      <label className="live-edit-field">
        Explanation
        <textarea
          rows={2}
          value={question.explanation}
          onChange={(event) => patch({ explanation: event.target.value })}
          disabled={disabled}
        />
      </label>
    </div>
  );
};

export default LiveQuestionEditor;
