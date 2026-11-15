import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineArrowDownTray, HiOutlinePrinter } from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import { printEndpoint, printableErrorText } from "../../utils/printDocument.js";
import { dateLabel, downloadBlob, errorText, statusTone } from "./supportUi.js";

const ReportsPanel = ({ classes }) => {
  const { t, i18n } = useTranslation("support");
  const [filters, setFilters] = useState({ status: "", severity: "", classId: "", overdue: "", search: "" });
  const [search, setSearch] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.search.trim()), 400);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const params = useCallback(() => {
    const clean = {};
    if (filters.status) clean.status = filters.status;
    if (filters.severity) clean.severity = filters.severity;
    if (filters.classId) clean.classId = filters.classId;
    if (filters.overdue) clean.overdue = "true";
    if (search) clean.search = search;
    return clean;
  }, [filters.status, filters.severity, filters.classId, filters.overdue, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await supportService.getReport(params()));
    } catch (error) {
      toast.error(errorText(error, t("errors.loadReport")));
    } finally {
      setLoading(false);
    }
  }, [params, t]);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const downloadCsv = async () => {
    setBusy("csv");
    try {
      const response = await supportService.getReportCsv(params());
      downloadBlob(response.data, `support-cases-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      toast.error(errorText(error, t("errors.export")));
    } finally {
      setBusy("");
    }
  };

  const print = async () => {
    setBusy("print");
    try {
      await printEndpoint("/support/reports/print", { params: params() });
    } catch (error) {
      toast.error(printableErrorText(error, t("errors.print")));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="support-reports">
      <div className="support-toolbar is-compact">
        <label>
          <span>{t("reports.status")}</span>
          <select value={filters.status} onChange={(event) => set("status", event.target.value)}>
            <option value="">{t("reports.allStatuses")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="closed">{t("status.closed")}</option>
          </select>
        </label>
        <label>
          <span>{t("reports.severity")}</span>
          <select value={filters.severity} onChange={(event) => set("severity", event.target.value)}>
            <option value="">{t("reports.allSeverities")}</option>
            {["watch", "support", "intensive"].map((key) => (
              <option key={key} value={key}>{t(`severity.${key}`)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("reports.class")}</span>
          <select value={filters.classId} onChange={(event) => set("classId", event.target.value)}>
            <option value="">{t("reports.allClasses")}</option>
            {(classes || []).map((row) => (
              <option key={row.id} value={row.id}>{row.name}{row.section ? ` · ${row.section}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="support-check is-inline">
          <input
            type="checkbox"
            checked={Boolean(filters.overdue)}
            onChange={(event) => set("overdue", event.target.checked ? "true" : "")}
          />
          <span>{t("reports.overdueOnly")}</span>
        </label>
        <label className="support-search">
          <span>{t("reports.search")}</span>
          <input
            value={filters.search}
            maxLength={80}
            placeholder={t("reports.searchPlaceholder")}
            onChange={(event) => set("search", event.target.value)}
          />
        </label>
        <div className="support-toolbar-actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={downloadCsv}>
            <HiOutlineArrowDownTray size={15} />
            {busy === "csv" ? t("common.working") : t("reports.csv")}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={print}>
            <HiOutlinePrinter size={15} />
            {busy === "print" ? t("common.working") : t("reports.print")}
          </button>
        </div>
      </div>

      {loading && !report ? (
        <div className="support-empty-inline"><div className="spinner" /></div>
      ) : (
        <>
          {report?.truncated && <p className="support-warning-list is-inline">{t("reports.truncated")}</p>}
          <p className="support-muted">
            {t("reports.generated", { date: dateLabel(report?.generatedAt, i18n.language), n: report?.rows?.length || 0 })}
          </p>
          <div className="support-table-wrap">
            <table className="support-table">
              <thead>
                <tr>
                  <th>{t("reports.columns.student")}</th>
                  <th>{t("reports.columns.subjects")}</th>
                  <th>{t("reports.columns.severity")}</th>
                  <th>{t("reports.columns.status")}</th>
                  <th>{t("reports.columns.owner")}</th>
                  <th>{t("reports.columns.opened")}</th>
                  <th>{t("reports.columns.lastReview")}</th>
                  <th>{t("reports.columns.nextReview")}</th>
                  <th>{t("reports.columns.surveys")}</th>
                  <th>{t("reports.columns.plan")}</th>
                </tr>
              </thead>
              <tbody>
                {(report?.rows || []).length === 0 ? (
                  <tr><td colSpan={10} className="support-muted">{t("reports.empty")}</td></tr>
                ) : report.rows.map((row, index) => (
                  <tr key={`${row.student.name}-${index}`}>
                    <td>
                      <strong>{row.student.name}</strong>
                      <span className="support-muted"> {row.student.class}</span>
                    </td>
                    <td>{row.subjects.join(", ") || "—"}</td>
                    <td><span className={`support-chip ${row.severity === "intensive" ? "is-intensive" : row.severity === "watch" ? "is-watch" : "is-support"} is-solid`}>{t(`severity.${row.severity}`)}</span></td>
                    <td><span className={`support-chip ${statusTone(row.status)}`}>{t(`status.${row.status}`)}</span></td>
                    <td>{row.owner || "—"}</td>
                    <td>{dateLabel(row.openedAt, i18n.language) || "—"}</td>
                    <td>{dateLabel(row.lastReviewAt, i18n.language) || "—"}</td>
                    <td>{dateLabel(row.nextReviewAt, i18n.language) || "—"}</td>
                    <td>{row.surveys.submitted}/{row.surveys.total}</td>
                    <td>
                      {row.plan
                        ? <span className="support-chip is-live">v{row.plan.version}</span>
                        : <span className="support-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportsPanel;
