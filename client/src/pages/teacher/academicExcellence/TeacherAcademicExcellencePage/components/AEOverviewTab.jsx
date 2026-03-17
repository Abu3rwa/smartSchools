import { useState, useEffect, useRef } from "react";
import { PERMISSIONS } from "../../../../../constants/permissions";
import PaginationBar from "./PaginationBar";
import { PAGE_SIZE, labelFromMastery } from "../constants";

// ─── Three-dot action menu ────────────────────────────────────────────
const ObjectiveActionsMenu = ({ obj, hasPermission, onRename, onDeleteRequest, onBulkAssign, onAIPracticeAll }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const canRenameDelete = obj._id && typeof obj._id === "string" && obj._id.length === 24;
  const canBulkAssign   = hasPermission(PERMISSIONS.BULK_ASSIGN_ACADEMIC_EXCELLENCE_TASKS);

  // Nothing to show → render nothing
  if (!canRenameDelete && !canBulkAssign) return null;

  const handleAction = (fn) => { fn(); setOpen(false); };

  return (
    <span className="ae-obj-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className="ae-obj-menu-trigger"
        title="Actions"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className="ae-obj-menu-dropdown" role="menu">
          {canRenameDelete && (
            <>
              <button
                type="button"
                className="ae-obj-menu-item"
                role="menuitem"
                onClick={() => handleAction(() => onRename(obj))}
              >
                <span className="ae-obj-menu-icon">✎</span> Rename
              </button>
              <button
                type="button"
                className="ae-obj-menu-item ae-obj-menu-item--danger"
                role="menuitem"
                onClick={() => handleAction(() => onDeleteRequest(obj._id))}
              >
                <span className="ae-obj-menu-icon">✕</span> Delete
              </button>
              <div className="ae-obj-menu-divider" />
            </>
          )}
          {canBulkAssign && (
            <>
              <button
                type="button"
                className="ae-obj-menu-item"
                role="menuitem"
                onClick={() => handleAction(() => onBulkAssign(obj))}
              >
                <span className="ae-obj-menu-icon">👥</span> Assign All
              </button>
              <button
                type="button"
                className="ae-obj-menu-item"
                role="menuitem"
                onClick={() => handleAction(() => onAIPracticeAll(obj))}
              >
                <span className="ae-obj-menu-icon">🤖</span> AI Practice (All)
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
};

// ─── Heatmap Legend ───────────────────────────────────────────────────
const HeatmapLegend = () => (
  <div className="teacher-ae-heatmap-legend">
    <span className="teacher-ae-legend-item mastered">
      <span className="teacher-ae-legend-dot">M</span> Mastered — move on
    </span>
    <span className="teacher-ae-legend-item developing">
      <span className="teacher-ae-legend-dot">D</span> Developing — needs practice
    </span>
    <span className="teacher-ae-legend-item at_risk">
      <span className="teacher-ae-legend-dot">R</span> At Risk — help NOW
    </span>
    <span className="teacher-ae-legend-item not_started">
      <span className="teacher-ae-legend-dot">N</span> Not Started
    </span>
  </div>
);

// ─── KPI Cards ────────────────────────────────────────────────────────
const KPICards = ({ kpis }) => (
  <div className="teacher-ae-grid">
    <article className="teacher-ae-card">
      <h3>Total Students</h3>
      <strong>{kpis.totalStudents}</strong>
    </article>
    <article className="teacher-ae-card">
      <h3>At Risk</h3>
      <strong>{kpis.atRiskPercent}%</strong>
    </article>
    <article className="teacher-ae-card">
      <h3>Developing</h3>
      <strong>{kpis.developingPercent}%</strong>
    </article>
    <article className="teacher-ae-card">
      <h3>Mastered</h3>
      <strong>{kpis.masteredPercent}%</strong>
    </article>
  </div>
);

// ─── Heatmap ──────────────────────────────────────────────────────────
const HeatmapPanel = ({
  heatmapData, selectedClassId,
  heatmapPage, setHeatmapPage,
  heatmapStudentsPage, setHeatmapStudentsPage,
  hasPermission,
  onCellClick, onCellDoubleClick,
  onRename, onDeleteRequest, onBulkAssign, onAIPracticeAll,
}) => (
  <section className="teacher-ae-panel">
    <div className="teacher-ae-heatmap-header-row">
      <h2 style={{ margin: 0 }}>Objective × Student Heatmap</h2>
      {heatmapData && <HeatmapLegend />}
    </div>

    {heatmapData ? (
      <div className="teacher-ae-heatmap-wrap">
        <table className="teacher-ae-heatmap">
          <thead>
            <tr>
              <th>Objective</th>
              {(heatmapData.students || [])
                .slice((heatmapStudentsPage - 1) * PAGE_SIZE, heatmapStudentsPage * PAGE_SIZE)
                .map((s) => <th key={s._id}>{s.name || s._id}</th>)}
            </tr>
          </thead>
          <tbody>
            {(heatmapData.objectives || [])
              .slice((heatmapPage - 1) * PAGE_SIZE, heatmapPage * PAGE_SIZE)
              .map((obj) => (
                <tr key={obj.objectiveKey}>
                  <td className="teacher-ae-objective-cell">
                    <div className="teacher-ae-objective-cell-inner">
                      <span className="teacher-ae-objective-name" title={obj.objectiveName || obj.objectiveKey}>
                        {obj.objectiveName || obj.objectiveKey}
                      </span>
                      <ObjectiveActionsMenu
                        obj={obj}
                        hasPermission={hasPermission}
                        onRename={onRename}
                        onDeleteRequest={onDeleteRequest}
                        onBulkAssign={onBulkAssign}
                        onAIPracticeAll={onAIPracticeAll}
                      />
                    </div>
                  </td>
                  {(heatmapData.students || [])
                    .slice((heatmapStudentsPage - 1) * PAGE_SIZE, heatmapStudentsPage * PAGE_SIZE)
                    .map((s) => {
                      const cell = (obj.studentLevels || {})[s._id] || "not_started";
                      return (
                        <td
                          key={s._id}
                          className={cell}
                          style={{ cursor: "pointer" }}
                          onClick={() => onCellClick(s, obj)}
                          onDoubleClick={() => onCellDoubleClick(obj, s)}
                          title={`${s.name}: ${labelFromMastery(cell)} (double click to assign AI practice)`}
                        >
                          {labelFromMastery(cell).charAt(0)}
                        </td>
                      );
                    })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="teacher-ae-empty">
        {selectedClassId ? "No heatmap data available for this class." : "Select a class to view the heatmap."}
      </div>
    )}

    {heatmapData?.objectives?.length > 0 && (
      <div className="teacher-ae-heatmap-pagination-row">
        <div>
          <span className="teacher-ae-heatmap-pagination-label">Objectives (rows)</span>
          <PaginationBar page={heatmapPage} total={heatmapData.objectives.length} pageSize={PAGE_SIZE} onPage={setHeatmapPage} />
        </div>
        {(heatmapData.students || []).length > PAGE_SIZE && (
          <div>
            <span className="teacher-ae-heatmap-pagination-label">Students (columns)</span>
            <PaginationBar page={heatmapStudentsPage} total={heatmapData.students.length} pageSize={PAGE_SIZE} onPage={setHeatmapStudentsPage} />
          </div>
        )}
      </div>
    )}
  </section>
);

// ─── Objectives List ──────────────────────────────────────────────────
const ObjectivesList = ({
  objectives,
  objectivesPage, setObjectivesPage,
  editingObjectiveId,
  editingObjectiveName, setEditingObjectiveName,
  confirmDeleteObjectiveId,
  onStartRename, onConfirmRename, onCancelRename,
  onDeleteRequest, onDeleteConfirm,
  onAIPracticeAll,
  hasPermission,
}) => (
  <section className="teacher-ae-panel">
    <h2>Objectives ({objectives.length})</h2>
    {objectives.length === 0 ? (
      <div className="teacher-ae-empty">No objectives tracked yet.</div>
    ) : (
      <div className="teacher-ae-list">
        {objectives
          .slice((objectivesPage - 1) * PAGE_SIZE, objectivesPage * PAGE_SIZE)
          .map((obj) => (
            <article key={obj._id || obj.objectiveKey} className="teacher-ae-task-item">
              <div className="teacher-ae-task-header">
                {editingObjectiveId === obj._id ? (
                  <div className="teacher-ae-inline-edit">
                    <input
                      className="teacher-ae-input"
                      value={editingObjectiveName}
                      onChange={(e) => setEditingObjectiveName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")  onConfirmRename();
                        if (e.key === "Escape") onCancelRename();
                      }}
                      autoFocus
                    />
                    <button type="button" className="teacher-ae-btn-primary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.78rem" }} onClick={onConfirmRename}>Save</button>
                    <button type="button" className="teacher-ae-btn"         style={{ padding: "0.2rem 0.5rem", fontSize: "0.78rem" }} onClick={onCancelRename}>Cancel</button>
                  </div>
                ) : (
                  <div className="teacher-ae-objective-name-group">
                    <strong className="teacher-ae-objective-name" title={obj.objectiveName || obj.objectiveKey}>
                      {obj.objectiveName || obj.objectiveKey}
                    </strong>

                    {/* Three-dot menu */}
                    <ObjectiveActionsMenu
                      obj={obj}
                      hasPermission={hasPermission}
                      onRename={onStartRename}
                      onDeleteRequest={onDeleteRequest}
                      onBulkAssign={() => {/* no bulk assign in list view */}}
                      onAIPracticeAll={onAIPracticeAll}
                    />

                    {/* Confirm delete inline */}
                    {confirmDeleteObjectiveId === obj._id && (
                      <span className="teacher-ae-confirm-delete">
                        <button type="button" className="teacher-ae-btn-danger" style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem" }} onClick={() => onDeleteConfirm(obj._id)}>Confirm</button>
                        <button type="button" className="teacher-ae-btn"        style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem" }} onClick={() => onDeleteRequest(null)}>Cancel</button>
                      </span>
                    )}
                  </div>
                )}
                <span className={`academic-excellence-badge ${obj.masteryLevel || "not_started"}`}>
                  {labelFromMastery(obj.masteryLevel)}
                </span>
              </div>
              <div className="teacher-ae-task-meta">
                <span>Avg Score: {obj.avgScore ?? obj.masteryScore ?? 0}%</span>
                <span>Students at risk: {obj.atRiskCount || 0}</span>
              </div>
            </article>
          ))}
      </div>
    )}
    {objectives.length > 0 && (
      <PaginationBar page={objectivesPage} total={objectives.length} pageSize={PAGE_SIZE} onPage={setObjectivesPage} />
    )}
  </section>
);

// ─── AEOverviewTab ────────────────────────────────────────────────────
const AEOverviewTab = ({
  kpis,
  heatmapData, selectedClassId,
  objectives,
  heatmapPage,         setHeatmapPage,
  heatmapStudentsPage, setHeatmapStudentsPage,
  objectivesPage,      setObjectivesPage,
  editingObjectiveId,
  editingObjectiveName, setEditingObjectiveName,
  confirmDeleteObjectiveId,
  hasPermission,
  onHeatmapCellClick, onHeatmapCellDoubleClick,
  onStartRename, onConfirmRename, onCancelRename,
  onDeleteRequest, onDeleteConfirm,
  onBulkAssign, onAIPracticeAll,
}) => (
  <>
    <KPICards kpis={kpis} />
    <HeatmapPanel
      heatmapData={heatmapData}
      selectedClassId={selectedClassId}
      heatmapPage={heatmapPage}               setHeatmapPage={setHeatmapPage}
      heatmapStudentsPage={heatmapStudentsPage} setHeatmapStudentsPage={setHeatmapStudentsPage}
      hasPermission={hasPermission}
      onCellClick={onHeatmapCellClick}
      onCellDoubleClick={onHeatmapCellDoubleClick}
      onRename={onStartRename}
      onDeleteRequest={onDeleteRequest}
      onBulkAssign={onBulkAssign}
      onAIPracticeAll={onAIPracticeAll}
    />
    <ObjectivesList
      objectives={objectives}
      objectivesPage={objectivesPage}           setObjectivesPage={setObjectivesPage}
      editingObjectiveId={editingObjectiveId}
      editingObjectiveName={editingObjectiveName} setEditingObjectiveName={setEditingObjectiveName}
      confirmDeleteObjectiveId={confirmDeleteObjectiveId}
      onStartRename={onStartRename}
      onConfirmRename={onConfirmRename}
      onCancelRename={onCancelRename}
      onDeleteRequest={onDeleteRequest}
      onDeleteConfirm={onDeleteConfirm}
      onAIPracticeAll={onAIPracticeAll}
      hasPermission={hasPermission}
    />
  </>
);

export default AEOverviewTab;
