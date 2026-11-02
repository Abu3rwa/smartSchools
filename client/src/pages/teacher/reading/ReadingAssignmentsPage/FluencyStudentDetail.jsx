import { Fragment, useEffect, useMemo, useState } from "react";
import { HiOutlineArrowLeft, HiOutlineChevronDown, HiOutlineChevronUp } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import readingService from "../../../../services/readingService.js";
import { issuesByIndex, markedTokens } from "../../../student/reading/fluency/fluencyText.js";
import "./FluencyReport.css";

const STATUS_LABEL = {
  needs_support: "needsSupport",
  on_track: "onTrack",
  not_started: "notStarted",
  goal_met: "goalMet",
};

const chartDomain = (values, kind) => {
  if (!values.length) return { min: 0, max: kind === "accuracy" ? 100 : 50 };
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (kind === "accuracy") {
    const min = Math.max(0, Math.floor((low - 5) / 10) * 10);
    const max = Math.min(100, Math.ceil((high + 5) / 10) * 10);
    return { min, max: max === min ? Math.min(100, min + 10) : max };
  }
  const min = Math.max(0, Math.floor((low - 10) / 10) * 10);
  const max = Math.ceil((high + 10) / 10) * 10;
  return { min, max: max === min ? min + 10 : max };
};

function SeriesChart({ label, values, kind, t }) {
  const width = 300;
  const height = 138;
  const padX = 34;
  const padY = 18;
  const domain = chartDomain(values, kind);
  const span = domain.max - domain.min || 1;
  const step = values.length > 1 ? (width - padX * 2) / (values.length - 1) : 0;
  const pointAt = (value, index) => ({
    x: padX + step * index,
    y: height - padY - ((value - domain.min) / span) * (height - padY * 2),
  });
  const points = values.map(pointAt);
  const ticks = [domain.max, (domain.max + domain.min) / 2, domain.min];

  return (
    <figure className="fluency-chart">
      <figcaption>{label}</figcaption>
      {values.length === 0 ? (
        <p className="fluency-report-note">{t("reading:fluencyReport.detail.noReadings")}</p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t("reading:fluencyReport.detail.chartAria", { label })}
          direction="ltr"
        >
          {ticks.map((tick) => {
            const ratio = (tick - domain.min) / span;
            const y = height - padY - ratio * (height - padY * 2);
            return (
              <g key={tick}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  className="fluency-chart-grid"
                />
                <text x={padX - 6} y={y + 4} textAnchor="end" className="fluency-chart-label">
                  {Math.round(tick)}
                </text>
              </g>
            );
          })}
          {points.length > 1 && (
            <polyline
              points={points.map((point) => `${point.x},${point.y}`).join(" ")}
              className="fluency-chart-line"
            />
          )}
          {points.map((point, index) => (
            <circle
              key={`${point.x}-${index}`}
              cx={points.length === 1 ? width / 2 : point.x}
              cy={point.y}
              r="3.4"
              className="fluency-chart-dot"
            >
              <title>{`${index + 1}: ${Math.round(values[index])}`}</title>
            </circle>
          ))}
        </svg>
      )}
    </figure>
  );
}

const statusClass = (status) => `is-${String(status || "").replace(/_/g, "-")}`;

