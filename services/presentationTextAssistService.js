import { connectAiWithUsage } from "../utils/aiClientWithUsage.js";

const ACTION_PROMPTS = {
  improve: "Improve clarity, flow, and professionalism while preserving meaning.",
  simplify: "Simplify language for students while preserving key meaning and educational intent.",
  grammar: "Fix grammar, punctuation, spelling, and awkward phrasing while preserving original meaning.",
};

export async function assistSlideText({
  action,
  selectedText,
  customPrompt,
  slideContext,
  schoolId,
  userId,
  modelName,
}) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  const text = String(selectedText || "").trim();

  if (!text) {
    throw Object.assign(new Error("selectedText is required"), { status: 400 });
  }

  const actionInstruction =
    normalizedAction === "custom"
      ? String(customPrompt || "").trim()
      : ACTION_PROMPTS[normalizedAction];

  if (!actionInstruction) {
    throw Object.assign(new Error("Invalid text assist action"), { status: 400 });
  }

  const prompt = `You are an expert slide-writing assistant.

TASK:
${actionInstruction}

SLIDE CONTEXT:
Title: ${slideContext?.title || ""}
Layout: ${slideContext?.layout || ""}
Speaker Notes: ${slideContext?.speakerNotes || ""}

INPUT TEXT:
"""
${text}
"""

RULES:
- Keep output concise and presentation-ready.
- Preserve factual meaning unless the instruction explicitly requests changes.
- Return plain text only (no markdown, no code fences, no labels).

OUTPUT:
Return only the transformed text.`;

  const response = await connectAiWithUsage(
    prompt,
    { modelName },
    {
      feature: "presentation_text_assist",
      schoolId,
      userId,
      entityType: "Presentation",
      entityId: slideContext?.presentationId,
      metadata: { action: normalizedAction },
    }
  );

  return {
    assistedText: String(response.text || "").trim(),
    tokenUsage: {
      input: response.inputtokenCount || 0,
      output: response.outputtokenCount || 0,
      total: response.totalTokenCount || 0,
    },
  };
}
