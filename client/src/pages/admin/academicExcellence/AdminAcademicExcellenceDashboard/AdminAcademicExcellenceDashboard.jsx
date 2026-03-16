import { useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { PERMISSIONS } from "../../../../constants/permissions";
import { selectUser } from "../../../../store/slices/authSlice";
import useSchoolAEAnalytics from "./hooks/useSchoolAEAnalytics";
import "./AdminAcademicExcellenceDashboard.css";

const labelFromMastery = (value) =>
  String(value || "")
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");

const MASTERY_COLORS = {
  mastered: "#16a34a",
  developing: "#2563eb",
  at_risk: "#dc2626",
  not_started: "#9ca3af",
};

const TREND_COLORS = {
  improving: "#16a34a",
  stable: "#2563eb",
  declining: "#dc2626",
};

const TABS = [
  { key: "analytics", label: "Analytics" },
  { key: "settings", label: "Settings" },
];

const AdminAcademicExcellenceDashboard = () => {
  const user = useSelector(selectUser);
  const [activeTab, setActiveTab] = useState("analytics");

  // Local settings state
  const [localSettings, setLocalSettings] = useState(null);
  const [settingsInitialized, setSettingsInitialized] = useState(false);

  const {
    loading,
    error,
    classes,
    selectedClassId,
    setSelectedClassId,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    analytics,
    atRiskStudents,
    classComparison,
    weakestObjectives,
    aeSettings,
    savingSettings,
    saveSettings,
    exportReport,
    refresh,
  } = useSchoolAEAnalytics();

  const hasPermission = useCallback(
    (perm) => {
      if (!user) return false;
      if (user.role === "super_admin" || user.role === "admin") return true;
      return user.permissions?.includes(perm) ?? false;
    },
    [user],
  );

  // KPIs
  const kpis = useMemo(() => {
    const s = analytics?.summary || {};
    return {
      totalStudents: s.totalStudents || 0,
      atRiskPercent: s.atRiskPercent || 0,
      avgMastery: s.avgMastery || 0,
      tasksCompleted: s.tasksCompleted || 0,
      objectivesMastered: s.objectivesMastered || 0,
    };
  }, [analytics]);

  // Mastery distribution for Pie chart
  const masteryDistribution = useMemo(() => {
    const dist = analytics?.masteryDistribution || {};
    return [
      { name: "Mastered", value: dist.mastered || 0, fill: MASTERY_COLORS.mastered },
      { name: "Developing", value: dist.developing || 0, fill: MASTERY_COLORS.developing },
      { name: "At Risk", value: dist.at_risk || 0, fill: MASTERY_COLORS.at_risk },
      { name: "Not Started", value: dist.not_started || 0, fill: MASTERY_COLORS.not_started },
    ];
  }, [analytics]);

  // Progress trend for Line chart
  const progressTrend = useMemo(() => {
    return analytics?.progressTrend || [];
  }, [analytics]);

  // Init local settings from loaded aeSettings
  useMemo(() => {
    if (aeSettings && !settingsInitialized) {
      setLocalSettings(aeSettings);
      setSettingsInitialized(true);
    }
  }, [aeSettings, settingsInitialized]);

  const updateSettingField = (path, value) => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSaveSettings = async () => {
    if (!localSettings) return;
    try {
      await saveSettings(localSettings);
    } catch {
      /* toast */
    }
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async (format) => {
    setExporting(true);
    try {
      await exportReport(format);
    } catch {
      /* toast */
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="admin-academic-excellence-dashboard">
      {/* Header */}
      <header className="admin-ae-header">
        <div>
          <h1>Academic Excellence Analytics</h1>
          <p>School-wide mastery insights, at-risk tracking, and configuration.</p>
        </div>
        <div className="admin-ae-header-actions">
          {hasPermission(PERMISSIONS.EXPORT_ACADEMIC_EXCELLENCE_REPORTS) && (
            <button type="button" className="admin-ae-btn" onClick={() => handleExport("csv")} disabled={exporting}>
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          )}
          <button type="button" className="admin-ae-btn" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="admin-ae-filters">
        <select
          className="admin-ae-select"
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
        >
          <option value="">All Classes</option>
          {classes.map((cls) => (
            <option key={cls._id} value={cls._id}>
              {cls.name || cls.className || cls._id}
            </option>
          ))}
        </select>
        {subjects.length > 0 && (
          <select
            className="admin-ae-select"
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
          >
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub._id || sub} value={sub._id || sub}>
                {sub.name || sub}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && <div className="admin-ae-loading">Loading analytics...</div>}
      {error && <div className="admin-ae-error">{error}</div>}

      {/* Tabs */}
      <nav className="admin-ae-tabs">
        {TABS.map((tab) => {
          if (tab.key === "settings" && !hasPermission(PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_SETTINGS)) return null;
          return (
            <button
              key={tab.key}
              type="button"
              className={`admin-ae-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ═══ Analytics Tab ═══ */}
      {activeTab === "analytics" && (
        <>
          {/* KPI Cards */}
          <div className="admin-ae-kpi-grid">
            <article className="admin-ae-kpi-card">
              <h3>Students Total</h3>
              <strong>{kpis.totalStudents.toLocaleString()}</strong>
            </article>
            <article className="admin-ae-kpi-card">
              <h3>At Risk</h3>
              <strong>{kpis.atRiskPercent}%</strong>
            </article>
            <article className="admin-ae-kpi-card">
              <h3>Avg Mastery</h3>
              <strong>{kpis.avgMastery}%</strong>
            </article>
            <article className="admin-ae-kpi-card">
              <h3>Tasks Completed</h3>
              <strong>{kpis.tasksCompleted.toLocaleString()}</strong>
            </article>
            <article className="admin-ae-kpi-card">
              <h3>Objectives Mastered</h3>
              <strong>{kpis.objectivesMastered.toLocaleString()}</strong>
            </article>
          </div>

          {/* Charts Row */}
          <div className="admin-ae-chart-row">
            {/* Mastery Distribution Pie */}
            <section className="admin-ae-panel">
              <h2>Mastery Distribution</h2>
              {masteryDistribution.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={masteryDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {masteryDistribution.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="admin-ae-empty">No distribution data available.</div>
              )}
            </section>

            {/* Progress Trend Line */}
            <section className="admin-ae-panel">
              <h2>School Progress Trend</h2>
              {progressTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={progressTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="avgMastery" stroke="#0f766e" name="Avg Mastery %" strokeWidth={2} />
                    <Line type="monotone" dataKey="atRiskPercent" stroke="#dc2626" name="At Risk %" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="admin-ae-empty">No trend data available.</div>
              )}
            </section>
          </div>

          {/* Class Comparison Bar */}
          <section className="admin-ae-panel">
            <h2>Class Comparison (Average Mastery %)</h2>
            {classComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, classComparison.length * 40)}>
                <BarChart data={classComparison} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="className" type="category" width={140} />
                  <Tooltip />
                  <Bar dataKey="avgMastery" fill="#0f766e" name="Avg Mastery %" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="admin-ae-empty">No class comparison data available.</div>
            )}
          </section>

          {/* Weakest Objectives Table */}
          <section className="admin-ae-panel">
            <h2>Weakest Objectives Across School</h2>
            {weakestObjectives.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-ae-table">
                  <thead>
                    <tr>
                      <th>Objective</th>
                      <th>% Below Mastery</th>
                      <th>Classes Affected</th>
                      <th>Avg Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weakestObjectives.map((obj, idx) => (
                      <tr key={obj.objectiveKey || idx}>
                        <td>{obj.objectiveName || obj.objectiveKey}</td>
                        <td>{obj.belowMasteryPercent || 0}%</td>
                        <td>{obj.classesAffected || 0}</td>
                        <td>{obj.avgScore || 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-ae-empty">No weak objective data available.</div>
            )}
          </section>

          {/* At-Risk Students Table */}
          <section className="admin-ae-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h2 style={{ margin: 0 }}>At-Risk Students ({atRiskStudents.length})</h2>
              {hasPermission(PERMISSIONS.EXPORT_ACADEMIC_EXCELLENCE_REPORTS) && (
                <button type="button" className="admin-ae-btn" onClick={() => handleExport("csv")} disabled={exporting}>
                  Export CSV
                </button>
              )}
            </div>
            {atRiskStudents.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-ae-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Class</th>
                      <th>Subject</th>
                      <th>Score</th>
                      <th>Trend</th>
                      <th>Tasks Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atRiskStudents.map((student) => (
                      <tr key={student._id || student.studentId}>
                        <td>{student.studentName || student.name || "—"}</td>
                        <td>{student.className || "—"}</td>
                        <td>{student.subjectName || "—"}</td>
                        <td>{student.masteryScore != null ? `${student.masteryScore}%` : "—"}</td>
                        <td>
                          <span className={`academic-excellence-badge ${student.trend || "stable"}`}>
                            {labelFromMastery(student.trend || "stable")}
                          </span>
                        </td>
                        <td>{student.pendingTasksCount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-ae-empty">No at-risk students identified.</div>
            )}
          </section>
        </>
      )}

      {/* ═══ Settings Tab ═══ */}
      {activeTab === "settings" && hasPermission(PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_SETTINGS) && (
        <section className="admin-ae-panel">
          <h2>Academic Excellence Settings</h2>
          {localSettings ? (
            <div className="admin-ae-settings-grid">
              {/* Feature toggles */}
              <strong style={{ fontSize: "0.95rem", marginTop: "0.25rem" }}>Feature Controls</strong>
              <div className="admin-ae-setting-row">
                <label>Enabled</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.enabled ? "on" : "off"}`}
                  onClick={() => updateSettingField("enabled", !localSettings.enabled)}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>Student Dashboard Enabled</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.studentDashboardEnabled ? "on" : "off"}`}
                  onClick={() => updateSettingField("studentDashboardEnabled", !localSettings.studentDashboardEnabled)}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>Practice Tasks Enabled</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.practiceTasksEnabled ? "on" : "off"}`}
                  onClick={() => updateSettingField("practiceTasksEnabled", !localSettings.practiceTasksEnabled)}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>Self-Initiated Practice</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.selfInitiatedPracticeEnabled ? "on" : "off"}`}
                  onClick={() => updateSettingField("selfInitiatedPracticeEnabled", !localSettings.selfInitiatedPracticeEnabled)}
                />
              </div>

              {/* Thresholds */}
              <strong style={{ fontSize: "0.95rem", marginTop: "0.75rem" }}>Thresholds</strong>
              <div className="admin-ae-setting-row">
                <label>Objective Weak Threshold</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={localSettings.thresholds?.objectiveWeakThreshold ?? 70}
                    onChange={(e) => updateSettingField("thresholds.objectiveWeakThreshold", Number(e.target.value))}
                  />
                  <span style={{ minWidth: "36px", fontWeight: 600 }}>{localSettings.thresholds?.objectiveWeakThreshold ?? 70}%</span>
                </div>
              </div>
              <div className="admin-ae-setting-row">
                <label>Mastery Threshold</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={localSettings.thresholds?.masteryThreshold ?? 85}
                    onChange={(e) => updateSettingField("thresholds.masteryThreshold", Number(e.target.value))}
                  />
                  <span style={{ minWidth: "36px", fontWeight: 600 }}>{localSettings.thresholds?.masteryThreshold ?? 85}%</span>
                </div>
              </div>
              <div className="admin-ae-setting-row">
                <label>Repeated Weak Count</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={localSettings.thresholds?.repeatedWeakCount ?? 2}
                  onChange={(e) => updateSettingField("thresholds.repeatedWeakCount", Number(e.target.value))}
                  style={{ width: "70px", border: "1px solid var(--border-color, #d1d5db)", borderRadius: "6px", padding: "0.3rem" }}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>Repeated Weak Window (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={localSettings.thresholds?.repeatedWeakWindowDays ?? 30}
                  onChange={(e) => updateSettingField("thresholds.repeatedWeakWindowDays", Number(e.target.value))}
                  style={{ width: "70px", border: "1px solid var(--border-color, #d1d5db)", borderRadius: "6px", padding: "0.3rem" }}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>Class-Wide Weak Threshold</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={localSettings.thresholds?.classWideWeakThreshold ?? 40}
                    onChange={(e) => updateSettingField("thresholds.classWideWeakThreshold", Number(e.target.value))}
                  />
                  <span style={{ minWidth: "36px", fontWeight: 600 }}>{localSettings.thresholds?.classWideWeakThreshold ?? 40}%</span>
                </div>
              </div>

              {/* Behaviour */}
              <strong style={{ fontSize: "0.95rem", marginTop: "0.75rem" }}>Behaviour</strong>
              <div className="admin-ae-setting-row">
                <label>Auto Sync On Grade Save</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.autoSyncOnGradeSave !== false ? "on" : "off"}`}
                  onClick={() => updateSettingField("autoSyncOnGradeSave", !(localSettings.autoSyncOnGradeSave !== false))}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>Default Task Due Date (days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={localSettings.taskDueDateDefault ?? 7}
                  onChange={(e) => updateSettingField("taskDueDateDefault", Number(e.target.value))}
                  style={{ width: "70px", border: "1px solid var(--border-color, #d1d5db)", borderRadius: "6px", padding: "0.3rem" }}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>Max Tasks Per Objective</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={localSettings.maxTasksPerObjective ?? 5}
                  onChange={(e) => updateSettingField("maxTasksPerObjective", Number(e.target.value))}
                  style={{ width: "70px", border: "1px solid var(--border-color, #d1d5db)", borderRadius: "6px", padding: "0.3rem" }}
                />
              </div>

              {/* Notification Defaults */}
              <strong style={{ fontSize: "0.95rem", marginTop: "0.75rem" }}>School Notification Defaults</strong>
              <div className="admin-ae-setting-row">
                <label>On Task Completed</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.notificationDefaults?.onTaskCompleted !== false ? "on" : "off"}`}
                  onClick={() => updateSettingField("notificationDefaults.onTaskCompleted", !(localSettings.notificationDefaults?.onTaskCompleted !== false))}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>On Objective Mastered</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.notificationDefaults?.onObjectiveMastered !== false ? "on" : "off"}`}
                  onClick={() => updateSettingField("notificationDefaults.onObjectiveMastered", !(localSettings.notificationDefaults?.onObjectiveMastered !== false))}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>On Student Struggling</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.notificationDefaults?.onStudentStruggling !== false ? "on" : "off"}`}
                  onClick={() => updateSettingField("notificationDefaults.onStudentStruggling", !(localSettings.notificationDefaults?.onStudentStruggling !== false))}
                />
              </div>
              <div className="admin-ae-setting-row">
                <label>Weekly Digest</label>
                <button
                  type="button"
                  className={`admin-ae-toggle ${localSettings.notificationDefaults?.onWeeklyDigest !== false ? "on" : "off"}`}
                  onClick={() => updateSettingField("notificationDefaults.onWeeklyDigest", !(localSettings.notificationDefaults?.onWeeklyDigest !== false))}
                />
              </div>

              <button
                type="button"
                className="admin-ae-btn-primary"
                style={{ marginTop: "0.75rem", justifySelf: "start" }}
                disabled={savingSettings}
                onClick={handleSaveSettings}
              >
                {savingSettings ? "Saving..." : "Save Settings"}
              </button>
            </div>
          ) : (
            <div className="admin-ae-empty">Loading settings...</div>
          )}
        </section>
      )}
    </div>
  );
};

export default AdminAcademicExcellenceDashboard;
