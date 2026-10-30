import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "./SurveyForm.css";

const pick = (en, ar, isArabic) => (isArabic ? ar || en : en || ar);

const answerToState = (answer = {}) => ({
  scaleValue: answer.scaleValue ?? null,
  choiceIndex: Number.isInteger(answer.choiceIndex) ? answer.choiceIndex : null,
  textValue: answer.textValue || "",
});

const formFromSurvey = (survey) => {
  const initial = {};
  for (const question of survey?.questions || []) {
    const existing = (survey.answers || []).find((answer) => answer.questionId === question.id);
    initial[question.id] = answerToState(existing);
  }
  return initial;
};

const SurveyForm = ({ survey, onSubmit, onSave, submitting = false, saving = false, readOnly = false }) => {
  const { t, i18n } = useTranslation("support");
  const isArabic = String(i18n.language || "").startsWith("ar");
  const [answers, setAnswers] = useState(() => formFromSurvey(survey));
  const [error, setError] = useState("");
  const submitted = survey?.status === "submitted" || readOnly;

  const questions = useMemo(() => survey?.questions || [], [survey]);
  const answeredCount = useMemo(
    () => questions.filter((question) => {
      const value = answers[question.id] || {};
      return value.scaleValue != null
        || Number.isInteger(value.choiceIndex)
        || String(value.textValue || "").trim() !== "";
    }).length,
    [answers, questions],
  );

  const update = (questionId, patch) => {
    setError("");
    setAnswers((current) => ({
      ...current,
      [questionId]: { ...current[questionId], ...patch },
    }));
  };

  const payload = () => questions.map((question) => ({
    questionId: question.id,
    ...answers[question.id],
  })).filter((answer) => (
    answer.scaleValue != null
    || Number.isInteger(answer.choiceIndex)
    || String(answer.textValue || "").trim() !== ""
  ));

  const handleSubmit = () => {
    const missing = questions.filter((question) => (
      question.required
      && (answers[question.id]?.scaleValue == null
        && !Number.isInteger(answers[question.id]?.choiceIndex)
        && !String(answers[question.id]?.textValue || "").trim())
    ));
    if (missing.length > 0) {
      setError(t("survey.requiredHint"));
      return;
    }
    onSubmit?.(payload());
  };

  return (
    <div className={`support-survey ${isArabic ? "is-rtl" : ""}`} dir={isArabic ? "rtl" : "ltr"}>
      <div className="support-survey-progress" aria-hidden="true">
        <span style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
      </div>
      <p className="support-survey-progress-label">
        {t("survey.progress", { answered: answeredCount, total: questions.length })}
      </p>

      <ol className="support-survey-questions">
        {questions.map((question, index) => {
          const value = answers[question.id] || {};
          const options = isArabic ? (question.optionsAr?.length ? question.optionsAr : question.options) : question.options;
          const anchors = isArabic ? (question.anchorsAr?.length ? question.anchorsAr : question.anchors) : question.anchors;
          return (
            <li key={question.id} className="support-question">
              <div className="support-question-head">
                <span className="support-question-number">{index + 1}</span>
                <p>{pick(question.prompt, question.promptAr, isArabic)}</p>
                {!question.required && <span className="support-question-optional">{t("survey.optional")}</span>}
              </div>

              {question.kind === "scale" && (
                <div className="support-scale" role="group" aria-label={pick(question.prompt, question.promptAr, isArabic)}>
                  {Array.from({ length: question.scaleMax || 4 }, (_, idx) => idx + 1).map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      className={`support-scale-option ${Number(value.scaleValue) === scale ? "is-selected" : ""}`}
                      aria-pressed={Number(value.scaleValue) === scale}
                      disabled={submitted}
                      onClick={() => update(question.id, { scaleValue: scale })}
                    >
                      <span className="support-scale-dot" aria-hidden="true">{scale}</span>
                      <span className="support-scale-label">{anchors?.[scale - 1] || scale}</span>
                    </button>
                  ))}
                </div>
              )}

              {question.kind === "choice" && (
                <div className="support-choices" role="radiogroup" aria-label={pick(question.prompt, question.promptAr, isArabic)}>
                  {(options || []).map((option, idx) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={Number(value.choiceIndex) === idx}
                      className={`support-choice ${Number(value.choiceIndex) === idx ? "is-selected" : ""}`}
                      disabled={submitted}
                      onClick={() => update(question.id, { choiceIndex: idx })}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {question.kind === "text" && (
                <textarea
                  className="support-textarea"
                  rows={4}
                  maxLength={1000}
                  value={value.textValue || ""}
                  disabled={submitted}
                  placeholder={t("survey.optionalPlaceholder")}
                  onChange={(event) => update(question.id, { textValue: event.target.value })}
                />
              )}
            </li>
          );
        })}
      </ol>

      {error && <p className="support-survey-error" role="alert">{error}</p>}

      {!submitted ? (
        <div className="support-survey-actions">
          {onSave && (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => onSave(payload())}>
              {saving ? t("survey.saving") : t("survey.saveForNow")}
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? t("survey.submitting") : t("survey.submit")}
          </button>
        </div>
      ) : (
        <div className="support-survey-done">
          <strong>{t("survey.thankYouTitle")}</strong>
          <p>{t("survey.thankYouBody")}</p>
        </div>
      )}
    </div>
  );
};

export default SurveyForm;
