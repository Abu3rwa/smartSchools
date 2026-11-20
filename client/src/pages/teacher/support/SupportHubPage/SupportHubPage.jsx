import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClipboardDocumentCheck,
  HiOutlineCog6Tooth,
  HiOutlineDocumentChartBar,
  HiOutlineLightBulb,
  HiOutlinePlus,
  HiOutlineQueueList,
} from "react-icons/hi2";
import supportService from "../../../../services/supportService.js";
import ErrorBanner from "../../../../components/shared/ErrorBanner.jsx";
import CaseWorkspace from "../../../../components/support/CaseWorkspace.jsx";
import CreateCaseDialog from "../../../../components/support/CreateCaseDialog.jsx";
import RequestsPanel from "../../../../components/support/RequestsPanel.jsx";
import SuggestionsPanel from "../../../../components/support/SuggestionsPanel.jsx";
import QuestionBankPanel from "../../../../components/support/QuestionBankPanel.jsx";
import SettingsPanel from "../../../../components/support/SettingsPanel.jsx";
import ReportsPanel from "../../../../components/support/ReportsPanel.jsx";
import { dueLabel, initials, isOverdue, severityTone, statusTone } from "../../../../components/support/supportUi.js";
import { selectUser } from "../../../../store/slices/authSlice";
import { setCurrentAcademicYear } from "../../../../store/slices/uiSlice";
import "./SupportHubPage.css";
import "./SupportCaseWorkbench.css";

const TABS = [
  { key: "cases", icon: HiOutlineClipboardDocumentCheck },
  { key: "requests", icon: HiOutlineChatBubbleLeftRight },
  { key: "suggestions", icon: HiOutlineLightBulb },
  { key: "bank", icon: HiOutlineQueueList },
  { key: "settings", icon: HiOutlineCog6Tooth },
  { key: "reports", icon: HiOutlineDocumentChartBar },
];

const STATUSES = ["active", "closed"];
const SEVERITIES = ["watch", "support", "intensive"];

const ATTENTION_TONES = {
  surveyOverdue: "is-intensive",
  acknowledge: "is-watch",
  reviewOverdue: "is-support",
};

