import { useEffect, useMemo, useState } from "react";
import api from "../../config/api";
import {
  applyMarkDrafts,
  buildMarkPayload,
  clearMarkDrafts,
  draftOutcome,
  groupMarkAnswers,
  liveMarkStateLabel,
  liveQuestionKindLabel,
  markSheetSaved,
  markSheetSummary,
  mergeMarkSheet,
  pendingMarkCount,
} from "../../utils/liveLessonMarkSheet";
import "./LiveSessionMarkSheet.css";

/**
 * The mark sheet for a live session: one card per question, every level of that question together,
 * saved with one button. A written answer has no key, so this is the only thing that turns it into a
 * mark, and sharing is the only thing that lets the class read it.
 *
 * Suggestions are offered only when the school has them switched on, and only ever fill the rows: a
 * mark becomes real when the teacher saves it, never when it is suggested.
 */
const LiveSessionMarkSheet = ({ sessionId, questions, onSaved }) => {
  const markable = useMemo(
    () => (questions || []).filter((question) => (question.answers || []).length),
    [questions],
  );
  // An admin switches suggestions on for the whole school, so the sheet asks once and remembers.
  const [draftingEnabled, setDraftingEnabled] = useState(false);
  const [sheets, setSheets] = useState({});
  const [saving, setSaving] = useState("");
  const [drafting, setDrafting] = useState("");
  const [notes, setNotes] = useState({});
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState({});

  useEffect(() => {
    let active = true;
    api.get("/live/settings")
      .then((response) => {
        if (active) setDraftingEnabled(response.data?.data?.aiMarkDraftEnabled === true);
      })
      .catch(() => {
        // A setting that cannot be read reads as off: the mark sheet works, it just has no button.
        if (active) setDraftingEnabled(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSheets((current) => {
      let next = current;
      for (const question of markable) {
        const merged = mergeMarkSheet(current[question.slideId], question);
        const previous = current[question.slideId];
        if (previous && Object.keys(merged.rows).length === Object.keys(previous.rows).length) continue;
        if (next === current) next = { ...current };
        next[question.slideId] = merged;
      }
      return next;
    });
  }, [markable]);

  const updateRow = (slideId, studentId, patch) => {
    setSheets((current) => {
      const sheet = current[slideId];
      if (!sheet) return current;
      return {
        ...current,
        [slideId]: {
          ...sheet,
          rows: { ...sheet.rows, [studentId]: { ...sheet.rows[studentId], ...patch } },
        },
      };
    });
  };

  const updateAllocation = (slideId, value) => {
    setSheets((current) => ({
      ...current,
      [slideId]: { ...current[slideId], maxMarks: value },
    }));
  };

  const saveQuestion = async (question) => {
    const sheet = sheets[question.slideId];
    if (!sheet || saving) return;
    setSaving(question.slideId);
    setErrors((current) => ({ ...current, [question.slideId]: "" }));
    setSaved((current) => ({ ...current, [question.slideId]: "" }));
    setNotes((current) => ({ ...current, [question.slideId]: "" }));
    try {
      const response = await api.patch(`/live/sessions/${sessionId}/marks`, buildMarkPayload(question, sheet));
      const result = response.data?.data || {};
      // Saving is the approval: the rows now hold the teacher's own marks, not suggestions.
      setSheets((current) => ({
        ...current,
        [question.slideId]: markSheetSaved(current[question.slideId]),
      }));
      setSaved((current) => ({
        ...current,
        [question.slideId]: `${result.marked || 0} marked · ${result.released || 0} shared with the class`,
      }));
      await onSaved?.();
    } catch (requestError) {
      setErrors((current) => ({
        ...current,
        [question.slideId]: requestError.response?.data?.message
          || "Could not save these marks. Check the values and try again.",
      }));
    } finally {
      setSaving("");
    }
  };

  /**
   * Ask for a first mark on every answer this question is waiting for. The request can fail in three
   * ordinary ways - switched off, out of allowance, or nothing available - and each one leaves the
   * sheet exactly as it was, so the teacher can always fall back to marking by hand.
   */
  const draftQuestion = async (question) => {
    const sheet = sheets[question.slideId];
    if (!sheet || drafting) return;
    setDrafting(question.slideId);
    setNotes((current) => ({ ...current, [question.slideId]: "" }));
    setErrors((current) => ({ ...current, [question.slideId]: "" }));
    try {
      const response = await api.post(`/live/sessions/${sessionId}/marks/draft`, {
        slideId: question.slideId,
        maxMarks: Number(sheet.maxMarks) || undefined,
      });
      const result = response.data?.data || {};
      const waiting = pendingMarkCount(question);
      const { applied } = applyMarkDrafts(sheet, question, result);
      // Applied against the newest sheet, so an answer typed while the request was running survives.
      setSheets((current) => ({
        ...current,
        [question.slideId]: applyMarkDrafts(current[question.slideId], question, result).sheet,
      }));
      setNotes((current) => ({
        ...current,
        [question.slideId]: draftOutcome(result, { waiting, applied }),
      }));
    } catch (requestError) {
      const waiting = pendingMarkCount(question);
      // The monthly allowance answers with a 429 before the request ever reaches the drafter.
      if (requestError.response?.status === 429) {
        setNotes((current) => ({
          ...current,
          [question.slideId]: draftOutcome({ unavailable: true, reason: "credit_limit" }, { waiting, applied: 0 }),
        }));
      } else {
        setErrors((current) => ({
          ...current,
          [question.slideId]: requestError.response?.data?.message
            || "Suggestions could not be reached. Your mark sheet is unchanged.",
        }));
      }
    } finally {
      setDrafting("");
    }
  };

  const clearSuggestions = (question) => {
    setSheets((current) => ({
      ...current,
      [question.slideId]: clearMarkDrafts(current[question.slideId], question),
    }));
    setNotes((current) => ({ ...current, [question.slideId]: "" }));
  };

  if (!markable.length) return null;

  return (
    <div className="live-mark-sheets">
      {markable.map((question, index) => {
        const sheet = sheets[question.slideId];
        if (!sheet) return null;
        const summary = markSheetSummary(question, sheet);
        const groups = groupMarkAnswers(question);
        const showLevels = groups.length > 1;
        return (
          <article className="live-mark-card" key={question.slideId}>
            <header className="live-mark-card-heading">
              <div>
                <span className="live-mark-kicker">Question {index + 1}</span>
                <h3>{question.title || liveQuestionKindLabel(question.kind)}</h3>
                <p className="live-mark-prompt">{question.prompt}</p>
              </div>
              <div className="live-mark-card-counts">
                <span className={summary.toMark ? "live-mark-queue" : "live-mark-clear"}>
                  {summary.toMark ? `${summary.toMark} to mark` : "All marked"}
                </span>
                <label className="live-mark-allocation">
                  <span>Marked out of</span>
                  <input
                    type="number"
                    min="0.25"
                    max="100"
                    step="0.25"
                    value={sheet.maxMarks}
                    onChange={(event) => updateAllocation(question.slideId, event.target.value)}
                    aria-label={`Marks available for question ${index + 1}`}
                  />
                </label>
              </div>
            </header>
            {question.key && !showLevels && (
              <p className="live-mark-key"><strong>Answer key</strong><span>{question.key}</span></p>
            )}
            {groups.map((group) => (
              <section className="live-mark-group" key={group.level}>
                {showLevels && (
                  <div className="live-mark-group-heading">
                    <h4>{group.level}</h4>
                    {group.question.key && <span>{group.question.key}</span>}
                  </div>
                )}
                <div className="live-mark-table">
                  <div className="live-mark-row live-mark-row-head">
                    <span>Student</span><span>Answer</span><span>Result</span>
                    <span>Mark</span><span>Feedback</span><span>Share</span>
                  </div>
                  {group.answers.map((answer) => {
                    const row = sheet.rows[answer.studentId] || { marks: '', feedback: '', released: false };
                    return (
                      <div className="live-mark-row" key={answer.studentId}>
                        <div className="live-mark-student">
                          <strong>{answer.name}</strong>
                          {answer.latencyMs != null && <small>{(answer.latencyMs / 1000).toFixed(1)}s</small>}
                        </div>
                        <div className="live-mark-answer">
                          <span>{answer.answerText || "No answer recorded"}</span>
                          <small>{liveQuestionKindLabel(answer.kind)}</small>
                        </div>
                        <span className={`live-mark-state ${answer.state}`}>{liveMarkStateLabel(answer.state)}</span>
                        <div className="live-mark-mark">
                          <input
                            className="live-mark-input"
                            type="number"
                            min="0"
                            max={Number(sheet.maxMarks) || undefined}
                            step="0.25"
                            value={row.marks}
                            placeholder="—"
                            onChange={(event) => updateRow(question.slideId, answer.studentId, { marks: event.target.value, suggested: false })}
                            aria-label={`Mark for ${answer.name} on question ${index + 1}`}
                          />
                          {row.suggested && (
                            <small className={row.confidence === "low" ? "live-mark-suggestion shaky" : "live-mark-suggestion"}>
                              {row.confidence === "low" ? "Suggested · needs a look" : "Suggested"}
                            </small>
                          )}
                        </div>
                        <input
                          className="live-mark-feedback"
                          type="text"
                          value={row.feedback}
                          maxLength={2000}
                          placeholder="Comment for the student"
                          onChange={(event) => updateRow(question.slideId, answer.studentId, { feedback: event.target.value, suggested: false })}
                          aria-label={`Feedback for ${answer.name} on question ${index + 1}`}
                        />
                        <input
                          className="live-mark-release"
                          type="checkbox"
                          checked={row.released && row.marks !== ''}
                          disabled={row.marks === ''}
                          onChange={(event) => updateRow(question.slideId, answer.studentId, { released: event.target.checked })}
                          aria-label={`Share ${answer.name}'s mark and feedback on question ${index + 1}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            <footer className="live-mark-card-footer">
              <span>
                {summary.marked} of {summary.total} marked
                {summary.released ? ` · ${summary.released} shared` : ""}
                {summary.suggested ? ` · ${summary.suggested} awaiting your approval` : ""}
              </span>
              <div className="live-mark-card-actions">
                {(errors[question.slideId] || summary.error) && (
                  <p className="live-mark-error" role="alert">{errors[question.slideId] || summary.error}</p>
                )}
                {notes[question.slideId] && !saving && (
                  <p className={`live-mark-note ${notes[question.slideId].kind}`} role="status">
                    {notes[question.slideId].message}
                  </p>
                )}
                {saved[question.slideId] && !saving && <p className="live-mark-saved">{saved[question.slideId]}</p>}
                {draftingEnabled && pendingMarkCount(question) > 0 && (
                  <div className="live-mark-draft-actions">
                    <button
                      className="live-session-secondary"
                      onClick={() => draftQuestion(question)}
                      disabled={Boolean(drafting) || Boolean(saving)}
                    >
                      {drafting === question.slideId ? "Drafting…" : `Draft marks for approval (${pendingMarkCount(question)})`}
                    </button>
                    {summary.suggested > 0 && (
                      <button className="live-mark-clear-button" onClick={() => clearSuggestions(question)}>
                        Clear suggestions
                      </button>
                    )}
                  </div>
                )}
                <button
                  className="live-session-primary"
                  onClick={() => saveQuestion(question)}
                  disabled={saving === question.slideId || summary.invalid}
                >
                  {saving === question.slideId ? "Saving…" : "Save marks for this question"}
                </button>
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
};

export default LiveSessionMarkSheet;
