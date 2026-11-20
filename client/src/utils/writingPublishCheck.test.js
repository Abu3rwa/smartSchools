import assert from "node:assert/strict";
import test from "node:test";
import {
  draftParagraphs,
  evidenceQuoteFound,
  publishBlockers,
  unfilledTokens,
} from "./writingPublishCheck.js";

test("the student slot is allowed, any other token would reach the child raw", () => {
  assert.deepEqual(unfilledTokens({ summary: "Dear {{student}}," }), []);
  assert.deepEqual(unfilledTokens({ summary: "Dear {{ name }}," }), [
    "{{ name }}",
  ]);
  assert.deepEqual(
    unfilledTokens({
      a: "{{child}}",
      b: ["{{student}}", "{{title}}"],
    }),
    ["{{child}}", "{{title}}"],
  );
  // Internal copies of the AI reply are never rendered.
  assert.deepEqual(
    unfilledTokens({ aiOriginal: { summary: "{{kept}}" }, summary: "fine" }),
    [],
  );
});

test("a quote is anchored only when the draft really holds it", () => {
  const paragraphs = [
    "Schools should wear uniforms.",
    "They make mornings easier.",
  ];
  assert.equal(evidenceQuoteFound(paragraphs, "make mornings easier"), true);
  assert.equal(evidenceQuoteFound(paragraphs, "The bell rings loudly"), false);
  // Smart quotes and case fold on both sides.
  assert.equal(evidenceQuoteFound(["It’s fair for everyone."], "it's fair"), true);
  // A short quote is a general note, not a claim about one line.
  assert.equal(evidenceQuoteFound(paragraphs, "ok"), true);
  // A slightly reworded quote still finds its paragraph when nearly all of its
  // content words are there.
  assert.equal(
    evidenceQuoteFound(
      ["They make the mornings much easier for everyone."],
      "they make mornings easier",
    ),
    true,
  );
});

test("a missing quote blocks the publish and names its part", () => {
  const draft = {
    sections: [{ key: "body", index: 1, text: "Uniforms save time." }],
  };
  const blockers = publishBlockers({
    assessment: {
      kind: "feedback",
      sections: [
        { key: "intro", index: 0, label: "Opening", evidence: "Schools wear uniforms." },
        { key: "body", index: 1, label: "Body", evidence: "save time" },
      ],
    },
    draft,
  });
  assert.deepEqual(blockers, [{ kind: "anchors", items: ["Opening"] }]);
});

test("an unfilled token blocks the publish; the student slot does not", () => {
  const blockers = publishBlockers({
    assessment: {
      kind: "feedback",
      overall: { summary: "Dear {{name}}, your opening is clear." },
    },
    draft: { sections: [] },
  });
  assert.deepEqual(blockers, [{ kind: "tokens", items: ["{{name}}"] }]);

  assert.deepEqual(
    publishBlockers({
      assessment: {
        kind: "feedback",
        overall: { summary: "Dear {{student}}, your opening is clear." },
      },
      draft: { sections: [] },
    }),
    [],
  );
});

test("a comparison round has no section quotes to anchor", () => {
  const draft = { sections: [{ key: "body", index: 0, text: "Same words." }] };
  assert.deepEqual(
    publishBlockers({
      assessment: {
        kind: "comparison",
        sections: [
          { key: "body", index: 0, label: "Body", evidence: "Text that moved" },
        ],
      },
      draft,
    }),
    [],
  );
});

test("paragraph text is all a quote can anchor to", () => {
  assert.deepEqual(
    draftParagraphs({ sections: [{ text: "One" }, { text: null }] }),
    ["One", ""],
  );
  assert.deepEqual(draftParagraphs(null), []);
});
