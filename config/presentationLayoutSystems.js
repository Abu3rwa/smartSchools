export const PRESENTATION_LAYOUT_SYSTEMS = [
  {
    id: "lesson-classic",
    name: "Lesson Classic",
    description: "Balanced instructional flow with opener, guided explanation, practice, and recap.",
    promptGuidance:
      "Favor clear instructional sequencing, strong hierarchy, and structured teaching moments for whole-class lessons.",
    slideStructure: [
      { layout: "title", purpose: "opener", promptHint: "Title slide with lesson topic and context" },
      { layout: "title-body", purpose: "objective", promptHint: "2-4 student-friendly learning objectives" },
      { layout: "bullets", purpose: "warmup", promptHint: "Short warm-up or prior knowledge activation" },
      { layout: "two-column", purpose: "instruction", promptHint: "Explain concept and pair it with worked examples" },
      { layout: "title-body", purpose: "practice", promptHint: "Guided practice with clear steps" },
      { layout: "comparison", purpose: "misconceptions", promptHint: "Correct approach vs common mistakes" },
      { layout: "title-body", purpose: "summary", promptHint: "Recap the key points and exit task" },
    ],
  },
  {
    id: "concept-compare",
    name: "Concept Compare",
    description: "Built for contrasting ideas, strategies, examples, and misconceptions.",
    promptGuidance:
      "Use side-by-side reasoning, comparisons, and concise contrast statements. Prefer comparison and two-column slides when possible.",
    slideStructure: [
      { layout: "title", purpose: "opener", promptHint: "Topic framing and comparison goal" },
      { layout: "comparison", purpose: "core-compare", promptHint: "Compare two concepts, methods, or examples" },
      { layout: "two-column", purpose: "examples", promptHint: "Show parallel examples or worked solutions" },
      { layout: "bullets", purpose: "takeaways", promptHint: "List the most important comparison takeaways" },
      { layout: "title-body", purpose: "assessment", promptHint: "Short prompts that ask students to distinguish the concepts" },
    ],
  },
  {
    id: "review-quick",
    name: "Review Quick",
    description: "Fast recap deck optimized for reinforcement and short checks for understanding.",
    promptGuidance:
      "Keep slide content compact, high-signal, and review-oriented. Favor bullets and quick prompts over long explanations.",
    slideStructure: [
      { layout: "title", purpose: "opener", promptHint: "Review topic and what students should remember" },
      { layout: "bullets", purpose: "recap", promptHint: "Summarize key concepts in compact bullets" },
      { layout: "comparison", purpose: "mistakes", promptHint: "Common mistakes versus correct thinking" },
      { layout: "title-body", purpose: "questions", promptHint: "Add 3-4 quick review questions or retrieval prompts" },
      { layout: "title", purpose: "closer", promptHint: "End with final takeaway and next action" },
    ],
  },
  {
    id: "storytelling",
    name: "Storytelling",
    description: "Narrative flow with stronger emphasis on visual pacing and sequence.",
    promptGuidance:
      "Build a beginning-middle-end arc, use image-led slides where helpful, and keep each slide focused on one beat in the story.",
    slideStructure: [
      { layout: "title", purpose: "opener", promptHint: "Strong narrative title and hook" },
      { layout: "image-full", purpose: "scene", promptHint: "Use a visual anchor and concise supporting text" },
      { layout: "title-body", purpose: "development", promptHint: "Explain the next story beat or concept" },
      { layout: "image-right", purpose: "example", promptHint: "Pair explanation with an illustrative image or scenario" },
      { layout: "quote", purpose: "reflection", promptHint: "Memorable insight, quote, or reflection prompt" },
    ],
  },
];

export const PRESENTATION_LAYOUT_SYSTEM_MAP = Object.fromEntries(
  PRESENTATION_LAYOUT_SYSTEMS.map((layoutSystem) => [layoutSystem.id, layoutSystem])
);

export const DEFAULT_PRESENTATION_LAYOUT_SYSTEM = PRESENTATION_LAYOUT_SYSTEMS[0].id;