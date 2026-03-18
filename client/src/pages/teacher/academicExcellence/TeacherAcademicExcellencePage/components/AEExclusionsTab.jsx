import { PERMISSIONS } from "../../../../../constants/permissions";
import PaginationBar from "./PaginationBar";
import { PAGE_SIZE } from "../constants";

const AEExclusionsTab = ({
  exclusions,
  exclusionsPage,
  setExclusionsPage,
  newExclusion,
  setNewExclusion,
  trackingMode = "objectives",
  hasPermission,
  onCreateExclusion,
  onToggleExclusion,
  onDeleteExclusion,
}) => {
  const entityLabel = trackingMode === "standards" ? "Standard" : "Objective";
  const entityLabelLower = trackingMode === "standards" ? "standard" : "objective";
  const canManage =
    hasPermission(PERMISSIONS.EXCLUDE_ACADEMIC_EXCELLENCE_LESSON) ||
    hasPermission(PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_EXCLUSIONS);

  return (
    <section className="teacher-ae-panel">
      <h2>Exclusions ({exclusions.length})</h2>

      {canManage && (
        <div style={{ display: "grid", gap: "0.5rem", marginBottom: "1rem", padding: "0.75rem", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
          <strong style={{ fontSize: "0.9rem" }}>Add Exclusion</strong>

          <div className="teacher-ae-form-group">
            <label>Scope Type</label>
            <select
              className="teacher-ae-select"
              value={newExclusion.scopeType}
              onChange={(e) => setNewExclusion((p) => ({ ...p, scopeType: e.target.value }))}
            >
              <option value="objective">{entityLabel}</option>
              <option value="lesson">Lesson</option>
              <option value="subject">Subject</option>
            </select>
          </div>

          <div className="teacher-ae-form-group">
            <label>{entityLabel} Key</label>
            <input
              className="teacher-ae-input"
              value={newExclusion.objectiveKey}
              onChange={(e) => setNewExclusion((p) => ({ ...p, objectiveKey: e.target.value }))}
              placeholder={entityLabelLower === "standard" ? "e.g. MATH.5.NF.1" : "e.g. MATH-G5-FRACTIONS-ADD"}
            />
          </div>

          <div className="teacher-ae-form-group">
            <label>Target</label>
            <select
              className="teacher-ae-select"
              value={newExclusion.targetType}
              onChange={(e) => setNewExclusion((p) => ({ ...p, targetType: e.target.value }))}
            >
              <option value="all_students">All Students</option>
              <option value="class">This Class</option>
              <option value="student">Individual Student</option>
            </select>
          </div>

          <div className="teacher-ae-form-group">
            <label>Reason</label>
            <input
              className="teacher-ae-input"
              value={newExclusion.reason}
              onChange={(e) => setNewExclusion((p) => ({ ...p, reason: e.target.value }))}
              placeholder="Why exclude this?"
            />
          </div>

          <button type="button" className="teacher-ae-btn-primary" onClick={onCreateExclusion}>
            Create Exclusion
          </button>
        </div>
      )}

      {exclusions.length === 0 ? (
        <div className="teacher-ae-empty">No active exclusions.</div>
      ) : (
        <div className="teacher-ae-list">
          {exclusions
            .slice((exclusionsPage - 1) * PAGE_SIZE, exclusionsPage * PAGE_SIZE)
            .map((exc) => (
              <div key={exc._id} className="teacher-ae-exclusion-item">
                <div>
                  <strong>{exc.objectiveKey || exc.lessonPlanId || exc.subjectId || "—"}</strong>
                  <div className="teacher-ae-exclusion-meta">
                    {exc.scopeType} · {exc.targetType} · {exc.reason || "No reason"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button type="button" className="teacher-ae-btn" onClick={() => onToggleExclusion(exc._id)}>
                    {exc.isActive ? "Deactivate" : "Activate"}
                  </button>
                  {hasPermission(PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_EXCLUSIONS) && (
                    <button type="button" className="teacher-ae-btn-danger" onClick={() => onDeleteExclusion(exc._id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
      {exclusions.length > 0 && (
        <PaginationBar page={exclusionsPage} total={exclusions.length} pageSize={PAGE_SIZE} onPage={setExclusionsPage} />
      )}
    </section>
  );
};

export default AEExclusionsTab;