export default function FluencyStudentDetail({ assignmentId, studentId, onBack }) {
  const { t, i18n } = useTranslation(["reading"]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partKey, setPartKey] = useState("");
  const [openAttempt, setOpenAttempt] = useState("");

  useEffect(() => {
    let active = true;
    readingService.getFluencyStudentReport(assignmentId, studentId)
      .then((response) => {
        if (!active) return;
        const data = response.data?.data || null;
        setDetail(data);
        const firstPart = (data?.parts || []).find((part) => part.progress?.readings > 0)
          || (data?.parts || [])[0];
        setPartKey(firstPart?.key || "");
      })
      .catch((requestError) => {
        if (!active) return;
        setDetail(null);
        setError(
          requestError.response?.data?.message || t("reading:fluencyReport.detail.loadFailed"),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignmentId, studentId, t]);

  const part = useMemo(
    () => (detail?.parts || []).find((item) => item.key === partKey) || null,
    [detail, partKey],
  );

  const series = useMemo(() => {
    const counted = (part?.attempts || [])
      .filter((attempt) => attempt.status === "scored" && attempt.counted)
      .slice()
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
    return {
      accuracy: counted.map((attempt) => Number(attempt.accuracy)).filter(Number.isFinite),
      pace: counted
        .filter((attempt) => attempt.wpm !== null && attempt.wpm !== undefined)
        .map((attempt) => Number(attempt.wpm))
        .filter(Number.isFinite),
    };
  }, [part]);

  const formatDate = (value) => {
    if (!value) return t("reading:fluencyReport.never");
    return new Date(value).toLocaleString(i18n.language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="fluency-report-error">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <HiOutlineArrowLeft size={16} aria-hidden="true" />
          {t("reading:fluencyReport.detail.back")}
        </button>
        <p>{error || t("reading:fluencyReport.detail.loadFailed")}</p>
      </div>
    );
  }

  const attempts = part?.attempts || [];
  const marked = openAttempt
    ? markedTokens(part?.text, attempts.find((attempt) => attempt.id === openAttempt)?.statusMap)
    : [];
  const heard = openAttempt
    ? issuesByIndex(attempts.find((attempt) => attempt.id === openAttempt)?.issues)
    : new Map();
  const openAttemptRow = attempts.find((attempt) => attempt.id === openAttempt) || null;

  const missedFor = (attempt) => markedTokens(part?.text, attempt.statusMap)
    .map((token, index) => ({ ...token, index }))
    .filter((token) => token.status === "s" || token.status === "k" || token.status === "e");

  return (
    <div className="fluency-detail">
      <div className="fluency-detail-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <HiOutlineArrowLeft size={16} aria-hidden="true" />
          {t("reading:fluencyReport.detail.back")}
        </button>
        <div className="fluency-detail-title">
          <h3>{detail.student.name || t("reading:fluencyReport.unnamed")}</h3>
          <p>{detail.assignment.title}</p>
        </div>
        <span className={`fluency-status ${statusClass(detail.student.status)}`}>
          {t(`reading:fluencyReport.status.${STATUS_LABEL[detail.student.status]}`)}
        </span>
      </div>

      <div className="fluency-detail-stats">
        <div>
          <span>{detail.totals.readings}</span>
          <small>{t("reading:fluencyReport.detail.readingsLabel")}</small>
        </div>
        <div>
          <span>
            {detail.totals.latestAccuracy === null
              ? "—"
              : `${Math.round(detail.totals.latestAccuracy)}%`}
          </span>
          <small>{t("reading:fluencyReport.detail.latestAccuracy")}</small>
        </div>
        <div>
          <span>
            {detail.totals.latestWpm === null ? "—" : Math.round(detail.totals.latestWpm)}
          </span>
          <small>{t("reading:fluencyReport.detail.latestPace")}</small>
        </div>
        <div>
          <span>{formatDate(detail.totals.lastPractised)}</span>
          <small>{t("reading:fluencyReport.detail.lastPractised")}</small>
        </div>
      </div>

      {detail.parts.length === 0 ? (
        <p className="reading-dash results-empty-note">{t("reading:fluencyReport.detail.noParts")}</p>
      ) : (
        <>
          <div className="fluency-detail-partbar">
            <label>
              <span>{t("reading:fluencyReport.detail.partLabel")}</span>
              <select
                value={partKey}
                onChange={(event) => {
                  setPartKey(event.target.value);
                  setOpenAttempt("");
                }}
              >
                {detail.parts.map((item, index) => (
                  <option key={item.key} value={item.key}>
                    {item.title || t("reading:fluencyReport.partFallback", { n: index + 1 })}
                    {item.enabled ? "" : ` · ${t("reading:fluencyReport.detail.turnedOff")}`}
                  </option>
                ))}
              </select>
            </label>
            {part && (
              <span className="fluency-report-note">
                {t("reading:fluencyReport.detail.partWords", {
                  words: part.wordCount,
                  readings: part.progress.readings,
                })}
              </span>
            )}
          </div>

          <div className="fluency-charts">
            <SeriesChart
              label={t("reading:fluencyReport.detail.accuracyChart")}
              values={series.accuracy}
              kind="accuracy"
              t={t}
            />
            <SeriesChart
              label={t("reading:fluencyReport.detail.paceChart")}
              values={series.pace}
              kind="pace"
              t={t}
            />
          </div>

          <div className="fluency-attempt-list">
            {attempts.length === 0 ? (
              <p className="reading-dash results-empty-note">
                {t("reading:fluencyReport.detail.noAttempts")}
              </p>
            ) : attempts.map((attempt) => {
              const missed = missedFor(attempt);
              const open = openAttempt === attempt.id;
              return (
                <article key={attempt.id} className="fluency-attempt">
                  <header>
                    <div>
                      <strong>
                        {t("reading:fluencyReport.detail.readingNumber", {
                          n: attempt.attemptNumber,
                        })}
                      </strong>
                      <span>{formatDate(attempt.createdAt)}</span>
                    </div>
                    {attempt.status === "scored" ? (
                      <span className={`reading-pill ${attempt.counted ? "is-soft" : "is-warning"}`}>
                        {attempt.counted
                          ? t("reading:fluencyReport.detail.counted")
                          : t("reading:fluencyReport.detail.notCounted")}
                      </span>
                    ) : (
                      <span className="reading-pill is-warning">
                        {t("reading:fluencyReport.detail.notHeard")}
                      </span>
                    )}
                  </header>

                  {attempt.status === "scored" ? (
                    <>
                      <p className="fluency-attempt-stats">
                        {t("reading:fluencyReport.detail.summary", {
                          correct: attempt.wordsCorrect,
                          attempted: attempt.wordsAttempted,
                          accuracy: Math.round(attempt.accuracy),
                        })}
                        {attempt.wpm !== null && (
                          <>
                            {" · "}
                            {t("reading:fluencyReport.detail.summaryPace", {
                              wpm: Math.round(attempt.wpm),
                            })}
                          </>
                        )}
                        {attempt.longPauses > 0 && (
                          <>
                            {" · "}
                            {t("reading:fluencyReport.detail.summaryPauses", {
                              n: attempt.longPauses,
                              sec: Math.round(attempt.longestPauseSec * 10) / 10,
                            })}
                          </>
                        )}
                      </p>

                      {missed.length > 0 && (
                        <ul className="fluency-missed">
                          {missed.slice(0, 8).map((token) => {
                            const heardWord = heard.get(token.index);
                            const label = token.status === "s"
                              ? (heardWord
                                ? t("reading:fluencyReport.detail.missSwapped", {
                                  word: token.word,
                                  heard: heardWord,
                                })
                                : t("reading:fluencyReport.detail.missOther", {
                                  word: token.word,
                                }))
                              : token.status === "k"
                                ? t("reading:fluencyReport.detail.missSkipped", {
                                  word: token.word,
                                })
                                : t("reading:fluencyReport.detail.missEnding", {
                                  word: token.word,
                                });
                            return (
                              <li key={`${attempt.id}-${token.index}`} className={`is-${token.status}`}>
                                {label}
                              </li>
                            );
                          })}
                          {missed.length > 8 && (
                            <li className="is-more">
                              {t("reading:fluencyReport.detail.moreMissed", {
                                n: missed.length - 8,
                              })}
                            </li>
                          )}
                        </ul>
                      )}

                      {attempt.textChanged ? (
                        <p className="fluency-report-note">
                          {t("reading:fluencyReport.detail.textChanged")}
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm fluency-marks-toggle"
                          onClick={() => setOpenAttempt(open ? "" : attempt.id)}
                          aria-expanded={open}
                        >
                          {open
                            ? t("reading:fluencyReport.detail.hideMarks")
                            : t("reading:fluencyReport.detail.showMarks")}
                          {open
                            ? <HiOutlineChevronUp size={15} aria-hidden="true" />
                            : <HiOutlineChevronDown size={15} aria-hidden="true" />}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="fluency-report-note">
                      {t("reading:fluencyReport.detail.notHeardHint")}
                    </p>
                  )}
                </article>
              );
            })}
          </div>

          {openAttemptRow && !openAttemptRow.textChanged && (
            <div className="fluency-marked-panel">
              <p className="fluency-marked-text" dir="ltr">
                {marked.map((token, index) => {
                  const gapStart = index === 0 ? 0 : marked[index - 1].end;
                  const gap = part.text.slice(gapStart, token.start);
                  const status = token.status === "s"
                    ? "is-swapped"
                    : token.status === "k"
                      ? "is-skipped"
                      : token.status === "e"
                        ? "is-ending"
                        : "";
                  return (
                    <Fragment key={`${token.start}-${index}`}>
                      {gap}
                      {status ? (
                        <mark className={`fluency-${status}`}>{token.word}</mark>
                      ) : token.word}
                    </Fragment>
                  );
                })}
                {marked.length > 0 && part.text.slice(marked[marked.length - 1].end)}
              </p>
              <ul className="fluency-detail-legend">
                <li><span className="is-swapped">✕</span>{t("reading:fluency.legendDifferent")}</li>
                <li><span className="is-skipped">–</span>{t("reading:fluency.legendSkipped")}</li>
                <li><span className="is-ending">~</span>{t("reading:fluency.legendEnding")}</li>
              </ul>
            </div>
          )}
        </>
      )}

      <section className="fluency-hard-words">
        <h3>{t("reading:fluencyReport.detail.persistentWords")}</h3>
        {detail.focusWords.length === 0 ? (
          <p className="fluency-report-note">{t("reading:fluencyReport.detail.noPersistentWords")}</p>
        ) : (
          <ul className="fluency-word-chips">
            {detail.focusWords.map((item) => (
              <li key={item.word}>
                <span>{item.word}</span>
                <em>{item.misses}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="fluency-report-note fluency-report-footnote">
        {t("reading:fluencyReport.footnote")}
      </p>
    </div>
  );
}
