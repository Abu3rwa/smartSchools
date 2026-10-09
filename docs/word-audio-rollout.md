# Word audio: staging test and rollback

The feature is additive and OFF by default. Nothing changes for students until a grade is switched on.

## What was added
- Collection `wordAudio` (one document per normalized word, shared by every grade) and `spellingaudiosettings` (per school and grade, `enabled`).
- Admin endpoints (role `admin`), under `/api/spelling/word-audio`:
  - `POST /import` (multipart `file`, `dryRun` defaults to **true**; send `dryRun=false` to write)
  - `GET /coverage`, `GET /settings`, `PUT /settings/:grade` with `{ "enabled": true }`
- `GET /api/spelling/sessions/:id/current-item` gains an optional `item.audio` **only** when the grade flag is ON and the word has audio.
- Admin page: `/portal/spelling/audio` (link on the Spelling page, admins only). Sample file: `client/public/spelling_word_audio_sample.csv`.
- Student page: voice/example panel appears only when `item.audio` exists. The Dictionary API is not called for those words. Default voice and every failure fall back to the original playback.

## CSV format
Required `word`; optional columns in any order: `Longman US, Longman UK, Oxford US, Oxford UK, Webster US, status, first week, definition`, and per-dictionary examples `Longman example 1..n`, `Oxford example 1..n`, `Webster example 1..n` (several URLs in one cell can be separated by `|`).
Only https URLs on `www.ldoceonline.com`, `www.oxfordlearnersdictionaries.com`, `media.merriam-webster.com` are accepted. Empty cells never erase data; example URLs are only added.

## Test on staging / a copy of the database first
1. Restore a copy of production into a separate database (`mongodump` then `mongorestore --nsFrom/--nsTo`, or an Atlas snapshot restore) and point a staging server's `MONGODB_URI` at it. Do not run the first import against production.
2. Log in as admin, open `/portal/spelling/audio`, upload a grade CSV, press **Preview (dry run)** and read the report (nothing is saved).
3. Press **Import**. Run it again: the report should show 0 new / 0 updated words (idempotent).
4. Check **Coverage**, switch on **one** grade, and log in as a student in that grade: the Voice panel shows per-dictionary US/UK buttons and examples. Switch the grade off: the screen is identical to before.
5. Try a bad URL in the CSV (rejected in the report) and block a host in the browser (student hears the default voice and sees a friendly note).

## Roll back
- Quickest: switch the grade(s) off on the audio admin page (or `PUT /settings/:grade {"enabled":false}`). Students immediately get the old behaviour.
- Remove the data: `db.wordAudio.drop()` and `db.spellingaudiosettings.drop()`. Only these two new collections are touched; words, progress and scores are never written by this feature.
- Code: each step is a separate commit and can be reverted on its own with `git revert`.