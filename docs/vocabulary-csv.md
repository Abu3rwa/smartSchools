# Vocabulary CSV guide

All files are UTF-8 CSV with a header row. Re-importing updates existing records and never creates duplicates. Use **Dry run** first to see row errors without saving.

## Combined (recommended)

One row per word. Required: `list_id`, `word`, `part_of_speech`.

Core columns: `list_id, list_title, lesson_title, word, part_of_speech, form, base_word, example_sentence, student_friendly_meaning, arabic_meaning, notes`.

Per dictionary (`oxford_`, `longman_`, `webster_`): `definition, url, audio_us, audio_uk, example_audio`.

- `form` is one of `plural, verb_s, past, ing, comparative, superlative, contraction`. With `base_word`, students see a notice before spelling, because the recording says the base word.
- `arabic_meaning` is optional and shown only when filled.

## Advanced: lists, words, word_sources

The same data split into three files (import lists, then words, then sources). Use the Import tab template download for exact headers.

## Multiple-choice questions (`mcq`)

Headers: `question_id, scope, word, question, option_a, option_b, option_c, option_d, correct, explanation`.

- `question_id` is unique; re-importing the same id updates the question.
- `scope` is one list id (`S1-L3`), several separated by `;` (`S1-L3;S1-L4`), or `ALL`.
- `word` is optional. When given it must be in one of the scope's lists, and answers then count towards that word's mastery.
- At least two options (A and B); options must differ. `correct` is `A`-`D` and must point to a filled option.
- Students see the options in a shuffled order.

## Matching questions (`matching`)

Columns: `set_id, scope, instruction` plus `left_1, right_1` ... `left_6, right_6`. Use 2 to 6 pairs; leave unused pairs blank. `scope` works like MCQ (a list id, ids separated by `;`, or `ALL`). Left and right items must be unique within a set. Students pick the partner for each left item and are marked correct only when every pair is right.

## Practice rules

- Spelling is strict. If a student types the base word instead of the form, they see "Almost! This word needs an ending." unless the list has **Accept base word** on.
- A word is mastered after the configured number of correct answers in a row; it needs review after the configured days of inactivity.
- "Use it" sentences wait for teacher review and never change mastery.
- Reports export to CSV and are limited to the teacher's own classes.
