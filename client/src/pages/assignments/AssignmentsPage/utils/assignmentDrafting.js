export const DRAFT_FIELD_KEYS = ["title", "summary", "instructions"];

export const buildBriefRequestMeta = ({ useForForm = false, attachFile = false }) => ({
  sourceUsage: [
    ...(useForForm ? ["form"] : []),
    ...(attachFile ? ["attachment"] : []),
  ],
});

export const formContextFromQuestions = (questions = []) =>
  (Array.isArray(questions) ? questions : [])
    .map((question) => String(question?.title || "").trim())
    .filter(Boolean)
    .slice(0, 30);

export const applyDraftFields = (form, draft = {}) => {
  const next = { ...form };
  for (const key of DRAFT_FIELD_KEYS) {
    if (typeof draft[key] === "string") next[key] = draft[key];
  }
  return next;
};

export const attachFileToForm = (form, file) => {
  if (!file) return form;
  const files = Array.isArray(form.attachmentFiles)
    ? form.attachmentFiles
    : [];
  if (files.includes(file)) return form;
  return { ...form, attachmentFiles: [...files, file] };
};

export const detachFileFromForm = (form, file) => {
  if (!file) return form;
  const files = Array.isArray(form.attachmentFiles)
    ? form.attachmentFiles
    : [];
  if (!files.includes(file)) return form;
  return {
    ...form,
    attachmentFiles: files.filter((candidate) => candidate !== file),
  };
};
