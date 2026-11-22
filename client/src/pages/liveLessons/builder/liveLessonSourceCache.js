/**
 * The API keeps extracted lesson text in process memory only. This module keeps
 * a size-capped copy in the teacher's browser so the text can be put back after
 * an API restart; nothing is ever sent to another device or stored in MongoDB.
 */

export const SOURCE_COPY_VERSION = 1;
export const SOURCE_COPY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SOURCE_COPY_MAX_DRAFTS = 5;
export const SOURCE_COPY_MAX_CHARS = 1_500_000;
export const SOURCE_COPY_KEY_PREFIX = "llb.source.";

const keyFor = (draftId) => `${SOURCE_COPY_KEY_PREFIX}${draftId}`;

const defaultStorage = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

const entryChars = (entry) => {
  const pasted = typeof entry?.pastedText === "string" ? entry.pastedText.length : 0;
  const files = Array.isArray(entry?.files) ? entry.files : [];
  return (
    pasted +
    files.reduce(
      (sum, file) => sum + (typeof file?.text === "string" ? file.text.length : 0),
      0,
    )
  );
};

const sanitize = (raw, draftId) => {
  if (!raw || typeof raw !== "object" || raw.v !== SOURCE_COPY_VERSION) return null;
  if (String(raw.draftId || "") !== String(draftId)) return null;
  if (typeof raw.textHash !== "string" || !raw.textHash) return null;
  const savedAt = Number(raw.savedAt);
  if (!Number.isFinite(savedAt)) return null;
  const files = Array.isArray(raw.files)
    ? raw.files
        .filter(
          (file) =>
            file && typeof file.fileId === "string" && typeof file.text === "string",
        )
        .map((file) => ({ fileId: file.fileId, text: file.text }))
    : [];
  return {
    v: SOURCE_COPY_VERSION,
    draftId: String(draftId),
    textHash: raw.textHash,
    pastedText: typeof raw.pastedText === "string" ? raw.pastedText : "",
    files,
    savedAt,
  };
};

const listKeys = (storage) => {
  const output = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(SOURCE_COPY_KEY_PREFIX)) output.push(key);
    }
  } catch {
    return [];
  }
  return output;
};

const readRaw = (storage, key) => {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const dropKey = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    // A storage that refuses writes also refuses cleanup; nothing else to do.
  }
};

/** Expired copies go first, then the oldest drafts until both caps hold. */
export const pruneSourceCopies = ({
  storage = defaultStorage(),
  now = Date.now(),
} = {}) => {
  if (!storage) return;
  const live = [];
  for (const key of listKeys(storage)) {
    const entry = readRaw(storage, key);
    if (!entry || !Number.isFinite(Number(entry.savedAt)) ||
      now - Number(entry.savedAt) >= SOURCE_COPY_TTL_MS) {
      dropKey(storage, key);
      continue;
    }
    live.push({ key, entry });
  }
  live.sort((left, right) => Number(right.entry.savedAt) - Number(left.entry.savedAt));
  let kept = 0;
  let total = 0;
  for (const row of live) {
    const size = entryChars(row.entry);
    if (kept >= SOURCE_COPY_MAX_DRAFTS || total + size > SOURCE_COPY_MAX_CHARS) {
      dropKey(storage, row.key);
      continue;
    }
    kept += 1;
    total += size;
  }
};

export const removeSourceCopy = (draftId, { storage = defaultStorage() } = {}) => {
  if (!storage || !draftId) return;
  dropKey(storage, keyFor(draftId));
};

export const readSourceCopy = (
  draftId,
  { storage = defaultStorage(), now = Date.now() } = {},
) => {
  if (!storage || !draftId) return null;
  const key = keyFor(draftId);
  const raw = readRaw(storage, key);
  const entry = sanitize(raw, draftId);
  if (!entry) {
    let stored = null;
    try {
      stored = storage.getItem(key);
    } catch {
      stored = null;
    }
    if (stored !== null) dropKey(storage, key);
    return null;
  }
  if (now - entry.savedAt >= SOURCE_COPY_TTL_MS) {
    dropKey(storage, key);
    return null;
  }
  return { ...entry, chars: entryChars(entry) };
};

export const writeSourceCopy = (
  { draftId, textHash, pastedText = "", files = [] },
  { storage = defaultStorage(), now = Date.now() } = {},
) => {
  if (!storage || !draftId || !textHash) return false;
  const entry = sanitize(
    {
      v: SOURCE_COPY_VERSION,
      draftId: String(draftId),
      textHash,
      pastedText,
      files,
      savedAt: now,
    },
    draftId,
  );
  if (!entry) return false;
  if (entryChars(entry) > SOURCE_COPY_MAX_CHARS) {
    removeSourceCopy(draftId, { storage });
    return false;
  }
  try {
    storage.setItem(keyFor(draftId), JSON.stringify(entry));
  } catch {
    return false;
  }
  pruneSourceCopies({ storage, now });
  return true;
};

export const updateSourceCopy = (
  draftId,
  changes = {},
  { storage = defaultStorage(), now = Date.now() } = {},
) => {
  const existing = readSourceCopy(draftId, { storage, now });
  if (!existing) return false;
  return writeSourceCopy(
    {
      draftId,
      textHash: changes.textHash || existing.textHash,
      pastedText:
        changes.pastedText !== undefined ? changes.pastedText : existing.pastedText,
      files: Array.isArray(changes.files) ? changes.files : existing.files,
    },
    { storage, now },
  );
};
