import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { HiOutlineArrowLeft, HiOutlineArrowRight } from "react-icons/hi";
import DetailsStep from "./DetailsStep.jsx";
import RubricStep from "./RubricStep.jsx";
import StructureStep from "./StructureStep.jsx";
import SupportsStep from "./SupportsStep.jsx";
import WritingCsvImportPanel from "./WritingCsvImportPanel.jsx";
import { studentViewPreview } from "./form.js";
import ErrorBanner from "../../../../components/shared/ErrorBanner.jsx";
import { useWritingBuilderData } from "./hooks/useWritingBuilderData.js";
import "../writingShared.css";

const STEPS = ["details", "structure", "supports", "rubric"];

export default function WritingAssignmentBuilderPage() {
  const { t } = useTranslation(["writing"]);
  const [step, setStep] = useState(0);
  const {
    assignmentId,
    applyTemplate,
    classes,
    errors,
    failed,
    form,
    isEdit,
    loading,
    onCancel,
    retry,
    roster,
    save,
    saveTemplate,
    saving,
    savingTemplate,
    templates,
    templatesLoading,
    update,
    vocabularyLists,
    wasActive,
  } = useWritingBuilderData();

  const applyCsv = useCallback((patch) => {
    update(patch);
    setStep(0);
    toast.success(t("writing:teacher.builder.csv.applied"));
  }, [t, update]);

  if (loading) {
    return (
      <div className="wa-page wa-loading" aria-live="polite">
        <div className="spinner" />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="wa-page wa-builder">
        <div className="wa-head">
          <div>
            <button type="button" className="btn btn-ghost btn-sm wa-back" onClick={onCancel}>
              <HiOutlineArrowLeft size={16} aria-hidden="true" />
              {t("writing:common.back")}
            </button>
            <h1>{t(isEdit ? "writing:teacher.builder.editTitle" : "writing:teacher.builder.newTitle")}</h1>
          </div>
        </div>
        <ErrorBanner
          message={t("writing:teacher.builder.loadFailed")}
          onRetry={retry}
          retryLabel={t("writing:teacher.retry")}
        />
      </div>
    );
  }

  const preview = studentViewPreview(form);
  const key = STEPS[step];

  return (
    <div className="wa-page wa-builder">
      <div className="wa-head">
        <div>
          <button type="button" className="btn btn-ghost btn-sm wa-back" onClick={onCancel}>
            <HiOutlineArrowLeft size={16} aria-hidden="true" />
            {t("writing:common.back")}
          </button>
          <h1>{t(isEdit ? "writing:teacher.builder.editTitle" : "writing:teacher.builder.newTitle")}</h1>
          <p className="wa-sub">{t("writing:teacher.builder.subtitle")}</p>
        </div>
      </div>

      <div className="wa-import-row">
        <WritingCsvImportPanel onApplied={applyCsv} supports={form.supports} />
      </div>

      <div className="wa-template-row">
        {!isEdit && (templatesLoading || templates.length > 0) && (
          <label className="wa-template-pick">
            <span>{t("writing:teacher.builder.template.apply")}</span>
            <select
              defaultValue=""
              disabled={templatesLoading}
              aria-label={t("writing:teacher.builder.template.choose")}
              onChange={(event) => {
                const templateId = event.target.value;
                event.target.value = "";
                if (templateId) applyTemplate(templateId);
              }}
            >
              <option value="">{t("writing:teacher.builder.template.choose")}</option>
              {templates.map((row) => (
                <option key={row._id} value={row._id}>
                  {row.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {isEdit && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving || savingTemplate}
            onClick={saveTemplate}
          >
            {t(
              savingTemplate
                ? "writing:teacher.builder.template.saving"
                : "writing:teacher.builder.template.save",
            )}
          </button>
        )}
      </div>

      <ol className="wa-steps" aria-label={t("writing:teacher.builder.stepsAria")}>
        {STEPS.map((item, index) => (
          <li key={item}>
            <button
              type="button"
              className={`wa-step-tab${index === step ? " is-active" : ""}`}
              onClick={() => setStep(index)}
              aria-current={index === step ? "step" : undefined}
            >
              <span className="wa-step-index">{index + 1}</span>
              {t(`writing:teacher.builder.steps.${item}`)}
            </button>
          </li>
        ))}
      </ol>

      <div className="wa-builder-body">
        <div className="wa-builder-main">
          {key === "details" && (
            <DetailsStep classes={classes} errors={errors} form={form} roster={roster} update={update} />
          )}
          {key === "structure" && <StructureStep errors={errors} form={form} update={update} />}
          {key === "supports" && (
            <SupportsStep
              assignmentId={assignmentId}
              form={form}
              roster={roster}
              update={update}
              vocabularyLists={vocabularyLists}
            />
          )}
          {key === "rubric" && <RubricStep errors={errors} form={form} update={update} />}

          {step > 0 && key !== "rubric" && Object.keys(errors).length > 0 && (
            <em className="wa-error">{t("writing:teacher.builder.errors.otherStep")}</em>
          )}
        </div>

        {key === "rubric" && (
          <aside className="wa-preview">
            <h3>{t("writing:teacher.builder.previewTitle")}</h3>
            <p className="wa-preview-title">{preview.title || t("writing:teacher.builder.untitled")}</p>
            {preview.topic && <p className="wa-preview-topic">{preview.topic}</p>}
            <dl>
              <div>
                <dt>{t("writing:teacher.builder.previewSections")}</dt>
                <dd>{t("writing:teacher.builder.previewSectionValue", {
                  required: preview.requiredCount,
                  total: preview.sectionCount,
                  slots: preview.writingSlots,
                })}</dd>
              </div>
              <div>
                <dt>{t("writing:teacher.builder.previewLength")}</dt>
                <dd>{preview.minWords || preview.maxWords
                  ? t("writing:teacher.builder.previewLengthValue", {
                    min: preview.minWords || 0,
                    max: preview.maxWords || t("writing:teacher.builder.previewNoMax"),
                  })
                  : t("writing:teacher.builder.previewNoLength")}</dd>
              </div>
              <div>
                <dt>{t("writing:teacher.builder.previewAudience")}</dt>
                <dd>{preview.audienceMode === "selected"
                  ? t("writing:teacher.builder.previewAudienceSelected", { n: preview.audienceCount })
                  : t("writing:teacher.builder.previewAudienceClass")}</dd>
              </div>
              <div>
                <dt>{t("writing:teacher.builder.previewPoints")}</dt>
                <dd>{preview.totalPoints}</dd>
              </div>
              <div>
                <dt>{t("writing:teacher.builder.previewFeedback")}</dt>
                <dd>{t(preview.publishesFeedback
                  ? "writing:teacher.builder.previewFeedbackManual"
                  : "writing:teacher.builder.previewFeedbackAuto")}</dd>
              </div>
              <div>
                <dt>{t("writing:teacher.builder.previewNotebook")}</dt>
                <dd>{t(preview.notebookCheck
                  ? "writing:teacher.builder.previewNotebookYes"
                  : "writing:teacher.builder.previewNotebookNo")}</dd>
              </div>
            </dl>
            {preview.supports.length > 0 && (
              <ul className="wa-preview-supports">
                {preview.supports.map((item) => (
                  <li key={item.key}>
                    {t(`writing:teacher.builder.${item.key}`)} · {t("writing:teacher.builder.previewItemCount", { n: item.items })}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>

      <div className="wa-footer">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
        >
          {step === 0 ? t("writing:teacher.builder.cancel") : t("writing:teacher.builder.previous")}
        </button>
        <div className="wa-footer-actions">
          {(!isEdit || !wasActive) && (
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => save({ isActive: false })}>
              {t("writing:teacher.builder.saveDraft")}
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
              {t("writing:teacher.builder.next")}
              <HiOutlineArrowRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save()}>
              {saving
                ? t("writing:teacher.builder.saving")
                : t(isEdit && wasActive ? "writing:teacher.builder.saveChanges" : "writing:teacher.builder.publish")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
