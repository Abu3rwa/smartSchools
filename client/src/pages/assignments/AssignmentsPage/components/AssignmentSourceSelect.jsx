import { useTranslation } from "react-i18next";
import { HiOutlineDocumentText } from "react-icons/hi";

/**
 * The one place the AI drafters point at a source. Uploading happens once, in
 * the Drive attachments editor; this only chooses which uploaded file to read.
 */
const AssignmentSourceSelect = ({
  options = [],
  value = "",
  onChange,
  disabled = false,
  compact = false,
  onRequestSource,
}) => {
  const { t } = useTranslation(["assignments"]);

  if (options.length === 0) {
    return (
      <div className="assignment-source">
        <p className="question-drafter__hint">
          {t("assignments:source.none")}
        </p>
        {onRequestSource && (
          <button
            type="button"
            className="question-drafter__link"
            onClick={onRequestSource}
            disabled={disabled}
          >
            {t("assignments:source.addSource")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="assignment-source">
      <label className="assignment-source__field">
        {!compact && <span>{t("assignments:source.label")}</span>}
        <select
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          disabled={disabled}
          aria-label={t("assignments:source.label")}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="question-drafter__hint">
        <HiOutlineDocumentText aria-hidden="true" />
        {t("assignments:source.help")}
      </p>
    </div>
  );
};

export default AssignmentSourceSelect;
