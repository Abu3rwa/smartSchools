/**
 * Identities of the writing prompts and reply shapes.
 *
 * Bump a version in the same change as the prompt text or the JSON shape it
 * asks for, and add the line to docs/writing-prompt-changelog.md. Every stored
 * assessment and analysis records the version that produced it, so a published
 * comment can always be traced back to the exact prompt.
 */

export const WRITING_PROMPT_VERSIONS = {
  feedback: "feedback-2026-11-20.2",
  comparison: "comparison-2026-11-16.3",
  analysis: "analysis-2026-11-16.1",
  note: "note-2026-11-16.1",
};

export const WRITING_SCHEMA_VERSION = "writing-schema-2026-11-17.1";
