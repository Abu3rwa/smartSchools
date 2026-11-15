import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineArrowPath,
  HiOutlineDocumentText,
  HiOutlinePrinter,
  HiOutlineXMark,
} from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import { printEndpoint } from "../../utils/printDocument.js";
import SurveyForm from "./SurveyForm.jsx";
import {
  deliveryLabelKey,
  dueLabel,
  errorText,
  monthLabel,
  pick,
  statusTone,
} from "./supportUi.js";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

const emptyPlanning = () => ({
  month: new Date().getMonth() + 1,
  dueDate: "",
  length: "",
  includeStudent: "inherit",
  teachers: null,
  parentSlots: null,
  refreshContacts: false,
});

const promptOf = (question, arabic) => pick(question?.prompt, question?.promptAr, arabic);

const CaseSurveys = ({ data, reload }) => {
  const { t, i18n } = useTranslation("support");
  const arabic = String(i18n.language || "").startsWith("ar");
  const caseId = data.case.id;
  const canManage = data.case.canManage && data.case.status === "active";

  const teachers = useMemo(
    () => (data.case.participants || []).filter((row) => row.active && row.role === "teacher" && row.subject),
    [data.case.participants],
  );
  const contacts = useMemo(
    () => (data.case.familyContacts || []).filter((row) => row.active !== false),
    [data.case.familyContacts],
  );

  const [planning, setPlanning] = useState(() => ({
    ...emptyPlanning(),
    teachers: teachers.map((row) => `${row.id}:${row.subject}`),
    parentSlots: contacts.map((row) => row.slot),
  }));
  const [preview, setPreview] = useState(null);
  const [reviewId, setReviewId] = useState(data.reviews?.[0]?.id || "");
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState("");
  const [cancelForm, setCancelForm] = useState({ open: false, reason: "" });
  const [assist, setAssist] = useState(null);
  const [openAnswers, setOpenAnswers] = useState("");

  useEffect(() => {
    setPlanning((current) => ({
      ...current,
      teachers: teachers.map((row) => `${row.id}:${row.subject}`),
      parentSlots: contacts.map((row) => row.slot),
    }));
  }, [teachers, contacts]);

  useEffect(() => {
    if (!reviewId) {
      setReview(null);
      return;
    }
    let active = true;
    setBusy("review");
    supportService.getReview(caseId, reviewId)
      .then((value) => { if (active) setReview(value); })
      .catch((error) => {
        if (active) toast.error(errorText(error, t("errors.loadReview")));
      })
      .finally(() => { if (active) setBusy(""); });
    return () => { active = false; };
  }, [caseId, reviewId, t]);

  const setField = (key, value) => setPlanning((current) => ({ ...current, [key]: value }));

  const toggleList = (key, value) => {
    setPlanning((current) => {
      const list = current[key] || [];
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((row) => row !== value) : [...list, value],
      };
    });
  };

  const planningPayload = () => {
    const payload = {
      parentSlots: planning.parentSlots,
      teachers: (planning.teachers || []).map((key) => {
        const [userId, subjectId] = key.split(":");
        return { userId, subjectId };
      }),
      refreshContacts: planning.refreshContacts,
      period: { month: Number(planning.month), academicYear: data.case.student.academicYear },
    };
    if (planning.dueDate) payload.dueDate = planning.dueDate;
    if (planning.length) payload.length = Number(planning.length);
    if (planning.includeStudent !== "inherit") payload.includeStudent = planning.includeStudent === "on";
    return payload;
  };

  const runPreview = async () => {
    setBusy("preview");
    try {
      setPreview(await supportService.previewReview(caseId, planningPayload()));
    } catch (error) {
      toast.error(errorText(error, t("errors.preview")));
    } finally {
      setBusy("");
    }
  };

  const prepare = async () => {
    setBusy("prepare");
    try {
      const result = await supportService.prepareReview(caseId, planningPayload());
      setReviewId(result.review.id);
      setReview(null);
      setPreview(null);
      toast.success(t("reviews.prepared"));
      await reload();
    } catch (error) {
      toast.error(errorText(error, t("errors.prepare")));
    } finally {
      setBusy("");
    }
  };

  const act = async (key, action, success) => {
    setBusy(key);
    try {
      await action();
      if (success) toast.success(success);
      await reload();
      if (reviewId) {
        const fresh = await supportService.getReview(caseId, reviewId);
        setReview(fresh);
      }
    } catch (error) {
      toast.error(errorText(error, t("errors.generic")));
    } finally {
      setBusy("");
    }
  };

  const issue = () => act("issue", () => supportService.issueReview(caseId, reviewId), t("reviews.issued"));
  const retry = () => act("retry", () => supportService.retryReview(caseId, reviewId), t("reviews.retried"));
  const cancel = () => act("cancel", async () => {
    await supportService.cancelReview(caseId, reviewId, cancelForm.reason);
    setCancelForm({ open: false, reason: "" });
  }, t("reviews.cancelled"));

  const printSlips = async () => {
    setBusy("slips");
    try {
      await printEndpoint(`/support/cases/${caseId}/reviews/${reviewId}/slips`);
    } catch (error) {
      toast.error(errorText(error, t("errors.print")));
    } finally {
      setBusy("");
    }
  };

  const markHandedOver = (surveyId) => act(`hand-${surveyId}`, () => supportService.markHandedOver(caseId, surveyId), t("reviews.handedOver"));

  const submitAssisted = async (answers) => {
    if (!assist) return;
    setBusy("assist");
    try {
      await supportService.assistedResponse(caseId, assist.id, answers);
      setAssist(null);
      toast.success(t("reviews.assistedSaved"));
      await reload();
      if (reviewId) setReview(await supportService.getReview(caseId, reviewId));
    } catch (error) {
      toast.error(errorText(error, t("errors.assisted")));
    } finally {
      setBusy("");
    }
  };

  const selectedReview = review?.review || data.reviews?.find((row) => row.id === reviewId) || null;
  const surveys = review?.surveys || [];
  const printedSlips = surveys.filter((row) => ["printed", "assisted"].includes(row.deliveryMethod));
  const loadReview = useCallback(async (id) => {
    setReviewId(id);
    setReview(null);
  }, []);

  return (
    <div className="support-surveys">
      {canManage && (
        <section className="support-card">
          <div className="support-card-head">
            <h2>{t("reviews.planTitle")}</h2>
            <span className="support-chip is-waiting">{t("reviews.round", { n: (data.reviews?.length || 0) + 1 })}</span>
          </div>
          <p className="support-muted">{t("reviews.planBody")}</p>

          <div className="support-field-row is-three">
            <label>
              <span>{t("reviews.month")}</span>
              <select value={planning.month} onChange={(event) => setField("month", event.target.value)}>
                {MONTHS.map((month) => (
                  <option key={month} value={month}>{monthLabel(month, i18n.language)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("reviews.dueDate")}</span>
              <input type="date" value={planning.dueDate} onChange={(event) => setField("dueDate", event.target.value)} />
            </label>
            <label>
              <span>{t("reviews.length")}</span>
              <input
                type="number"
                min={1}
                max={20}
                value={planning.length}
                placeholder={t("reviews.lengthDefault")}
                onChange={(event) => setField("length", event.target.value)}
              />
            </label>
          </div>

          <div className="support-field-row is-two">
            <label>
              <span>{t("reviews.studentVoice")}</span>
              <select value={planning.includeStudent} onChange={(event) => setField("includeStudent", event.target.value)}>
                <option value="inherit">{t("case.voiceInherit")}</option>
                <option value="on">{t("case.voiceOn")}</option>
                <option value="off">{t("case.voiceOff")}</option>
              </select>
            </label>
            <label className="support-check is-inline">
              <input
                type="checkbox"
                checked={planning.refreshContacts}
                onChange={(event) => setField("refreshContacts", event.target.checked)}
              />
              <span>{t("reviews.refreshContacts")}</span>
            </label>
          </div>

          <fieldset className="support-fieldset">
            <legend>{t("reviews.teachers")}</legend>
            {teachers.length === 0 ? (
              <p className="support-muted">{t("reviews.noTeachers")}</p>
            ) : (
              <div className="support-check-grid">
                {teachers.map((row) => {
                  const key = `${row.id}:${row.subject}`;
                  const subject = data.subjects.find((entry) => entry.id === row.subject);
                  return (
                    <label key={key} className="support-check">
                      <input
                        type="checkbox"
                        checked={(planning.teachers || []).includes(key)}
                        onChange={() => toggleList("teachers", key)}
                      />
                      <span>
                        <strong>{row.name}</strong>
                        <em>{subject?.name || t("case.role.teacher")}</em>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="support-fieldset">
            <legend>{t("reviews.family")}</legend>
            {contacts.length === 0 ? (
              <p className="support-muted">{t("reviews.noFamily")}</p>
            ) : (
              <div className="support-check-grid">
                {contacts.map((row) => (
                  <label key={row.respondentId} className="support-check">
                    <input
                      type="checkbox"
                      checked={(planning.parentSlots || []).includes(row.slot)}
                      onChange={() => toggleList("parentSlots", row.slot)}
                    />
                    <span>
                      <strong>{row.name || t(`contact.slot.${row.slot}`)}</strong>
                      <em>{t(`delivery.${row.deliveryMethod}`)}</em>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="support-form-actions">
            <button type="button" className="btn btn-secondary" disabled={busy === "preview"} onClick={runPreview}>
              {busy === "preview" ? t("common.working") : t("reviews.preview")}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy === "prepare"} onClick={prepare}>
              {busy === "prepare" ? t("common.working") : t("reviews.prepare")}
            </button>
          </div>
        </section>
      )}

      {preview && (
        <section className="support-card">
          <div className="support-card-head">
            <h2>{t("reviews.previewTitle")}</h2>
            <span className="support-chip is-waiting">
              {t("reviews.previewMeta", { month: monthLabel(preview.period?.month, i18n.language), due: dueLabel(preview.dueDate, i18n.language) })}
            </span>
          </div>
          <p className="support-muted">{t("reviews.previewBody")}</p>
          {preview.warnings?.length > 0 && (
            <ul className="support-warning-list">
              {preview.warnings.map((row) => <li key={row.code}>{row.message}</li>)}
            </ul>
          )}
          <div className="support-preview-items">
            {preview.items.map((item) => (
              <article key={item.key} className="support-preview-item">
                <div className="support-preview-head">
                  <strong>
                    {item.audience === "parent"
                      ? `${t("reviews.audience.parent")} · ${item.userName || t(`contact.slot.${item.slot}`)}`
                      : item.audience === "teacher"
                        ? `${t("reviews.audience.teacher")} · ${item.userName}`
                        : t("reviews.audience.student")}
                  </strong>
                  <span className="support-preview-meta">
                    {[item.subject?.name, t(deliveryLabelKey(item.deliveryMethod)), item.mode].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <ol>
                  {item.questions.map((question) => (
                    <li key={question.id}>{promptOf(question, arabic)}</li>
                  ))}
                </ol>
                {item.anchorCount > 0 && (
                  <span className="support-mini-count">{t("reviews.trendAnchors", { n: item.anchorCount })}</span>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="support-card">
        <div className="support-card-head">
          <h2>{t("reviews.listTitle")}</h2>
        </div>
        {(data.reviews || []).length === 0 ? (
          <p className="support-muted">{t("reviews.none")}</p>
        ) : (
          <div className="support-review-list">
            {data.reviews.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`support-review-row ${reviewId === row.id ? "is-active" : ""}`}
                onClick={() => loadReview(row.id)}
              >
                <span className="support-review-month">{monthLabel(row.month, i18n.language)} {row.academicYear}</span>
                <span className="support-review-meta">
                  {t("reviews.sequence", { n: row.sequence })}
                  {row.dueDate ? ` · ${t("reviews.dueOn", { date: dueLabel(row.dueDate, i18n.language) })}` : ""}
                </span>
                <span className={`support-chip ${statusTone(row.status)}`}>{t(`reviews.status.${row.status}`)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {reviewId && (
        <section className="support-card">
          <div className="support-card-head">
            <h2>{t("reviews.detailTitle")}</h2>
            <div className="support-review-actions">
              {printedSlips.length > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy === "slips"} onClick={printSlips}>
                  <HiOutlinePrinter size={15} />
                  {t("reviews.printSlips", { n: printedSlips.length })}
                </button>
              )}
              {selectedReview?.status === "preparing" && canManage && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === "issue"} onClick={issue}>
                  {busy === "issue" ? t("common.working") : t("reviews.issue")}
                </button>
              )}
              {["preparing", "issued"].includes(selectedReview?.status) && canManage && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy === "retry"} onClick={retry}>
                    <HiOutlineArrowPath size={15} />
                    {t("reviews.retry")}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy === "cancel"} onClick={() => setCancelForm((current) => ({ ...current, open: true }))}>
                    <HiOutlineXMark size={15} />
                    {t("reviews.cancel")}
                  </button>
                </>
              )}
            </div>
          </div>

          {cancelForm.open && (
            <div className="support-inline-form">
              <label className="support-field-row">
                <span>{t("reviews.cancelReason")}</span>
                <input
                  value={cancelForm.reason}
                  maxLength={300}
                  onChange={(event) => setCancelForm((current) => ({ ...current, reason: event.target.value }))}
                />
              </label>
              <div className="support-form-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCancelForm({ open: false, reason: "" })}>
                  {t("common.cancel")}
                </button>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy === "cancel"} onClick={cancel}>
                  {t("reviews.cancelConfirm")}
                </button>
              </div>
            </div>
          )}

          {busy === "review" && !review ? (
            <div className="support-empty-inline"><div className="spinner" /></div>
          ) : surveys.length === 0 ? (
            <p className="support-muted">{t("reviews.noSurveys")}</p>
          ) : (
            <div className="support-table-wrap">
              <table className="support-table">
                <thead>
                  <tr>
                    <th>{t("reviews.respondent")}</th>
                    <th>{t("reviews.audience.label")}</th>
                    <th>{t("reviews.subject")}</th>
                    <th>{t("reviews.status.label")}</th>
                    <th>{t("reviews.delivery")}</th>
                    <th>{t("reviews.answers")}</th>
                    <th aria-label={t("common.actions")} />
                  </tr>
                </thead>
                <tbody>
                  {surveys.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.respondentName || t(`contact.slot.${row.respondentSlot}`, { defaultValue: row.respondentSlot })}</strong>
                        {row.noConcerns && <span className="support-chip is-ready">{t("reviews.noConcernsChip")}</span>}
                      </td>
                      <td>{t(`reviews.audience.${row.audience}`)}</td>
                      <td>{row.subject?.name || "—"}</td>
                      <td><span className={`support-chip ${statusTone(row.status)}`}>{t(`reviews.status.${row.status}`)}</span></td>
                      <td>{t(`delivery.${row.deliveryMethod}`)}</td>
                      <td>{row.answeredCount}/{row.questionCount}</td>
                      <td>
                        <div className="support-row-actions">
                          {["printed", "assisted"].includes(row.deliveryMethod) && !["submitted", "skipped", "cancelled"].includes(row.status) && canManage && (
                            <>
                              <button type="button" className="support-icon-btn" title={t("reviews.markHandedOver")} onClick={() => markHandedOver(row.id)}>
                                <HiOutlineDocumentText size={16} />
                              </button>
                              <button type="button" className="support-link-btn" onClick={() => setAssist(row)}>
                                {t("reviews.assist")}
                              </button>
                            </>
                          )}
                          {row.answeredCount > 0 && (
                            <button
                              type="button"
                              className="support-link-btn"
                              onClick={() => setOpenAnswers(openAnswers === row.id ? "" : row.id)}
                            >
                              {openAnswers === row.id ? t("common.hide") : t("reviews.viewAnswers")}
                            </button>
                          )}
                        </div>
                        {openAnswers === row.id && (
                          <ul className="support-answer-list">
                            {row.answers?.length ? row.answers.map((answer) => {
                              const question = (row.questions || []).find((entry) => entry.id === answer.questionId);
                              const value = answer.scaleValue ?? answer.choiceValue
                                ?? (Number.isInteger(answer.choiceIndex) ? (question?.options?.[answer.choiceIndex] || answer.choiceIndex) : "")
                                ?? answer.textValue;
                              return (
                                <li key={answer.questionId}>
                                  <span>{promptOf(question, arabic)}</span>
                                  <strong>{String(value ?? "")}</strong>
                                </li>
                              );
                            }) : <li className="support-muted">{t("reviews.answersHidden")}</li>}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {assist && (
            <div className="support-inline-form">
              <div className="support-card-head">
                <h3>{t("reviews.assistTitle", { name: assist.respondentName || t(`contact.slot.${assist.respondentSlot}`) })}</h3>
                <button type="button" className="support-icon-btn" aria-label={t("common.close")} onClick={() => setAssist(null)}>
                  <HiOutlineXMark size={17} />
                </button>
              </div>
              <p className="support-muted">{t("reviews.assistBody")}</p>
              <SurveyForm
                key={assist.id}
                survey={{ ...assist, questions: assist.questions || [] }}
                submitting={busy === "assist"}
                onSubmit={submitAssisted}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default CaseSurveys;
