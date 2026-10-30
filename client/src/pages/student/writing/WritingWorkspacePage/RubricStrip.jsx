import { useTranslation } from "react-i18next";
import { rubricRows } from "../../../../utils/writingRubric.js";

/**
 * Where the draft stands on each class criterion: a word, five dots and one
 * quote from the student's own writing. Points stay with the teacher.
 */
export default function RubricStrip({ scores }) {
  const { t, i18n } = useTranslation(["writing"]);
  const rows = rubricRows(scores);
  if (rows.length === 0) return null;

  const quote = (text) => (i18n.language === "ar" ? `«${text}»` : `“${text}”`);

  return (
    <div className="ws-rubric">
      {rows.map((row) => (
        <div className={`ws-rubric-row is-${row.level}`} key={row.key}>
          <h4>{row.label}</h4>
          <span className="ws-rubric-verdict">{t(`writing:student.rubricLevel.${row.level}`)}</span>
          <span className="ws-rubric-dots" aria-hidden="true">
            {Array.from({ length: row.dots }, (_, index) => (
              <i className={index < row.filled ? "is-on" : ""} key={index} />
            ))}
          </span>
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