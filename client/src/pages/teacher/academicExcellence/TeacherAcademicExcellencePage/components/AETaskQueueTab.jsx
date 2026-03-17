import { PERMISSIONS } from "../../../../../constants/permissions";
import PaginationBar from "./PaginationBar";
import { PAGE_SIZE, labelFromMastery } from "../constants";

const AETaskQueueTab = ({
  taskQueue,
  tasksPage,
  setTasksPage,
  reviewingTaskId,
  feedbackText,
  setFeedbackText,
  hasPermission,
  onStartReview,
  onSubmitReview,
  onCancelReview,
}) => (
  <section className="teacher-ae-panel">
    <h2>Task Queue ({taskQueue.length})</h2>
    {taskQueue.length === 0 ? (
      <div className="teacher-ae-empty">No tasks awaiting review.</div>
    ) : (
      <div className="teacher-ae-list">
        {taskQueue
          .slice((tasksPage - 1) * PAGE_SIZE, tasksPage * PAGE_SIZE)
          .map((task) => (
            <article key={task._id} className="teacher-ae-task-item">
              <div className="teacher-ae-task-header">
                <strong>{task.title || task.objectiveName || "Task"}</strong>
                <span className={`academic-excellence-badge ${task.status || "assigned"}`}>
                  {labelFromMastery(task.status)}
                </span>
              </div>
              <div className="teacher-ae-task-meta">
                <span>Student: {task.studentName || task.student?.name || "—"}</span>
                <span>Objective: {task.objectiveName || task.objectiveKey || "—"}</span>
                <span>Score: {task.studentScore != null ? `${task.studentScore}%` : "—"}</span>
                <span>Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}</span>
              </div>
              {task.studentNotes && (
                <div style={{ fontSize: "0.85rem", fontStyle: "italic" }}>
                  &ldquo;{task.studentNotes}&rdquo;
                </div>
              )}
              {hasPermission(PERMISSIONS.REVIEW_ACADEMIC_EXCELLENCE_TASKS) && task.status === "completed" && (
                <>
                  {reviewingTaskId === task._id ? (
                    <div className="teacher-ae-task-feedback">
                      <textarea
                        placeholder="Your feedback..."
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                      />
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button type="button" className="teacher-ae-btn-primary" onClick={() => onSubmitReview(task._id)}>
                          Submit Feedback
                        </button>
                        <button type="button" className="teacher-ae-btn" onClick={onCancelReview}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="teacher-ae-btn-primary" onClick={() => onStartReview(task._id)}>
                      Review
                    </button>
                  )}
                </>
              )}
              {task.teacherFeedback && (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Feedback: {task.teacherFeedback}
                </div>
              )}
            </article>
          ))}
      </div>
    )}
    {taskQueue.length > 0 && (
      <PaginationBar page={tasksPage} total={taskQueue.length} pageSize={PAGE_SIZE} onPage={setTasksPage} />
    )}
  </section>
);

export default AETaskQueueTab;
