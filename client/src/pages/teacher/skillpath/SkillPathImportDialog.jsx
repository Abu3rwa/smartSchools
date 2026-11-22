import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useFeatureNamespaces } from "../../../i18n/useFeatureNamespaces";
import skillpathService from "../../../services/skillpathService";
import {
  ITEM_TYPES,
  TYPE_LABEL_KEY,
  normalizeItemType,
  importPreviewPayload,
  importCommitPayload,
  canPreviewImport,
  isBulkLayout,
  newSubmissionId
} from "./utils/skillpathAuthoring";

const POOL_DIFFICULTY_KEY = { easy: "level1", medium: "level2", hard: "level3" };

const initialState = (defaultSkillId) => ({
  source: "csv",
  mode: "single",
  type: "multiple_choice",
  content: "",
  skillId: defaultSkillId || "",
  operation: "create",
  packId: "",
  newPackTitle: "",
  poolId: "",
  questionIds: [],
  validOnly: false,
  confirmations: [],
  preview: null,
  submissionId: "",
  busy: false,
  error: null
});

const SkillPathImportDialog = ({ skills, packs, subjects, defaultSkillId, onClose, onImported }) => {
  const { t } = useFeatureNamespaces(["skillpath"]);
  const [state, setState] = useState(() => initialState(defaultSkillId));
  const [pools, setPools] = useState([]);
  const [poolsError, setPoolsError] = useState(null);
  const [poolSubject, setPoolSubject] = useState("");
  const stateRef = useRef(state);
  stateRef.current = state;

  // Any change to what would be imported invalidates the preview; review
  // toggles (confirmations, validOnly) do not.
  const patchImport = (patch) => setState((prev) => ({
    ...prev, ...patch, preview: null, submissionId: "", error: null, commitErrors: null, confirmations: [], validOnly: false, busy: false
  }));
  const patchReview = (patch) => setState((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (state.source !== "pool") return undefined;
    let cancelled = false;
    skillpathService.listQuestionPools(poolSubject ? { subjectId: poolSubject } : {})
      .then((data) => { if (!cancelled) { setPools(data.pools || []); setPoolsError(null); } })
      .catch((error) => { if (!cancelled) setPoolsError(error?.response?.data?.message || t("errors.generic")); });
    return () => { cancelled = true; };
  }, [state.source, poolSubject, t]);

  const selectedPool = pools.find((pool) => String(pool._id) === state.poolId) || null;

  const payloadKey = useMemo(() => JSON.stringify(importPreviewPayload(state)), [state]);
  const bulkLayout = isBulkLayout(state);
  const canPreview = canPreviewImport(state);

  useEffect(() => {
    if (!canPreview) return undefined;
    const timer = setTimeout(async () => {
      const current = stateRef.current;
      const request = importPreviewPayload(current);
      setState((prev) => ({ ...prev, busy: true, error: null }));
      try {
        const data = current.source === "pool"
          ? await skillpathService.previewPoolImport(request)
          : await skillpathService.previewImport(request);
        setState((prev) => (JSON.stringify(importPreviewPayload(prev)) === JSON.stringify(request)
          ? { ...prev, busy: false, preview: data, submissionId: newSubmissionId() }
          : prev));
      } catch (error) {
        setState((prev) => (JSON.stringify(importPreviewPayload(prev)) === JSON.stringify(request)
          ? {
            ...prev,
            busy: false,
            preview: null,
            error: error?.response?.data?.message || t("errors.generic")
          }
          : prev));
      }
    }, 500);
    return () => clearTimeout(timer);
    // payloadKey captures every field that changes the import; stateRef reads
    // the latest review toggles without retriggering the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, canPreview]);

  const downloadTemplate = async () => {
    try {
      const target = state.mode === "bulk" ? "bulk" : "single";
      const blob = await skillpathService.downloadTemplate(state.type, { target, skillId: state.skillId });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `skillpath-${state.type}-${target}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const copyPrompt = async () => {
    try {
      const target = state.mode === "bulk" ? "bulk" : "single";
      const data = await skillpathService.getImportPrompt(state.type, { target, skillId: state.skillId });
      await navigator.clipboard.writeText(data.prompt);
      toast.success(t("import.promptCopied"));
    } catch (error) {
      toast.error(error?.response?.data?.message || t("errors.generic"));
    }
  };

  const readFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    patchImport({ content });
  };

  const choosePool = (poolId) => {
    const pool = pools.find((entry) => String(entry._id) === poolId);
    patchImport({ poolId, questionIds: (pool?.questions || []).map((question) => String(question._id)) });
  };

  const toggleQuestion = (questionId) => {
    setState((prev) => ({
      ...prev,
      preview: null,
      submissionId: "",
      confirmations: [],
      validOnly: false,
      questionIds: prev.questionIds.includes(questionId)
        ? prev.questionIds.filter((id) => id !== questionId)
        : [...prev.questionIds, questionId]
    }));
  };

  const preview = state.preview;
  const effectiveConfirmations = [...state.confirmations, ...(state.validOnly ? ["validRows"] : [])];
  const errorsBlock = preview && preview.counts.invalidRows > 0
    && (preview.operation === "replace" || preview.mode === "bulk" || !state.validOnly);
  const commitReady = preview
    && !state.busy
    && preview.problems.length === 0
    && !errorsBlock
    && preview.packs.some((pack) => pack.itemCount > 0)
    && preview.requiredConfirmations.every((code) => effectiveConfirmations.includes(code));

  const commit = async () => {
    setState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      const data = await skillpathService.commitImport(
        importCommitPayload({ ...state, confirmations: effectiveConfirmations }, preview)
      );
      toast.success(t("import.committed", {
        packs: data.summary.packsCreated + data.summary.packsUpdated,
        items: data.summary.itemsImported
      }));
      onImported();
    } catch (error) {
      const detail = error?.response?.data?.data;
      setState((prev) => ({
        ...prev,
        busy: false,
        preview: null,
        error: error?.response?.data?.message || t("errors.generic"),
        commitErrors: detail?.errors || null
      }));
    }
  };

  const confirmationLabel = (code) => {
    if (code === "replace") {
      return t("import.confirmReplace", { count: preview?.replacement?.removedCount ?? 0 });
    }
    if (code === "skillCreate") {
      const names = (preview?.skillActions || []).filter((action) => action.action === "create").map((action) => action.name);
      return t("import.confirmSkillCreate", { names: names.join(", ") });
    }
    if (code === "unpublish") return t("import.confirmUnpublish");
    if (code === "skillConflicts") return t("import.confirmSkillConflicts");
    return code;
  };

  const replaceablePacks = packs.filter((pack) => pack.status !== "archived");

  return (
    <div className="sp-form">
      <div className="sp-actions">
        <button
          type="button"
          className={`sp-btn${state.source === "csv" ? " sp-btn--primary" : ""}`}
          onClick={() => patchImport({ source: "csv" })}
        >
          {t("import.sourceCsv")}
        </button>
        <button
          type="button"
          className={`sp-btn${state.source === "pool" ? " sp-btn--primary" : ""}`}
          onClick={() => patchImport({ source: "pool" })}
        >
          {t("import.sourcePool")}
        </button>
      </div>

      <div className="sp-import-target">
        <strong>{bulkLayout ? t("import.fileDestinationTitle") : t("import.destinationTitle")}</strong>
        <span>{bulkLayout ? t("import.fileDestinationHelp") : t("import.destinationHelp")}</span>
      </div>
      {bulkLayout ? null : (
        <div className="sp-form__row">
          <label>
            <span>{t("editor.skill")}</span>
            <select value={state.skillId} onChange={(event) => patchImport({ skillId: event.target.value })}>
              <option value="">{t("editor.chooseSkill")}</option>
              {skills.map((skill) => (
                <option key={skill._id} value={skill._id}>
                  {skill.name}{skill.gradeLevel ? ` · ${skill.gradeLevel}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("import.operation")}</span>
            <select value={state.operation} onChange={(event) => patchImport({ operation: event.target.value })}>
              <option value="create">{t("import.operationNew")}</option>
              <option value="replace">{t("import.operationReplace")}</option>
            </select>
          </label>
          {state.operation === "create" ? (
            <label>
              <span>{t("import.newPackTitle")}</span>
              <input
                dir="auto"
                value={state.newPackTitle}
                onChange={(event) => patchImport({ newPackTitle: event.target.value })}
                placeholder={t("studio.packTitlePlaceholder")}
              />
            </label>
          ) : (
            <label>
              <span>{t("import.choosePack")}</span>
              <select value={state.packId} onChange={(event) => patchImport({ packId: event.target.value })}>
                <option value="">{t("import.choosePackPlaceholder")}</option>
                {replaceablePacks.map((pack) => (
                  <option key={pack._id} value={pack._id}>
                    {pack.title} · {t("home.items", { count: pack.itemCount })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {state.source === "csv" ? (
        <>
          <div className="sp-form__row">
            <label>
              <span>{t("import.mode")}</span>
              <select
                value={state.mode}
                onChange={(event) => patchImport(event.target.value === "bulk"
                  ? { mode: "bulk", operation: "create", packId: "" }
                  : { mode: "single" })}
              >
                <option value="single">{t("import.modeSingle")}</option>
                <option value="bulk">{t("import.modeBulk")}</option>
              </select>
            </label>
            <label>
              <span>{t("editor.itemType")}</span>
              <select value={state.type} onChange={(event) => patchImport({ type: event.target.value })}>
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`editor.${TYPE_LABEL_KEY[type]}`)}</option>
                ))}
                <option value="mixed">{t("editor.typeMixed")}</option>
              </select>
            </label>
            <div className="sp-actions" style={{ alignItems: "flex-end" }}>
              <button type="button" className="sp-btn" onClick={downloadTemplate}>{t("import.downloadTemplate")}</button>
              <button type="button" className="sp-btn" onClick={copyPrompt}>{t("import.copyPrompt")}</button>
            </div>
          </div>
          <p className="sp-play__foot-note">{t("import.help")}</p>
          {state.type === "mixed" ? <p className="sp-play__foot-note">{t("import.mixedHint")}</p> : null}
          <label>
            <span>{t("import.chooseFile")}</span>
            <input type="file" accept=".csv,text/csv" onChange={readFile} />
          </label>
          <label>
            <span>{t("import.paste")}</span>
            <textarea
              rows={7}
              dir="auto"
              value={state.content}
              onChange={(event) => patchImport({ content: event.target.value })}
              placeholder={t("import.pastePlaceholder")}
            />
          </label>
        </>
      ) : (
        <>
          <div className="sp-form__row">
            <label>
              <span>{t("import.poolSubjectFilter")}</span>
              <select value={poolSubject} onChange={(event) => setPoolSubject(event.target.value)}>
                <option value="">{t("import.allSubjects")}</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("import.poolLabel")}</span>
              <select value={state.poolId} onChange={(event) => choosePool(event.target.value)}>
                <option value="">{t("import.choosePool")}</option>
                {pools.map((pool) => (
                  <option key={pool._id} value={pool._id}>
                    {[
                      pool.standard?.code,
                      pool.subject?.name,
                      pool.class?.name,
                      t("import.poolQuestionCount", { count: pool.questionCount })
                    ].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {poolsError ? <div className="sp-error">{poolsError}</div> : null}
          {!poolsError && pools.length === 0 ? (
            <div className="sp-empty">{t("import.poolEmpty")}</div>
          ) : null}
          {selectedPool ? (
            <div>
              <div className="sp-actions">
                <span className="sp-form__label">{t("import.poolQuestions")}</span>
                <button
                  type="button"
                  className="sp-btn sp-btn--ghost"
                  onClick={() => patchImport({ questionIds: selectedPool.questions.map((question) => String(question._id)) })}
                >
                  {t("import.selectAll")}
                </button>
                <button
                  type="button"
                  className="sp-btn sp-btn--ghost"
                  onClick={() => patchImport({ questionIds: [] })}
                >
                  {t("import.selectNone")}
                </button>
              </div>
              <div className="sp-check-list sp-scroll" style={{ maxHeight: 260 }}>
                {selectedPool.questions.map((question) => (
                  <label key={question._id} className="sp-check">
                    <input
                      type="checkbox"
                      checked={state.questionIds.includes(String(question._id))}
                      onChange={() => toggleQuestion(String(question._id))}
                    />
                    <span dir="auto">
                      <span className="sp-chip">{t(`editor.${TYPE_LABEL_KEY[normalizeItemType(question.questionType)] || "typeMcq"}`)}</span>
                      <span className="sp-chip">{t(`editor.${POOL_DIFFICULTY_KEY[question.difficulty] || "level2"}`)}</span>
                      {question.hasPassage ? <span className="sp-chip sp-chip--due">{t("import.passageChip")}</span> : null}
                      {question.questionText}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {state.error ? <div className="sp-error">{state.error}</div> : null}
      {state.commitErrors?.length ? (
        <div className="sp-scroll">
          <table className="sp-table">
            <thead>
              <tr>
                <th>{t("import.colRow")}</th>
                <th>{t("import.colColumn")}</th>
                <th>{t("import.colMessage")}</th>
              </tr>
            </thead>
            <tbody>
              {state.commitErrors.map((row, index) => (
                <tr key={`${row.row}-${row.column}-${index}`}>
                  <td>{row.row}</td>
                  <td><code>{row.column}</code></td>
                  <td>{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview ? (
        <div className="sp-import-result">
          <div className="sp-actions">
            <span className={`sp-chip ${preview.counts.invalidRows === 0 ? "sp-chip--done" : "sp-chip--due"}`}>
              {t("import.validRows", { valid: preview.counts.validRows, total: preview.counts.totalRows })}
            </span>
            <span className="sp-chip">{t("import.packCount", { count: preview.packs.length })}</span>
            {preview.skillActions.some((action) => action.action === "create") ? (
              <span className="sp-chip sp-chip--due">
                {t("import.newSkills", { count: preview.skillActions.filter((action) => action.action === "create").length })}
              </span>
            ) : null}
          </div>

          {preview.destination ? (
            <p className="sp-play__foot-note">
              {t("import.destinationSummary", {
                skill: preview.destination.skill?.name || "",
                pack: preview.destination.pack?.title || state.newPackTitle || t("import.newPack")
              })}
            </p>
          ) : null}

          {preview.problems.length ? (
            <div className="sp-error" style={{ marginTop: 8 }}>
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {preview.problems.map((problem, index) => <li key={index}>{problem}</li>)}
              </ul>
            </div>
          ) : null}

          {preview.conflicts && (preview.conflicts.skillKeys.length || preview.conflicts.skillNames.length) ? (
            <p className="sp-play__foot-note">
              {t("import.conflictNote", {
                keys: [...preview.conflicts.skillKeys, ...preview.conflicts.skillNames].join(", ")
              })}
            </p>
          ) : null}

          {preview.mode === "bulk" && preview.packs.length ? (
            <div className="sp-preview-items">
              <h4>{t("import.packSkillsTitle")}</h4>
              {preview.packs.map((pack) => (
                <div key={pack.packKey || pack.packId} className="sp-preview-item">
                  <p dir="auto">{pack.title}</p>
                  <div className="sp-actions">
                    <span className={`sp-chip ${pack.exists ? "" : "sp-chip--done"}`}>
                      {pack.exists ? t("import.updatesPack") : t("import.newPack")}
                    </span>
                    <span className="sp-chip">{t("home.items", { count: pack.itemCount })}</span>
                    {pack.exists ? (
                      <span className="sp-chip">{t("import.existingItems", { count: pack.existingItemCount })}</span>
                    ) : null}
                  </div>
                </div>
              ))}
              {preview.skillActions.length ? (
                <div className="sp-actions" style={{ flexWrap: "wrap" }}>
                  {preview.skillActions.map((action) => (
                    <span key={action.skillId || action.key} className={`sp-chip ${action.action === "create" ? "sp-chip--due" : ""}`}>
                      {action.name}{action.action === "create" ? ` · ${t("import.skillNew")}` : ""}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {preview.counts.invalidRows > 0 ? (
            <>
              <div className="sp-error" style={{ marginTop: 8 }}>
                {t("import.errorCount", { count: preview.counts.invalidRows })}
              </div>
              <div className="sp-scroll" style={{ maxHeight: 220 }}>
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th>{t("import.colRow")}</th>
                      <th>{t("import.colColumn")}</th>
                      <th>{t("import.colMessage")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((row, index) => (
                      <tr key={`${row.row}-${row.column}-${index}`}>
                        <td>{row.row}</td>
                        <td><code>{row.column}</code></td>
                        <td>{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.operation === "replace" || preview.mode === "bulk" ? (
                <p className="sp-play__foot-note">{t("import.fixFileNote")}</p>
              ) : (
                <label className="sp-check">
                  <input
                    type="checkbox"
                    checked={state.validOnly}
                    onChange={(event) => patchReview({ validOnly: event.target.checked })}
                  />
                  <span>{t("import.validOnly")}</span>
                </label>
              )}
            </>
          ) : null}

          {preview.sampleItems?.length ? (
            <div className="sp-preview-items">
              <h4>{t("import.previewTitle")}</h4>
              {preview.sampleItems.map((item, index) => (
                <div key={index} className="sp-preview-item">
                  <span className="sp-chip">{t(`editor.${TYPE_LABEL_KEY[normalizeItemType(item.type)] || "typeMcq"}`)}</span>
                  <p dir="auto">{item.prompt}</p>
                  {item.options?.length ? (
                    <ul>
                      {item.options.map((option) => <li key={option.id} dir="auto">{option.text}</li>)}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {preview.requiredConfirmations.filter((code) => code !== "validRows").map((code) => (
            <label key={code} className="sp-check">
              <input
                type="checkbox"
                checked={state.confirmations.includes(code)}
                onChange={(event) => patchReview({
                  confirmations: event.target.checked
                    ? [...state.confirmations, code]
                    : state.confirmations.filter((entry) => entry !== code)
                })}
              />
              <span>{confirmationLabel(code)}</span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="sp-actions">
        <button type="button" className="sp-btn" onClick={onClose}>{t("common.cancel")}</button>
        <button
          type="button"
          className="sp-btn sp-btn--primary"
          disabled={!commitReady}
          onClick={commit}
        >
          {state.busy ? t("common.working") : t("import.commit")}
        </button>
      </div>
    </div>
  );
};

export default SkillPathImportDialog;