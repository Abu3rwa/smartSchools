import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineBellAlert, HiOutlineSparkles } from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import { errorText } from "./supportUi.js";

const KIND_TONE = { attendance: "is-watch", grades: "is-support", behavior: "is-intensive" };

const SuggestionsPanel = ({ onCreated }) => {
  const { t } = useTranslation("support");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState("");
  const [form, setForm] = useState({ subjectIds: [], severity: "watch", concernNote: "" });
  const [subjects, setSubjects] = useState([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await supportService.getSuggestions());
    } catch (error) {
      toast.error(errorText(error, t("errors.loadSuggestions")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const openItem = async (item) => {
    if (openId === item.signature) {
      setOpenId("");
      return;
    }
    setOpenId(item.signature);
    setForm({ subjectIds: [], severity: "watch", concernNote: "" });
    setSubjects([]);
    if (!item.student.classId) return;
    try {
      const scope = await supportService.getClassScope(item.student.classId);
      setSubjects(scope.subjects || []);
    } catch {
      setSubjects([]);
    }
  };

  const toggleSubject = (subjectId) => {
    setForm((current) => ({
      ...current,
      subjectIds: current.subjectIds.includes(subjectId)
        ? current.subjectIds.filter((id) => id !== subjectId)
        : [...current.subjectIds, subjectId],
    }));
  };

  const confirm = async (item) => {
    if (form.subjectIds.length === 0) {
      toast.error(t("suggestions.chooseSubject"));
      return;
    }
    setBusy(`confirm-${item.signature}`);
    try {
      const result = await supportService.confirmSuggestion({
        studentId: item.student.id,
        subjectIds: form.subjectIds,
        severity: form.severity,
        concernNote: form.concernNote,
      });
      toast.success(t("suggestions.confirmed", { n: result.issued?.length || 0 }));
      setOpenId("");
      await load();
      if (result.case?.id) onCreated(result.case.id);
    } catch (error) {
      toast.error(errorText(error, t("errors.confirmSuggestion")));
    } finally {
      setBusy("");
    }
  };

  const dismiss = async (item) => {
    setBusy(`dismiss-${item.signature}`);
    try {
      await supportService.dismissSuggestion({
        studentId: item.student.id,
        signature: item.signature,
        reason: "",
      });
      toast.success(t("suggestions.dismissed"));
      setOpenId("");
      await load();
    } catch (error) {
      toast.error(errorText(error, t("errors.dismissSuggestion")));
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return <div className="support-empty-inline"><div className="spinner" /></div>;
  }

  if (!data?.available) {
    return (
      <div className="support-empty">
        <HiOutlineSparkles size={40} />
        <h2>{t(data?.enabled ? "suggestions.notAvailableTitle" : "suggestions.offTitle")}</h2>
        <p>{t(data?.enabled ? `suggestions.reason.${data?.reason || "unknown"}` : "suggestions.offBody")}</p>
      </div>
    );
  }

  if ((data.items || []).length === 0) {
    return (
      <div className="support-empty">
        <HiOutlineBellAlert size={40} />
        <h2>{t("suggestions.emptyTitle")}</h2>
        <p>{t("suggestions.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="support-suggestions">
      <p className="support-muted">
        {t("suggestions.body", { days: data.windowDays })}
      </p>
      <ul className="support-suggestion-list">
        {data.items.map((item) => (
          <li key={`${item.student.id}:${item.signature}`} className="support-suggestion">
            <div className="support-suggestion-head">
              <div>
                <strong>{item.student.name}</strong>
                <span>{item.student.class}</span>
              </div>
              <span className={`support-chip ${KIND_TONE[item.kind] || "is-waiting"} is-solid`}>
                {t(`suggestions.kind.${item.kind}`)}
              </span>
            </div>
            <p className="support-suggestion-detail">
              {item.metric?.value != null
                ? t(`suggestions.metric.${item.kind}`, {
                    value: `${item.metric.value}${item.metric.unit === "percent" ? "%" : ""}`,
                    threshold: `${item.metric.threshold}${item.metric.unit === "percent" ? "%" : ""}`,
                  })
                : item.detail}
            </p>
            <div className="support-suggestion-actions">
              <button type="button" className="support-link-btn" onClick={() => openItem(item)}>
                {openId === item.signature ? t("common.hide") : t("suggestions.review")}
              </button>
              <button
                type="button"
                className="support-link-btn"
                disabled={Boolean(busy)}
                onClick={() => dismiss(item)}
              >
                {t("suggestions.dismiss")}
              </button>
            </div>

            {openId === item.signature && (
              <div className="support-suggestion-form">
                <fieldset className="support-fieldset">
                  <legend>{t("suggestions.subjects")}</legend>
                  {subjects.length === 0 ? (
                    <p className="support-muted">{t("suggestions.noScope")}</p>
                  ) : (
                    <div className="support-check-grid">
                      {subjects.map((subject) => (
                        <label key={subject.id} className="support-check">
                          <input
                            type="checkbox"
                            checked={form.subjectIds.includes(subject.id)}
                            onChange={() => toggleSubject(subject.id)}
                          />
                          <span>
                            <strong>{subject.name}</strong>
                            <em>{subject.teacherName || t("create.noTeacher")}</em>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
                <div className="support-field-row is-two">
                  <label>
                    <span>{t("create.severity")}</span>
                    <select
                      value={form.severity}
                      onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}
                    >
                      {["watch", "support", "intensive"].map((key) => (
                        <option key={key} value={key}>{t(`severity.${key}`)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t("suggestions.concern")}</span>
                    <input
                      value={form.concernNote}
                      maxLength={2000}
                      onChange={(event) => setForm((current) => ({ ...current, concernNote: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="support-form-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(busy) || form.subjectIds.length === 0}
                    onClick={() => confirm(item)}
                  >
                    {busy === `confirm-${item.signature}` ? t("common.working") : t("suggestions.confirm")}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SuggestionsPanel;
