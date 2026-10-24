import { useState } from "react";
import api from "../../config/api";
import { HiOutlineCheck, HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";
import "./LiveGroupPanel.css";

const NEW_GROUP = "__new__";
const MAX_NAME_LENGTH = 60;

const asSet = (ids) => new Set((ids || []).map(String));
const sameMembers = (left, right) =>
  left.size === right.size && [...left].every((id) => right.has(id));
const savedRow = (group) => ({
  name: group?.name || "",
  studentIds: (group?.studentIds || []).map(String),
});

const requestMessage = (requestError, fallback) =>
  requestError.response?.data?.message || fallback;

/**
 * The groups a class is split into for levelled questions. Membership is one group per student
 * because a levelled slide can only send a student one question, so a student already placed
 * elsewhere is shown as taken rather than offered twice.
 */
const LiveGroupPanel = ({ classId, groups = [], students = [], onRefresh }) => {
  const [rows, setRows] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [error, setError] = useState("");

  const rowFor = (group) => rows[group._id] || savedRow(group);
  const newRow = rows[NEW_GROUP] || savedRow();
  const writeRow = (key, change) =>
    setRows((previous) => {
      const base =
        previous[key] ||
        savedRow(key === NEW_GROUP ? null : groups.find((group) => group._id === key));
      return { ...previous, [key]: { ...base, ...change } };
    });
  const clearRow = (key) =>
    setRows((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });

  const claimedBy = new Map();
  groups.forEach((group) => {
    group.studentIds.forEach((studentId) => claimedBy.set(String(studentId), group.name));
  });

  // A group can tick its own students; only a student another group holds is unavailable.
  const memberToggles = (key, selectedIds, ownerName) => (
    <div className="live-group-members">
      {students.length === 0 && (
        <p className="live-group-empty">This class has no enrolled students yet.</p>
      )}
      {students.map((student) => {
        const claimed = claimedBy.get(String(student.id));
        const takenByOther = claimed && claimed !== ownerName ? claimed : "";
        return (
          <label
            className="live-group-member"
            key={student.id}
            title={takenByOther ? `Already in ${takenByOther}` : ""}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(String(student.id))}
              disabled={Boolean(takenByOther)}
              onChange={(event) =>
                writeRow(key, {
                  studentIds: event.target.checked
                    ? [...selectedIds, String(student.id)]
                    : [...selectedIds].filter((id) => id !== String(student.id)),
                })
              }
            />
            <span>{student.name}</span>
            {takenByOther && <em>{takenByOther}</em>}
          </label>
        );
      })}
    </div>
  );

  const saveGroup = async (group) => {
    const draft = rowFor(group);
    setSavingKey(group._id);
    setError("");
    try {
      await api.patch(`/live/groups/${group._id}`, {
        name: draft.name,
        studentIds: draft.studentIds,
      });
      clearRow(group._id);
      await onRefresh();
    } catch (requestError) {
      setError(requestMessage(requestError, "Could not update this group."));
    } finally {
      setSavingKey("");
    }
  };

  const createGroup = async () => {
    setSavingKey(NEW_GROUP);
    setError("");
    try {
      await api.post("/live/groups", {
        classId,
        name: newRow.name,
        studentIds: newRow.studentIds,
      });
      clearRow(NEW_GROUP);
      await onRefresh();
    } catch (requestError) {
      setError(requestMessage(requestError, "Could not create this group."));
    } finally {
      setSavingKey("");
    }
  };

  const deleteGroup = async (group) => {
    if (confirmDeleteId !== group._id) {
      setConfirmDeleteId(group._id);
      return;
    }
    setConfirmDeleteId("");
    setSavingKey(group._id);
    setError("");
    try {
      await api.delete(`/live/groups/${group._id}`);
      clearRow(group._id);
      await onRefresh();
    } catch (requestError) {
      setError(requestMessage(requestError, "Could not delete this group."));
    } finally {
      setSavingKey("");
    }
  };

  return (
    <div className="live-groups">
      <div className="live-groups-header">
        <h4>Groups for this class</h4>
        <p>
          A student belongs to one group, so a levelled slide sends each student one question.
        </p>
      </div>

      {groups.map((group) => {
        const draft = rowFor(group);
        const selectedIds = asSet(draft.studentIds);
        const dirty =
          draft.name !== group.name || !sameMembers(selectedIds, asSet(group.studentIds));
        return (
          <section className="live-group" key={group._id}>
            <label className="live-edit-field">
              Group name
              <input
                value={draft.name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) => writeRow(group._id, { name: event.target.value })}
              />
            </label>
            {memberToggles(group._id, selectedIds, group.name)}
            <footer className="live-group-actions">
              <button
                type="button"
                className="live-primary-button live-group-save"
                onClick={() => saveGroup(group)}
                disabled={!dirty || savingKey === group._id}
              >
                <HiOutlineCheck />
                {savingKey === group._id ? "Saving…" : "Save group"}
              </button>
              <button
                type="button"
                className={
                  confirmDeleteId === group._id
                    ? "live-group-confirm"
                    : "live-group-delete"
                }
                onClick={() => deleteGroup(group)}
                disabled={savingKey === group._id}
              >
                <HiOutlineTrash />
                {confirmDeleteId === group._id ? "Confirm delete" : "Delete group"}
              </button>
              <span className="live-group-count">
                {selectedIds.size} of {students.length} students
              </span>
            </footer>
          </section>
        );
      })}

      <section className="live-group live-group-new">
        <label className="live-edit-field">
          New group name
          <input
            value={newRow.name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Group 1"
            onChange={(event) => writeRow(NEW_GROUP, { name: event.target.value })}
          />
        </label>
        {memberToggles(NEW_GROUP, asSet(newRow.studentIds), "")}
        <button
          type="button"
          className="live-secondary-button"
          onClick={createGroup}
          disabled={!newRow.name.trim() || savingKey === NEW_GROUP}
        >
          <HiOutlinePlus />
          {savingKey === NEW_GROUP ? "Creating…" : "Create group"}
        </button>
      </section>

      {error && (
        <p className="live-group-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default LiveGroupPanel;
