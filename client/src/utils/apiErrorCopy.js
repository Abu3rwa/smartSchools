/**
 * Server refusals that carry a `code` are translated from that code, never from
 * the server's English sentence. Copy lives in the common namespace under
 * `rateLimit.*`; anything the server sends that is not listed here shares the
 * generic sentence, so a new limiter can never arrive untranslated.
 */
export const RATE_LIMIT_COPY_KEYS = Object.freeze({
  AI_RATE_LIMITED: "ai",
  DRAFT_SAVE_RATE_LIMITED: "draftSave",
  EMAIL_RATE_LIMITED: "email",
  IMPORT_RATE_LIMITED: "import",
});

export const rateLimitCopyKey = (code) =>
  RATE_LIMIT_COPY_KEYS[code] || "generic";
