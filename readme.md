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
