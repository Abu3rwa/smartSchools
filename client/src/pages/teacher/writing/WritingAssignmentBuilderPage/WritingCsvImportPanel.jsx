import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineDownload, HiOutlineUpload, HiOutlineX } from "react-icons/hi";
import { buildWritingCsvTemplate, formPatchFromCsv, parseWritingCsv } from "./writingCsvImport.js";

const RULE_KEYS = ["rule1", "rule2", "rule3", "rule4", "rule5", "rule6", "rule7"];

export default function WritingCsvImportPanel({ onApplied }) {
  const { t } = useTranslation(["writing"]);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setFileName("");
    setParsed(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const blob = new Blob([buildWritingCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "writing-task-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    setParsed(null);
    setError("");
    setFileName(file?.name || "");
    if (!file) return;
    try {
      setParsed(parseWritingCsv(await file.text()));
    } catch (parseError) {
      setError(parseError.message || t("writing:teacher.builder.csv.failed"));
    }
  };

  const apply = () => {
    if (!parsed) return;
    onApplied(formPatchFromCsv(parsed));
    close();
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-sm wa-csv-open" onClick={() => setOpen(true)}>
        <HiOutlineUpload size={16} aria-hidden="true" />
        {t("writing:teacher.builder.csv.open")}
      </button>
    );
  }

  return (
    <section className="wa-card wa-csv" aria-labelledby="wa-csv-title">
      <div className="wa-card-head">
        <div>
          <h3 id="wa-csv-title">{t("writing:teacher.builder.csv.title")}</h3>
          <p className="wa-card-sub">{t("writing:teacher.builder.csv.subtitle")}</p>
        </div>
        <button type="button" className="wa-icon-btn" onClick={close} aria-label={t("writing:teacher.builder.csv.close")}>
          <HiOutlineX size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="wa-card-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={downloadTemplate}>
          <HiOutlineDownload size={16} aria-hidden="true" />
          {t("writing:teacher.builder.csv.download")}
        </button>
        <label className="btn btn-secondary btn-sm wa-csv-choose">
          <HiOutlineUpload size={16} aria-hidden="true" />
          {t("writing:teacher.builder.csv.choose")}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            aria-label={t("writing:teacher.builder.csv.chooseAria")}
          />
        </label>
        {fileName && <span className="wa-csv-file">{fileName}</span>}
      </div>

      {error && <p className="wa-error" role="alert">{error}</p>}

      {parsed && (
        <div className="wa-csv-preview">
          <strong>{parsed.title}</strong>
          <span>{t(`writing:teacher.types.${parsed.writingType}`)}</span>
          <span>{t("writing:teacher.builder.csv.sections", { n: parsed.sections.length })}</span>
          <span>{t("writing:teacher.builder.csv.marks", {
            n: parsed.rubric.length,
            points: parsed.rubric.reduce((sum, row) => sum + row.maxScore, 0),
          })}</span>
          <span>{parsed.minWords || parsed.maxWords
            ? t("writing:teacher.builder.csv.length", {
              min: parsed.minWords || 0,
              max: parsed.maxWords || t("writing:teacher.builder.previewNoMax"),
            })
            : t("writing:teacher.builder.csv.noLength")}</span>
          <span>{t("writing:teacher.builder.csv.drafts", { n: parsed.workflow.maxDrafts })}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
            {t("writing:teacher.builder.csv.apply")}
          </button>
        </div>
      )}

      <div className="wa-csv-help">
        <p className="wa-hint">{t("writing:teacher.builder.csv.help")}</p>
        <ul className="wa-csv-rules">
          {RULE_KEYS.map((rule) => (
            <li key={rule}>{t(`writing:teacher.builder.csv.${rule}`)}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
