import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineInbox, HiOutlineXMark } from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import { dateLabel, errorText } from "./supportUi.js";

const RequestsPanel = ({ onAccepted }) => {
  const { t, i18n } = useTranslation("support");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [body, setBody] = useState({ subjectIds: [], response: "" });
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supportService.getRequests();
      setRequests(data.requests || []);
    } catch (error) {
      toast.error(errorText(error, t("errors.loadRequests")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const open = async (request) => {
    if (openId === request.id) {
      setOpenId("");
      return;
    }
    setOpenId(request.id);
    setBody({ subjectIds: [], response: "" });
    setSubjects([]);
    if (!request.student.classId) return;
    try {
      const scope = await supportService.getClassScope(request.student.classId);
      setSubjects(scope.subjects || []);
    } catch {
      setSubjects([]);
    }
  };

  const toggleSubject = (subjectId) => {
    setBody((current) => ({
      ...current,
      subjectIds: current.subjectIds.includes(subjectId)
        ? current.subjectIds.filter((id) => id !== subjectId)
        : [...current.subjectIds, subjectId],
    }));
  };

  const respond = async (request, status) => {
    if (status === "accepted" && body.subjectIds.length === 0) {
      toast.error(t("requests.chooseSubject"));
      return;
    }
    setBusy(`${request.id}:${status}`);
    try {
      const result = await supportService.respondToRequest(request.id, {
        status,
        response: body.response,
        subjectIds: body.subjectIds,
      });
      toast.success(t(status === "accepted" ? "requests.accepted" : "requests.declined", { n: result.issued?.length || 0 }));
      setOpenId("");
      await load();
      if (status === "accepted" && result.case?.id) onAccepted(result.case.id);
    } catch (error) {
      toast.error(errorText(error, t("errors.respondRequest")));
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return <div className="support-empty-inline"><div className="spinner" /></div>;
  }

  if (requests.length === 0) {
    return (
      <div className="support-empty">
        <HiOutlineInbox size={40} />
        <h2>{t("requests.emptyTitle")}</h2>
        <p>{t("requests.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="support-requests">
      <ul className="support-request-list">
        {requests.map((request) => (
          <li key={request.id} className={`support-request ${openId === request.id ? "is-open" : ""}`}>
            <button type="button" className="support-request-head" onClick={() => open(request)} aria-expanded={openId === request.id}>
              <div>
                <strong>{request.student.name}</strong>
                <span>{request.student.class}</span>
              </div>
              <div className="support-request-meta">
                <em>{dateLabel(request.createdAt, i18n.language)}</em>
                <span className="support-chip is-ready">{t("requests.pending")}</span>
              </div>
            </button>
            {request.message && <blockquote className="support-request-message">{request.message}</blockquote>}

            {openId === request.id && (
              <div className="support-request-body">
                <fieldset className="support-fieldset">
                  <legend>{t("requests.subjects")}</legend>
                  <p className="support-muted">{t("requests.subjectsBody")}</p>
                  {subjects.length === 0 ? (
                    <p className="support-muted">{t("requests.noScope")}</p>
                  ) : (
                    <div className="support-check-grid">
                      {subjects.map((subject) => (
                        <label key={subject.id} className="support-check">
                          <input
                            type="checkbox"
                            checked={body.subjectIds.includes(subject.id)}
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

                <label className="support-field-row">
                  <span>{t("requests.response")}</span>
                  <textarea
                    rows={2}
                    maxLength={600}
                    value={body.response}
                    placeholder={t("requests.responsePlaceholder")}
                    onChange={(event) => setBody((current) => ({ ...current, response: event.target.value }))}
                  />
                </label>

                <div className="support-form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={Boolean(busy)}
                    onClick={() => respond(request, "declined")}
                  >
                    <HiOutlineXMark size={15} />
                    {t("requests.decline")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(busy) || body.subjectIds.length === 0}
                    onClick={() => respond(request, "accepted")}
                  >
                    {busy === `${request.id}:accepted` ? t("common.working") : t("requests.accept")}
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

export default RequestsPanel;
