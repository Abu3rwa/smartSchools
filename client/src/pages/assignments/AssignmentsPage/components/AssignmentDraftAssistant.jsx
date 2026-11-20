import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { HiOutlineLightningBolt } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import assignmentService from "../../../../services/assignmentService";
import {
  buildBriefRequestMeta,
  buildSourceRequestFields,
  formContextFromQuestions,
  resolveSourceOption,
} from "../utils/assignmentDrafting";
import AssignmentSourceSelect from "./AssignmentSourceSelect";

const ERROR_KEYS = {
  DRAFT_CLASS_SUBJECT_REQUIRED: "assignments:draftAssistant.errors.needClassSubject",
  DRAFT_TYPE_REQUIRED: "assignments:draftAssistant.errors.needType",
  DRAFT_CLASS_INVALID: "assignments:draftAssistant.errors.classInvalid",
  DRAFT_SUBJECT_INVALID: "assignments:draftAssistant.errors.subjectInvalid",
  DRAFT_NOT_AUTHORIZED: "assignments:draftAssistant.errors.notAuthorized",
  DRAFT_SOURCE_REQUIRED: "assignments:draftAssistant.errors.sourceRequired",
  DRAFT_ASSIGNMENT_NOT_FOUND: "assignments:draftAssistant.errors.assignmentMissing",
  DRAFT_BRIEF_SOURCE_TOO_SHORT: "assignments:draftAssistant.errors.sourceTooShort",
  DRAFT_BRIEF_RESPONSE_INVALID: "assignments:draftAssistant.errors.invalidDraft",
  DRAFT_QUESTIONS_INVALID: "assignments:draftAssistant.errors.invalidQuestions",
  DRAFT_RESPONSE_INVALID: "assignments:draftAssistant.errors.invalidQuestions",
  GOOGLE_FORMS_DISABLED: "assignments:draftAssistant.errors.formsDisabled",
  DOCUMENT_NO_TEXT: "assignments:draftAssistant.errors.noText",
  DOCUMENT_PDF_UNREADABLE: "assignments:draftAssistant.errors.pdfUnreadable",
  DOCUMENT_TYPE_UNSUPPORTED: "assignments:draftAssistant.errors.unsupportedFile",
  DOCUMENT_TOO_LARGE: "assignments:draftAssistant.errors.fileTooLarge",
  DOCUMENT_EMPTY_FILE: "assignments:draftAssistant.errors.emptyFile",
  DRIVE_FILE_NOT_CONNECTED: "assignments:draftAssistant.errors.driveNotConnected",
  DRIVE_FILE_NOT_FOUND: "assignments:draftAssistant.errors.driveFileMissing",
  DRIVE_FILE_API_FAILED: "assignments:draftAssistant.errors.driveFailed",
};

const AssignmentDraftAssistant = ({
  disabled = false,
  classId,
  subjectId,
  assignmentTypeId,
  assignmentId = null,
  sourceOptions = [],
  isGoogleForm = false,
  googleFormPublished = false,
  googleFormQuestions = [],
  hasExistingQuestions = false,
  onRequestSource,
  onDrafted,
  onQuestionsDrafted,
}) => {
  const { t } = useTranslation(["assignments"]);
  const [sourceValue, setSourceValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (resolveSourceOption(sourceOptions, sourceValue)) return;
    setSourceValue(sourceOptions[0]?.value || "");
  }, [sourceOptions, sourceValue]);

  const source = resolveSourceOption(sourceOptions, sourceValue);
  const hasClassSubject = Boolean(classId && subjectId);
  // Questions the teacher already has are never overwritten from here; the
  // question drafter below is the explicit way to replace them.
  const formMode =
    isGoogleForm && !googleFormPublished && !hasExistingQuestions;
  // An already-linked form stays part of the assignment even when its
  // questions cannot be replaced, so the draft should still describe it.
  const formExists =
    isGoogleForm && (googleFormPublished || hasExistingQuestions);
  const canGenerate =
    !disabled && !loading && hasClassSubject && Boolean(source);

  const disabledReason = (() => {
    if (!hasClassSubject)
      return t("assignments:draftAssistant.needClassSubject");
    if (!source) return t("assignments:draftAssistant.needFile");
    return "";
  })();

  const errorMessageFor = (requestError) => {
    const code = requestError?.response?.data?.code || requestError?.code;
    if (code && ERROR_KEYS[code]) return t(ERROR_KEYS[code]);
    if (requestError?.response?.status === 429)
      return t("assignments:draftAssistant.errors.rateLimited");
    return (
      requestError?.response?.data?.message ||
      requestError?.message ||
      t("assignments:draftAssistant.errors.failed")
    );
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setLoading(true);
    setError("");
    setNotice("");
    const sourceFields = buildSourceRequestFields(source);
    try {
      const briefResponse = await assignmentService.draftBrief({
        classId,
        subjectId,
        assignmentTypeId,
        assignmentId,
        ...sourceFields,
        ...buildBriefRequestMeta({
          useForForm: formMode || formExists,
        }),
        formContext: formContextFromQuestions(googleFormQuestions),
      });
      const draft = briefResponse?.data || {};
      if (!draft.title || !draft.summary || !draft.instructions) {
        throw new Error(t("assignments:draftAssistant.errors.invalidDraft"));
      }
      onDrafted?.({
        title: draft.title,
        summary: draft.summary,
        instructions: draft.instructions,
      });

      let questionError = "";
      if (formMode) {
        try {
          const response = await assignmentService.draftQuestions({
            classId,
            subjectId,
            lessonPlanIds: [],
            count: 5,
            types: ["multiple_choice", "true_false"],
            assignmentId,
            ...sourceFields,
          });
          const questions = response?.data?.questions || [];
          if (questions.length === 0) {
            throw new Error(
              t("assignments:draftAssistant.errors.invalidQuestions"),
            );
          }
          onQuestionsDrafted?.(questions);
        } catch (requestError) {
          questionError = errorMessageFor(requestError);
        }
      }

      toast.success(t("assignments:draftAssistant.done"));
      if (questionError) {
        setNotice(
          t("assignments:draftAssistant.partial", { message: questionError }),
        );
      }
    } catch (requestError) {
      setError(errorMessageFor(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="question-drafter">
      <div className="question-drafter__head">
        <span className="question-drafter__icon" aria-hidden="true">
          <HiOutlineLightningBolt />
        </span>
        <div>
          <h4>{t("assignments:draftAssistant.title")}</h4>
          <p>{t("assignments:draftAssistant.help")}</p>
        </div>
      </div>

      <AssignmentSourceSelect
        options={sourceOptions}
        value={sourceValue}
        onChange={setSourceValue}
        disabled={disabled || loading}
        onRequestSource={onRequestSource}
      />

      {formMode && (
        <p className="question-drafter__hint">
          {t("assignments:draftAssistant.alsoFormQuestions")}
        </p>
      )}

      {error && (
        <p className="question-drafter__error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="question-drafter__hint" role="status">
          {notice}
        </p>
      )}

      <div className="question-drafter__actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleGenerate}
          disabled={!canGenerate}
        >
          <HiOutlineLightningBolt />
          {loading
            ? t("assignments:draftAssistant.generating")
            : t("assignments:draftAssistant.generate")}
        </button>
        {disabledReason && !error && (
          <span className="question-drafter__hint">{disabledReason}</span>
        )}
      </div>
    </div>
  );
};

export default AssignmentDraftAssistant;
