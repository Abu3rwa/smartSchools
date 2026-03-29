/**
 * Presentation feature limits and quotas by plan.
 */
export const PRESENTATION_LIMITS = {
  // Per-generation limits
  maxInputTokens: 8000,
  maxOutputTokens: 4000,
  maxSlides: 20,
  minSlides: 3,

  // Per-school daily limits (by plan)
  dailyGenerations: {
    starter: 5,
    professional: 50,
    enterprise: 200,
  },

  // Per-school daily token budget
  dailyTokenBudget: {
    starter: 50000,
    professional: 500000,
    enterprise: 2000000,
  },

  // File limits
  maxFilesPerUpload: 5,
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxTotalUploadBytes: 30 * 1024 * 1024,

  // Storage limits
  maxPresentationsPerTeacher: 100,
  maxExtractionsPerTeacher: 50,
};

export const VALID_SLIDE_LAYOUTS = [
  "title",
  "title-body",
  "two-column",
  "image-left",
  "image-right",
  "image-full",
  "quote",
  "bullets",
  "comparison",
  "blank",
];

export const ALLOWED_HTML_TAGS = [
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "h3",
  "h4",
  "br",
];
