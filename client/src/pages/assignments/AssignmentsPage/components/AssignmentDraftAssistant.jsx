import { useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  HiOutlineDocumentText,
  HiOutlineLightningBolt,
  HiOutlineUpload,
  HiOutlineX,
} from "react-icons/hi";
import { useTranslation } from "react-i18next";
import assignmentService from "../../../../services/assignmentService";
import {
  buildBriefRequestMeta,
  formContextFromQuestions,
} from "../utils/assignmentDrafting";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ERROR_KEYS = {
  DRAFT_CLASS_SUBJECT_REQUIRED: "assignments:draftAssistant.errors.needClassSubject",
  DRAFT_TYPE_REQUIRED: "assignments:draftAssistant.errors.needType",
  DRAFT_CLASS_INVALID: "assignments:draftAssistant.errors.classInvalid",
  DRAFT_SUBJECT_INVALID: "assignments:draftAssistant.errors.subjectInvalid",
  DRAFT_NOT_AUTHORIZED: "assignments:draftAssistant.errors.notAuthorized",
  DRAFT_SOURCE_REQUIRED: "assignments:draftAssistant.errors.sourceRequired",
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
};

const formatFileSize = (bytes) =>
  `${(bytes / (1024 * 1024)).toFixed(bytes > 1024 * 1024 ? 1 : 2)} MB`;

const AssignmentDraftAssistant = ({
  disabled = false,
  classId,
  subjectId,
  assignmentTypeId,
  isGoogleForm = false,
  googleFormPublished = false,
  googleFormQuestions = [],
  hasExistingQuestions = false,
  attachedFiles = [],
  onDrafted,
  onQuestionsDrafted,
  onAttachFile,
  onDetachFile,
}) => {
  const { t } = useTranslation(["assignments"]);
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [useForForm, setUseForForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const attached = Boolean(
    file && (attachedFiles || []).includes(file),
  );
  const hasClassSubject = Boolean(classId && subjectId);
  const canUseForm = isGoogleForm && !googleFormPublished;
  const formMode = useForForm && canUseForm;
  // An already-linked form stays part of the assignment even when its
  // questions cannot be replaced, so the draft should still describe it.
  const formExists =
    isGoogleForm && (googleFormPublished || hasExistingQuestions);
  const canGenerate =
    !disabled && !loading && hasClassSubject && Boolean(file);

  const disabledReason = (() => {
    if (!hasClassSubject)
      return t("assignments:draftAssistant.needClassSubject");
    if (!file) return t("assignments:draftAssistant.needFile");
    return "";
  })();

  const formOptionHint = (() => {
    if (!isGoogleForm) return t("assignments:draftAssistant.formNeedsForm");
    if (googleFormPublished)
      return t("assignments:draftAssistant.formPublished");
    return t("assignments:draftAssistant.useForFormHelp");
  })();

  const replaceFile = (nextFile) => {
    if (attached && file) onDetachFile?.(file);
    setFile(nextFile);
    if (attached && nextFile) onAttachFile?.(nextFile);
  };

  const handleFileChange = (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (!ACCEPTED_TYPES.includes(chosen.type)) {
      setError(t("assignments:draftAssistant.errors.unsupportedFile"));
      replaceFile(null);
      return;
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setError(t("assignments:draftAssistant.errors.fileTooLarge"));
      replaceFile(null);
      return;
    }
    setError("");
    setNotice("");
    replaceFile(chosen);
  };

  const clearFile = () => {
    if (attached && file) onDetachFile?.(file);
    setFile(null);
    setError("");
    setNotice("");
  };

  const toggleAttach = () => {
    if (!file) return;
    if (attached) onDetachFile?.(file);
    else onAttachFile?.(file);
  };

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
    if (
      formMode &&
      hasExistingQuestions &&
      !window.confirm(t("assignments:draftAssistant.replaceQuestionsConfirm"))
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    try {
      const briefResponse = await assignmentService.draftBrief({
        classId,
        subjectId,
        assignmentTypeId,
        file,
        ...buildBriefRequestMeta({
          useForForm: formMode || formExists,
          attachFile: attached,
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
            file,
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

      <div className="question-drafter__file">
        <div className="question-drafter__file-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || loading}
          >
            <HiOutlineUpload />
            {t("assignments:draftAssistant.chooseFile")}
          </button>
          {file && (
            <button
              type="button"
              className="question-drafter__clear"
              onClick={clearFile}
              disabled={disabled || loading}
              aria-label={t("assignments:draftAssistant.removeFile")}
            >
              <HiOutlineX />
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
            hidden
            onChange={handleFileChange}
            aria-label={t("assignments:draftAssistant.chooseFile")}
          />
        </div>
        {file ? (
          <p className="question-drafter__file-name">
            <HiOutlineDocumentText aria-hidden="true" />
            <span>{file.name}</span>
            <span className="question-drafter__file-size">
              {formatFileSize(file.size)}
            </span>
          </p>
        ) : (
          <p className="question-drafter__hint">
            {t("assignments:draftAssistant.fileTypes")}
          </p>
        )}
        <p className="question-drafter__hint">
          {t("assignments:draftAssistant.fileNotSaved")}
        </p>
      </div>

      <fieldset className="question-drafter__source">
        <legend>{t("assignments:draftAssistant.useFor")}</legend>
        <label className="question-drafter__radio">
          <input
            type="checkbox"
            checked={attached}
            disabled={disabled || loading || !file}
            onChange={toggleAttach}
          />
          <span>
            {t("assignments:draftAssistant.attachFile")}
            <small>{t("assignments:draftAssistant.attachFileHelp")}</small>
          </span>
        </label>
        <label className="question-drafter__radio">
          <input
            type="checkbox"
            checked={formMode}
            disabled={disabled || loading || !canUseForm}
            onChange={(event) => setUseForForm(event.target.checked)}
          />
          <span>
            {t("assignments:draftAssistant.useForForm")}
            <small>{formOptionHint}</small>
          </span>
        </label>
      </fieldset>

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
