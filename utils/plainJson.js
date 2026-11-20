/**
 * The AI reply is stored twice: filled for reading, tokenised for the edit
 * trail. The stored copy has to be plain, bounded JSON or a later round cannot
 * read it back, so every write path asks this first.
 */
export const PLAIN_JSON_LIMITS = {
  maxDepth: 32,
  maxBytes: 512 * 1024,
};

const isPlainObject = (value) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Null when the value can be stored as plain JSON within the limits, else a
 * short reason ("cycle", "depth", "size", "unsupported:function", ...) for the
 * log. Never throws, whatever it is given.
 */
export const plainJsonIssue = (
  value,
  { maxDepth = PLAIN_JSON_LIMITS.maxDepth, maxBytes = PLAIN_JSON_LIMITS.maxBytes } = {},
) => {
  const seen = new WeakSet();

  const inspect = (entry, depth) => {
    // JSON drops undefined on its own, so an unset field is not a problem.
    if (entry === null || entry === undefined) return null;
    const kind = typeof entry;
    if (kind === "string" || kind === "boolean") return null;
    if (kind === "number") return Number.isFinite(entry) ? null : "unsupported:number";
    if (kind !== "object") return `unsupported:${kind}`;    if (entry instanceof Date) return null;
    if (typeof entry.toHexString === "function") return null;
    if (depth >= maxDepth) return "depth";
    if (seen.has(entry)) return "cycle";
    seen.add(entry);

    if (Array.isArray(entry)) {
      for (const row of entry) {
        const problem = inspect(row, depth + 1);
        if (problem) return problem;
      }
      return null;
    }
    if (!isPlainObject(entry)) return `unsupported:${entry.constructor?.name || "object"}`;

    for (const row of Object.values(entry)) {
      const problem = inspect(row, depth + 1);
      if (problem) return problem;
    }
    return null;
  };

  const structural = inspect(value, 0);
  if (structural) return structural;
  return Buffer.byteLength(JSON.stringify(value)) > maxBytes ? "size" : null;
};
