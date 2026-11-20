import { useTranslation } from "react-i18next";
import {
  marksModeOf,
  marksShowsNumbers,
  rubricRows,
} from "../../../../utils/writingRubric.js";

/**
 * Where the draft stands on each class criterion: a word, five dots and one
 * quote from the student's own writing. Points stay with the teacher unless the
 * school has asked for numbers to be shown (C4).
 */
export default function RubricStrip({ scores, marks = "words" }) {
  const { t, i18n } = useTranslation(["writing"]);
  const mode = marksModeOf(marks);
  const rows = rubricRows(scores, { marks: mode });
  if (rows.length === 0) return null;

  const quote = (text) => (i18n.language === "ar" ? `«${text}»` : `“${text}”`);

  return (
    <div className="ws-rubric">
      {rows.map((row) => (
        <div className={`ws-rubric-row is-${row.level}`} key={row.key}>
          <h4>{row.label}</h4>
          <span className="ws-rubric-verdict">
            {mode !== "numbers" && t(`writing:student.rubricLevel.${row.level}`)}
            {marksShowsNumbers(mode) && (
              <span className="ws-rubric-score" dir="ltr">
                {row.score}/{row.maxScore}
              </span>
            )}
          </span>
          {mode !== "numbers" && (
            <span className="ws-rubric-dots" aria-hidden="true">
              {Array.from({ length: row.dots }, (_, index) => (
                <i className={index < row.filled ? "is-on" : ""} key={index} />
              ))}
            </span>
          )}
          {(row.evidence || row.explanation) && (
            <p className="ws-rubric-quote">
              {row.evidence ? quote(row.evidence) : row.explanation}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
