/**
 * One frozen draft + assessment used by every deterministic correction test on
 * the client and the server. Test tooling only: no runtime code imports it.
 *
 * Paragraph 0 overlaps a coaching note ("healthy body") with a grammar fix on
 * the same words; paragraph 1 holds a tense pair and a punctuation pair; the
 * third records a historical two-field pair with no anchor or review metadata.
 */
export const LANGUAGE_FIXTURE_TEXT =
  "It will make them have healthy body and increase their focus.";

export const languageDraftFixture = () => ({
  draft: {
    id: "draft-2",
    number: 2,
    title: "Why recess matters",
    totalWords: 26,
    submittedAt: "2026-11-17T09:00:00.000Z",
    sections: [
      { key: "body", index: 0, text: LANGUAGE_FIXTURE_TEXT },
      { key: "body", index: 1, text: "Yesterday we go outside" },
      { key: "body", index: 2, text: "sme peoeple like recess." },
    ],
  },
  assessment: {
    id: "assessment-2",
    kind: "feedback",
    sections: [
      {
        key: "body",
        index: 0,
        label: "Body",
        evidence: "healthy body",
        strengths: ["Clear opinion."],
        improvements: ["Add a reason."],
        nextStep: "Explain why recess matters.",
        why: "A reason makes the opinion convincing.",
        mechanics: [
          {
            category: "grammar",
            original: "healthy body",
            correction: "a healthy body",
            explanation: "Use “a” before the singular countable noun “body”.",
            anchor: { start: 23, end: 35 },
          },
        ],
        mechanicsReview: { version: 1, status: "checked" },
      },
      {
        key: "body",
        index: 1,
        label: "Body",
        evidence: "",
        mechanics: [
          {
            category: "verb_tense",
            original: "go",
            correction: "went",
            explanation: "Use past tense because this happened yesterday.",
            anchor: { start: 13, end: 15 },
          },
          {
            category: "punctuation",
            original: "outside",
            correction: "outside.",
            explanation: "End the sentence with a full stop.",
            anchor: { start: 16, end: 23 },
          },
        ],
        mechanicsReview: { version: 1, status: "partial" },
      },
      {
        key: "body",
        index: 2,
        label: "Body",
        evidence: "",
        mechanics: [
          { original: "sme", correction: "some" },
          { original: "peoeple", correction: "people" },
        ],
      },
    ],
  },
});
