# Spelling pronunciation: data migration and cleanup plan

Status: proposal only. Nothing here has been run against any database, and no
production data was read while preparing it.

## What changed in code

- Spelling pronunciation is now AI-only. Every spelling code path that read,
  edited, imported, exported, or fell back to dictionary pronunciation URLs
  (`longmanUS/UK`, `oxfordUS/UK`, `googleUS/UK` on `wordAudio`) was removed.
- AI clips gained an admin remove/regenerate lifecycle. A removed clip is a
  tombstone: the `spellingPronunciations` document keeps its unique `key` with
  `removedAt`/`removedBy` set, so bulk generation skips it and the public audio
  route returns 404. Regeneration synthesizes first, then replaces the document
  with new bytes and a new `publicId` (new URL, so immutable browser caches of
  the old URL are never reused).

## Stored data assessment

1. `wordAudio` pronunciation URL fields — **keep, do not delete.**
   The Reading Assistant (`server/services/readingAssistantService.js`,
   `attachVocabularyAudio`) still plays these same shared URLs for vocabulary
   audio. Deleting or unsetting them would break a non-spelling feature, which
   the change request explicitly forbids. Spelling simply no longer reads them.
   No migration is required: documents without the fields and documents with
   them both behave identically in spelling now.

2. `spellingPronunciations` existing clips — **keep as-is.**
   Existing documents have no `removedAt` field; Mongoose defaults it to `null`
   on read, and every query filters `removedAt: null`, which matches missing
   fields in MongoDB. No backfill is needed.

3. `spellingAudioSettings` per-grade switches — **keep.**
   They now gate example recordings only (pronunciation no longer depends on
   them). Existing values keep their meaning for examples.

4. Session attempt snapshots — historical attempts may carry old audio payloads
   (dictionary URLs or superseded clip URLs). They are history records and are
   left untouched. The student client only plays AI clips from these payloads;
   a superseded or removed clip URL fails and falls back to the browser voice.

## Optional future cleanup (needs explicit approval)

If the Reading Assistant later stops using dictionary pronunciation URLs, the
stored fields can be removed with a dry-run-first script:

```
db.wordAudio.updateMany(
  { $or: [
    { longmanUS: { $exists: true } }, { longmanUK: { $exists: true } },
    { oxfordUS: { $exists: true } }, { oxfordUK: { $exists: true } },
    { googleUS: { $exists: true } }, { googleUK: { $exists: true } }
  ] },
  { $unset: { longmanUS: 1, longmanUK: 1, oxfordUS: 1, oxfordUK: 1, googleUS: 1, googleUK: 1 } }
)
```

Until then, no destructive step is safe or necessary.