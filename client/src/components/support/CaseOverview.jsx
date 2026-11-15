import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineClipboardDocument,
  HiOutlineExclamationTriangle,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import { dateLabel, errorText, severityTone } from "./supportUi.js";

const SLOTS = ["mother", "father", "guardian"];
const CLOSE_REASONS = ["goal_met", "stepped_down", "moved_school", "referred", "other"];
const DELIVERIES = ["email", "printed", "assisted"];

const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const CaseOverview = ({ data, reload }) => {
  const { t, i18n } = useTranslation("support");
  const { case: caseDoc, subjects } = data;
  const canManage = caseDoc.canManage && caseDoc.status === "active";
  const [form, setForm] = useState(() => ({
    severity: caseDoc.severity,
    concernNote: caseDoc.concernNote || "",
    cadenceDays: caseDoc.cadenceDays ?? 30,
    nextReviewAt: toDateInput(caseDoc.nextReviewAt),
    studentVoice: caseDoc.studentVoice || "inherit",
    studentEvidenceInPlan: caseDoc.studentEvidenceInPlan === true,
    owner: caseDoc.owner?.id || "",
  }));
  const [note, setNote] = useState("");
  const [contact, setContact] = useState({ slot: "", name: "", email: "", deliveryMethod: "printed" });
  const [contactOpen, setContactOpen] = useState(false);
  const [integration, setIntegration] = useState(null);
  const [newsletter, setNewsletter] = useState(null);
  const [observation, setObservation] = useState("");
  const [closeForm, setCloseForm] = useState({ open: false, reason: "goal_met", summary: "" });
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setForm({
      severity: caseDoc.severity,
      concernNote: caseDoc.concernNote || "",
      cadenceDays: caseDoc.cadenceDays ?? 30,
      nextReviewAt: toDateInput(caseDoc.nextReviewAt),
      studentVoice: caseDoc.studentVoice || "inherit",
      studentEvidenceInPlan: caseDoc.studentEvidenceInPlan === true,
      owner: caseDoc.owner?.id || "",
    });
    setNewsletter(null);
    setCloseForm((current) => ({ ...current, open: false }));
  }, [caseDoc.id, caseDoc.severity, caseDoc.concernNote, caseDoc.cadenceDays,
    caseDoc.nextReviewAt, caseDoc.studentVoice, caseDoc.studentEvidenceInPlan, caseDoc.owner?.id]);

  useEffect(() => {
    let active = true;
    supportService.getIntegration()
      .then((value) => { if (active) setIntegration(value); })
      .catch(() => { if (active) setIntegration(null); });
    return () => { active = false; };
  }, []);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const participantOptions = useMemo(
    () => (caseDoc.participants || []).filter((row) => row.active),
    [caseDoc.participants],
  );

  const run = async (key, action, success) => {
    setBusy(key);
    try {
      await action();
      if (success) toast.success(success);
      await reload();
    } catch (error) {
      toast.error(errorText(error, t("errors.generic")));
    } finally {
      setBusy("");
    }
  };

  const saveBasics = () => run("basics", () => supportService.updateCase(caseDoc.id, {
    severity: form.severity,
    concernNote: form.concernNote,
    cadenceDays: Number(form.cadenceDays),
    nextReviewAt: form.nextReviewAt || null,
    studentVoice: form.studentVoice,
    studentEvidenceInPlan: form.studentEvidenceInPlan,
    ...(form.owner && form.owner !== caseDoc.owner?.id ? { owner: form.owner } : {}),
  }), t("case.saved"));

  const addNote = () => {
    if (!note.trim()) return;
    run("note", async () => {
      await supportService.addNote(caseDoc.id, note.trim());
      setNote("");
    }, t("case.noteAdded"));
  };

  const saveContact = () => {
    if (!contact.slot) return;
    run("contact", async () => {
      await supportService.addContact(caseDoc.id, contact);
      setContact({ slot: "", name: "", email: "", deliveryMethod: "printed" });
      setContactOpen(false);
    }, t("case.contactSaved"));
  };

  const copyNewsletter = async () => {
    setBusy("newsletter");
    try {
      const summary = newsletter || await supportService.getNewsletterSummary(caseDoc.id);
      setNewsletter(summary);
      await navigator.clipboard.writeText(summary.summary);
      toast.success(t("case.newsletterCopied"));
    } catch (error) {
      toast.error(errorText(error, t("errors.newsletter")));
    } finally {
      setBusy("");
    }
  };

  const saveObservation = () => {
    if (observation.trim().length < 10) {
      toast.error(t("case.observationShort"));
      return;
    }
    run("observation", async () => {
      await supportService.addObservation(caseDoc.id, { note: observation.trim() });
      setObservation("");
    }, t("case.observationAdded"));
  };

  const closeCase = () => {
    run("close", async () => {
      await supportService.closeCase(caseDoc.id, closeForm);
      setCloseForm({ open: false, reason: "goal_met", summary: "" });
    }, t("case.closed"));
  };

  return (
    <div className="support-overview">
      {!caseDoc.canManage && (
        <p className="support-muted">{t("case.readOnlyHint")}</p>
      )}

      <section className="support-card">
        <div className="support-card-head">
          <h2>{t("case.basics")}</h2>
          {canManage && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy === "basics"} onClick={saveBasics}>
              {busy === "basics" ? t("common.saving") : t("common.save")}
            </button>
          )}
        </div>
        <div className="support-field-row is-three">
          <label>
            <span>{t("case.severity")}</span>
            <select value={form.severity} disabled={!canManage} onChange={(event) => set("severity", event.target.value)}>
              {["watch", "support", "intensive"].map((key) => (
                <option key={key} value={key}>{t(`severity.${key}`)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("case.cadence")}</span>
            <input
              type="number"
              min={1}
              max={180}
              value={form.cadenceDays}
              disabled={!canManage}
              onChange={(event) => set("cadenceDays", event.target.value)}
            />
          </label>
          <label>
            <span>{t("case.nextReviewLabel")}</span>
            <input
              type="date"
              value={form.nextReviewAt}
              disabled={!canManage}
              onChange={(event) => set("nextReviewAt", event.target.value)}
            />
          </label>
        </div>
        <div className="support-field-row is-three">
          <label>
            <span>{t("case.studentVoice")}</span>
            <select value={form.studentVoice} disabled={!canManage} onChange={(event) => set("studentVoice", event.target.value)}>
              <option value="inherit">{t("case.voiceInherit")}</option>
              <option value="on">{t("case.voiceOn")}</option>
              <option value="off">{t("case.voiceOff")}</option>
            </select>
          </label>
          <label>
            <span>{t("case.owner")}</span>
            <select value={form.owner} disabled={!canManage} onChange={(event) => set("owner", event.target.value)}>
              {participantOptions.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <label className="support-check is-inline">
            <input
              type="checkbox"
              checked={form.studentEvidenceInPlan}
              disabled={!canManage}
              onChange={(event) => set("studentEvidenceInPlan", event.target.checked)}
            />
            <span>{t("case.studentEvidence")}</span>
          </label>
        </div>
        <label className="support-field-row">
          <span>{t("case.concern")}</span>
          <textarea
            rows={4}
            maxLength={2000}
            value={form.concernNote}
            disabled={!canManage}
            placeholder={t("case.concernPlaceholder")}
            onChange={(event) => set("concernNote", event.target.value)}
          />
        </label>
      </section>

      <div className="support-overview-columns">
        <section className="support-card">
          <div className="support-card-head">
            <h2>{t("case.participants")}</h2>
          </div>
          {participantOptions.length === 0 ? (
            <p className="support-muted">{t("case.noParticipants")}</p>
          ) : (
            <ul className="support-respondent-list">
              {participantOptions.map((row) => (
                <li key={`${row.id}:${row.role}`} className="support-respondent">
                  <div className="support-respondent-main">
                    <strong>{row.name}</strong>
                    <span>
                      {[
                        t(`case.role.${row.role}`, { defaultValue: row.role }),
                        row.subject ? (subjects.find((entry) => entry.id === row.subject)?.name) : "",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {caseDoc.owner?.id === row.id && <span className="support-chip is-ready">{t("case.ownerChip")}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="support-card">
          <div className="support-card-head">
            <h2>{t("case.family")}</h2>
            {canManage && (
              <button type="button" className="support-icon-btn" aria-label={t("case.addContact")} onClick={() => setContactOpen((open) => !open)}>
                <HiOutlinePlus size={17} />
              </button>
            )}
          </div>
          {(caseDoc.familyContacts || []).length === 0 ? (
            <p className="support-muted">{t("case.noContacts")}</p>
          ) : (
            <ul className="support-respondent-list">
              {caseDoc.familyContacts.map((row) => (
                <li key={row.respondentId} className="support-respondent">
                  <div className="support-respondent-main">
                    <strong>{row.name || t(`contact.slot.${row.slot}`)}</strong>
                    <span className="support-respondent-meta">
                      {[t(`contact.slot.${row.slot}`), row.email, t(`delivery.${row.deliveryMethod}`)]
                        .filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {row.codeHint && <span className="support-chip is-waiting">{t("case.codeEnds", { hint: row.codeHint })}</span>}
                  {canManage && (
                    <button
                      type="button"
                      className="support-icon-btn"
                      aria-label={t("case.editContact")}
                      onClick={() => {
                        setContact({ slot: row.slot, name: row.name || "", email: row.email || "", deliveryMethod: row.deliveryMethod || "printed" });
                        setContactOpen(true);
                      }}
                    >
                      <HiOutlineClipboardDocument size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {contactOpen && canManage && (
            <div className="support-contact-form">
              <div className="support-field-row is-two">
                <label>
                  <span>{t("contact.slotLabel")}</span>
                  <select value={contact.slot} onChange={(event) => setContact((current) => ({ ...current, slot: event.target.value }))}>
                    <option value="">{t("contact.chooseSlot")}</option>
                    {SLOTS.map((slot) => (
                      <option key={slot} value={slot}>{t(`contact.slot.${slot}`)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("contact.delivery")}</span>
                  <select value={contact.deliveryMethod} onChange={(event) => setContact((current) => ({ ...current, deliveryMethod: event.target.value }))}>
                    {DELIVERIES.map((method) => (
                      <option key={method} value={method}>{t(`delivery.${method}`)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="support-field-row is-two">
                <label>
                  <span>{t("contact.name")}</span>
                  <input value={contact.name} maxLength={120} onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label>
                  <span>{t("contact.emailOptional")}</span>
                  <input type="email" dir="ltr" value={contact.email} maxLength={200} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} />
                </label>
              </div>
              <div className="support-form-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setContactOpen(false)}>{t("common.cancel")}</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={!contact.slot || busy === "contact"} onClick={saveContact}>
                  {busy === "contact" ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="support-card">
        <div className="support-card-head">
          <h2>{t("case.notes")}</h2>
        </div>
        {canManage && (
          <div className="support-note-add">
            <textarea
              rows={2}
              maxLength={2000}
              value={note}
              placeholder={t("case.notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={!note.trim() || busy === "note"} onClick={addNote}>
              {t("case.addNote")}
            </button>
          </div>
        )}
        {(caseDoc.notes || []).length === 0 ? (
          <p className="support-muted">{t("case.noNotes")}</p>
        ) : (
          <ul className="support-comment-list">
            {caseDoc.notes.slice().reverse().map((row, index) => (
              <li key={`${row.at}-${index}`}>
                <span>{dateLabel(row.at, i18n.language)}</span>
                <p>{row.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {integration && (integration.newsletter.available || integration.observations.available) && (
        <section className="support-card">
          <div className="support-card-head">
            <h2>{t("case.integrations")}</h2>
          </div>
          {integration.newsletter.available && (
            <div className="support-integration-row">
              <div>
                <strong>{t("case.newsletter")}</strong>
                <p className="support-muted">{t("case.newsletterBody")}</p>
                {newsletter && <blockquote className="support-newsletter-preview">{newsletter.summary}</blockquote>}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy === "newsletter"} onClick={copyNewsletter}>
                {busy === "newsletter" ? t("common.working") : t("case.copySummary")}
              </button>
            </div>
          )}
          {integration.observations.available && canManage && (
            <div className="support-integration-row">
              <div>
                <strong>{t("case.observation")}</strong>
                <p className="support-muted">{t("case.observationBody")}</p>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={observation}
                  placeholder={t("case.observationPlaceholder")}
                  onChange={(event) => setObservation(event.target.value)}
                />
              </div>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy === "observation"} onClick={saveObservation}>
                {busy === "observation" ? t("common.working") : t("case.addObservation")}
              </button>
            </div>
          )}
        </section>
      )}

      {caseDoc.status === "closed" ? (
        <section className="support-card">
          <div className="support-card-head">
            <h2>{t("case.closedTitle")}</h2>
            <span className="support-chip is-muted">{t(`case.closeReason.${caseDoc.closeReason}`, { defaultValue: caseDoc.closeReason })}</span>
          </div>
          <p className="support-muted">{dateLabel(caseDoc.closedAt, i18n.language)}</p>
          {caseDoc.closeSummary && <p className="support-muted">{caseDoc.closeSummary}</p>}
        </section>
      ) : caseDoc.canManage && (
        <section className="support-card">
          <div className="support-card-head">
            <h2>{t("case.closeTitle")}</h2>
          </div>
          {!closeForm.open ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCloseForm((current) => ({ ...current, open: true }))}>
              <HiOutlineXMark size={15} />
              {t("case.closeCase")}
            </button>
          ) : (
            <>
              <p className="support-muted">{t("case.closeBody")}</p>
              <div className="support-field-row is-two">
                <label>
                  <span>{t("case.closeReasonLabel")}</span>
                  <select value={closeForm.reason} onChange={(event) => setCloseForm((current) => ({ ...current, reason: event.target.value }))}>
                    {CLOSE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{t(`case.closeReason.${reason}`)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("case.closeSummary")}</span>
                  <input
                    value={closeForm.summary}
                    maxLength={1200}
                    onChange={(event) => setCloseForm((current) => ({ ...current, summary: event.target.value }))}
                  />
                </label>
              </div>
              <div className="support-form-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCloseForm({ open: false, reason: "goal_met", summary: "" })}>
                  {t("common.cancel")}
                </button>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy === "close"} onClick={closeCase}>
                  {busy === "close" ? t("common.working") : t("case.closeConfirm")}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="support-card">
        <div className="support-card-head">
          <h2>{t("case.timeline")}</h2>
        </div>
        <ul className="support-timeline">
          <li><span>{t("case.opened")}</span><strong>{dateLabel(caseDoc.openedAt, i18n.language)}</strong></li>
          <li><span>{t("case.lastReview")}</span><strong>{dateLabel(caseDoc.lastReviewAt, i18n.language) || t("case.never")}</strong></li>
          <li><span>{t("case.nextReviewLabel")}</span><strong>{dateLabel(caseDoc.nextReviewAt, i18n.language) || t("case.never")}</strong></li>
          <li>
            <span>{t("case.severity")}</span>
            <strong className={`support-severity ${severityTone(caseDoc.severity)}`}>{t(`severity.${caseDoc.severity}`)}</strong>
          </li>
        </ul>
        {caseDoc.source === "parent_request" && (
          <p className="support-inline-note"><HiOutlineExclamationTriangle size={15} />{t("case.fromRequest")}</p>
        )}
      </section>
    </div>
  );
};

export default CaseOverview;
