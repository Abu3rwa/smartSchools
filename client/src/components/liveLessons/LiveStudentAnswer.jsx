import { useState } from "react";
import { isLiveWrittenKind } from "../../constants/liveLessonQuestionKinds.js";
import FillInBlankAnswerInput from "../assessment/FillInBlankAnswerInput.jsx";
import MatchingAnswerInput from "../assessment/MatchingAnswerInput.jsx";
import MultipleSelectAnswerInput from "../assessment/MultipleSelectAnswerInput.jsx";
import NumericAnswerInput from "../assessment/NumericAnswerInput.jsx";
import OrderingAnswerInput from "../assessment/OrderingAnswerInput.jsx";
import {
  buildLiveAnswerPayload,
  countLiveAnswerWords,
  describeLiveStudentAnswer,
  isLiveAnswerReady,
  liveAnswerDraft,
  liveAnswerQuestion
} from "../../utils/liveLessonStudentAnswer.js";
import "./LiveStudentAnswer.css";

/**
 * One card, one input per answer kind. The choices keep the live lesson's own tap-to-answer buttons,
 * because a single click is the whole answer there; every other kind builds up a response and hands
 * it over deliberately. Once the answer is in, the student reads back what they gave, since the
 * session locks it until the teacher reveals the results.
 */
const LiveStudentAnswer = ({ question, answer = null, canAnswer = false, submitting = false, onSubmit }) => {
  const [draft, setDraft] = useState(() => liveAnswerDraft(question, answer));
  const presented = liveAnswerQuestion(question);
  // The presented question carries the resolved kind, so a lesson written before kinds existed
  // still renders its option buttons instead of an empty card.
  const kind = presented.kind;
  const answered = Boolean(answer);
  const locked = !canAnswer || submitting;
  const sent = answered ? describeLiveStudentAnswer(question, answer) : "";
  const words = countLiveAnswerWords(draft);

  const submit = () => {
    if (!isLiveAnswerReady(question, draft)) return;
    onSubmit(buildLiveAnswerPayload(question, draft));
  };

  if (kind === "mcq" || kind === "tf") {
    const chosen = answered ? liveAnswerDraft(question, answer) : draft;
    return (
      <div className="live-answer-options">
        {presented.options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`live-answer-option ${option.id === chosen ? "selected" : ""}`}
            disabled={!canAnswer || submitting}
            onClick={() => {
              setDraft(option.id);
              onSubmit({ selectedOptionId: option.id });
            }}
          >
            <span>{option.label}</span>
            {option.text}
          </button>
        ))}
      </div>
    );
  }

  const input = {
    multi_select: (
      <MultipleSelectAnswerInput question={presented} value={draft} onChange={setDraft} />
    ),
    matching: (
      <MatchingAnswerInput question={presented} value={draft} onChange={setDraft} />
    ),
    ordering: (
      <OrderingAnswerInput question={presented} value={draft} onChange={setDraft} />
    ),
    fill_in_blank: (
      <FillInBlankAnswerInput question={presented} value={draft} onChange={setDraft} />
    ),
    numeric: (
      <NumericAnswerInput question={presented} value={String(draft ?? "")} onChange={setDraft} />
    )
  }[kind];

  return (
    <div className="live-answer-kind">
      {question.guidance && <p className="live-answer-guidance">{question.guidance}</p>}
      {answered ? (
        <>
          <p className="live-answer-given">{sent}</p>
          {isLiveWrittenKind(kind) && (
            <p className="live-answer-count">
              Your teacher reads written answers after the lesson.
            </p>
          )}
        </>
      ) : (
        <>
          {isLiveWrittenKind(kind) ? (
            <fieldset className="live-answer-body" disabled={locked}>
              <textarea
                className="live-answer-written"
                dir="auto"
                rows={5}
                maxLength={4000}
                value={draft}
                placeholder="Write your answer here."
                onChange={(event) => setDraft(event.target.value)}
              />
              <p className="live-answer-count">
                {words} {words === 1 ? "word" : "words"}
                {question.minWords ? ` · write at least ${question.minWords}` : ""}
                {question.maxWords ? ` · no more than ${question.maxWords}` : ""}
              </p>
            </fieldset>
          ) : (
            // A disabled fieldset is the only way to still these shared inputs: they serve the
            // practice flows, where the student always answers, so they take no disabled prop.
            <fieldset className="live-answer-body" disabled={locked}>
              {input || (
                <p className="live-answer-given">
                  This question is not open for answers yet.
                </p>
              )}
            </fieldset>
          )}
          <button
            type="button"
            className="live-answer-submit"
            disabled={!canAnswer || submitting || !isLiveAnswerReady(question, draft)}
            onClick={submit}
          >
            {submitting ? "Submitting…" : "Submit answer"}
          </button>
        </>
      )}
    </div>
  );
};

export default LiveStudentAnswer;
