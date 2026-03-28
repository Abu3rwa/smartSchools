import test from "node:test";
import assert from "node:assert/strict";

import standardsPracticeAIService from "../services/standardsPracticeAIService.js";

test("marks punctuation question correct when only wording is off-target", () => {
  const result = standardsPracticeAIService._applyTargetSkillRelevanceGuard({
    questionType: "short_answer",
    isCorrect: false,
    questionText:
      "Read the sentence below. Add the missing commas to correctly set off the tag question. This is an interesting book, isn't it",
    studentAnswer: "This is interesting book, isn't it?",
    correctAnswer: "This is an interesting book, isn't it?",
    standard: {
      code: "ELA.5.L.2",
      name: "Punctuation and sentence structure",
      description: "Use commas correctly in sentences and tag questions.",
    },
  });

  assert.equal(result.guardApplied, true);
  assert.equal(result.isCorrect, true);
  assert.match(
    result.feedbackPartsPatch?.correctionOrConfirmation || "",
    /marked correct/i,
  );
  assert.match(result.feedbackPartsPatch?.reviewTag || "", /punctuation/i);
});

test("marks grammar question correct when only spelling is off-target", () => {
  const result = standardsPracticeAIService._applyTargetSkillRelevanceGuard({
    questionType: "short_answer",
    isCorrect: false,
    questionText: "Rewrite the sentence using the correct past-tense verb.",
    studentAnswer: "She walkd to school yesterday.",
    correctAnswer: "She walked to school yesterday.",
    standard: {
      code: "ELA.5.L.1",
      name: "Grammar and verb tense",
      description: "Use correct verb tense in sentences.",
    },
  });

  assert.equal(result.guardApplied, true);
  assert.equal(result.isCorrect, true);
  assert.match(
    result.feedbackPartsPatch?.explanation || "",
    /outside the skill being graded/i,
  );
  assert.match(result.feedbackPartsPatch?.reviewTag || "", /grammar/i);
});

test("keeps spelling question incorrect when spelling is the target skill", () => {
  const result = standardsPracticeAIService._applyTargetSkillRelevanceGuard({
    questionType: "short_answer",
    isCorrect: false,
    questionText:
      "Correct the spelling in the sentence: She walkd to school yesterday.",
    studentAnswer: "She walkd to school yesterday.",
    correctAnswer: "She walked to school yesterday.",
    standard: {
      code: "ELA.5.L.2d",
      name: "Spelling",
      description: "Spell grade-appropriate words correctly.",
    },
  });

  assert.equal(result.guardApplied, false);
  assert.equal(result.isCorrect, false);
});

test("does not override when punctuation is the actual target mismatch", () => {
  const result = standardsPracticeAIService._applyTargetSkillRelevanceGuard({
    questionType: "short_answer",
    isCorrect: false,
    questionText:
      "Read the sentence below. Add the missing commas to correctly set off the tag question. This is an interesting book isn't it",
    studentAnswer: "This is an interesting book isn't it?",
    correctAnswer: "This is an interesting book, isn't it?",
    standard: {
      code: "ELA.5.L.2",
      name: "Punctuation and sentence structure",
      description: "Use commas correctly in sentences and tag questions.",
    },
  });

  assert.equal(result.guardApplied, false);
  assert.equal(result.isCorrect, false);
});
