import { combineSourceText, hashSeed } from "./liveLessonBuilderSanitizeService.js";
import { builderError } from "./liveLessonBuilderOperationService.js";
import { LIVE_LESSON_BUILDER } from "../config/liveLessonBuilderConfig.js";

/**
 * The lesson source lives here and nowhere else: an in-process map keyed by
 * (draftId, fileId), with a sliding TTL and LRU eviction. MongoDB keeps metadata
 * and a hash, never the text. The builder therefore runs on one API instance;
 * when an entry is gone (restart, eviction, another instance) reading it fails
 * with SOURCE_UNAVAILABLE instead of building a lesson from nothing.
 */

export const SOURCE_STORE_TTL_MS = 2 * 60 * 60 * 1000;
export const SOURCE_STORE_ENTRY_MAX_CHARS = LIVE_LESSON_BUILDER.maxSourceChars;
// Roughly 130 capped sources; a teacher's draft is a few tens of KB in practice.
const SOURCE_STORE_MAX_CHARS = 4_000_000;
const SOURCE_STORE_MAX_ENTRIES = 1000;

const PASTED_FILE_ID = "";

const entries = new Map();
let storedChars = 0;

const keyFor = (draftId, fileId = PASTED_FILE_ID) => `${String(draftId)}\u0000${fileId || "pasted"}`;
const prefixFor = (draftId) => `${String(draftId)}\u0000`;

const drop = (key) => {
  const entry = entries.get(key);
  if (!entry) return false;
  entries.delete(key);
  storedChars -= entry.text.length;
  return true;
};

// Map iteration order is recency order (every read moves the key to the end),
// so the front is both the oldest TTL and the least recently used entry.
const sweep = (now) => {
  for (const [key, entry] of entries) {
    if (entry.expiresAt > now) break;
    drop(key);
  }
  while (storedChars > SOURCE_STORE_MAX_CHARS || entries.size > SOURCE_STORE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    drop(oldest);
  }
};

export const putSourceText = ({ draftId, fileId = "", text = "", ttlMs = SOURCE_STORE_TTL_MS }) => {
  const key = keyFor(draftId, fileId);
  const value = String(text ?? "").slice(0, SOURCE_STORE_ENTRY_MAX_CHARS);
  const now = Date.now();
  drop(key);
  if (!value) {
    sweep(now);
    return "";
  }
  entries.set(key, { text: value, expiresAt: now + ttlMs });
  storedChars += value.length;
  sweep(now);
  return value;
};

export const getSourceText = ({ draftId, fileId = "" }) => {
  const key = keyFor(draftId, fileId);
  const entry = entries.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (entry.expiresAt <= now) {
    drop(key);
    return null;
  }
  entry.expiresAt = now + SOURCE_STORE_TTL_MS;
  entries.delete(key);
  entries.set(key, entry);
  return entry.text;
};

export const removeSourceText = ({ draftId, fileId = "" }) => drop(keyFor(draftId, fileId));

export const removeDraftSourceText = (draftId) => {
  const prefix = prefixFor(draftId);
  for (const key of [...entries.keys()]) {
    if (key.startsWith(prefix)) drop(key);
  }
};

/** Test helper: the store is a module singleton. */
export const resetSourceStore = () => {
  entries.clear();
  storedChars = 0;
};

const asPlain = (value) => (value?.toObject ? value.toObject() : value);

const sourceRows = (draft) => {
  const files = draft?.setup?.sourceMeta?.files;
  return Array.isArray(files) ? files.map(asPlain) : [];
};

/**
 * Rebuilds the source a prompt reads from memory, falling back to text that
 * drafts written before memory-only storage kept in Mongo. A memory draft never
 * falls back to a pasted value it no longer owns, so clearing pasted text cannot
 * resurrect it.
 *
 * @returns {{
 *   text: string, pastedText: string, files: object[],
 *   truncated: boolean, redactions: {emails: number, phones: number},
 *   hash: string, available: boolean
 * }}
 */
export const readDraftSource = (draft, { require = true, maxChars = LIVE_LESSON_BUILDER.maxSourceChars } = {}) => {
  const draftId = String(draft?._id || "");
  const meta = asPlain(draft?.setup?.sourceMeta) || {};
  const memoryOnly = meta.storage === "memory";

  const files = sourceRows(draft).map((row) => {
    const stored = draftId ? getSourceText({ draftId, fileId: row.fileId }) : null;
    const text = stored ?? String(row.text || "");
    return {
      ...row,
      text,
      available: Boolean(text.trim()) || !(Number(row.chars) > 0),
    };
  });

  const storedPaste = draftId ? getSourceText({ draftId }) : null;
  const pastedChars = Number(meta.pastedChars) || 0;
  const pastedText = storedPaste ?? (memoryOnly ? "" : String(draft?.setup?.pastedText || ""));
  const available = files.every((file) => file.available) && (pastedChars === 0 || storedPaste !== null);
  if (require && !available) {
    throw builderError(
      409,
      "SOURCE_UNAVAILABLE",
      "The source material is no longer held in memory. Upload the document again to continue; slides that already have content are kept.",
    );
  }

  const combined = combineSourceText({ pastedText, files, maxChars });
  return {
    text: combined.text,
    pastedText,
    files,
    truncated: combined.truncated || meta.truncated === true,
    redactions: combined.redactions,
    hash: meta.textHash || (combined.text ? hashSeed(combined.text) : ""),
    available,
  };
};

/** Names, page metadata and counts for the chip; never the text. */
export const sourceMetaSnapshot = (sourceMeta) => {
  const plain = asPlain(sourceMeta) || {};
  const files = Array.isArray(plain.files) ? plain.files.map(asPlain) : [];
  return {
    origin: plain.origin === "upload" ? "upload" : "paste",
    pastedChars: Number(plain.pastedChars) || 0,
    files: files.map((file) => ({
      name: String(file.name || ""),
      sourceType: String(file.sourceType || ""),
      chars: Number(file.chars) || 0,
      pageCount: Number(file.pageCount) || null,
      pages: file.pages?.first && file.pages?.last
        ? { first: Number(file.pages.first), last: Number(file.pages.last) }
        : null,
    })),
  };
};
