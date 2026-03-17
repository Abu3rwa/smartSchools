const TOGGLE_ROWS = [
  { label: "Enable AE Notifications",  path: "global.enabled" },
  { label: "On Task Completed",         path: "global.onTaskCompleted" },
  { label: "On Objective Mastered",     path: "global.onObjectiveMastered" },
  { label: "On Student Struggling",     path: "global.onStudentStruggling" },
  { label: "Weekly Digest",             path: "global.onWeeklyDigest" },
];

const CHANNEL_ROWS = [
  { label: "In-App", path: "global.channels.inApp" },
  { label: "Email",  path: "global.channels.email" },
  { label: "Push",   path: "global.channels.push" },
];

/** Safely read a dotted path from an object */
const getByPath = (obj, path) => {
  if (!obj) return undefined;
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
};

const AENotificationsTab = ({ localNotifPrefs, savingNotifs, onUpdateField, onSave }) => (
  <section className="teacher-ae-panel">
    <h2>Notification Preferences</h2>
    {localNotifPrefs ? (
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {TOGGLE_ROWS.map(({ label, path }) => (
          <div key={path} className="teacher-ae-noti-row">
            <label>{label}</label>
            <button
              type="button"
              className={`teacher-ae-toggle ${getByPath(localNotifPrefs, path) ? "on" : "off"}`}
              onClick={() => onUpdateField(path, !getByPath(localNotifPrefs, path))}
            />
          </div>
        ))}

        <strong style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Channels</strong>

        {CHANNEL_ROWS.map(({ label, path }) => (
          <div key={path} className="teacher-ae-noti-row">
            <label>{label}</label>
            <button
              type="button"
              className={`teacher-ae-toggle ${getByPath(localNotifPrefs, path) ? "on" : "off"}`}
              onClick={() => onUpdateField(path, !getByPath(localNotifPrefs, path))}
            />
          </div>
        ))}

        <button
          type="button"
          className="teacher-ae-btn-primary"
          style={{ marginTop: "0.75rem", justifySelf: "start" }}
          disabled={savingNotifs}
          onClick={onSave}
        >
          {savingNotifs ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    ) : (
      <div className="teacher-ae-empty">Loading notification preferences...</div>
    )}
  </section>
);

export default AENotificationsTab;
