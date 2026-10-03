# Review and Plan: Lesson Plan Export/Import and Academic Excellence Removal

Status: review and plan only. No code was changed for this document.

---

## Part 1. Lesson plan export / import: review

### 1.1 What exists now

| Piece | Where |
|---|---|
| Word (.docx) export, EN and AR, RTL | `services/lessonPlanDocxService.js`, `GET /api/lessons/:id/export.docx` |
| Bulk CSV import (preview, then commit, drafts only) | `services/lessonPlanImportService.js`, `/api/lessons/import/{template,preview,commit}` |
| Fill-the-form import inside Create Lesson Plan | `parseLessonPlanCsvForForm`, `POST /api/lessons/import/form` |
| Copy AI prompt button | `client/src/utils/lessonPlanCsvPrompt.js` |
| Import modal, template download, export buttons | `ImportLessonPlansModal.jsx`, `LessonPlanPage.jsx`, `LessonPlanFormModal.jsx`, `LessonPlanTable.jsx` |

### 1.2 Verification gaps (must close first)

These are unverified, not known broken.

1. No end-to-end test. No real HTTP call, no browser click-through.
2. The .docx has never been opened in Word, Google Docs or LibreOffice. RTL, table widths and Arabic fonts are unchecked.
3. The "imported but cannot see it" report was fixed by preferring the class from the selected academic year. The root cause was never confirmed against real data.
4. Only 7 unit tests exist. Nothing covers `parseLessonPlanCsvForForm`, the academic-year class preference, the controllers, or the client.

### 1.3 Likely problems and risks

| # | Area | Problem | Impact | Suggested fix |
|---|---|---|---|---|
| 1 | Class lookup | Same class name can exist in several academic years. Currently the active year wins silently. | Plans can attach to the wrong class and look "missing". | Add a warning when a class name is ambiguous. In the preview, show which academic year the class resolved to. |
| 2 | Visibility after import | The list only shows classes of the selected academic year. | Imported plans can disappear from the list. | After commit, show a message with the resolved class and year, plus a link or filter to the imported plans. |
| 3 | File encoding | `file.text()` assumes UTF-8. Excel on Windows often saves "CSV" as ANSI / Windows-1256. | Arabic text turns into garbled characters. | Detect non-UTF-8 and warn. Prefer "CSV UTF-8" in the instructions. Consider decoding fallback. |
| 4 | Date format | Excel converts dates to local formats. `05/10/2026` is read as day-first. | Wrong dates for US-style locales. | Make the preview show the parsed date next to each row. Recommend `YYYY-MM-DD` in the template. |
| 5 | Two import paths | Header "Import CSV" (bulk) and the in-form import behave differently. The bulk path reads class, subject and date from the file. The form path ignores them. | Confusing. | Decide on one primary flow. Keep bulk for admins and migration. Label each clearly. |
| 6 | Form import: standards | Standard codes are always added as manual standards, never linked to the saved standards. | Imported plans do not link to curriculum standards. | Return matched standard ids and merge them into `standardIds`. |
| 7 | Form import: overwrite | Filled fields replace what is already typed. | Possible loss of the teacher's text. | Confirm first if the form already has content, or only fill empty fields. |
| 8 | Form import: first row only | Extra rows are ignored with a toast. | Teachers may think everything imported. | Let the teacher choose a row when the file has several. |
| 9 | Header list duplicated | Column headers live in the server service and the client prompt file. | The prompt and the importer can drift apart. | Serve the header list and field rules from one server endpoint and build the prompt from it. |
| 10 | Prompt class/subject lists | The prompt uses the page's class and subject filter lists. | They may be limited by filters or the year. | Fetch the school's current-year classes and subjects directly. |
| 11 | Size limit | CSV is sent as JSON with a 900 KB client cap (server body limit 1 MB). | Large files fail. | Use multipart upload, or raise the limit for these routes only. |
| 12 | Localisation | Server validation messages are English only. Some client toasts are English fallbacks. | Arabic users see English errors. | Return error codes plus parameters and translate on the client. |
| 13 | Permissions | Department principals cannot import or create. | May surprise them. | Confirm the rule with the school. Document it. |
| 14 | Audit | No audit record for imports or exports. | No trace of who imported what. | Log import runs: user, counts, file name, time. |
| 15 | Docx content | No school logo, header or footer, page numbers. Long text may overflow table cells. | Looks less polished than the print view. | Add logo, footer with page numbers, and test with long procedure text. |
| 16 | Google Docs | Not built. | Users may expect it. | Later: `drive.file` scope with a consent flow. Today's .docx opens in Google Docs. |
| 17 | Plan document | `LESSON_PLAN_EXPORT_IMPORT_PLAN.md` does not match what was built. | Misleading. | Update it: own `/api/lessons/import/*` endpoints, client-side error report, template served from lesson routes, department principals excluded, in-form import. |

### 1.4 Improvement ideas (after fixes)

- Preview table of the parsed rows (not only counts and errors).
- Import history page (who, when, how many, errors).
- Update-existing mode (match on teacher, class, subject, date and title) instead of skip-duplicates.
- Excel (.xlsx) template with dropdowns for class and subject, which removes most name-mismatch errors.
- Export a whole week or class as one document, or export to PDF.
- Optional AI evaluation or admin notes in the export for admins.

### 1.5 Suggested order of work

1. Manual test pass: real browser, real data, open the .docx in Word and Google Docs. Log every defect.
2. Fix rows 1-4 above (class ambiguity, visibility message, encoding, date preview).
3. Fix rows 6-9 (standards linking, overwrite, row choice, single header source).
4. Add tests: form import parser, class-year preference, controller permission checks, client modal behaviour.
5. Polish: localisation, audit, docx header and footer.
6. Update the older plan document.

---

## Part 2. Academic Excellence (AE)

The previous removal section has been intentionally retired.

Use this review-and-improvement document instead:

- [ACADEMIC_EXCELLENCE_REVIEW_PLAN.md](/A:/business/gb/server/docs/ACADEMIC_EXCELLENCE_REVIEW_PLAN.md)
