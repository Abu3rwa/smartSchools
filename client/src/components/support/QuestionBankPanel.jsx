import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  HiOutlineCheckBadge,
  HiOutlineDocumentDuplicate,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import supportService from "../../services/supportService.js";
import { errorText, pick, statusTone } from "./supportUi.js";

const AUDIENCES = ["teacher", "parent", "student"];
const KINDS = ["scale", "choice", "text"];
const CONCERNS = ["general", "reading", "writing", "math", "focus", "confidence", "attendance", "behavior", "participation", "organization"];

const emptyForm = {
  audience: "teacher",
  kind: "scale",
  concern: "general",
  domain: "academic",
  prompt: "",
  promptAr: "",
  options: "",
  optionsAr: "",
  anchors: "",
  anchorsAr: "",
  scaleMax: 4,
  required: true,
  allowComment: false,
  trendAnchor: false,
};

const splitList = (value) => String(value || "").split("|").map((row) => row.trim()).filter(Boolean);

const QuestionBankPanel = () => {
  const { t, i18n } = useTranslation("support");
  const user = useSelector((state) => state.auth.user);
  const isSuperAdmin = [user?.role, ...(user?.roles || [])].includes("super_admin");

  const [audience, setAudience] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState({ questions: [], canManage: false });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await supportService.getBank({
        ...(audience ? { audience } : {}),
        ...(status ? { status } : {}),
      }));
    } catch (error) {
      toast.error(errorText(error, t("errors.loadBank")));
    } finally {
      setLoading(false);
    }
  }, [audience, status, t]);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const startRevise = (question) => {
    setEditing(question);
    setForm({
      audience: question.audience,
      kind: question.kind,
      concern: question.concern || "general",
      domain: question.domain || "academic",
      prompt: question.prompt || "",
      promptAr: question.promptAr || "",
      options: (question.options || []).join(" | "),
      optionsAr: (question.optionsAr || []).join(" | "),
      anchors: (question.anchors || []).join(" | "),
      anchorsAr: (question.anchorsAr || []).join(" | "),
      scaleMax: question.scaleMax || 4,
      required: question.required !== false,
      allowComment: question.allowComment === true,
      trendAnchor: question.trendAnchor === true,
    });
    setFormOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      audience: form.audience,
      kind: form.kind,
      concern: form.concern,
      domain: form.domain,
      prompt: form.prompt,
      promptAr: form.promptAr,
      scaleMax: Number(form.scaleMax),
      required: form.required,
      allowComment: form.allowComment,
      trendAnchor: form.trendAnchor,
    };
    if (form.kind === "choice") {
      payload.options = splitList(form.options);
      payload.optionsAr = splitList(form.optionsAr);
    }
    if (form.kind === "scale") {
      payload.anchors = splitList(form.anchors);
      payload.anchorsAr = splitList(form.anchorsAr);
    }
    setBusy("save");
    try {
      if (editing) {
        await supportService.reviseQuestion(editing._id, payload);
        toast.success(t("bank.revised"));
      } else {
        await supportService.createQuestion(payload);
        toast.success(t("bank.created"));
      }
      setFormOpen(false);
      setForm(emptyForm);
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(errorText(error, t("errors.saveQuestion")));
    } finally {
      setBusy("");
    }
  };

  const act = async (key, action, success) => {
    setBusy(key);
    try {
      await action();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(errorText(error, t("errors.bankAction")));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="support-bank">
      <div className="support-toolbar is-compact">
        <label>
          <span>{t("bank.audience")}</span>
          <select value={audience} onChange={(event) => setAudience(event.target.value)}>
            <option value="">{t("bank.allAudiences")}</option>
            {AUDIENCES.map((key) => <option key={key} value={key}>{t(`reviews.audience.${key}`)}</option>)}
          </select>
        </label>
        {data.canManage && (
          <label>
            <span>{t("bank.status")}</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">{t("bank.allStatuses")}</option>
              {["draft", "approved", "retired"].map((key) => (
                <option key={key} value={key}>{t(`bank.state.${key}`)}</option>
              ))}
            </select>
          </label>
        )}
        {data.canManage && (
          <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
            <HiOutlinePlus size={15} />
            {t("bank.newQuestion")}
          </button>
        )}
      </div>

      {formOpen && (
        <form className="support-card" onSubmit={submit}>
          <div className="support-card-head">
            <h2>{editing ? t("bank.reviseTitle") : t("bank.createTitle")}</h2>
            <button type="button" className="support-icon-btn" aria-label={t("common.close")} onClick={() => setFormOpen(false)}>
              <HiOutlineXMark size={17} />
            </button>
          </div>
          {editing && <p className="support-muted">{t("bank.reviseBody")}</p>}

          <div className="support-field-row is-three">
            <label>
              <span>{t("bank.audience")}</span>
              <select value={form.audience} disabled={Boolean(editing)} onChange={(event) => set("audience", event.target.value)}>
                {AUDIENCES.map((key) => <option key={key} value={key}>{t(`reviews.audience.${key}`)}</option>)}
              </select>
            </label>
            <label>
              <span>{t("bank.kind")}</span>
              <select value={form.kind} onChange={(event) => set("kind", event.target.value)}>
                {KINDS.map((key) => <option key={key} value={key}>{t(`bank.kindLabel.${key}`)}</option>)}
              </select>
            </label>
            <label>
              <span>{t("bank.concern")}</span>
              <select value={form.concern} onChange={(event) => set("concern", event.target.value)}>
                {CONCERNS.map((key) => <option key={key} value={key}>{t(`concern.${key}`, { defaultValue: key })}</option>)}
              </select>
            </label>
          </div>

          <label className="support-field-row">
            <span>{t("bank.prompt")}</span>
            <input required maxLength={500} value={form.prompt} onChange={(event) => set("prompt", event.target.value)} />
          </label>
          <label className="support-field-row">
            <span>{t("bank.promptAr")}</span>
            <input required dir="rtl" maxLength={500} value={form.promptAr} onChange={(event) => set("promptAr", event.target.value)} />
          </label>

          {form.kind === "choice" && (
            <>
              <label className="support-field-row">
                <span>{t("bank.options")}</span>
                <input value={form.options} placeholder={t("bank.optionsHint")} onChange={(event) => set("options", event.target.value)} />
              </label>
              <label className="support-field-row">
                <span>{t("bank.optionsAr")}</span>
                <input dir="rtl" value={form.optionsAr} placeholder={t("bank.optionsHint")} onChange={(event) => set("optionsAr", event.target.value)} />
              </label>
            </>
          )}

          {form.kind === "scale" && (
            <>
              <div className="support-field-row is-two">
                <label>
                  <span>{t("bank.scaleMax")}</span>
                  <select value={form.scaleMax} onChange={(event) => set("scaleMax", Number(event.target.value))}>
                    {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="support-check is-inline">
                  <input type="checkbox" checked={form.trendAnchor} onChange={(event) => set("trendAnchor", event.target.checked)} />
                  <span>{t("bank.trendAnchor")}</span>
                </label>
              </div>
              <label className="support-field-row">
                <span>{t("bank.anchors")}</span>
                <input value={form.anchors} placeholder={t("bank.anchorsHint")} onChange={(event) => set("anchors", event.target.value)} />
              </label>
              <label className="support-field-row">
                <span>{t("bank.anchorsAr")}</span>
                <input dir="rtl" value={form.anchorsAr} placeholder={t("bank.anchorsHint")} onChange={(event) => set("anchorsAr", event.target.value)} />
              </label>
            </>
          )}

          <label className="support-check is-inline">
            <input type="checkbox" checked={form.allowComment} onChange={(event) => set("allowComment", event.target.checked)} />
            <span>{t("bank.allowComment")}</span>
          </label>

          <div className="support-form-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFormOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy === "save"}>
              {busy === "save" ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="support-empty-inline"><div className="spinner" /></div>
      ) : (
        <div className="support-table-wrap">
          <table className="support-table">
            <thead>
              <tr>
                <th>{t("bank.question")}</th>
                <th>{t("bank.audience")}</th>
                <th>{t("bank.kind")}</th>
                <th>{t("bank.owner")}</th>
                <th>{t("bank.state.label")}</th>
                <th aria-label={t("common.actions")} />
              </tr>
            </thead>
            <tbody>
              {(data.questions || []).map((question) => {
                const isSchool = Boolean(question.school);
                return (
                  <tr key={question._id}>
                    <td>
                      <strong>{pick(question.prompt, question.promptAr, i18n.language?.startsWith("ar"))}</strong>
                      {question.trendAnchor && <span className="support-chip is-ready">{t("bank.trendChip")}</span>}
                    </td>
                    <td>{t(`reviews.audience.${question.audience}`)}</td>
                    <td>{t(`bank.kindLabel.${question.kind}`)}</td>
                    <td>{isSchool ? t("bank.schoolOwned") : t("bank.platformOwned")}</td>
                    <td>
                      <span className={`support-chip ${statusTone(question.status)}`}>
                        {t(`bank.state.${question.status}`)}
                      </span>
                      <span className="support-muted"> v{question.version}</span>
                    </td>
                    <td>
                      <div className="support-row-actions">
                        {isSchool && data.canManage && (
                          <button
                            type="button"
                            className="support-icon-btn"
                            title={t("bank.revise")}
                            disabled={question.status === "retired"}
                            onClick={() => startRevise(question)}
                          >
                            <HiOutlineDocumentDuplicate size={16} />
                          </button>
                        )}
                        {isSchool && data.canManage && question.status !== "retired" && (
                          <button
                            type="button"
                            className="support-link-btn"
                            disabled={Boolean(busy)}
                            onClick={() => act(`retire-${question._id}`, () => supportService.retireQuestion(question._id), t("bank.retired"))}
                          >
                            {t("bank.retire")}
                          </button>
                        )}
                        {isSchool && isSuperAdmin && question.status === "draft" && (
                          <button
                            type="button"
                            className="support-link-btn"
                            disabled={Boolean(busy)}
                            onClick={() => act(`approve-${question._id}`, () => supportService.approveQuestion(question._id), t("bank.approved"))}
                          >
                            <HiOutlineCheckBadge size={14} />
                            {t("bank.approve")}
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
    </div>
  );
};

export default QuestionBankPanel;
