import { useTranslation } from "react-i18next";
import { HiOutlineExclamation } from "react-icons/hi";
import { formatPasteTime } from "../../../student/writing/WritingWorkspacePage/pasteGuard.js";

/** Blocked paste attempts for one student, shown before any AI analysis. */
export default function PasteAttempts({ history }) {
  const { t, i18n } = useTranslation(["writing"]);
  const attempts = history?.project?.pasteAttempts || [];
  if (attempts.length === 0) return null;

  const submitted = Number(history.project.draftCount) || 0;
  const sections = history.assignment?.sections || [];
  const labelFor = (row) => {
    if (row.key === "title") return t("writing:student.pieceTitle");
    if (row.key === "page") return t("writing:teacher.paste.elsewhere");
    const definition = sections.find((item) => item.key === row.key);
    if (!definition) return row.key;
    return definition.repeatable
      ? `${definition.label} ${Number(row.index) + 1}`
      : definition.label;
  };

  return (
    <section className="wa-paste-flag" role="alert">
      <h4>
        <HiOutlineExclamation size={18} aria-hidden="true" />
        {t("writing:teacher.paste.title", { count: attempts.length })}
      </h4>
      <p className="wa-hint">{t("writing:teacher.paste.hint")}</p>
      <ul>
        {attempts.map((row) => (
          <li key={`${row.at}-${row.key}-${row.index}`}>
            <strong>{formatPasteTime(row.at, i18n.language)}</strong>
            {" · "}
            {t("writing:teacher.paste.draftN", { n: row.draftNumber })}
            {row.draftNumber > submitted && (
              <> ({t("writing:teacher.paste.notSubmitted")})</>
            )}
            {" · "}
            {labelFor(row)}
            {" · "}
            {t("writing:teacher.paste.chars", { n: row.chars })}
            {row.text ? (
              <blockquote>{row.text}</blockquote>
            ) : (
              <em>{t("writing:teacher.paste.noText")}</em>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
