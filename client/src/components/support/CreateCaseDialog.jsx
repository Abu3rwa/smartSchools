import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineXMark } from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import { errorText } from "./supportUi.js";

const SLOTS = ["mother", "father", "guardian"];

const contactFromStudent = (student) => {
  const info = student?.parentInfo || {};
  return SLOTS.map((slot) => ({
    slot,
    name: info[`${slot}Name`] || "",
    email: info[`${slot}Email`] || "",
    deliveryMethod: info[`${slot}Email`] ? "email" : "printed",
  })).filter((row) => row.name || row.email);
};

const CreateCaseDialog = ({ classes, onClose, onCreated }) => {
  const { t } = useTranslation("support");
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [students, setStudents] = useState([]);
  const [scope, setScope] = useState(null);
  const [studentId, setStudentId] = useState("");
  const [subjectIds, setSubjectIds] = useState([]);
  const [severity, setSeverity] = useState("support");
  const [concernNote, setConcernNote] = useState("");
  const [participantIds, setParticipantIds] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classId) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      supportService.getClassStudents(classId),
      supportService.getClassScope(classId),
    ])
      .then(([studentData, scopeData]) => {
        if (!active) return;
        const rows = (studentData.students || []).filter((row) => row.status !== "inactive");
        setStudents(rows);
        setScope(scopeData);
        setStudentId((current) => (rows.some((row) => row._id === current) ? current : ""));
        setSubjectIds([]);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [classId]);

  const student = useMemo(
    () => students.find((row) => row._id === studentId) || null,
    [students, studentId],
  );

  useEffect(() => {
    setContacts(student ? contactFromStudent(student) : []);
  }, [student]);

  const allowedPeople = useMemo(() => {
    if (!scope) return [];
    const rows = [];
    if (scope.homeroom) rows.push({ id: scope.homeroom.id, name: scope.homeroom.name, role: "homeroom" });
    for (const subject of scope.subjects) {
      if (!subjectIds.includes(subject.id)) continue;
      if (rows.some((row) => row.id === subject.teacherId)) continue;
      rows.push({ id: subject.teacherId, name: subject.teacherName, role: "teacher", subject: subject.name });
    }
    return rows;
  }, [scope, subjectIds]);

  useEffect(() => {
    setParticipantIds(allowedPeople.map((row) => row.id));
  }, [allowedPeople]);

  const toggleSubject = (subjectId) => {
    setSubjectIds((current) => (
      current.includes(subjectId) ? current.filter((id) => id !== subjectId) : [...current, subjectId]
    ));
  };

  const toggleParticipant = (userId) => {
    setParticipantIds((current) => (
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    ));
  };

  const updateContact = (slot, patch) => {
    setContacts((current) => current.map((row) => (row.slot === slot ? { ...row, ...patch } : row)));
  };

  const toggleContact = (slot) => {
    if (contacts.some((row) => row.slot === slot)) {
      setContacts((current) => current.filter((row) => row.slot !== slot));
    } else {
      setContacts((current) => [...current, { slot, name: "", email: "", deliveryMethod: "printed" }]);
    }
  };

  const normalizedContacts = useMemo(() => {
    const seen = new Set();
    return contacts
      .filter((row) => row.name.trim() || row.email.trim())
      .map((row) => {
        const email = row.email.trim().toLowerCase();
        let deliveryMethod = row.deliveryMethod;
        if (email && seen.has(email)) deliveryMethod = "printed";
        if (email) seen.add(email);
        if (!email && deliveryMethod === "email") deliveryMethod = "printed";
        return { slot: row.slot, name: row.name.trim(), email, deliveryMethod };
      });
  }, [contacts]);

  const submit = async (event) => {
    event.preventDefault();
    if (!studentId) {
      toast.error(t("create.chooseStudent"));
      return;
    }
    if (subjectIds.length === 0) {
      toast.error(t("create.chooseSubject"));
      return;
    }
    const defaultPeople = allowedPeople.map((row) => row.id);
    const explicit = participantIds.length !== defaultPeople.length
      || participantIds.some((id) => !defaultPeople.includes(id));
    setBusy(true);
    try {
      const result = await supportService.createCase({
        studentId,
        subjectIds,
        severity,
        concernNote,
        participantUserIds: explicit ? participantIds : null,
        familyContacts: normalizedContacts.length ? normalizedContacts : null,
      });
      toast.success(t(result.issued?.length ? "create.createdWithCodes" : "create.created", {
        n: result.issued?.length || 0,
      }));
      onCreated(result.case);
    } catch (error) {
      const existing = error?.response?.data?.data?.caseId;
      const duplicate = error?.response?.data?.code === "RESPONDENT_DUPLICATE";
      toast.error(duplicate ? t("create.respondentDuplicate") : errorText(error, t("create.failed")));
      if (existing) onCreated({ id: existing }, { existing: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="support-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="support-modal support-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-create-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="support-modal-head">
          <div>
            <h2 id="support-create-title">{t("create.title")}</h2>
            <p>{t("create.body")}</p>
          </div>
          <button type="button" className="support-icon-btn" aria-label={t("common.close")} onClick={onClose}>
            <HiOutlineXMark size={18} />
          </button>
        </div>

        <div className="support-field-row is-two">
          <label>
            <span>{t("create.class")}</span>
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}{row.section ? ` · ${row.section}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("create.severity")}</span>
            <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
              <option value="watch">{t("severity.watch")}</option>
              <option value="support">{t("severity.support")}</option>
              <option value="intensive">{t("severity.intensive")}</option>
            </select>
          </label>
        </div>

        <label className="support-field-row">
          <span>{t("create.student")}</span>
          <select
            value={studentId}
            disabled={loading || loadError}
            onChange={(event) => setStudentId(event.target.value)}
          >
            <option value="">{loading ? t("create.loadingStudents") : t("create.chooseStudent")}</option>
            {students
              .slice()
              .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
              .map((row) => (
                <option key={row._id} value={row._id}>
                  {row.firstName} {row.lastName}
                </option>
              ))}
          </select>
        </label>

        {loadError && <p className="support-muted" role="alert">{t("create.loadFailed")}</p>}

        <fieldset className="support-fieldset">
          <legend>{t("create.subjects")}</legend>
          <p className="support-muted">{t("create.subjectsBody")}</p>
          <div className="support-check-grid">
            {(scope?.subjects || []).map((subject) => (
              <label key={subject.id} className="support-check">
                <input
                  type="checkbox"
                  checked={subjectIds.includes(subject.id)}
                  onChange={() => toggleSubject(subject.id)}
                />
                <span>
                  <strong>{subject.name}</strong>
                  <em>{subject.teacherName || t("create.noTeacher")}</em>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="support-fieldset">
          <legend>{t("create.participants")}</legend>
          <p className="support-muted">{t("create.participantsBody")}</p>
          {allowedPeople.length === 0 ? (
            <p className="support-muted">{t("create.participantsNone")}</p>
          ) : (
            <div className="support-check-grid">
              {allowedPeople.map((person) => (
                <label key={`${person.id}:${person.role}`} className="support-check">
                  <input
                    type="checkbox"
                    checked={participantIds.includes(person.id)}
                    onChange={() => toggleParticipant(person.id)}
                  />
                  <span>
                    <strong>{person.name}</strong>
                    <em>{person.subject || t(`create.role.${person.role}`)}</em>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="support-fieldset">
          <legend>{t("create.family")}</legend>
          <p className="support-muted">{t("create.familyBody")}</p>
          <div className="support-slot-tabs">
            {SLOTS.map((slot) => {
              const active = contacts.some((row) => row.slot === slot);
              return (
                <button
                  key={slot}
                  type="button"
                  className={`support-slot-toggle ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => toggleContact(slot)}
                >
                  {t(`contact.slot.${slot}`)}
                </button>
              );
            })}
          </div>
          {contacts.map((contact) => (
            <div key={contact.slot} className="support-contact-row">
              <span className="support-contact-slot">{t(`contact.slot.${contact.slot}`)}</span>
              <input
                value={contact.name}
                maxLength={120}
                placeholder={t("contact.name")}
                aria-label={t("contact.name")}
                onChange={(event) => updateContact(contact.slot, { name: event.target.value })}
              />
              <input
                type="email"
                value={contact.email}
                maxLength={200}
                placeholder={t("contact.emailOptional")}
                dir="ltr"
                aria-label={t("contact.emailOptional")}
                onChange={(event) => updateContact(contact.slot, { email: event.target.value })}
              />
              <select
                value={contact.deliveryMethod}
                aria-label={t("contact.delivery")}
                onChange={(event) => updateContact(contact.slot, { deliveryMethod: event.target.value })}
              >
                <option value="email">{t("contact.deliveryEmail")}</option>
                <option value="printed">{t("contact.deliveryPrinted")}</option>
                <option value="assisted">{t("contact.deliveryAssisted")}</option>
              </select>
            </div>
          ))}
          <p className="support-muted">{t("create.familyHint")}</p>
        </fieldset>

        <label className="support-field-row">
          <span>{t("create.concern")}</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={concernNote}
            placeholder={t("create.concernPlaceholder")}
            onChange={(event) => setConcernNote(event.target.value)}
          />
        </label>

        <div className="support-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !studentId}>
            {busy ? t("create.saving") : t("create.save")}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateCaseDialog;
