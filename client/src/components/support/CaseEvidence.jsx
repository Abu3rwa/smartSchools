import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineAcademicCap,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineExclamationTriangle,
  HiOutlinePresentationChartLine,
  HiOutlineShieldCheck,
} from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import { dateLabel, errorText } from "./supportUi.js";

const WINDOWS = [30, 60, 90, 120, 180, 365];

const SourceCard = ({ icon, title, source, emptyLabel, children }) => (
  <article className={`support-evidence-card ${source?.available ? "" : "is-unavailable"}`}>
    <header>
      <span className="support-evidence-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
    </header>
    {source?.available === false ? (
      <p className="support-muted">{emptyLabel}</p>
    ) : source?.reason === "no_record" ? (
      <p className="support-muted">{emptyLabel}</p>
    ) : (
      children
    )}
  </article>
);

const CaseEvidence = ({ data }) => {
  const { t, i18n } = useTranslation("support");
  const caseId = data.case.id;
  const [windowDays, setWindowDays] = useState(120);
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvidence(await supportService.getEvidence(caseId, windowDays));
    } catch (error) {
      toast.error(errorText(error, t("errors.loadEvidence")));
    } finally {
      setLoading(false);
    }
  }, [caseId, windowDays, t]);

  useEffect(() => { load(); }, [load]);

  const reasonLabel = (source) => t(`evidence.reason.${source?.reason || "unavailable"}`);

  return (
    <div className="support-evidence">
      <section className="support-card">
        <div className="support-card-head">
          <div>
            <h2>{t("evidence.title")}</h2>
            <p className="support-muted">{t("evidence.body")}</p>
          </div>
          <label className="support-window-select">
            <span>{t("evidence.window")}</span>
            <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))}>
              {WINDOWS.map((days) => (
                <option key={days} value={days}>{t("evidence.windowDays", { days })}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="support-privacy-note">
          <HiOutlineShieldCheck size={16} />
          {t("evidence.privacy")}
        </p>

        {evidence && (
          <div className="support-context-row">
            {evidence.context?.gender && <span>{t(`evidence.gender.${evidence.context.gender}`)}</span>}
            {evidence.context?.age != null && <span>{t("evidence.age", { age: evidence.context.age })}</span>}
            {evidence.context?.grade != null && <span>{t("evidence.grade", { grade: evidence.context.grade })}</span>}
            {evidence.context?.academicYear && <span>{evidence.context.academicYear}</span>}
          </div>
        )}
      </section>

      {loading && !evidence ? (
        <div className="support-empty-inline"><div className="spinner" /></div>
      ) : evidence ? (
        <div className="support-evidence-grid">
          <SourceCard
            icon={<HiOutlinePresentationChartLine size={18} />}
            title={t("evidence.sources.grades")}
            source={evidence.sources?.grades}
            emptyLabel={reasonLabel(evidence.sources?.grades)}
          >
            {evidence.sources.grades.subjects.length === 0 ? (
              <p className="support-muted">{t("evidence.noGrades")}</p>
            ) : (
              <table className="support-table is-compact">
                <thead>
                  <tr>
                    <th>{t("evidence.subject")}</th>
                    <th>{t("evidence.records")}</th>
                    <th>{t("evidence.average")}</th>
                    <th>{t("evidence.direction.label")}</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.sources.grades.subjects.map((row) => (
                    <tr key={row.subjectId}>
                      <td>{row.name || "—"}</td>
                      <td>{row.records}</td>
                      <td>{row.averagePercent != null ? `${row.averagePercent}%` : "—"}</td>
                      <td>
                        <span className={`support-chip is-${row.direction}`}>
                          {t(`evidence.direction.${row.direction}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {evidence.sources.grades.asOf && (
              <p className="support-muted">{t("evidence.asOf", { date: dateLabel(evidence.sources.grades.asOf, i18n.language) })}</p>
            )}
          </SourceCard>

          <SourceCard
            icon={<HiOutlineCalendarDays size={18} />}
            title={t("evidence.sources.attendance")}
            source={evidence.sources?.attendance}
            emptyLabel={reasonLabel(evidence.sources?.attendance)}
          >
            {evidence.sources.attendance.presentShare != null ? (
              <>
                <p className="support-evidence-figure">{evidence.sources.attendance.presentShare}%</p>
                <p className="support-muted">
                  {t("evidence.attendanceMeta", {
                    recorded: evidence.sources.attendance.recordedDays,
                  })}
                </p>
                <ul className="support-count-list">
                  {Object.entries(evidence.sources.attendance.counts || {}).map(([status, count]) => (
                    <li key={status}>
                      <span>{t(`evidence.attendanceStatus.${status}`, { defaultValue: status })}</span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="support-muted">{t("evidence.noAttendance")}</p>
            )}
          </SourceCard>

          <SourceCard
            icon={<HiOutlineExclamationTriangle size={18} />}
            title={t("evidence.sources.behavior")}
            source={evidence.sources?.behavior}
            emptyLabel={reasonLabel(evidence.sources?.behavior)}
          >
            {evidence.sources.behavior.types?.length ? (
              <ul className="support-count-list">
                {evidence.sources.behavior.types.map((row) => (
                  <li key={row.type}>
                    <span>{t(`evidence.behaviorType.${row.type}`, { defaultValue: row.type })}</span>
                    <strong>{row.count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="support-muted">{t("evidence.noBehavior")}</p>
            )}
          </SourceCard>

          <SourceCard
            icon={<HiOutlineChatBubbleLeftRight size={18} />}
            title={t("evidence.sources.remarks")}
            source={evidence.sources?.remarks}
            emptyLabel={reasonLabel(evidence.sources?.remarks)}
          >
            {evidence.sources.remarks.remarks?.length ? (
              <ul className="support-remark-list">
                {evidence.sources.remarks.remarks.map((row) => (
                  <li key={`${row.at}-${row.text.slice(0, 12)}`}>
                    <span>{row.text}</span>
                    <em>{dateLabel(row.at, i18n.language)}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="support-muted">{t("evidence.noRemarks")}</p>
            )}
          </SourceCard>

          <article className="support-evidence-card is-unavailable">
            <header>
              <span className="support-evidence-icon" aria-hidden="true"><HiOutlineAcademicCap size={18} /></span>
              <h3>{t("evidence.sources.map")}</h3>
            </header>
            <p className="support-muted">{t("evidence.reason.not_integrated")}</p>
          </article>

          <article className="support-evidence-card is-unavailable">
            <header>
              <span className="support-evidence-icon" aria-hidden="true"><HiOutlineAcademicCap size={18} /></span>
              <h3>{t("evidence.sources.reading")}</h3>
            </header>
            <p className="support-muted">{t("evidence.reason.not_integrated")}</p>
          </article>
        </div>
      ) : null}
    </div>
  );
};

export default CaseEvidence;
