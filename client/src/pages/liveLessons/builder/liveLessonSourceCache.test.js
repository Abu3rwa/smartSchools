import assert from "node:assert/strict";
import test from "node:test";
import {
  SOURCE_COPY_MAX_CHARS,
  SOURCE_COPY_MAX_DRAFTS,
  SOURCE_COPY_TTL_MS,
  pruneSourceCopies,
  readSourceCopy,
  removeSourceCopy,
  updateSourceCopy,
  writeSourceCopy,
} from "./liveLessonSourceCache.js";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

const copyFor = (draftId, overrides = {}) => ({
  draftId,
  textHash: `hash-${draftId}`,
  pastedText: "Teacher notes",
  files: [
    { fileId: "file-1", text: "Water evaporates." },
    { fileId: "file-2", text: "Clouds condense." },
  ],
  ...overrides,
});

test("a written copy reads back with its files and fingerprint", () => {
  const storage = new MemoryStorage();
  assert.equal(writeSourceCopy(copyFor("draft-a"), { storage }), true);
  const copy = readSourceCopy("draft-a", { storage });
  assert.equal(copy.draftId, "draft-a");
  assert.equal(copy.textHash, "hash-draft-a");
  assert.equal(copy.pastedText, "Teacher notes");
  assert.deepEqual(copy.files, [
    { fileId: "file-1", text: "Water evaporates." },
    { fileId: "file-2", text: "Clouds condense." },
  ]);
  assert.equal(copy.chars, 13 + 17 + 16);
});

test("a copy without a fingerprint or with another draft id is refused", () => {
  const storage = new MemoryStorage();
  assert.equal(writeSourceCopy(copyFor("draft-a", { textHash: "" }), { storage }), false);
  assert.equal(readSourceCopy("draft-a", { storage }), null);

  storage.setItem(
    "llb.source.draft-a",
    JSON.stringify({ ...copyFor("draft-a"), draftId: "draft-b" }),
  );
  assert.equal(readSourceCopy("draft-a", { storage }), null);
  assert.equal(storage.getItem("llb.source.draft-a"), null);
});

test("a malformed or old-version entry is discarded instead of crashing", () => {
  const storage = new MemoryStorage();
  storage.setItem("llb.source.draft-a", "{not json");
  assert.equal(readSourceCopy("draft-a", { storage }), null);
  assert.equal(storage.length, 0);

  storage.setItem(
    "llb.source.draft-b",
    JSON.stringify({ ...copyFor("draft-b"), v: 0 }),
  );
  assert.equal(readSourceCopy("draft-b", { storage }), null);
  assert.equal(storage.length, 0);
});

test("a copy older than seven days is removed on read", () => {
  const storage = new MemoryStorage();
  const savedAt = 1_000_000;
  writeSourceCopy(copyFor("draft-a"), { storage, now: savedAt });
  assert.ok(readSourceCopy("draft-a", { storage, now: savedAt + SOURCE_COPY_TTL_MS - 1 }));
  assert.equal(
    readSourceCopy("draft-a", { storage, now: savedAt + SOURCE_COPY_TTL_MS }),
    null,
  );
  assert.equal(storage.length, 0);
});

test("only the newest five drafts keep a copy", () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < SOURCE_COPY_MAX_DRAFTS + 1; index += 1) {
    writeSourceCopy(copyFor(`draft-${index}`), { storage, now: 1_000 + index });
  }
  assert.equal(readSourceCopy("draft-0", { storage, now: 2_000 }), null);
  for (let index = 1; index <= SOURCE_COPY_MAX_DRAFTS; index += 1) {
    assert.ok(readSourceCopy(`draft-${index}`, { storage, now: 2_000 }));
  }
});

test("the total cap drops the oldest drafts first", () => {
  const storage = new MemoryStorage();
  const big = "a".repeat(SOURCE_COPY_MAX_CHARS / 2 + 10);
  writeSourceCopy(copyFor("older", { pastedText: big, files: [] }), {
    storage,
    now: 1_000,
  });
  writeSourceCopy(copyFor("newer", { pastedText: big, files: [] }), {
    storage,
    now: 2_000,
  });
  assert.equal(readSourceCopy("older", { storage, now: 3_000 }), null);
  assert.ok(readSourceCopy("newer", { storage, now: 3_000 }));
});

test("a single copy past the cap is not stored and clears its old copy", () => {
  const storage = new MemoryStorage();
  writeSourceCopy(copyFor("draft-a"), { storage, now: 1_000 });
  const huge = "a".repeat(SOURCE_COPY_MAX_CHARS + 1);
  assert.equal(
    writeSourceCopy(copyFor("draft-a", { pastedText: huge, files: [] }), {
      storage,
      now: 2_000,
    }),
    false,
  );
  assert.equal(readSourceCopy("draft-a", { storage, now: 3_000 }), null);
});

test("updating a copy keeps its files and refreshes the fingerprint", () => {
  const storage = new MemoryStorage();
  writeSourceCopy(copyFor("draft-a"), { storage, now: 1_000 });
  assert.equal(
    updateSourceCopy(
      "draft-a",
      { textHash: "hash-2", pastedText: "New paste" },
      { storage, now: 2_000 },
    ),
    true,
  );
  const copy = readSourceCopy("draft-a", { storage, now: 2_000 });
  assert.equal(copy.textHash, "hash-2");
  assert.equal(copy.pastedText, "New paste");
  assert.equal(copy.files.length, 2);
});

test("removing a copy leaves other drafts alone", () => {
  const storage = new MemoryStorage();
  writeSourceCopy(copyFor("draft-a"), { storage, now: 1_000 });
  writeSourceCopy(copyFor("draft-b"), { storage, now: 1_000 });
  removeSourceCopy("draft-a", { storage });
  assert.equal(readSourceCopy("draft-a", { storage, now: 2_000 }), null);
  assert.ok(readSourceCopy("draft-b", { storage, now: 2_000 }));
});

test("pruning drops an abandoned expired copy", () => {
  const storage = new MemoryStorage();
  writeSourceCopy(copyFor("draft-a"), { storage, now: 1_000 });
  storage.setItem(
    "llb.source.draft-old",
    JSON.stringify({ ...copyFor("draft-old"), savedAt: 1_000 }),
  );
  pruneSourceCopies({ storage, now: 1_000 + SOURCE_COPY_TTL_MS });
  assert.equal(storage.length, 0);
});

test("a storage that refuses to write degrades quietly", () => {
  const storage = new MemoryStorage();
  storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.equal(writeSourceCopy(copyFor("draft-a"), { storage }), false);
  assert.equal(readSourceCopy("draft-a", { storage }), null);
});
