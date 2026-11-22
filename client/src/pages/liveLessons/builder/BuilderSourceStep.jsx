import { useId, useRef, useState } from "react";
import {
  HiOutlineArrowUpTray,
  HiOutlineCheck,
  HiOutlineClipboard,
  HiOutlineDocumentText,
  HiOutlineMinus,
  HiOutlinePlus,
  HiOutlineSparkles,
  HiOutlineXMark,
} from "react-icons/hi2";
import {
  BUILDER_LIMITS,
  GRADE_OPTIONS,
  LEVEL_OPTIONS,
  QUESTION_KIND_OPTIONS,
  costCredits,
  fileSizeLabel,
  fileTypeInfo,
  formatNumber,
} from "./liveLessonBuilderForm.js";
import { sourceChips } from "../liveLessonSourceChip.js";

const BuilderSourceStep = ({
  draft,
  setup,
  onSetupChange,
  pastedText,
  onPastedTextChange,
  pendingFiles,
  onFilesPicked,
  onRemoveServerFile,
  onRemovePendingFile,
  onSuggestTitle,
  suggestingTitle,
  titleSuggested,
  titleSuggestionError,
  stats,
  quote,
  locked,
  subjects = [],
  palettes = [],
  t,
  locale,
}) => {
  const [mode, setMode] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const titleId = useId();
  const pasteId = useId();
  const paletteLabelId = useId();
  const modeLabelId = useId();
  const gradeOptions = GRADE_OPTIONS.includes(setup.grade) || !setup.grade
    ? GRADE_OPTIONS
    : [setup.grade, ...GRADE_OPTIONS];
  const serverFiles = draft?.setup?.files || [];
  const chips = sourceChips(draft?.setup, t, locale);
  const planCost = quote?.plan?.chargedCents;
  const subjectNames = [...new Set(
    (subjects || []).map((subject) => subject?.name).filter(Boolean),
  )];
  const subjectChoices = subjectNames.includes(setup.subjectText) || !setup.subjectText
    ? subjectNames
    : [setup.subjectText, ...subjectNames];

  const setCount = (key, delta, min, max) => {
    const value = Math.min(max, Math.max(min, Number(setup[key] || 0) + delta));
    onSetupChange({ [key]: value });
  };

  const toggleKind = (kind) => {
    const selected = setup.questionKinds || [];
    if (selected.includes(kind)) {
      if (selected.length === 1) return;
      onSetupChange({ questionKinds: selected.filter((row) => row !== kind) });
      return;
    }
    onSetupChange({ questionKinds: [...selected, kind] });
  };

  const takeFiles = (fileList) => {
    if (!fileList?.length) return;
    onFilesPicked(Array.from(fileList));
  };

  return (
    <section className="llb-screen" aria-label={t("steps.source.label")}>
      <div className="llb-screen-heading">
        <div>
          <h2>{t("source.heading")}</h2>
          <p>{t("source.copy")}</p>
        </div>
        <div className="llb-heading-aside">
          <span className="llb-soft-chip">
            <strong>{formatNumber(stats.files, locale)}</strong>
            {t("source.filesSuffix")}
          </span>
          <span className="llb-soft-chip">
            <strong>{formatNumber(stats.characters, locale)}</strong>
            {t("source.charsSuffix")}
          </span>
          {chips.map((chip, index) => (
            <span
              className="llb-soft-chip llb-source-chip"
              key={`${index}:${chip}`}
              title={chip}
            >
              <span className="llb-source-chip-text">{chip}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="llb-source-layout">
        <div className="llb-panel">
          <div className="llb-panel-header">
            <div>
              <h3>{t("source.panelTitle")}</h3>
              <p>{t("source.panelCopy")}</p>
            </div>
          </div>
          <div className="llb-source-body">
            <div className="llb-field-label-row">
              <label className="llb-field-label" htmlFor={titleId}>
                {t("source.titleLabel")}
              </label>
              <button
                type="button"
                className="llb-suggest-link"
                onClick={onSuggestTitle}
                disabled={
                  locked ||
                  suggestingTitle ||
                  !(stats.files || pastedText.trim() || draft?.setup?.hasSource)
                }
              >
                <HiOutlineSparkles className="llb-ic-sm" aria-hidden="true" />
                {suggestingTitle ? t("source.suggesting") : t("source.suggest")}
              </button>
            </div>
            <input
              id={titleId}
              className="llb-input"
              dir="auto"
              value={setup.title}
              maxLength={BUILDER_LIMITS.titleMax}
              disabled={locked}
              placeholder={t("source.titlePlaceholder")}
              onChange={(event) => onSetupChange({ title: event.target.value })}
            />
            {titleSuggested && !locked && (
              <p className="llb-field-hint-suggest">
                <HiOutlineCheck className="llb-ic-sm" aria-hidden="true" />
                {t("source.suggested")}
              </p>
            )}
            {titleSuggestionError && (
              <p className="llb-field-hint" role="alert">
                {titleSuggestionError}
              </p>
            )}

            <div className="llb-tabs" role="tablist" aria-label={t("source.panelTitle")}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "paste"}
                className={mode === "paste" ? "llb-tab is-active" : "llb-tab"}
                onClick={() => setMode("paste")}
              >
                {t("source.tabPaste")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "upload"}
                className={mode === "upload" ? "llb-tab is-active" : "llb-tab"}
                onClick={() => setMode("upload")}
              >
                {t("source.tabUpload")}
              </button>
            </div>

            {mode === "upload" ? (
              <div>
                <div
                  className={dragOver ? "llb-dropzone is-over" : "llb-dropzone"}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!locked) setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    if (!locked) takeFiles(event.dataTransfer?.files);
                  }}
                >
                  <div className="llb-dropzone-icon">
                    <HiOutlineArrowUpTray className="llb-ic" aria-hidden="true" />
                  </div>
                  <strong>
                    {t("source.dropTitle")}{" "}
                    <button
                      type="button"
                      className="llb-dropzone-link"
                      onClick={() => inputRef.current?.click()}
                      disabled={locked}
                    >
                      {t("source.dropBrowse")}
                    </button>
                  </strong>
                  <span>{t("source.dropNote")}</span>
                  <input
                    ref={inputRef}
                    type="file"
                    hidden
                    multiple
                    accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                    onChange={(event) => {
                      takeFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>

                {(serverFiles.length > 0 || pendingFiles.length > 0) && (
                  <div className="llb-file-list">
                    {serverFiles.map((file) => {
                      const type = fileTypeInfo(file);
                      return (
                        <div className="llb-file-row" key={file.fileId}>
                          <span className={`llb-file-type is-${type.tone}`}>
                            {type.label}
                          </span>
                          <div className="llb-file-copy">
                            <strong>{file.name}</strong>
                            <span>
                              {fileSizeLabel(file.size, locale)} ·{" "}
                              {t("source.fileMeta", {
                                chars: formatNumber(file.chars, locale),
                              })}
                            </span>
                          </div>
                          <span className="llb-file-state">
                            <span className="llb-state-dot is-ready" />
                            {t("source.fileReady")}
                          </span>
                          <button
                            type="button"
                            className="llb-row-action"
                            aria-label={t("source.removeFile", { name: file.name })}
                            disabled={locked}
                            onClick={() => onRemoveServerFile(file.fileId)}
                          >
                            <HiOutlineXMark className="llb-ic-sm" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                    {pendingFiles.map((entry) => {
                      const type = fileTypeInfo(entry.file);
                      return (
                        <div className="llb-file-row" key={entry.key}>
                          <span className={`llb-file-type is-${type.tone}`}>
                            {type.label}
                          </span>
                          <div className="llb-file-copy">
                            <strong>{entry.file.name}</strong>
                            <span>
                              {entry.error
                                ? entry.error
                                : `${fileSizeLabel(entry.file.size, locale)} · ${t("source.filePending")}`}
                            </span>
                          </div>
                          <span className="llb-file-state">
                            <span
                              className={
                                entry.error
                                  ? "llb-state-dot is-failed"
                                  : "llb-state-dot is-generating"
                              }
                            />
                            {entry.error ? t("source.fileFailed") : t("source.filePending")}
                          </span>
                          <button
                            type="button"
                            className="llb-row-action"
                            aria-label={t("source.removeFile", { name: entry.file.name })}
                            onClick={() => onRemovePendingFile(entry.key)}
                          >
                            <HiOutlineXMark className="llb-ic-sm" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="llb-help">
                  <span>{t("source.filesHelp")}</span>
                  <button
                    type="button"
                    className="llb-mini-link"
                    disabled={locked}
                    onClick={() => {
                      setMode("paste");
                      onPastedTextChange(t("source.exampleText"));
                    }}
                  >
                    {t("source.useExample")}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="llb-field-label" htmlFor={pasteId}>
                  {t("source.pasteLabel")}
                </label>
                <div className="llb-textarea-wrap">
                  <div className="llb-source-toolbar">
                    <span>
                      <HiOutlineDocumentText className="llb-ic-sm" aria-hidden="true" />
                      {t("source.plainText")}
                    </span>
                    <span className="llb-toolbar-divider" />
                    <button
                      type="button"
                      className="llb-mini-link"
                      disabled={locked}
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard?.readText?.();
                          if (text) onPastedTextChange(text);
                        } catch {
                          // Clipboard permission is browser-owned; the teacher
                          // can still paste with the keyboard.
                        }
                      }}
                    >
                      <HiOutlineClipboard className="llb-ic-sm" aria-hidden="true" />
                      {t("source.pasteClipboard")}
                    </button>
                    <span className="llb-char-count">
                      {t("source.charCount", {
                        used: formatNumber(pastedText.length, locale),
                        max: formatNumber(BUILDER_LIMITS.maxSourceChars, locale),
                      })}
                    </span>
                  </div>
                  <textarea
                    id={pasteId}
                    className="llb-textarea"
                    value={pastedText}
                    maxLength={BUILDER_LIMITS.maxSourceChars}
                    disabled={locked}
                    spellCheck={false}
                    placeholder={t("source.pastePlaceholder")}
                    onChange={(event) => onPastedTextChange(event.target.value)}
                  />
                </div>
                <div className="llb-help">
                  <span>{t("source.textHelp")}</span>
                  <button
                    type="button"
                    className="llb-mini-link"
                    disabled={locked}
                    onClick={() => onPastedTextChange(t("source.exampleText"))}
                  >
                    {t("source.useExample")}
                  </button>
                </div>
              </div>
            )}

            <label className={locked ? "llb-attestation is-locked" : "llb-attestation"}>
              <input
                type="checkbox"
                checked={setup.attestationNoStudentData}
                disabled={locked}
                onChange={(event) =>
                  onSetupChange({ attestationNoStudentData: event.target.checked })
                }
              />
              <span>
                {locked ? t("source.attestationLocked") : t("source.attestation")}
              </span>
            </label>
          </div>
        </div>

        <div className="llb-setup-stack">
          <div className="llb-panel">
            <div className="llb-panel-header">
              <div>
                <h3>{t("source.setupTitle")}</h3>
                <p>{t("source.setupCopy")}</p>
              </div>
            </div>
            <div className="llb-setup-body">
              <div className="llb-field-pair">
                <div className="llb-field-block">
                  <label className="llb-field-label" htmlFor="llb-grade">
                    {t("source.grade")}
                  </label>
                  <select
                    id="llb-grade"
                    className="llb-select"
                    value={setup.grade}
                    disabled={locked}
                    onChange={(event) => onSetupChange({ grade: event.target.value })}
                  >
                    <option value="">{t("source.gradePlaceholder")}</option>
                    {gradeOptions.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="llb-field-block">
                  <label className="llb-field-label" htmlFor="llb-subject">
                    {t("source.subject")}
                  </label>
                  <select
                    id="llb-subject"
                    className="llb-select"
                    value={setup.subjectText}
                    disabled={locked}
                    onChange={(event) =>
                      onSetupChange({ subjectText: event.target.value })
                    }
                  >
                    <option value="">{t("source.subjectPlaceholder")}</option>
                    {subjectChoices.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="llb-field-block">
                <label className="llb-field-label" htmlFor="llb-language">
                  {t("source.language")}
                </label>
                <select
                  id="llb-language"
                  className="llb-select"
                  value={setup.language}
                  disabled={locked}
                  onChange={(event) => onSetupChange({ language: event.target.value })}
                >
                  <option value="en">{t("source.languageEn")}</option>
                  <option value="ar">{t("source.languageAr")}</option>
                </select>
              </div>

              {palettes.length > 0 && (
                <div className="llb-field-block">
                  <span className="llb-field-label" id={paletteLabelId}>
                    {t("source.paletteTitle")}
                  </span>
                  <p className="llb-field-hint">{t("source.paletteHint")}</p>
                  <div
                    className="llb-palette-grid"
                    role="radiogroup"
                    aria-labelledby={paletteLabelId}
                  >
                    {[...palettes, { id: "auto", bg: "", accent: "" }].map((palette) => {
                      const selected = setup.palette === palette.id;
                      const automatic = palette.id === "auto";
                      return (
                        <button
                          key={palette.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={
                            selected ? "llb-palette-tile is-selected" : "llb-palette-tile"
                          }
                          disabled={locked}
                          onClick={() => onSetupChange({ palette: palette.id })}
                        >
                          <span
                            className={
                              automatic
                                ? "llb-palette-chip is-auto"
                                : "llb-palette-chip"
                            }
                            aria-hidden="true"
                            style={
                              automatic
                                ? {
                                    backgroundImage: `linear-gradient(120deg, ${palettes
                                      .map((entry) => entry.accent)
                                      .join(", ")})`,
                                  }
                                : { backgroundImage: palette.bg }
                            }
                          >
                            {!automatic && (
                              <span
                                className="llb-palette-dot"
                                style={{ background: palette.accent }}
                              />
                            )}
                            {selected && (
                              <HiOutlineCheck className="llb-ic-sm" aria-hidden="true" />
                            )}
                          </span>
                          <span className="llb-palette-name">
                            {automatic
                              ? t("source.paletteAuto")
                              : t(`source.palettes.${palette.id}`, {
                                  defaultValue: palette.id,
                                })}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="llb-field-block">
                <span className="llb-field-label" id={modeLabelId}>
                  {t("source.modeTitle")}
                </span>
                <div
                  className="llb-mode-grid"
                  role="radiogroup"
                  aria-labelledby={modeLabelId}
                >
                  {[
                    { id: "high", label: "source.modeHigh", hint: "source.modeHighHint" },
                    { id: "low", label: "source.modeLow", hint: "source.modeLowHint" },
                  ].map((option) => {
                    const selected = setup.generationMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={
                          selected ? "llb-mode-tile is-selected" : "llb-mode-tile"
                        }
                        disabled={locked}
                        onClick={() => onSetupChange({ generationMode: option.id })}
                      >
                        <strong>{t(option.label)}</strong>
                        <span>{t(option.hint)}</span>
                      </button>
                    );
                  })}
                </div>
                {locked && (
                  <p className="llb-field-hint">{t("source.setupLocked")}</p>
                )}
              </div>

              <div className="llb-count-row">
                <div className="llb-count-copy">
                  <strong>{t("source.slidesLabel")}</strong>
                  <span>{t("source.slidesHint")}</span>
                </div>
                <div className="llb-stepper-input">
                  <button
                    type="button"
                    aria-label={t("source.decrease", { label: t("source.slidesLabel") })}
                    disabled={locked || setup.slideCount <= BUILDER_LIMITS.minSlides}
                    onClick={() => setCount("slideCount", -1, BUILDER_LIMITS.minSlides, BUILDER_LIMITS.maxSlides)}
                  >
                    <HiOutlineMinus className="llb-ic-sm" aria-hidden="true" />
                  </button>
                  <span>{formatNumber(setup.slideCount, locale)}</span>
                  <button
                    type="button"
                    aria-label={t("source.increase", { label: t("source.slidesLabel") })}
                    disabled={locked || setup.slideCount >= BUILDER_LIMITS.maxSlides}
                    onClick={() => setCount("slideCount", 1, BUILDER_LIMITS.minSlides, BUILDER_LIMITS.maxSlides)}
                  >
                    <HiOutlinePlus className="llb-ic-sm" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="llb-count-row">
                <div className="llb-count-copy">
                  <strong>{t("source.questionsLabel")}</strong>
                  <span>{t("source.questionsHint")}</span>
                </div>
                <div className="llb-stepper-input">
                  <button
                    type="button"
                    aria-label={t("source.decrease", { label: t("source.questionsLabel") })}
                    disabled={locked || setup.questionCount <= 0}
                    onClick={() => setCount("questionCount", -1, 0, BUILDER_LIMITS.maxQuestions)}
                  >
                    <HiOutlineMinus className="llb-ic-sm" aria-hidden="true" />
                  </button>
                  <span>{formatNumber(setup.questionCount, locale)}</span>
                  <button
                    type="button"
                    aria-label={t("source.increase", { label: t("source.questionsLabel") })}
                    disabled={locked || setup.questionCount >= BUILDER_LIMITS.maxQuestions}
                    onClick={() => setCount("questionCount", 1, 0, BUILDER_LIMITS.maxQuestions)}
                  >
                    <HiOutlinePlus className="llb-ic-sm" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="llb-field-block">
                <span className="llb-field-label">{t("source.questionTypes")}</span>
                <div className="llb-chip-set">
                  {QUESTION_KIND_OPTIONS.map((option) => {
                    const selected = (setup.questionKinds || []).includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={selected ? "llb-option-chip is-selected" : "llb-option-chip"}
                        aria-pressed={selected}
                        disabled={locked}
                        onClick={() => toggleKind(option.value)}
                      >
                        <span className="llb-option-check">
                          {selected && (
                            <HiOutlineCheck className="llb-ic-sm" aria-hidden="true" />
                          )}
                        </span>
                        {t(option.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="llb-field-block">
                <label className="llb-field-label" htmlFor="llb-level">
                  {t("source.level")}
                </label>
                <select
                  id="llb-level"
                  className="llb-select"
                  value={setup.level}
                  disabled={locked}
                  onChange={(event) => onSetupChange({ level: event.target.value })}
                >
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="llb-cost-card">
            <div className="llb-cost-head">
              <span>{t("source.costHead")}</span>
              <strong>
                {planCost === undefined || planCost === null
                  ? t("source.costUnknown")
                  : t("source.costValue", { credits: formatNumber(costCredits(planCost), locale) })}
              </strong>
            </div>
            <p>{t("source.costNote")}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BuilderSourceStep;
