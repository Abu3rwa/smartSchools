/**
 * The machine-readable reasons an AI run can fail. A stored run carries one of
 * these codes plus a sentence a teacher may read; the exception text itself is
 * only ever logged, because it can name a model, a library or a file path.
 */
export const AI_FAILURE_MESSAGES = {
  AI_TIMEOUT: "The AI took too long to answer. Try again in a moment.",
  AI_INVALID_REPLY: "The AI reply could not be read. Try again.",
  AI_CONTENT_REJECTED:
    "The reply did not meet the school's content rules. Try again.",
  AI_PROVIDER_ERROR:
    "The AI service is unavailable right now. Try again shortly.",
  AI_PROVIDER_QUOTA:
    "The AI provider account is out of balance. Ask the platform owner to top it up.",
  AI_DEPTH_GUARD:
    "This draft could not be processed. Reload the student and try again.",
  CREDIT_EXHAUSTED: "There are not enough AI credits left to assess this draft.",
  AI_CREDIT_PAUSED:
    "Your AI credit is paused by the school admin. Ask them to turn it back on.",
  AI_CREDIT_PRICING_REQUIRED:
    "The AI credit price is not set up yet. Ask the platform owner to set it.",
  STALE_DRAFT: "A newer draft was submitted. Assess that one instead.",
  INTERNAL: "The assessment could not be completed. Try again.",
};

export const AI_FAILURE_CODES = Object.keys(AI_FAILURE_MESSAGES);

/** The gate knows why it refused, so its code is the answer — never its wording. */
const CREDIT_GATE_CODES = {
  AI_CREDIT_REQUIRED: "CREDIT_EXHAUSTED",
  AI_CREDIT_PAUSED: "AI_CREDIT_PAUSED",
  AI_CREDIT_PRICING_REQUIRED: "AI_CREDIT_PRICING_REQUIRED",
};

/** The provider running out of money is not the school's balance running out. */
const PROVIDER_QUOTA =
  /insufficient[_ ]credits?|credit balance is too low|exceeded your current quota|out of credits/i;

/** Classifies an exception by an explicit code when it has one, else by message. */
export const aiFailureCodeOf = (error) => {
  const explicit = String(error?.aiCode || error?.code || "").toUpperCase();
  if (AI_FAILURE_MESSAGES[explicit]) return explicit;
  if (CREDIT_GATE_CODES[explicit]) return CREDIT_GATE_CODES[explicit];

  const message = String(error?.message || "");
  if (PROVIDER_QUOTA.test(message)) return "AI_PROVIDER_QUOTA";
  if (explicit === "OPENAI_UPSTREAM_ERROR") return "AI_PROVIDER_ERROR";
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return "AI_TIMEOUT";
  // Narrow on purpose: an exception that merely mentions credit is not a refusal.
  if (/no AI credit left|not enough AI credits/i.test(message))
    return "CREDIT_EXHAUSTED";
  if (/json|invalid reply|could not be read/i.test(message))
    return "AI_INVALID_REPLY";
  if (/content rules|rejected|cannot be sent/i.test(message))
    return "AI_CONTENT_REJECTED";
  if (/maximum call stack|depth/i.test(message)) return "AI_DEPTH_GUARD";
  if (/provider|gateway|openai|ECONN|socket|network/i.test(message))
    return "AI_PROVIDER_ERROR";
  return "INTERNAL";
};
