import test from "node:test";
import assert from "node:assert/strict";

import {
  computeDraftMetrics,
  countWords,
  metricsPromptBlock,
  metricsSummaryForStorage,
  readabilityOf,
  scrubCountClaimsDeep,
  splitSentences,
  withinOneEdit,
} from "../services/writingDraftMetrics.js";

const draft = {
  number: 1,
  sections: [
    {
      key: "body",
      index: 0,
      label: "Body",
      text: "I think that uniforms help. I think that uniforms save time. I think that uniforms are fair. However, they cost money.",
    },
    {
      key: "ending",
      index: 0,
      label: "Ending",
      text: "For example, families buy one set. On the other hand, children grow.",
    },
  ],
};

test("words, sentences and the longest sentence come from the text", () => {
  const metrics = computeDraftMetrics({ draft });
  assert.equal(metrics.totalWords, 33);
  assert.equal(metrics.sentenceCount, 6);
  assert.equal(metrics.paragraphCount, 2);
  assert.equal(metrics.averageSentenceWords, 5.5);
  assert.equal(metrics.longestSentence.words, 6);
  assert.equal(metrics.longestSentence.key, "body");
  assert.equal(metrics.sections[0].words, 21);
  assert.equal(metrics.sections[1].sentences, 2);
  assert.equal(metrics.readingMinutes, 0.2);
});

test("a repeated phrase is reported with its count", () => {
  const { repeatedPhrases } = computeDraftMetrics({ draft });
  assert.deepEqual(repeatedPhrases[0], { phrase: "i think that", count: 3 });
});

test("counterpoint markers, including multi-word ones, are counted", () => {
  const { counterpoint } = computeDraftMetrics({ draft });
  const byMarker = Object.fromEntries(counterpoint.map((row) => [row.marker, row.count]));
  assert.equal(byMarker.however, 1);
  assert.equal(byMarker["for example"], 1);
  assert.equal(byMarker["on the other hand"], 1);
});

test("target words say what was used and what was nearly spelled right", () => {
  const metrics = computeDraftMetrics({
    draft,
    wordUseEvidence: {
      spelling: [{ word: "because", used: false, nearMisses: ["becuase"] }],
      vocabulary: [{ word: "uniform", used: true, nearMisses: [] }],
    },
    spellingCandidates: [{ word: "photosynthesis" }, { word: "families" }],
  });
  assert.equal(metrics.targetWords.usedCount, 2);
  assert.equal(metrics.targetWords.unusedCount, 2);
  assert.deepEqual(metrics.targetWords.nearMisses, [
    { word: "because", found: "becuase" },
  ]);
  assert.equal(computeDraftMetrics({ draft }).targetWords, null);
});

test("an empty draft produces zeros, not guesses", () => {
  const metrics = computeDraftMetrics({ draft: { sections: [] } });
  assert.equal(metrics.totalWords, 0);
  assert.equal(metrics.sentenceCount, 0);
  assert.equal(metrics.longestSentence, null);
  assert.equal(metrics.readingMinutes, 0);
  assert.equal(metricsPromptBlock(metrics), "");
});

test("two calls on the same text are identical", () => {
  assert.deepEqual(computeDraftMetrics({ draft }), computeDraftMetrics({ draft }));
});

test("word and sentence helpers ignore punctuation and blank gaps", () => {
  assert.equal(countWords("Hello, world! It's fine."), 4);
  assert.deepEqual(splitSentences("One.  Two!  Three? "), ["One.", "Two!", "Three?"]);
  assert.equal(withinOneEdit("photosyntesis", "photosynthesis"), true);
  assert.equal(withinOneEdit("because", "becuse"), true);
  assert.equal(withinOneEdit("because", "before"), false);
});

test("a reply that states a wrong count is corrected, its quotes are left alone", () => {
  const metrics = computeDraftMetrics({ draft });
  const reply = {
    overall: { summary: "Your 12 words are a good start. You wrote 9 sentences." },
    sections: [
      {
        strengths: ["Only 10 words, but clear."],
        evidence: "12 words about uniforms",
      },
    ],
    nested: [{ improvements: ["30 paragraphs is too many."] }],
  };
  const fixed = scrubCountClaimsDeep(reply, metrics);
  assert.equal(
    fixed.overall.summary,
    `Your ${metrics.totalWords} words are a good start. You wrote ${metrics.sentenceCount} sentences.`,
  );
  assert.equal(fixed.sections[0].strengths[0], `Only ${metrics.totalWords} words, but clear.`);
  assert.equal(fixed.sections[0].evidence, "12 words about uniforms");
  assert.equal(fixed.nested[0].improvements[0], `${metrics.paragraphCount} paragraphs is too many.`);
});

test("a claim that already matches is not rewritten", () => {
  const metrics = computeDraftMetrics({ draft });
  const reply = { summary: `This is ${metrics.totalWords} words and ${metrics.sentenceCount} sentences.` };
  assert.deepEqual(scrubCountClaimsDeep(reply, metrics), reply);
});

test("the prompt block quotes the facts and forbids other counts", () => {
  const block = metricsPromptBlock(computeDraftMetrics({ draft }));
  assert.match(block, /Total words: 33/);
  assert.match(block, /Sentences: 6/);
  assert.match(block, /never state a different count/);
});

test("the stored summary keeps numbers and drops the text", () => {
  const stored = metricsSummaryForStorage(computeDraftMetrics({ draft }));
  assert.equal(stored.totalWords, 33);
  assert.deepEqual(stored.repeatedPhrases, ["i think that", "think that uniforms"]);
  assert.equal(JSON.stringify(stored).includes("cost money"), false);
  assert.equal("sections" in stored, false);
});

test("readability is a gauge on the same word and sentence split", () => {
  const easy = readabilityOf("The cat sat. The dog ran. We had fun.");
  const hard = readabilityOf(
    "Notwithstanding the aforementioned considerations, institutional frameworks necessitate comprehensive re-evaluation.",
  );
  assert.equal(easy.words, 9);
  assert.equal(easy.sentences, 3);
  assert.ok(easy.fleschGrade < hard.fleschGrade);
  assert.ok(easy.fleschEase > hard.fleschEase);
  assert.deepEqual(readabilityOf(""), {
    words: 0,
    sentences: 0,
    fleschEase: 0,
    fleschGrade: 0,
  });
});
