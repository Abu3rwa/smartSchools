import { useTranslation } from "react-i18next";
import { formatDate } from "../WritingAssignmentBoardPage/boardPresentation.js";
import { formatTokens, formatUsd } from "../../../../utils/aiCredit.js";
import {
  WINDOW_PRESETS,
  codeDepth,
  codeOf,
  overlapSummary,
  overlappingStandards,
  standardGroups,
} from "./analysisPresentation.js";

export default function AnalysisSetup({ data }) {
  const { t, i18n } = useTranslation(["writing"]);
  const {
    applyCustomWindow,
    busy,
    chooseWindow,
    clearAll,
    clearAllDrafts,
    customFrom,
    customTo,
    openAnalysis,
    preset,
    run,
    scope,
    selectAll,
    selectAllDrafts,
    selected,
    selectedDrafts,
    setCustomFrom,
    setCustomTo,
    toggleDraft,
    toggleStandard,
  } = data;

  const pieces = scope.pieces || [];
  const canRun =
    selected.length > 0 && selectedDrafts.length > 0 && pieces.length > 0;
  const estimate = scope.estimate || {};
  const subjectName = scope.subject?.name || "";
  const groups = standardGroups(scope.standards || []);
  const overlaps = overlappingStandards(scope.standards || [], selected);
  const overlapText = overlapSummary(overlaps);
  const selectedCount = pieces.filter((piece) =>
    selectedDrafts.includes(String(piece.draft)),
  ).length;
  const windowLabel = (row) => {
    if (!row.from && !row.to) {
      return t("writing:teacher.analysis.windowPresets.all");
    }
    const from = row.from ? formatDate(row.from, i18n.language) : "…";
    const to = row.to ? formatDate(row.to, i18n.language) : "…";
    return `${from} – ${to}`;
  };

  return (
    <div className="wa-builder-body">
      <div className="wa-builder-main wa-step">
        <section className="wa-card">
          <div className="wa-card-head">
            <div>
              <h3>{t("writing:teacher.analysis.setupTitle")}</h3>
              <p className="wa-card-sub">
                {t("writing:teacher.analysis.setupHint")}
              </p>
            </div>
          </div>

          <div className="wa-analysis-controls">
            <div className="wa-field wa-grow">
              <span>{t("writing:teacher.analysis.window")}</span>
              <div className="wa-chip-row">
                {WINDOW_PRESETS.map((key) => (
                  <button
                    type="button"
                    key={key}
                    className={`wa-chip-button${preset === key ? " is-active" : ""}`}
                    onClick={() => chooseWindow(key)}
                  >
                    {t(`writing:teacher.analysis.windowPresets.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {preset === "custom" && (
            <div className="wa-row">
              <label className="wa-field">
                {t("writing:teacher.analysis.from")}
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label className="wa-field">
                {t("writing:teacher.analysis.to")}
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={applyCustomWindow}
              >
                {t("writing:teacher.analysis.applyDates")}
              </button>
            </div>
          )}
        </section>

        <section className="wa-card">
          <div className="wa-card-head">
            <div>
              <h3>{t("writing:teacher.analysis.standardsTitle")}</h3>
              <p className="wa-card-sub">
                {t("writing:teacher.analysis.standardsHint")}
              </p>
            </div>
            <div className="wa-card-actions">
              <span className="wa-chip">
                {t("writing:teacher.analysis.selectedCount", {
                  selected: selected.length,
                  n: (scope.standards || []).length,
                })}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={selectAll}
              >
                {t("writing:teacher.analysis.selectAll")}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearAll}
              >
                {t("writing:teacher.analysis.clearAll")}
              </button>
            </div>
          </div>

          {(scope.standards || []).length === 0 ? (
            <div className="wa-empty wa-empty-inline">
              <h3>{t("writing:teacher.analysis.noStandardsTitle")}</h3>
              <p>
                {t("writing:teacher.analysis.noStandardsBody", {
                  grade: scope.class?.grade ?? "",
                })}
              </p>
            </div>
          ) : (
            <div className="wa-analysis-groups">
              {groups.map((group) => (
                <div key={group.category || "other"} className="wa-ana-group">
                  <h4 className="wa-ana-group-title">
                    {group.category
                      ? t(
                          `writing:teacher.analysis.categories.${group.category}`,
                          group.category,
                        )
                      : t("writing:teacher.analysis.categoryOther")}
                  </h4>
                  <div className="wa-analysis-standards">
                    {group.rows.map((standard) => {
                      const id = String(standard._id);
                      const checked = selected.includes(id);
                      const depth = codeDepth(codeOf(standard));
                      return (
                        <label
                          key={id}
                          className={`wa-roster-row${checked ? " is-checked" : ""}`}
                          style={
                            depth
                              ? { paddingInlineStart: `${depth * 14}px` }
                              : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStandard(id)}
                          />
                          <span>
                            {standard.code ? `${standard.code} · ` : ""}
                            {standard.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {overlaps.length > 0 && (
            <p className="wa-ana-picker-alert">
              {t("writing:teacher.analysis.overlapWarning", {
                groups: overlapText,
              })}
            </p>
          )}
        </section>

        <section className="wa-card">
          <div className="wa-card-head">
            <div>
              <h3>{t("writing:teacher.analysis.piecesTitle")}</h3>
              <p className="wa-card-sub">
                {t("writing:teacher.analysis.piecesHint", {
                  cap: scope.pieceCap || 24,
                })}
              </p>
            </div>
            <div className="wa-card-actions">
              <span className="wa-chip">
                {t("writing:teacher.analysis.selectedCount", {
                  selected: selectedCount,
                  n: pieces.length,
                })}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={selectAllDrafts}
              >
                {t("writing:teacher.analysis.selectAll")}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearAllDrafts}
              >
                {t("writing:teacher.analysis.clearAll")}
              </button>
            </div>
          </div>

          {pieces.length === 0 ? (
            <div className="wa-empty wa-empty-inline">
              <h3>{t("writing:teacher.analysis.piecesEmptyTitle")}</h3>
              <p>{t("writing:teacher.analysis.piecesEmptyBody")}</p>
            </div>
          ) : (
            <div className="wa-table-card">
              <table className="wa-table">
                <thead>
                  <tr>
                    <th scope="col" className="wa-cell-check">
                      {t("writing:teacher.analysis.pieceRead")}
                    </th>
                    <th scope="col">
                      {t("writing:teacher.analysis.pieceTitle")}
                    </th>
                    <th scope="col">
                      {t("writing:teacher.analysis.pieceType")}
                    </th>
                    <th scope="col">
                      {t("writing:teacher.analysis.pieceDate")}
                    </th>
                    <th scope="col" className="wa-cell-number">
                      {t("writing:teacher.analysis.pieceWords")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pieces.map((piece) => {
                    const id = String(piece.draft);
                    return (
                      <tr key={id}>
                        <td className="wa-cell-check">
                          <input
                            type="checkbox"
                            checked={selectedDrafts.includes(id)}
                            aria-label={t(
                              "writing:teacher.analysis.pieceReadOne",
                              { title: piece.title || id },
                            )}
                            onChange={() => toggleDraft(id)}
                          />
                        </td>
                        <td>{piece.title || "—"}</td>
                        <td>
                          {piece.writingType
                            ? t(`writing:teacher.types.${piece.writingType}`)
                            : "—"}
                        </td>
                        <td className="wa-cell-date">
                          {formatDate(piece.submittedAt, i18n.language) || "—"}
                        </td>
                        <td className="wa-cell-number">{piece.totalWords}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(scope.excluded || []).length > 0 && (
            <div className="wa-analysis-excluded">
              <h4>{t("writing:teacher.analysis.excludedTitle")}</h4>
              <ul>
                {(scope.excluded || []).map((piece) => (
                  <li key={String(piece.draft)}>
                    <span>{piece.title || "—"}</span>
                    <span className="wa-hint">
                      {formatDate(piece.submittedAt, i18n.language)}
                    </span>
                    <span className="wa-ana-reason">
                      {t(
                        `writing:teacher.analysis.exclusionReasons.${piece.reason}`,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <aside className="wa-preview wa-analysis-preview">
        <h3>{t("writing:teacher.analysis.estimateTitle")}</h3>
        <p className="wa-preview-topic">{subjectName}</p>
        <dl>
          <div>
            <dt>{t("writing:teacher.analysis.estimatePieces")}</dt>
            <dd>{estimate.pieces ?? 0}</dd>
          </div>
          <div>
            <dt>{t("writing:teacher.analysis.estimateTokens")}</dt>
            <dd>{formatTokens(estimate.totalTokens || 0, i18n.language)}</dd>
          </div>
          <div>
            <dt>{t("writing:teacher.analysis.estimateCost")}</dt>
            <dd>
              {formatUsd(estimate.chargedCents || 0, i18n.language, 4)}
            </dd>
          </div>
          <div>
            <dt>{t("writing:teacher.analysis.language")}</dt>
            <dd>
              {t(`writing:teacher.analysis.languages.${scope.language || "en"}`)}
            </dd>
          </div>
        </dl>
        <p className="wa-hint wa-analysis-preview-note">
          {t("writing:teacher.analysis.estimateNote")}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={run}
          disabled={!canRun || busy === "run"}
        >
          {busy === "run"
            ? t("writing:teacher.analysis.running")
            : t("writing:teacher.analysis.run")}
        </button>
        {!canRun && (
          <p className="wa-hint">
            {selected.length === 0
              ? t("writing:teacher.analysis.runHint")
              : t("writing:teacher.analysis.runHintPieces")}
          </p>
        )}

        <div className="wa-analysis-history">
          <h4>{t("writing:teacher.analysis.historyTitle")}</h4>
          {(scope.history || []).length === 0 ? (
            <p className="wa-hint">{t("writing:teacher.analysis.historyEmpty")}</p>
          ) : (
            <ul>
              {(scope.history || []).map((row) => (
                <li key={String(row._id)}>
                  <div>
                    <strong>
                      {t(`writing:teacher.analysis.runStatuses.${row.status}`)}
                    </strong>
                    <span className="wa-hint">{windowLabel(row)}</span>
                    {row.publish?.state === "published" && (
                      <span className="wa-ana-reason">
                        {t("writing:teacher.analysis.publishedChip")}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openAnalysis(row._id)}
                  >
                    {t("writing:teacher.analysis.historyOpen")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
