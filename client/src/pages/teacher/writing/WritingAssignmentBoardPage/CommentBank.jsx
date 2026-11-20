import { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import writingService from "../../../../services/writingService.js";

/**
 * F2: the teacher's own reusable notes, suggested for the section on screen.
 * Inserting one replaces the selected line of the field; the evidence quote is
 * a separate field and is never touched here.
 */
export default function CommentBank({
  sectionKey,
  criteria = [],
  notes = [],
  disabled = false,
  onReplace,
}) {
  const { t } = useTranslation(["writing"]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [bank, setBank] = useState([]);
  const [skills, setSkills] = useState([]);
  const [skill, setSkill] = useState("other");
  const [shared, setShared] = useState(false);
  const [noteIndex, setNoteIndex] = useState(0);
  const [busy, setBusy] = useState("");
  const safeIndex = Math.min(noteIndex, Math.max(notes.length - 1, 0));
  const current = notes[safeIndex] ?? "";

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await writingService.listCommentBank({
        sectionKey,
        criteria: (criteria || []).join(","),
      });
      setBank(result?.notes || []);
      setSkills(result?.skills || []);
    } catch {
      setFailed(true);
      setBank([]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    load();
  };

  const insert = async (note) => {
    onReplace(safeIndex, note.text);
    setBank((rows) =>
      rows.map((row) =>
        row.id === note.id
          ? {
              ...row,
              usageCount: (row.usageCount || 0) + 1,
              lastUsedAt: new Date().toISOString(),
            }
          : row,
      ),
    );
    try {
      await writingService.markCommentBankUsed(note.id);
    } catch {
      // The note is already in the editor; a missed count is not worth a warning.
    }
  };

  const save = async () => {
    if (!current.trim()) {
      toast.error(t("writing:teacher.review.bank.noteEmpty"));
      return;
    }
    setBusy("save");
    try {
      const result = await writingService.saveCommentBankNote({
        text: current,
        skill,
        sectionKeys: [sectionKey],
        criteria,
        sharedWithSchool: shared,
      });
      toast.success(
        result?.created === false
          ? t("writing:teacher.review.bank.updated")
          : t("writing:teacher.review.bank.saved"),
      );
      await load();
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("writing:teacher.review.bank.saveFailed"),
      );
    } finally {
      setBusy("");
    }
  };

  const remove = async (note) => {
    if (!window.confirm(t("writing:teacher.review.bank.deleteConfirm"))) return;
    setBusy(note.id);
    try {
      await writingService.deleteCommentBankNote(note.id);
      setBank((rows) => rows.filter((row) => row.id !== note.id));
      toast.success(t("writing:teacher.review.bank.deleted"));
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("writing:teacher.review.bank.deleteFailed"),
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="wa-comment-bank">
      <span className="wa-hint">{t("writing:teacher.review.bank.label")}</span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={disabled}
        aria-expanded={open}
        onClick={toggle}
      >
        {open
          ? t("writing:teacher.review.bank.close")
          : t("writing:teacher.review.bank.open")}
      </button>
      {open && (
        <div className="wa-bank-panel">
          <div className="wa-bank-save">
            {notes.length > 1 && (
              <select
                value={safeIndex}
                aria-label={t("writing:teacher.review.bank.whichNote")}
                onChange={(event) => setNoteIndex(Number(event.target.value))}
              >
                {notes.map((_note, index) => (
                  <option key={index} value={index}>
                    {t("writing:teacher.review.noteNumber", { n: index + 1 })}
                  </option>
                ))}
              </select>
            )}
            <select
              value={skill}
              aria-label={t("writing:teacher.review.bank.skillLabel")}
              onChange={(event) => setSkill(event.target.value)}
              disabled={loading || !skills.length}
            >
              {skills.map((value) => (
                <option key={value} value={value}>
                  {t(`writing:teacher.review.bank.skill.${value}`)}
                </option>
              ))}
            </select>
            <label className="wa-bank-share">
              <input
                type="checkbox"
                checked={shared}
                onChange={(event) => setShared(event.target.checked)}
              />
              <span>{t("writing:teacher.review.bank.share")}</span>
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled || loading || Boolean(busy)}
              onClick={save}
            >
              {busy === "save"
                ? t("writing:teacher.review.bank.saving")
                : t("writing:teacher.review.bank.saveCurrent")}
            </button>
          </div>
          {loading ? (
            <em className="wa-hint">
              {t("writing:teacher.review.bank.loading")}
            </em>
          ) : failed ? (
            <em className="wa-hint">{t("writing:teacher.review.bank.loadFailed")}</em>
          ) : bank.length === 0 ? (
            <em className="wa-hint">{t("writing:teacher.review.bank.empty")}</em>
          ) : (
            <ul className="wa-bank-list">
              {bank.map((note) => (
                <li key={note.id}>
                  <span>{note.text}</span>
                  <em>
                    {t(`writing:teacher.review.bank.skill.${note.skill}`)}
                    {" · "}
                    {t("writing:teacher.review.bank.usedCount", {
                      n: note.usageCount || 0,
                    })}
                    {note.sharedWithSchool
                      ? ` · ${t("writing:teacher.review.bank.shared")}`
                      : ""}
                  </em>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={disabled || Boolean(busy)}
                    onClick={() => insert(note)}
                  >
                    {t("writing:teacher.review.bank.insert")}
                  </button>
                  {note.mine && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={disabled || Boolean(busy)}
                      onClick={() => remove(note)}
                    >
                      {busy === note.id
                        ? t("writing:teacher.review.bank.deleting")
                        : t("writing:teacher.review.bank.delete")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
