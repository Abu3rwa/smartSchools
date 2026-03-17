import { useState } from "react";
import { PERMISSIONS } from "../../../../../constants/permissions";
import PaginationBar from "./PaginationBar";
import { PAGE_SIZE } from "../constants";

const AEStudentMonitorTab = ({
  students,
  classSummary,
  studentsPage,
  setStudentsPage,
  selectedClassId,
  hasPermission,
  onOpenDrawer,
  onAssignTask,
  onToggleAE,
}) => {
  // Track per-student loading state for the AE toggle button
  const [togglingAE, setTogglingAE] = useState({});

  const handleToggleAE = async (student) => {
    if (!selectedClassId) return;
    setTogglingAE((prev) => ({ ...prev, [student._id]: true }));
    try {
      await onToggleAE(student._id, selectedClassId);
    } catch {
      /* toast can go here */
    } finally {
      setTogglingAE((prev) => ({ ...prev, [student._id]: false }));
    }
  };

  return (
    <section className="teacher-ae-panel">
      <h2>Student Monitor</h2>
      {students.length === 0 ? (
        <div className="teacher-ae-empty">No students in this class.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="teacher-ae-student-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>At Risk</th>
                <th>Developing</th>
                <th>Mastered</th>
                <th>Tasks Pending</th>
                <th>AE Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students
                .slice((studentsPage - 1) * PAGE_SIZE, studentsPage * PAGE_SIZE)
                .map((student) => {
                  const aeData   = classSummary?.studentBreakdown?.[student._id] || {};
                  const disabled = aeData.isDisabled === true;
                  const toggling = togglingAE[student._id] === true;

                  return (
                    <tr key={student._id} style={{ opacity: disabled ? 0.65 : 1 }}>
                      <td>
                        <button
                          type="button"
                          className="teacher-ae-btn"
                          style={{ border: 0, background: "transparent", fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                          onClick={() => onOpenDrawer(student)}
                        >
                          {student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim() || student._id}
                        </button>
                      </td>
                      <td>{aeData.atRiskCount       || 0}</td>
                      <td>{aeData.developingCount    || 0}</td>
                      <td>{aeData.masteredCount      || 0}</td>
                      <td>{aeData.pendingTasksCount  || 0}</td>

                      {/* AE Status pill */}
                      <td>
                        <span className={`academic-excellence-badge ${disabled ? "at_risk" : "mastered"}`}>
                          {disabled ? "Disabled" : "Active"}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {hasPermission(PERMISSIONS.ASSIGN_ACADEMIC_EXCELLENCE_TASKS) && (
                            <button
                              type="button"
                              className="teacher-ae-btn-primary"
                              style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}
                              onClick={() => onAssignTask(student)}
                              disabled={disabled}
                              title={disabled ? "AE is disabled for this student" : "Assign a task"}
                            >
                              Assign Task
                            </button>
                          )}
                          {hasPermission(PERMISSIONS.DISABLE_ACADEMIC_EXCELLENCE_FOR_STUDENT) && (
                            <button
                              type="button"
                              className={disabled ? "teacher-ae-btn-primary" : "teacher-ae-btn"}
                              style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}
                              disabled={toggling}
                              onClick={() => handleToggleAE(student)}
                              title={disabled ? "Re-enable AE for this student" : "Disable AE for this student"}
                            >
                              {toggling ? "..." : disabled ? "Enable AE" : "Disable AE"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      {students.length > 0 && (
        <PaginationBar page={studentsPage} total={students.length} pageSize={PAGE_SIZE} onPage={setStudentsPage} />
      )}
    </section>
  );
};

export default AEStudentMonitorTab;
