import assert from "node:assert/strict";
import test from "node:test";

import ReadingFluencyAttempt from "../models/ReadingFluencyAttempt.js";
import {
  retentionDays,
  runReadingTranscriptPurgeJob
} from "../jobs/readingTranscriptPurgeJob.js";

test("the retention window defaults to ninety days", () => {
  assert.equal(retentionDays({}), 90);
  assert.equal(retentionDays({ READING_TRANSCRIPT_RETENTION_DAYS: "30" }), 30);
  assert.equal(retentionDays({ READING_TRANSCRIPT_RETENTION_DAYS: "nonsense" }), 90);
});

test("zero days turns the purge off", async (t) => {
  let writes = 0;
  t.mock.method(ReadingFluencyAttempt, "updateMany", async () => {
    writes += 1;
    return { modifiedCount: 1 };
  });

  const result = await runReadingTranscriptPurgeJob({
    env: { READING_TRANSCRIPT_RETENTION_DAYS: "0" }
  });

  assert.deepEqual(result, { purged: 0, disabled: true });
  assert.equal(writes, 0);
});

test("only attempts older than the window lose their spoken words", async (t) => {
  const now = new Date("2026-11-02T00:00:00Z");
  let captured = null;
  t.mock.method(ReadingFluencyAttempt, "updateMany", async (filter, update) => {
    captured = { filter, update };
    return { modifiedCount: 3 };
  });

  const result = await runReadingTranscriptPurgeJob({ env: {}, now });

  assert.equal(result.purged, 3);
  assert.equal(captured.filter.transcriptPurgedAt, null);
  assert.deepEqual(captured.filter.createdAt, {
    $lt: new Date("2026-08-04T00:00:00Z")
  });
  assert.deepEqual(captured.update.$unset, { transcript: "", issues: "" });
  assert.deepEqual(captured.update.$set, { transcriptPurgedAt: now });
});
