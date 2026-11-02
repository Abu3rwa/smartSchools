import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiOutlineArrowSmDown,
  HiOutlineArrowSmUp,
  HiOutlineDownload,
  HiOutlineSearch,
  HiOutlineSparkles,
} from "react-icons/hi";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import readingService from "../../../../services/readingService.js";
import FluencyStudentDetail from "./FluencyStudentDetail.jsx";
import ModelAudioPreview from "../ModelAudioPreview.jsx";
import "./FluencyReport.css";

const STATUS_LABEL = {
  needs_support: "needsSupport",
  on_track: "onTrack",
  not_started: "notStarted",
  goal_met: "goalMet",
};

const statusClass = (status) => `is-${String(status || "").replace(/_/g, "-")}`;

const roundPercent = (value) =>
  Number.isFinite(value) ? Math.round(value) : null;

const formatCents = (value) => {
  const cents = Number(value) || 0;
  return cents >= 1 ? Math.round(cents) : Math.round(cents * 100) / 100;
};

function Trend({ change }) {
  if (change === null || change === undefined) return null;
  if (change > 0) {
    return (
      <span className="fluency-trend-delta is-up" title={`+${change}`}>
        <HiOutlineArrowSmUp size={14} aria-hidden="true" />
        {change}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="fluency-trend-delta is-down" title={String(change)}>
        <HiOutlineArrowSmDown size={14} aria-hidden="true" />
        {Math.abs(change)}
      </span>
    );
  }
  return (
    <span className="fluency-trend-delta is-flat" title="0">
      —
    </span>
  );
}

function AccuracyCell({ first, latest, change, t }) {
  if (latest === null || latest === undefined) {
    return <span className="reading-dash">—</span>;
  }
  return (
    <span className="fluency-trend">
      {first !== null && first !== undefined && (
        <span className="fluency-trend-first">
          {roundPercent(first)}%{" → "}
        </span>
      )}
      <strong>{roundPercent(latest)}%</strong>
      <Trend change={change} />
      {change !== null && change !== undefined && (
        <span className="reading-sr-only">
          {t("reading:fluencyReport.changePoints", { change })}
        </span>
      )}
    </span>
  );
}

function PaceCell({ first, latest, change }) {
  if (latest === null || latest === undefined) {
    return <span className="reading-dash">—</span>;
  }
  return (
    <span className="fluency-trend">
      {first !== null && first !== undefined && (
        <span className="fluency-trend-first">
          {Math.round(first)}
          {" → "}
        </span>
      )}
      <strong>{Math.round(latest)}</strong>
      <Trend change={change} />
    </span>
  );
}

