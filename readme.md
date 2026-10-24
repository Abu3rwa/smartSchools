# GradeBook Pro

Student Grade Management System – Backend API and React frontend for schools. Supports grades, attendance, timetables, lesson plans, newsletters, reports, and parent notifications.

## Prerequisites

- **Node.js** 18+
- **MongoDB** 6+
- **npm** or **yarn**

## Quick Start

### 1. Clone and install

```bash
git clone <repository-url>
cd <project-directory>
npm install
```

### 2. Environment setup

```bash
cp .env.example .env
```

Edit `.env` and set the required variables (see [Environment variables](#environment-variables) below).

### 3. Run the server

```bash
npm run dev
```

The API runs at `http://localhost:5000`.

### 4. Run the client (development)

```bash
cd client
npm install
npm run dev
```

The React app runs at `http://localhost:5173`.

### 5. Seed data (optional)

```bash
npm run seed
```

## Environment Variables

See [.env.example](.env.example) for the full list. Required variables:

| Variable | Description |
|---------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for JWT tokens |
| `GEMINI_API_KEY` | API key for Gemini AI features |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

Optional: `PORT`, `NODE_ENV`, `CLIENT_URL`, `JWT_EXPIRE`, `GOOGLE_REDIRECT_URI`, `GOOGLE_LOGIN_REDIRECT_URI`, `ALLOW_LOCAL_SERVICE_ACCOUNT` (local/dev only), and background job toggles (`RUN_NEWSLETTER_ISSUE_SCHEDULER`, `RUN_SUBSTITUTION_EXPIRY_JOB`, etc.).

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server (nodemon) |
| `npm run seed` | Seed database with sample data |
| `npm run test:reminder` | Run attendance reminder test script |
| `npm run test:newsletter` | Run newsletter utils test script |

## API Endpoints

- **Health:** `GET /api/health` – Liveness check
- **Readiness:** `GET /api/health/ready` – MongoDB connection check (for load balancers)
- **Auth:** `POST /api/auth/login`, `POST /api/auth/register`, etc.
- **Schools, Students, Classes, Grades, Attendance:** See API docs or route files.

## MAP Practice CSV Import

The existing MAP Test Prep feature has been upgraded in place to support a CSV-based student practice workflow without creating a second feature. The new flow lives under the existing `/api/map-test-prep` namespace and uses the existing route and teacher/student page entry points.

### CSV file rules

- One file per student is recommended.
- UTF-8 with or without BOM is supported.
- Header row is required.
- Standard RFC 4180 quoting is expected for commas, quotes, and embedded line breaks.
- Student IDs must match the enrolled student ID in the school.
- `question_type` values are `mcq`, `multi_select`, `short_text`, `matching`, `ordering`, `fill_in_blank`, and `numeric_response`.
- `correct_answer` for `mcq` is a single letter such as `B`.
- `correct_answer` for `multi_select` is a pipe-separated list such as `A|C`.
- `correct_answer` for `short_text` is a pipe-separated list of accepted answers.
- The four objective types leave `correct_answer` empty and carry their key in their own column, listed under Column reference.

### Type columns and their grammar

Separators are fixed: pairs use `|`, a term and its match use `::`, accepted variants use `~`, and order steps use `>`.

- `matching_pairs` for `matching`: `term::definition|term::definition`, at least two pairs. Each correct pair earns part of the point, and students see the terms in order with the definitions shuffled.
- `ordering_items` for `ordering`: the steps in their correct order, `first > second > third`, three to eight different steps. The authored order is the key, so item ids are hashed server-side and the list is shuffled per student. Each item in its right position earns part of the point.
- `blank_answers` for `fill_in_blank`: `b1::Nile~the Nile|b2::Mediterranean`, and the `stem` marks each blank as `{{b1}}`. Ids may be left out when the answers are listed in blank order. Case, punctuation and leading `a`/`an`/`the` are ignored, and each correct blank earns part of the point.
- `numeric_rule` for `numeric_response`: one of `exact::100`, `tolerance::100~5`, `relative::40~25` (within 25% of 40), or `range::90~110`, plus any of `|unit::cm`, `|decimals::2`, `|fractions::on`, `|percent::on`. A bare number such as `100` is read as exact. Numbers are compared as exact rationals, never floating-point equality, and a unit is required when the rule authors one.
- `passage_source` for any row: where the passage came from, stored with the passage.

A `passage_id` names one passage for every row that uses it, and only one row has to carry the wording: a row that cites the id with empty `passage_text` reads the passage from another row in the same file, in either order, or from an earlier import of the same plan or assignment. One id with two different texts is reported as an error rather than guessed, and citing an id nothing ever carried is warned in the preview and blocks that row on import. Each attempt keeps an immutable copy of the passage it was served, so editing a passage never rewrites a finished attempt. The Standards assignment CSV import reads the same four type columns with the same grammar.

### Column reference

`student_id, plan_title, set_id, set_title, set_order, question_id, order, subject, strand, skill_code, skill_name, rit_band, passage_id, passage_title, passage_text, question_type, stem, option_a, option_b, option_c, option_d, correct_answer, explanation, distractor_note, points` plus the optional `matching_pairs, ordering_items, blank_answers, numeric_rule, passage_source`.

### Import flow

1. Upload one or more CSV files.
2. Preview file-by-file validation and student matching.
3. Confirm the import.
4. The app creates or updates plan, set, skill, and question records for the matched student.
5. Short-text answers remain in the teacher review queue unless accepted.
6. `matching`, `ordering`, and `fill_in_blank` award partial credit automatically; `numeric_response` is all or nothing against its rule; `multi_select` needs the exact set of correct options.
7. Student payloads never carry `correct_answer`, `explanation`, the pair map, the accepted answers, the numeric rule, or the authored order.

### Template files

- Template: `client/public/map_practice_template.csv`
- Example: `client/public/map_practice_example_student_1.csv`, one row per question type. Its short-answer row cites `P-1` by id only, so it shows a passage carried once and reused.
- The import panel's download buttons build both files from `client/src/pages/mapTestPrep/mapPracticeTemplate.js`, which is the source these samples mirror.
- The "Question types guide" popup next to those buttons explains every accepted type, the columns it reads, and its grammar with an example. Both the MAP practice and the Standards assignment import panels open the same popup from `client/src/components/assessment/QuestionTypeGuide.jsx`, whose rows come from `questionTypeGuideData.js`, so the guide, the sample files and the parsers are kept in step by `questionTypeGuideData.test.js`.

## Live Lesson CSV Import

The Live Lessons importer picks one of three CSV shapes from the header row, so a teacher's spreadsheet, an AI-generated lesson and a lesson export all import without a format switch. One row is one slide, and a `question` slide carries one question; non-question slides must leave every question column empty.

- Portable export: the file the lesson card's `Export CSV` writes. `format_version` must be the first cell and the columns must follow it in the order below. Version 2 carries every question kind and the levelled variants; a version 1 file (23 columns, options only) still imports, and a file whose `format_version` does not match the columns it uses is rejected rather than guessed.
- Standard rows: matched by header name in any order, so `lesson title`, `slide type`, `question prompt`, `question kind`, `options` or `option_a` to `option_d` all work.
- HTML rows: the fixed 17-column layout, one animated `html` slide per row, with `mcq` or `true_false` questions only. A lesson already generated in it still imports, but nothing in the app writes it any more: the `Copy AI prompt` text asks for the portable export layout instead, which carries designed HTML slides and every question kind.

### Question kinds and their columns

The kind cell accepts `mcq`, `tf`, `multi_select`, `matching`, `ordering`, `fill_in_blank`, `numeric` and `text`. `multiple_choice`, `true_false`, `true or false`, `yes_no`, `boolean`, `match`, `sequence`, `fill_in_the_blank`, `gap_fill`, `numeric_response`, `short_answer`, `sentence`, `paragraph` and `written` are read as the same kinds, and a standard row with options but no kind cell is `mcq`.

A kind column takes the shared practice grammar or the JSON an export writes, and a cell that is neither is reported against the column that held it:

- `matching_pairs` for `matching`: `term::definition|term::definition`, at least two pairs.
- `ordering_items` for `ordering`: `first > second > third`, three to eight different steps. The authored order is the key, and item ids are hashed server-side.
- `blank_answers` for `fill_in_blank`: `b1::simile|b2::like or as~like and as`, with each blank marked `{{b1}}` in `question_prompt`.
- `numeric_rule` for `numeric`: `exact::3`, `tolerance::100~5`, `relative::40~25` or `range::90~110`, plus any of `|unit::cm`, `|decimals::2`, `|fractions::on`, `|percent::on`. A bare number is read as exact.
- `correct_answer`: an option letter or the option's own wording for `mcq`, `true` or `false` for `tf`, letters joined by `|` for `multi_select`, and empty for every other kind.
- `guidance`, `criteria`, `min_words`, `max_words`: shown to the student answering a `text` question, which you grade while reviewing the session. No written answer grades automatically, in a live lesson or in practice.

The same cells are named `question_options_json`, `question_pairs_json`, `question_items_json`, `question_blanks_json`, `question_numeric_json`, `question_guidance`, `question_criteria`, `question_min_words` and `question_max_words` in a portable file. The portable column list is `format_version, lesson_id, lesson_title, lesson_description, subject, grade, language, assigned_class, assigned_subject, is_done, slide_order, slide_type, title, body, html, examples_json, image_url, question_kind, question_prompt, question_options_json, question_pairs_json, question_items_json, question_blanks_json, question_numeric_json, question_guidance, question_criteria, question_min_words, question_max_words, correct_answer, explanation, speaker_notes, levels_json`.

### Levelled questions on one slide

`levels_json` holds one entry per group, using the same keys as the question columns: `{"group":"Needs support","kind":"mcq","prompt":"Which sentence uses a simile?","options":[{"id":"a","text":"Her laugh was as bright as a bell."}],"correct_answer":"a"}`. Each entry is the question that group answers on that slide, so an exit ticket can be a choice question for one group and a paragraph for another. Groups are named, never given by id: the importer looks the name up in the class the lesson is imported into and rejects a name that class does not have, and an export writes the names back, so a lesson keeps its levels when it moves to another class or another year. The teacher editor no longer shows groups or levelled questions, so this column is the only way a lesson gains levels; the download sample leaves it out.

### Import flow

1. Upload the CSV and preview it; every error names the row and the column behind it.
2. Confirm the import. The app creates the lesson and its slides under the matched class and subject, and resolves each level to a group of that class.
3. Objective kinds are graded the moment the answer arrives, through the same engines MAP practice and Standards assignments use. A `text` answer stays in the session review until you mark it.
4. Student payloads and session replay never carry `correct_answer`, `explanation`, the option key, the pair map, the accepted answers, the numeric rule, or the authored order.

### Template files

- `client/src/pages/liveLessons/liveLessonCsvTemplate.js` exports two files: `LIVE_LESSON_SAMPLE_CSV`, a standard-format lesson with one row per question kind, is the `Sample CSV` download, and `LIVE_LESSON_AI_REFERENCE_CSV`, a portable-format reference with one row per slide type and per question kind, is the example `liveLessonAiPrompt.js` shows an external assistant. A CSV test asserts the download equals the service's own template cell for cell, and another parses the reference end to end, so neither sample can drift from the parser it is tested against.
- `services/liveLessonCsvService.js` exports `LIVE_LESSON_CSV_TEMPLATE`, a standard-format sample lesson with one row per question kind. The CSV tests parse it on every run, so the sample and the parser cannot drift.
- The import panel's `Question types guide` popup is the same `client/src/components/assessment/QuestionTypeGuide.jsx` the MAP practice and Standards panels open, with `flow="live"`, so the guide, the grammars and the kind vocabulary are kept in step by `questionTypeGuideData.test.js`.

## Project Structure

```
├── client/          # React (Vite) frontend
├── config/          # DB, env validation
├── controllers/     # API handlers
├── models/          # Mongoose models
├── routes/          # Express routes
├── services/        # Business logic
├── middleware/      # Auth, error handling, etc.
├── server.js        # Entry point
└── .env.example     # Environment template
```

## Documentation

- [Improvement roadmap](docs/IMPROVEMENTS.md)
- [Quick wins](docs/improvements/06-quick-wins.md)
- [UI/UX review](client/docs/UI_UX_IMPROVEMENT_REVIEW.md)
- [Tenant filter policy](docs/TENANT_FILTER_POLICY.md)

## License

ISC
