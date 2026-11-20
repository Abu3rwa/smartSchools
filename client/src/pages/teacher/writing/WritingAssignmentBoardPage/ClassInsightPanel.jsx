import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { countLabel } from "../../../../utils/countText.js";
import writingService from "../../../../services/writingService.js";

function InsightList({ rows, empty, render }) {
  if (!rows.length) return <p className="wa-hint">{empty}</p>;
  return (
    <ul className="wa-insight-list">
      {rows.map((row) => (
        <li key={row.label}>{render(row)}</li>
      ))}
    </ul>
  );
}

const durationText = (t, seconds) => {
  if (seconds === null || seconds === undefined) return t("teacher.insight.noDuration");
  if (seconds < 90) return t("teacher.insight.seconds", { n: seconds });
  return t("teacher.insight.minutes", { n: Math.round(seconds / 60) });
};

/**
 * F9/F11: one screen that answers "what should I reteach tomorrow?" from rows
 * the module already stores, plus the teacher's own review numbers for this
 * task. No AI calls, no teacher ranking.
 */
export default function ClassInsightPanel() {
  const { t } = useTranslation("writing");
  const { assignmentId } = useParams();
  const [insight, setInsight] = useState(null);
  const [workload, setWorkload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const loadedFor = useRef("");

  useEffect(() => {
    let active = true;
    if (loadedFor.current !== assignmentId) {
      // A different task is a different class; the previous summary must not stand in.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInsight(null);
      setWorkload(null);
      setLoading(true);
      setFailed(false);
    }
    Promise.all([
      writingService.getAssignmentInsight(assignmentId),
      writingService.getAssignmentWorkload(assignmentId),
    ])
      .then(([nextInsight, nextWorkload]) => {
        if (!active) return;
        loadedFor.current = assignmentId;
        setInsight(nextInsight);
        setWorkload(nextWorkload);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignmentId]);

  if (loading) {
    return (
      <section className="wa-insight" aria-live="polite">
        <p className="wa-hint">{t("teacher.insight.loading")}</p>
      </section>
    );
  }
  if (failed || !insight || !workload) {
    return (
      <section className="wa-insight">
        <p className="wa-hint">{t("teacher.insight.failed")}</p>
      </section>
    );
  }

  return (
    <section className="wa-insight" aria-label={t("teacher.insight.title")}>
      <article className="wa-insight-card">
        <h3>{t("teacher.insight.title")}</h3>
        <p className="wa-hint">{t("teacher.insight.hint")}</p>
        {insight.assessed === 0 ? (
          <p className="wa-hint">{t("teacher.insight.empty")}</p>
        ) : (
          <>
            <h4>{t("teacher.insight.tasks")}</h4>
            <InsightList
              rows={insight.commonTasks}
              empty={t("teacher.insight.tasksNone")}
              render={(row) => (
                <span>
                  {row.label} ·{" "}
                  {countLabel(t, "teacher.insight.studentCount", row.n)}
                </span>
              )}
            />
            <h4>{t("teacher.insight.weak")}</h4>
            <InsightList
              rows={insight.weakScores}
              empty={t("teacher.insight.weakNone")}
              render={(row) => (
                <span>
                  {row.label} · {t("teacher.insight.percent", { n: row.percent })}{" "}
                  · {countLabel(t, "teacher.insight.studentCount", row.n)}
                </span>
              )}
            />
            <h4>{t("teacher.insight.gaps")}</h4>
            <InsightList
              rows={insight.evidenceGaps}
              empty={t("teacher.insight.gapsNone")}
              render={(row) => (
                <span>
                  {row.label} ·{" "}
                  {countLabel(t, "teacher.insight.studentCount", row.n)}
                </span>
              )}
            />
            <h4>{t("teacher.insight.spelling")}</h4>
            <InsightList
              rows={insight.spellingGaps}
              empty={t("teacher.insight.spellingNone")}
              render={(row) => (
                <span>
                  {row.label} ·{" "}
                  {countLabel(t, "teacher.insight.studentCount", row.n)}
                </span>
              )}
            />
            <p className="wa-hint">
              {t("teacher.insight.packUse", {
                used: insight.packUse,
                assessed: insight.assessed,
              })}
            </p>
            {insight.stalled > 0 && (
              <p className="wa-hint">
                {t("teacher.insight.stalled", {
                  n: countLabel(t, "teacher.insight.studentCount", insight.stalled),
                })}
              </p>
            )}
          </>
        )}
      </article>

      <article className="wa-insight-card">
        <h3>{t("teacher.insight.workloadTitle")}</h3>
        <p className="wa-hint">{t("teacher.insight.workloadHint")}</p>
        {workload.assessments === 0 ? (
          <p className="wa-hint">{t("teacher.insight.workloadEmpty")}</p>
        ) : (
          <dl className="wa-insight-stats">
            <div>
              <dt>{t("teacher.insight.workloadAssessments")}</dt>
              <dd>{workload.assessments}</dd>
            </div>
            <div>
              <dt>{t("teacher.insight.workloadEdited")}</dt>
              <dd>{workload.edited}</dd>
            </div>
            <div>
              <dt>{t("teacher.insight.workloadNotes")}</dt>
              <dd>{workload.notesEdited}</dd>
            </div>
            <div>
              <dt>{t("teacher.insight.workloadRate")}</dt>
              <dd>{t("teacher.insight.percent", { n: workload.editRate })}</dd>
            </div>
            <div>
              <dt>{t("teacher.insight.workloadMedian")}</dt>
              <dd>{durationText(t, workload.reviewSeconds.median)}</dd>
            </div>
            <div>
              <dt>{t("teacher.insight.workloadAverage")}</dt>
              <dd>{durationText(t, workload.reviewSeconds.average)}</dd>
            </div>
          </dl>
        )}
      </article>
    </section>
  );
}