export default function FluencyReportPanel({ assignmentId }) {
  const { t, i18n } = useTranslation(["reading"]);
  const [report, setReport] = useState(null);
  const [hardWords, setHardWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [partFilter, setPartFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openStudentId, setOpenStudentId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [coverage, setCoverage] = useState(null);
  const [coverageError, setCoverageError] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(null);
  const audioCancelled = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setCoverage(null);
    setCoverageError(false);
    Promise.all([
      readingService.getFluencyClassReport(assignmentId),
      readingService.getFluencyHardWords(assignmentId),
    ])
      .then(([reportResponse, wordsResponse]) => {
        if (!active) return;
        const nextReport = reportResponse.data?.data || null;
        setReport(nextReport);
        setHardWords(wordsResponse.data?.data?.words || []);
        const textId = nextReport?.assignment?.textId;
        if (nextReport?.enabled && textId) {
          readingService
            .getModelAudioCoverage(textId)
            .then((response) => {
              if (active) setCoverage(response.data?.data || null);
            })
            .catch(() => {
              if (active) setCoverageError(true);
            });
        }
      })
      .catch((requestError) => {
        if (!active) return;
        setReport(null);
        setError(
          requestError.response?.data?.message ||
            t("reading:fluencyReport.loadFailed"),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignmentId, t]);

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (report?.students || []).filter((student) => {
      if (statusFilter !== "all" && student.status !== statusFilter)
        return false;
      if (!term) return true;
      return String(student.name || "")
        .toLocaleLowerCase()
        .includes(term);
    });
  }, [report, search, statusFilter]);

  const formatDate = (value) => {
    if (!value) return t("reading:fluencyReport.never");
    return new Date(value).toLocaleDateString(i18n.language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const audioGap = useMemo(() => {
    if (!coverage || !report?.enabled) return null;
    const wanted = new Map(
      (report.parts || [])
        .filter((part) => part.available !== false)
        .map((part) => [part.key, part.level ?? null]),
    );
    const blocks = (coverage.levels || []).flatMap((level) =>
      (level.blocks || [])
        .filter((block) => wanted.has(block.key))
        .filter((block) => {
          const wantedLevel = wanted.get(block.key);
          return wantedLevel === null || wantedLevel === (level.level ?? null);
        })
        .map((block) => ({ ...block, level: level.level })),
    );
    const missing = blocks.filter((block) => !block.generated);
    const sumCents = (list) =>
      Math.round(
        list.reduce((sum, block) => sum + (block.estimatedCents || 0), 0) * 100,
      ) / 100;
    return {
      available: coverage.available !== false,
      total: blocks.length,
      all: blocks,
      ready: blocks.filter((block) => block.generated),
      missing,
      cents: sumCents(missing),
      allCents: sumCents(blocks),
    };
  }, [coverage, report]);

  const loadCoverage = async () => {
    const textId = report?.assignment?.textId;
    if (!textId) return;
    setCoverageError(false);
    try {
      const response = await readingService.getModelAudioCoverage(textId);
      setCoverage(response.data?.data || null);
    } catch {
      setCoverageError(true);
    }
  };

  const handleGenerateAudio = async ({ regenerate = false } = {}) => {
    const textId = report?.assignment?.textId;
    const blocks = regenerate ? audioGap?.all : audioGap?.missing;
    if (!textId || !blocks?.length) return;
    if (
      regenerate &&
      !window.confirm(
        t("reading:fluencyReport.audioRegenerateConfirm", {
          n: blocks.length,
          cents: formatCents(audioGap.allCents),
        }),
      )
    )
      return;
    setGeneratingAudio(true);
    setAudioProgress({ done: 0, total: blocks.length });
    audioCancelled.current = false;
    let generated = 0;
    let failed = 0;
    let pending = blocks.map((block) => ({ key: block.key, level: block.level }));
    try {
      // One request per batch. Regenerating must advance the list, because the
      // server replaces every hash it is sent; generating skips what exists.
      while (pending.length && !audioCancelled.current) {
        const response = await readingService.generateModelAudio(textId, pending, { regenerate });
        const result = response.data?.data || {};
        setCoverage(result.coverage || null);
        generated += Number(result.generated) || 0;
        failed += Number(result.failed) || 0;
        setAudioProgress({ done: generated, total: blocks.length });
        if (failed > 0 || !(Number(result.generated) > 0)) break;
        if (regenerate) {
          pending = pending.slice(Number(result.generated));
        } else if (!(Number(result.remaining) > 0)) {
          break;
        }
      }
      if (failed > 0) {
        toast.error(
          t("reading:fluencyReport.audioPartial", {
            generated,
            failed,
          }),
        );
      } else if (generated > 0) {
        toast.success(t("reading:fluencyReport.audioGenerated", { n: generated }));
      } else if (!audioCancelled.current) {
        toast.success(t("reading:fluencyReport.audioAlreadyReady"));
      }
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.message ||
          t("reading:fluencyReport.audioGenerateFailed"),
      );
    } finally {
      setGeneratingAudio(false);
      setAudioProgress(null);
      audioCancelled.current = false;
    }
  };

  const cancelAudioGeneration = () => {
    audioCancelled.current = true;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await readingService.exportFluencyCsv(assignmentId);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report?.assignment?.title || "reading-fluency"}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(t("reading:fluencyReport.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  if (openStudentId) {
    return (
      <FluencyStudentDetail
        key={`${assignmentId}:${openStudentId}`}
        assignmentId={assignmentId}
        studentId={openStudentId}
        onBack={() => setOpenStudentId("")}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="fluency-report-error">
        <p>{error}</p>
      </div>
    );
  }

  if (!report?.enabled) {
    return (
      <p className="reading-dash results-empty-note">
        {t("reading:fluencyReport.disabled")}
      </p>
    );
  }

  const totals = report.totals || {};
  const settings = report.assignment?.settings || {};

  return (
    <div className="fluency-report">
      <div className="fluency-kpis">
        <div className="fluency-kpi">
          <span className="fluency-kpi-value">
            {totals.started || 0}
            {" / "}
            {totals.assigned || 0}
          </span>
          <span className="fluency-kpi-label">
            {t("reading:fluencyReport.kpiStarted")}
          </span>
        </div>
        <div className="fluency-kpi">
          <span className="fluency-kpi-value">
            {totals.goalMet || 0}
            {" / "}
            {totals.assigned || 0}
          </span>
          <span className="fluency-kpi-label">
            {t("reading:fluencyReport.kpiGoalMet")}
          </span>
        </div>
        <div className="fluency-kpi">
          <span className="fluency-kpi-value">
            {totals.averageReadingsPerPart ?? 0}
            <em>{t("reading:fluencyReport.perPart")}</em>
          </span>
          <span className="fluency-kpi-label">
            {t("reading:fluencyReport.kpiReadings")}
          </span>
        </div>
        <div className="fluency-kpi">
          <span className="fluency-kpi-value">
            {totals.averageAccuracy === null
              ? "—"
              : `${totals.averageAccuracy}%`}
            {totals.averageAccuracyChange !== null &&
              totals.averageAccuracyChange !== undefined && (
                <Trend change={totals.averageAccuracyChange} />
              )}
          </span>
          <span className="fluency-kpi-label">
            {t("reading:fluencyReport.kpiAccuracy")}
          </span>
        </div>
      </div>

      <p className="fluency-report-goal">
        {t("reading:fluencyReport.goalLine", {
          readings: settings.minReadings ?? 0,
          accuracy: settings.targetAccuracy ?? 0,
        })}
        {settings.targetWpm
          ? ` · ${t("reading:fluencyReport.paceGoal", { wpm: settings.targetWpm })}`
          : ""}
      </p>

      {audioGap?.available && audioGap.missing.length > 0 && (
        <div className="fluency-audio-alert">
          <p>
            {t("reading:fluencyReport.audioMissing", {
              missing: audioGap.missing.length,
              total: audioGap.total,
              cents: formatCents(audioGap.cents),
            })}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleGenerateAudio()}
            disabled={generatingAudio}
          >
            <HiOutlineSparkles size={16} aria-hidden="true" />
            {generatingAudio
              ? t("reading:fluencyReport.audioGenerating")
              : t("reading:fluencyReport.audioGenerate")}
          </button>
        </div>
      )}

      {audioGap?.available &&
        audioGap.total > 0 &&
        audioGap.missing.length === 0 && (
          <div className="fluency-audio-alert">
            <p>
              {t("reading:fluencyReport.audioReady", {
                total: audioGap.total,
                cents: formatCents(audioGap.allCents),
              })}
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleGenerateAudio({ regenerate: true })}
              disabled={generatingAudio}
            >
              <HiOutlineSparkles size={16} aria-hidden="true" />
              {generatingAudio
                ? t("reading:fluencyReport.audioGenerating")
                : t("reading:fluencyReport.audioRegenerate")}
            </button>
          </div>
        )}

      {audioGap?.available && audioGap.ready.length > 0 && (
        <ModelAudioPreview
          textId={report?.assignment?.textId}
          parts={audioGap.ready}
        />
      )}

      {generatingAudio && audioProgress && (
        <div className="fluency-audio-progress" role="status">
          <progress
            className="fluency-audio-bar"
            max={audioProgress.total || 1}
            value={audioProgress.done}
            aria-label={t("reading:fluencyReport.audioProgress", {
              done: audioProgress.done,
              total: audioProgress.total,
            })}
          />
          <span>
            {t("reading:fluencyReport.audioProgress", {
              done: audioProgress.done,
              total: audioProgress.total,
            })}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={cancelAudioGeneration}
          >
            {t("reading:common.cancel")}
          </button>
        </div>
      )}

      {coverageError && (
        <div className="fluency-audio-alert is-error">
          <p>{t("reading:fluencyReport.audioCoverageFailed")}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadCoverage}
          >
            {t("reading:fluencyReport.audioRetry")}
          </button>
        </div>
      )}

      <div className="fluency-report-toolbar">
        <select
          aria-label={t("reading:fluencyReport.partFilter")}
          value={partFilter}
          onChange={(event) => setPartFilter(event.target.value)}
        >
          <option value="all">{t("reading:fluencyReport.allParts")}</option>
          {report.parts.map((part, index) => (
            <option key={part.key} value={part.key}>
              {part.title ||
                t("reading:fluencyReport.partFallback", { n: index + 1 })}
            </option>
          ))}
        </select>
        <select
          aria-label={t("reading:fluencyReport.statusFilter")}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">{t("reading:fluencyReport.allStudents")}</option>
          <option value="needs_support">
            {t("reading:fluencyReport.status.needsSupport")}
          </option>
          <option value="on_track">
            {t("reading:fluencyReport.status.onTrack")}
          </option>
          <option value="not_started">
            {t("reading:fluencyReport.status.notStarted")}
          </option>
          <option value="goal_met">
            {t("reading:fluencyReport.status.goalMet")}
          </option>
        </select>
        <label className="reading-search fluency-report-search">
          <HiOutlineSearch size={16} aria-hidden="true" />
          <span className="reading-sr-only">
            {t("reading:fluencyReport.searchLabel")}
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("reading:fluencyReport.searchPlaceholder")}
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary btn-sm fluency-export"
          onClick={handleExport}
          disabled={exporting || !report.students.length}
        >
          <HiOutlineDownload size={16} aria-hidden="true" />
          {exporting
            ? t("reading:fluencyReport.exporting")
            : t("reading:fluencyReport.export")}
        </button>
      </div>

      {report.students.length === 0 ? (
        <p className="reading-dash results-empty-note">
          {t("reading:fluencyReport.noStudents")}
        </p>
      ) : visibleStudents.length === 0 ? (
        <p className="reading-dash results-empty-note">
          {t("reading:fluencyReport.noMatches")}
        </p>
      ) : (
        <div className="reading-table-card">
          <div className="reading-table-wrap">
            <table className="reading-table results-table fluency-table">
              <caption className="reading-sr-only">
                {t("reading:fluencyReport.caption")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    {t("reading:fluencyReport.columns.student")}
                  </th>
                  <th scope="col" className="reading-cell-number">
                    {t("reading:fluencyReport.columns.parts")}
                  </th>
                  <th scope="col" className="reading-cell-number">
                    {t("reading:fluencyReport.columns.readings")}
                  </th>
                  <th scope="col">
                    {t("reading:fluencyReport.columns.accuracy")}
                  </th>
                  <th scope="col" className="reading-col-optional">
                    {t("reading:fluencyReport.columns.pace")}
                  </th>
                  <th scope="col" className="reading-col-optional">
                    {t("reading:fluencyReport.columns.lastPractised")}
                  </th>
                  <th scope="col">
                    {t("reading:fluencyReport.columns.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => {
                  const partRow =
                    partFilter === "all"
                      ? null
                      : student.parts.find((part) => part.key === partFilter);
                  return (
                    <tr
                      key={student._id}
                      className="fluency-report-row"
                      onClick={() => setOpenStudentId(String(student._id))}
                    >
                      <td>
                        <button
                          type="button"
                          className="fluency-student-link"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenStudentId(String(student._id));
                          }}
                        >
                          {student.name || t("reading:fluencyReport.unnamed")}
                        </button>
                        {!student.assigned && (
                          <span className="reading-tags">
                            <em>{t("reading:assignments.noLongerAssigned")}</em>
                          </span>
                        )}
                      </td>
                      <td className="reading-cell-number">
                        {student.partsStarted}
                        {" / "}
                        {student.partsTotal}
                      </td>
                      <td className="reading-cell-number">
                        {partRow ? partRow.readings : student.readings}
                      </td>
                      <td>
                        <AccuracyCell
                          first={
                            partRow
                              ? partRow.firstAccuracy
                              : student.firstAccuracy
                          }
                          latest={
                            partRow
                              ? partRow.latestAccuracy
                              : student.latestAccuracy
                          }
                          change={
                            partRow
                              ? Number.isFinite(partRow.firstAccuracy) &&
                                Number.isFinite(partRow.latestAccuracy)
                                ? Math.round(
                                    partRow.latestAccuracy -
                                      partRow.firstAccuracy,
                                  )
                                : null
                              : student.accuracyChange
                          }
                          t={t}
                        />
                      </td>
                      <td className="reading-col-optional">
                        <PaceCell
                          first={partRow ? partRow.firstWpm : student.firstWpm}
                          latest={
                            partRow ? partRow.latestWpm : student.latestWpm
                          }
                          change={
                            partRow
                              ? Number.isFinite(partRow.firstWpm) &&
                                Number.isFinite(partRow.latestWpm)
                                ? Math.round(
                                    partRow.latestWpm - partRow.firstWpm,
                                  )
                                : null
                              : student.wpmChange
                          }
                        />
                      </td>
                      <td className="reading-col-optional reading-cell-date">
                        {formatDate(
                          partRow
                            ? partRow.lastPractised
                            : student.lastPractised,
                        )}
                      </td>
                      <td>
                        <span
                          className={`fluency-status ${statusClass(student.status)}`}
                        >
                          {t(
                            `reading:fluencyReport.status.${STATUS_LABEL[student.status]}`,
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="fluency-hard-words">
        <h3>{t("reading:fluencyReport.hardWordsTitle")}</h3>
        {hardWords.length === 0 ? (
          <p className="fluency-report-note">
            {t("reading:fluencyReport.hardWordsEmpty")}
          </p>
        ) : (
          <>
            <p className="fluency-report-note">
              {t("reading:fluencyReport.hardWordsHint")}
            </p>
            <ul className="fluency-word-chips">
              {hardWords.map((item) => (
                <li key={item.word}>
                  <span>{item.word}</span>
                  <em>{item.misses}</em>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="fluency-report-note fluency-report-footnote">
        {t("reading:fluencyReport.footnote")}
      </p>
    </div>
  );
}
