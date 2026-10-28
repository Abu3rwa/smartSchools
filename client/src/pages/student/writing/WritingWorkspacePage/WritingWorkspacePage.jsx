import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { HiOutlineArrowLeft, HiOutlineCheckCircle } from "react-icons/hi";
import ComparisonCard from "./ComparisonCard.jsx";
import DraftEssayView from "./DraftEssayView.jsx";
import FeedbackCard from "./FeedbackCard.jsx";
import SectionCard from "./SectionCard.jsx";
import { noteForSlot } from "./sectionFeedback.js";
import SubmitSheet from "./SubmitSheet.jsx";
import SupportsRail from "./SupportsRail.jsx";
import { useWritingWorkspaceData } from "./hooks/useWritingWorkspaceData.js";
import { draftReadiness } from "../../../../utils/writingWorkflow.js";
import "./WritingWorkspacePage.css";

export default function WritingWorkspacePage() {
  const { t, i18n } = useTranslation(["writing"]);
  const {
    addSlot,
    comparison,
    data,
    editSection,
    editTitle,
    feedback,
    latestDraft,
    loading,
    markNotebook,
    onBack,
    readOnly,
    reload,
    removeSlot,
    saveState,
    savedAt,
    submit,
    title,
    working,
  } = useWritingWorkspaceData();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // null follows a deep link ("?draft=2" from My Writing) until the student picks a tab.
  const [picked, setPicked] = useState(null);
  const [searchParams] = useSearchParams();
  const linkedNumber = Number(searchParams.get("draft")) || 0;
  const linkedDraft = linkedNumber
    ? data.drafts.find((draft) => draft.number === linkedNumber) || null
    : null;
  const view = picked ?? (linkedDraft ? linkedDraft.id : "write");

  const { assignment, project, tracker } = data;
  const readiness = useMemo(() => draftReadiness({ assignment, sections: working }), [assignment, working]);

  // A locked draft opens as the essay it is; the writing view comes back the moment it can be edited.
  const effectiveView = view === "write" && readOnly ? (latestDraft?.id || "write") : view;
  const viewedDraft = data.drafts.find((draft) => draft.id === effectiveView) || null;
  const viewedAssessment = viewedDraft
    ? data.feedback.find((row) => row.draftId === viewedDraft.id && row.kind !== "comparison") || null
    : null;

  if (loading) {
    return (
      <div className="ws-page ws-loading" aria-live="polite">
        <div className="spinner" />
      </div>
    );
  }

  if (!assignment || !project) return null;

  const rowsFor = (key) => working
    .filter((row) => row.key === key)
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));

  const saveLabel = () => {
    if (saveState === "saving" || saveState === "pending") return t("writing:student.saving");
    if (saveState === "saved" && savedAt) {
      return t("writing:student.savedAt", {
        time: new Date(savedAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }),
      });
    }
    return t("writing:student.allSaved");
  };

  const confirmSubmit = async () => {
    setBusy(true);
    const result = await submit();
    setBusy(false);
    setSheetOpen(false);
    // The draft is frozen; refetch so the tracker, locks and next step are right.
    if (result) reload();
  };

  const notebookDone = async () => {
    setBusy(true);
    const done = await markNotebook();
    setBusy(false);
    if (done) reload();
  };

  const blocked = project.canSubmit && project.canSubmit.allowed === false;

  const stillToWrite = [
    ...readiness.missingRequired,
    ...readiness.belowMinCount,
  ].map((row) => row.label).join(", ");

  return (
    <div className="ws-page">
      <header className="ws-head">
        <button type="button" className="btn btn-ghost btn-sm ws-back" onClick={onBack}>
          <HiOutlineArrowLeft size={16} aria-hidden="true" />
          {t("writing:student.myWriting")}
        </button>
        <div className="ws-head-title">
          <h1>{assignment.title}</h1>
          <p className="ws-sub">{t(`writing:student.types.${assignment.writingType}`)}</p>
        </div>
        {!readOnly && (
          <span className={`ws-saved is-${saveState}`} aria-live="polite">
            <span className="ws-dot" aria-hidden="true" />
            {saveLabel()}
          </span>
        )}
      </header>

      <ol className="ws-tracker" aria-label={t("writing:student.progressAria")}>
        {tracker.map((step) => (
          <li key={step.key} className={`ws-tracker-step is-${step.state}`}>
            {t(`writing:student.tracker.${step.key}`)}
          </li>
        ))}
      </ol>

      {data.drafts.length > 0 && (
        <nav className="ws-views" aria-label={t("writing:student.draftViewsAria")}>
          {!readOnly && (
            <button
              type="button"
              className={`ws-view${!viewedDraft ? " is-active" : ""}`}
              onClick={() => setPicked("write")}
            >
              {t("writing:student.writeTab")}
            </button>
          )}
          {data.drafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              className={`ws-view${viewedDraft?.id === draft.id ? " is-active" : ""}`}
              onClick={() => setPicked(draft.id)}
            >
              {t("writing:student.draftTab", { n: draft.number })}
              <span>{t("writing:student.words", { n: draft.totalWords || 0 })}</span>
            </button>
          ))}
        </nav>
      )}

      {assignment.instructions && <p className="ws-instructions">{assignment.instructions}</p>}

      {project.stage === "submitted" || project.stage === "feedback_ready" ? (
        <p className="ws-notice">{t("writing:student.teacherReviewing", { n: Math.max(1, project.draftCount) })}</p>
      ) : null}
      {project.stage === "ready_for_notebook" ? (
        <div className="ws-notice is-action">
          <span>{t("writing:student.notebookReady")}</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={notebookDone}>
            {t("writing:student.notebookDone")}
          </button>
        </div>
      ) : null}
      {project.stage === "awaiting_notebook_check" ? (
        <p className="ws-notice">{t("writing:student.waitingForNotebookCheck")}</p>
      ) : null}
      {project.stage === "completed" ? (
        <p className="ws-notice is-done">
          <HiOutlineCheckCircle size={18} aria-hidden="true" />
          {t("writing:student.completedNotice")}
        </p>
      ) : null}

      {/* Reading an older draft shows its own notes; the card would talk about a different draft. */}
      {(!viewedDraft || viewedDraft.id === latestDraft?.id) && (
        <FeedbackCard
          draftNumber={latestDraft?.number || 1}
          feedback={feedback}
          onReadDraft={latestDraft ? () => setPicked(latestDraft.id) : null}
          revising={!readOnly && Boolean(latestDraft) && !viewedDraft}
        />
      )}

      {comparison && (
        <ComparisonCard
          comparison={comparison}
          fromNumber={data.drafts.find((draft) => draft.id === comparison.previousDraftId)?.number
            || Math.max(1, (data.drafts.find((draft) => draft.id === comparison.draftId)?.number || 1) - 1)}
          toNumber={data.drafts.find((draft) => draft.id === comparison.draftId)?.number
            || Math.max(1, project.draftCount)}
        />
      )}

      <div className="ws-body">
        <main className="ws-main">
          {viewedDraft ? (
            <DraftEssayView
              assessment={viewedAssessment}
              assignment={assignment}
              draft={viewedDraft}
              locale={i18n.language}
            />
          ) : (
            <>
              <label className="ws-field">
                <span>{t("writing:student.pieceTitle")}</span>
                <input
                  type="text"
                  value={title}
                  readOnly={readOnly}
                  onChange={(event) => editTitle(event.target.value)}
                  placeholder={assignment.topic || t("writing:student.pieceTitlePlaceholder")}
                />
              </label>

              {assignment.sections.map((definition) => {
                const rows = rowsFor(definition.key);
                if (rows.length === 0) {
                  return (
                    <div className="ws-section ws-section-empty" key={definition.key}>
                      <h3>{definition.label}</h3>
                      <p className="ws-section-help">{definition.instructions}</p>
                      {!readOnly && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addSlot(definition)}>
                          {t("writing:student.addField", { label: definition.label })}
                        </button>
                      )}
                    </div>
                  );
                }
                const minCount = definition.required ? (definition.repeatable ? Number(definition.minCount) || 1 : 1) : 0;
                return rows.map((section) => (
                  <SectionCard
                    key={`${section.key}:${section.index}`}
                    canAdd={!readOnly && definition.repeatable
                      && rows.length < Math.max(Number(definition.maxCount) || 1, 1)}
                    canRemove={!readOnly && rows.length > minCount}
                    definition={{
                      ...definition,
                      label: definition.repeatable && rows.length > 1
                        ? `${definition.label} ${Number(section.index) + 1}`
                        : definition.label,
                    }}
                    note={noteForSlot(feedback, section)}
                    onChange={(key, index, text) => editSection(`${key}:${index}`, text)}
                    onAdd={() => addSlot(definition)}
                    onRemove={() => removeSlot(`${section.key}:${section.index}`)}
                    readOnly={readOnly}
                    section={section}
                  />
                ));
              })}

              {latestDraft && (
                <p className="ws-draft-note">
                  {t("writing:student.draftLocked", {
                    n: latestDraft.number,
                    words: latestDraft.totalWords || 0,
                    when: new Date(latestDraft.submittedAt).toLocaleDateString(i18n.language, {
                      day: "2-digit", month: "short",
                    }),
                  })}
                </p>
              )}
            </>
          )}
        </main>

        <SupportsRail assignment={assignment} goal={assignment.goal} />
      </div>

      <footer className="ws-bar">
        <div className="ws-bar-stats">
          <strong>{t("writing:student.words", { n: viewedDraft ? viewedDraft.totalWords || 0 : readiness.totalWords })}</strong>
          {!viewedDraft && ((Number(assignment.minWords) || 0) > 0 || (Number(assignment.maxWords) || 0) > 0) && (
            <span className="ws-bar-range">
              {t("writing:student.needs", {
                min: Number(assignment.minWords) || 0,
                max: Number(assignment.maxWords) || t("writing:student.noLimit"),
              })}
            </span>
          )}
          {!viewedDraft && (
            <span className={`ws-bar-required${stillToWrite ? " is-missing" : ""}`}>
              {stillToWrite
                ? t("writing:student.missingSections", { labels: stillToWrite })
                : t("writing:student.allSectionsDone")}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={readOnly || blocked || busy || Boolean(viewedDraft)}
          title={blocked ? project.canSubmit?.reason : undefined}
          onClick={() => setSheetOpen(true)}
        >
          {t("writing:student.submitDraft", { n: project.draftCount + 1 })}
        </button>
      </footer>

      {sheetOpen && (
        <SubmitSheet
          assignment={assignment}
          busy={busy}
          draftNumber={project.draftCount}
          onClose={() => setSheetOpen(false)}
          onConfirm={confirmSubmit}
          readiness={readiness}
        />
      )}
    </div>
  );
}
