import LiveLessonDraft from "../models/LiveLessonDraft.js";
import { LIVE_LESSON_BUILDER } from "../config/liveLessonBuilderConfig.js";
import { builderError } from "./liveLessonBuilderOperationService.js";
import {
  cleanText,
  combineSourceText,
  hashSeed,
} from "./liveLessonBuilderSanitizeService.js";
import {
  getSourceText,
  putSourceText,
  readDraftSource,
  removeDraftSourceText,
  removeSourceText,
} from "./liveLessonSourceStore.js";

/**
 * Draft writes that only touch source material or setup. Kept out of the
 * controller so the combine step (pasted text + every file) has one home.
 */

const asPlain = (value) => (value?.toObject ? value.toObject() : value);

const sourceFiles = (draft) => (Array.isArray(draft?.setup?.sourceMeta?.files)
  ? draft.setup.sourceMeta.files.map(asPlain)
  : []);

/** `keepText` is true only for rows written before memory-only sources. */
const fileRow = (file, { keepText }) => {
  const row = {
    fileId: String(file.fileId || ""),
    name: String(file.name || ""),
    size: Number(file.size) || 0,
    mimeType: String(file.mimeType || ""),
    sourceType: String(file.sourceType || ""),
    chars: Number(file.chars) || 0,
    truncated: file.truncated === true,
    pageCount: Number(file.pageCount) > 0 ? Number(file.pageCount) : null,
    pages: file.pages?.first && file.pages?.last
      ? { first: Number(file.pages.first), last: Number(file.pages.last) }
      : null,
    uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : new Date(),
  };
  const legacyText = keepText && typeof file.text === "string" ? file.text : "";
  return legacyText ? { ...row, text: legacyText } : row;
};

const writeSource = ({ draftId, pastedText, rows }) => {
  putSourceText({ draftId, text: pastedText });
  const source = readDraftSource({
    _id: draftId,
    setup: {
      pastedText: "",
      sourceMeta: { storage: "memory", pastedChars: pastedText.length, files: rows },
    },
  }, { require: false });
  return {
    storage: "memory",
    origin: rows.length ? "upload" : "paste",
    files: rows,
    truncated: source.truncated,
    redactions: source.redactions,
    pastedChars: pastedText.length,
    chars: source.text.length,
    textHash: source.hash,
  };
};

const mergePastedText = ({ draftId, draft, setup }) => {
  if (setup.pastedText !== undefined) return String(setup.pastedText || "");
  if (!draft) return "";
  const stored = getSourceText({ draftId });
  return stored !== null ? stored : String(draft.setup?.pastedText || "");
};

const nextExpiry = () => new Date(Date.now() + LIVE_LESSON_BUILDER.draftTtlMs);

/**
 * Create a draft, or merge source/options into an existing one. A version in
 * the filter turns a concurrent setup edit into a 409 instead of a lost write.
 * Extracted text goes to the in-memory store; only metadata and a hash are
 * written here.
 */