const SupportHubPage = () => {
  const { t, i18n } = useTranslation("support");
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const canManage = [user?.role, ...(user?.roles || [])].some((role) => role === "admin" || role === "super_admin");

  const [tab, setTab] = useState("cases");
  const [classes, setClasses] = useState([]);
  const [academicYear, setAcademicYear] = useState("");
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesFailed, setClassesFailed] = useState(false);

  const [filters, setFilters] = useState({ status: "active", severity: "", classId: "", subjectId: "", overdue: false });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [subjects, setSubjects] = useState([]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attention, setAttention] = useState(null);
  const [attentionFailed, setAttentionFailed] = useState(false);

  const [openCaseId, setOpenCaseId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const requestSeq = useRef(0);

  const loadClasses = useCallback(async () => {
    setClassesLoading(true);
    try {
      const result = await supportService.getClasses();
      setClasses(result.classes || []);
      setAcademicYear(result.academicYear || "");
      setClassesFailed(false);
      if (result.academicYear && result.academicYear !== localStorage.getItem("currentAcademicYear")) {
        dispatch(setCurrentAcademicYear(result.academicYear));
      }
    } catch {
      setClassesFailed(true);
    } finally {
      setClassesLoading(false);
    }
  }, [dispatch]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [filters, query]);

  useEffect(() => {
    if (!filters.classId) {
      setSubjects([]);
      return;
    }
    let active = true;
    supportService.getClassScope(filters.classId)
      .then((result) => { if (active) setSubjects(result.subjects || []); })
      .catch(() => { if (active) setSubjects([]); });
    return () => { active = false; };
  }, [filters.classId]);

  const params = useMemo(() => {
    const next = { page, limit: 20 };
    if (filters.status) next.status = filters.status;
    if (filters.severity) next.severity = filters.severity;
    if (filters.classId) next.classId = filters.classId;
    if (filters.subjectId) next.subjectId = filters.subjectId;
    if (filters.overdue) next.overdue = true;
    if (query) next.search = query;
    return next;
  }, [filters, query, page]);

  const loadCases = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setBusy(true);
    try {
      const result = await supportService.getCases(params);
      if (requestId !== requestSeq.current) return;
      setData(result);
      setLoadError(null);
    } catch (error) {
      if (requestId !== requestSeq.current) return;
      setData(null);
      setLoadError(error);
    } finally {
      if (requestId === requestSeq.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  }, [params]);

  useEffect(() => {
    if (tab === "cases") loadCases();
  }, [tab, loadCases]);

  const loadAttention = useCallback(async () => {
    setAttentionFailed(false);
    try {
      const result = await supportService.getAttention();
      setAttention(result);
    } catch {
      // The case table must keep working even when this strip cannot load.
      setAttention(null);
      setAttentionFailed(true);
    }
  }, []);

  useEffect(() => {
    if (tab === "cases") loadAttention();
  }, [tab, loadAttention]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const openCreated = (created) => {
    setCreateOpen(false);
    if (created?.id) {
      setTab("cases");
      setOpenCaseId(created.id);
    } else {
      loadCases();
      loadAttention();
    }
  };

  const closeCase = () => {
    setOpenCaseId("");
    loadCases();
    loadAttention();
  };

  const disabled = loadError?.response?.data?.code === "SUPPORT_DISABLED";
  const totalPages = data ? Math.max(Math.ceil(data.total / data.limit), 1) : 1;
  const counts = data?.counts || {};

  // School admin turned the module off: show only the notice, never the
  // workbench chrome. Admins keep one door into settings so it can be turned
  // back on; everyone else sees the explanation and nothing else.
  if (disabled) {
    if (tab === "settings" && canManage) {
      return (
        <div className="support-page">
          <SettingsPanel onChange={() => { setTab("cases"); setLoading(true); loadCases(); }} />
        </div>
      );
    }
    return (
      <div className="support-page">
        <section className="support-card">
          <div className="support-empty-inline">
            <HiOutlineCog6Tooth size={30} />
            <h2>{t("disabled.title")}</h2>
            <p>{t("disabled.body")}</p>
            {canManage && (
              <button type="button" className="btn btn-secondary" onClick={() => setTab("settings")}>
                {t("disabled.openSettings")}
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (openCaseId) {
    return (
      <div className="support-page">
        <CaseWorkspace caseId={openCaseId} onBack={closeCase} />
      </div>
    );
  }

  return (
    <div className="support-page">
      <header className="support-page-head">
        <div>
          <h1>{t("title")}</h1>
          <p>
            {t("subtitle")}
            {academicYear ? ` · ${academicYear}` : ""}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <HiOutlinePlus size={16} />
          {t("cases.create")}
        </button>
      </header>

      <nav className="support-tabs" role="tablist" aria-label={t("tabsLabel")}>
        {TABS.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              className={`support-tab ${tab === entry.key ? "is-active" : ""}`}
              onClick={() => setTab(entry.key)}
            >
              <Icon size={16} />
              {t(`tabs.${entry.key}`)}
            </button>
          );
        })}
      </nav>

      {tab === "cases" && (
        <>
          {classesFailed && (
            <ErrorBanner
              message={t("errors.loadClasses")}
              onRetry={loadClasses}
              retryLabel={t("common.retry")}
            />
          )}

          {!classesLoading && classes.length === 0 && !classesFailed ? (
            <section className="support-card">
              <div className="support-empty-inline">
                <HiOutlineClipboardDocumentCheck size={30} />
                <h2>{t("noClasses.title")}</h2>
                <p>{t("noClasses.body")}</p>
              </div>
            </section>
          ) : (
            <>
              {(attention?.rows?.length > 0 || attentionFailed) && (
                <section className="support-card support-attention">
                  {attentionFailed ? (
                    <div className="support-attention-failed">
                      <span>{t("attention.loadFailed")}</span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={loadAttention}>
                        {t("common.retry")}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="support-attention-head">
                        <h2>{t("attention.title")}</h2>
                      </div>
                      <ul className="support-attention-list">
                        {attention.rows.map((row) => (
                          <li key={row.id}>
                            <button
                              type="button"
                              className="support-attention-row"
                              onClick={() => setOpenCaseId(row.caseId)}
                            >
                              <span className="support-attention-student">{row.student}</span>
                              <span className={`support-chip ${ATTENTION_TONES[row.kind] || "is-support"}`}>
                                {t(`attention.kind.${row.kind}`)}{row.detail ? ` · ${row.detail}` : ""}
                              </span>
                              <span className="support-attention-owner">{row.owner || t("table.unassigned")}</span>
                              <span className="support-attention-due">
                                {row.dueAt ? dueLabel(row.dueAt, i18n.language) : ""}
                              </span>
                              <HiOutlineArrowRight size={14} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}

              <div className="support-toolbar is-compact">
                <label>
                  <span>{t("toolbar.status")}</span>
                  <select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
                    {STATUSES.map((value) => (
                      <option key={value} value={value}>{t(`status.${value}`)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("toolbar.severity")}</span>
                  <select value={filters.severity} onChange={(event) => setFilter("severity", event.target.value)}>
                    <option value="">{t("toolbar.anySeverity")}</option>
                    {SEVERITIES.map((value) => (
                      <option key={value} value={value}>{t(`severity.${value}`)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("toolbar.class")}</span>
                  <select value={filters.classId} onChange={(event) => setFilter("classId", event.target.value)}>
                    <option value="">{t("toolbar.anyClass")}</option>
                    {classes.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}{row.section ? ` · ${row.section}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("toolbar.subject")}</span>
                  <select
                    value={filters.subjectId}
                    disabled={!filters.classId || subjects.length === 0}
                    onChange={(event) => setFilter("subjectId", event.target.value)}
                  >
                    <option value="">{t("toolbar.anySubject")}</option>
                    {subjects.map((row) => (
                      <option key={row.id} value={row.id}>{row.name}</option>
                    ))}
                  </select>
                </label>
                <label className="support-check is-inline">
                  <input
                    type="checkbox"
                    checked={filters.overdue}
                    onChange={(event) => setFilter("overdue", event.target.checked)}
                  />
                  <span>{t("toolbar.overdueOnly")}</span>
                </label>
                <label className="support-search">
                  <span>{t("toolbar.search")}</span>
                  <input
                    value={search}
                    maxLength={60}
                    placeholder={t("toolbar.searchPlaceholder")}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>

              <div className="support-summary-strip">
                <span>{t("summary.active", { n: counts.active || 0 })}</span>
                <span>{t("summary.intensive", { n: counts["active:intensive"] || 0 })}</span>
                <span>{t("summary.support", { n: counts["active:support"] || 0 })}</span>
                <span>{t("summary.closed", { n: counts.closed || 0 })}</span>
              </div>

              <section className="support-card">
                {loading ? (
                  <div className="support-empty-inline"><div className="spinner" /></div>
                ) : loadError ? (
                  <ErrorBanner
                    message={t("errors.loadCases")}
                    onRetry={loadCases}
                    retryLabel={t("common.retry")}
                  />
                ) : !data || data.cases.length === 0 ? (
                  <div className="support-empty-inline">
                    <HiOutlineClipboardDocumentCheck size={30} />
                    <p>{query || filters.severity || filters.classId || filters.subjectId || filters.overdue
                      ? t("cases.emptyFiltered")
                      : t("cases.empty")}</p>
                  </div>
                ) : (
                  <>
                    <table className="support-table is-compact support-cases-table">
                      <thead>
                        <tr>
                          <th>{t("table.student")}</th>
                          <th>{t("table.subjects")}</th>
                          <th>{t("table.severity")}</th>
                          <th>{t("table.status")}</th>
                          <th>{t("table.owner")}</th>
                          <th>{t("table.responses")}</th>
                          <th>{t("table.nextReview")}</th>
                          <th>{t("table.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cases.map((row) => {
                          const overdue = row.status === "active" && isOverdue(row.nextReviewAt);
                          return (
                            <tr key={row.id}>
                              <td data-label={t("table.student")}>
                                <div className="support-student-cell">
                                  <span className="support-avatar" aria-hidden="true">{initials(row.student.name)}</span>
                                  <span>
                                    <strong>{row.student.name}</strong>
                                    <em>{row.student.class}{row.student.section ? ` · ${row.student.section}` : ""}</em>
                                  </span>
                                </div>
                              </td>
                              <td className="support-cell-subjects" data-label={t("table.subjects")}>
                                {row.subjects.map((subject) => subject.name).filter(Boolean).join(", ") || t("table.noSubjects")}
                              </td>
                              <td data-label={t("table.severity")}>
                                <span className={`support-chip ${severityTone(row.severity)} is-solid`}>
                                  {t(`severity.${row.severity}`)}
                                </span>
                              </td>
                              <td data-label={t("table.status")}>
                                <span className={`support-chip ${statusTone(row.status)}`}>{t(`status.${row.status}`)}</span>
                              </td>
                              <td data-label={t("table.owner")}>{row.owner?.name || t("table.unassigned")}</td>
                              <td data-label={t("table.responses")}>{row.responses ? `${row.responses.submitted}/${row.responses.total}` : "—"}</td>
                              <td className={overdue ? "support-overdue" : ""} data-label={t("table.nextReview")}>
                                {row.nextReviewAt ? dueLabel(row.nextReviewAt, i18n.language) : "—"}
                              </td>
                              <td data-label={t("table.actions")}>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenCaseId(row.id)}>
                                  {t("table.open")}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {totalPages > 1 && (
                      <div className="support-pagination">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy || page <= 1}
                          onClick={() => setPage((current) => Math.max(current - 1, 1))}
                        >
                          <HiOutlineArrowLeft size={15} />
                          {t("common.previous")}
                        </button>
                        <span>{t("cases.pageOf", { page: data.page, total: totalPages })}</span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy || page >= totalPages}
                          onClick={() => setPage((current) => current + 1)}
                        >
                          {t("common.next")}
                          <HiOutlineArrowRight size={15} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}

      {tab === "requests" && <RequestsPanel onAccepted={openCreated} />}
      {tab === "suggestions" && <SuggestionsPanel onCreated={openCreated} />}
      {tab === "bank" && <QuestionBankPanel />}
      {tab === "settings" && (
        <SettingsPanel onChange={() => { setLoading(true); loadCases(); }} />
      )}
      {tab === "reports" && <ReportsPanel classes={classes} />}

      {createOpen && (
        <CreateCaseDialog
          classes={classes}
          onClose={() => setCreateOpen(false)}
          onCreated={openCreated}
        />
      )}
    </div>
  );
};

export default SupportHubPage;
