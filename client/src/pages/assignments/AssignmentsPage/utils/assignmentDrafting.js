export const DRAFT_FIELD_KEYS = ["title", "summary", "instructions"];

export const buildBriefRequestMeta = ({ useForForm = false } = {}) => ({
  sourceUsage: useForForm ? ["form"] : [],
});

export const formContextFromQuestions = (questions = []) =>
  (Array.isArray(questions) ? questions : [])
    .map((question) => String(question?.title || "").trim())
    .filter(Boolean)
    .slice(0, 30);

/**
 * One upload feeds every use: the same Drive attachments list is the source
 * pool for AI drafting. Pending files are read in memory before the first
 * save; saved Drive files are read back from Drive by file id.
 */
export const buildSourceOptions = ({
  pendingFiles = [],
  driveAttachments = [],
} = {}) => [
  ...(Array.isArray(pendingFiles) ? pendingFiles : []).map((file, index) => ({
    value: `pending:${index}`,
    label: file.name,
    file,
  })),
  ...(Array.isArray(driveAttachments) ? driveAttachments : [])
    .filter((attachment) => attachment?.fileId)
    .map((attachment) => ({
      value: `drive:${attachment.fileId}`,
      label: attachment.fileName || attachment.fileId,
      attachment,
    })),
];

export const resolveSourceOption = (options = [], value) =>
  (Array.isArray(options) ? options : []).find(
    (option) => option.value === value,
  ) || null;

export const buildSourceRequestFields = (option) => {
  if (option?.file) return { file: option.file };
  if (option?.attachment?.fileId)
    return { sourceFileId: option.attachment.fileId };
  return {};
};

export const applyDraftFields = (form, draft = {}) => {
  const next = { ...form };
  for (const key of DRAFT_FIELD_KEYS) {
    if (typeof draft[key] === "string") next[key] = draft[key];
  }
  return next;
};