export const createLiveLessonDraft = async ({
  schoolId,
  ownerId,
  setup = {},
  files = [],
  draft = null,
  merge = false,
  version,
}) => {
  if (!draft) {
    const doc = new LiveLessonDraft({
      school: schoolId,
      ownerId,
      status: "setup",
      setup: {
        ...setup,
        pastedText: "",
        sourceText: "",
      },
    });
    for (const file of files) {
      putSourceText({ draftId: doc._id, fileId: file.fileId, text: file.text });
    }
    doc.setup.sourceMeta = writeSource({
      draftId: doc._id,
      pastedText: String(setup.pastedText || ""),
      rows: files.map((file) => fileRow(file, { keepText: false })),
    });
    await doc.save();
    return doc;
  }

  for (const file of files) {
    putSourceText({ draftId: draft._id, fileId: file.fileId, text: file.text });
  }
  const legacyRows = sourceFiles(draft).map((file) => fileRow(file, { keepText: true }));
  const addedRows = files.map((file) => fileRow(file, { keepText: false }));
  const rows = merge ? [...legacyRows, ...addedRows] : addedRows;
  const sourceMeta = writeSource({
    draftId: draft._id,
    pastedText: mergePastedText({ draftId: draft._id, draft, setup }),
    rows,
  });

  const $set = {
    "setup.sourceMeta": sourceMeta,
    expiresAt: nextExpiry(),
  };
  for (const key of ["title", "grade", "subjectText", "language", "level", "slideCount", "questionCount", "questionKinds", "palette", "generationMode"]) {
    if (setup[key] !== undefined) $set[`setup.${key}`] = setup[key];
  }
  if (setup.attestation !== undefined) {
    $set["setup.attestation.noStudentData"] = setup.attestation.noStudentData === true;
    $set["setup.attestation.at"] = setup.attestation.at || null;
  }

  const filter = {
    _id: draft._id,
    school: schoolId,
    ownerId,
    status: "setup",
  };
  if (version !== undefined) filter.version = version;

  const updated = await LiveLessonDraft.findOneAndUpdate(
    filter,
    { $set, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (!updated) {
    throw builderError(409, "VERSION_CONFLICT", "This draft changed in another tab. Reload before saving.");
  }
  return updated;
};

/**
 * Puts back the source the teacher's browser kept after the in-process store
 * lost it. The draft document is not written; the recomputed hash must equal
 * the one stored at upload, so only that exact material is accepted again.
 */
export const restoreSourceCopy = ({ draft, files = [], pastedText = "" }) => {
  const meta = asPlain(draft?.setup?.sourceMeta) || {};
  if (meta.storage !== "memory") {
    throw builderError(409, "SOURCE_NOT_VOLATILE", "This draft keeps its source in the database.");
  }
  if (!meta.textHash) {
    throw builderError(409, "SOURCE_MISMATCH", "This draft has no source fingerprint to restore against.");
  }
  const rows = sourceFiles(draft);
  const known = new Set(rows.map((row) => String(row.fileId)));
  const incoming = Array.isArray(files) ? files : [];
  if (incoming.length > rows.length) {
    throw builderError(422, "VALIDATION", "The saved copy lists files this draft does not have.");
  }
  const texts = new Map();
  for (const entry of incoming) {
    const fileId = String(entry?.fileId || "");
    if (!known.has(fileId)) {
      throw builderError(422, "VALIDATION", "The saved copy lists a file this draft does not have.");
    }
    if (texts.has(fileId)) {
      throw builderError(422, "VALIDATION", "The saved copy lists the same file twice.");
    }
    if (typeof entry?.text !== "string" || entry.text.length > LIVE_LESSON_BUILDER.maxSourceChars) {
      throw builderError(422, "VALIDATION", "The saved copy is not a valid source text.");
    }
    texts.set(fileId, entry.text);
  }
  const pasted = cleanText(pastedText, { maxLength: LIVE_LESSON_BUILDER.maxSourceChars });
  const missing = rows.filter((row) => Number(row.chars) > 0 && !(texts.get(String(row.fileId)) || "").trim());
  if (missing.length || (Number(meta.pastedChars) > 0 && !pasted) || !(texts.size || pasted)) {
    throw builderError(409, "SOURCE_RESTORE_INCOMPLETE", "The saved copy is incomplete. Upload the document again.");
  }
  const combined = combineSourceText({
    pastedText: pasted,
    files: rows.map((row) => ({ ...row, text: texts.get(String(row.fileId)) || "" })),
    maxChars: LIVE_LESSON_BUILDER.maxSourceChars,
  });
  if (hashSeed(combined.text) !== meta.textHash) {
    throw builderError(409, "SOURCE_MISMATCH", "The saved copy no longer matches this lesson. Upload the document again.");
  }
  putSourceText({ draftId: draft._id, text: pasted });
  rows.forEach((row) => {
    const text = texts.get(String(row.fileId)) || "";
    if (text) putSourceText({ draftId: draft._id, fileId: row.fileId, text });
  });
  return { restored: true, chars: combined.text.length, files: texts.size };
};

export const deleteFileFromDraft = async ({ draft, fileId }) => {
  removeSourceText({ draftId: draft._id, fileId });
  const rows = sourceFiles(draft)
    .filter((file) => file.fileId !== fileId)
    .map((file) => fileRow(file, { keepText: true }));
  const sourceMeta = writeSource({
    draftId: draft._id,
    pastedText: mergePastedText({ draftId: draft._id, draft, setup: {} }),
    rows,
  });
  const updated = await LiveLessonDraft.findOneAndUpdate(
    {
      _id: draft._id,
      school: draft.school,
      ownerId: draft.ownerId,
      status: "setup",
      activeOp: null,
    },
    {
      $set: {
        "setup.sourceMeta": sourceMeta,
        expiresAt: nextExpiry(),
      },
      $inc: { version: 1 },
    },
    { new: true },
  );
  if (!updated) throw builderError(409, "VERSION_CONFLICT", "This draft changed in another tab. Reload and try again.");
  return updated;
};

export const discardDraftSource = (draftId) => removeDraftSourceText(draftId);

export default createLiveLessonDraft;
