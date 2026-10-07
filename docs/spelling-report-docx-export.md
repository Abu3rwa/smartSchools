# Student Spelling Report Export Plan

> **Goal:** let teachers produce a clear, complete, print-ready report from a student's *Spelling details* page. PDF is the primary format; an editable Word document is an optional follow-up.

> **Status:** The A4 browser print report and editable DOCX export are implemented. Both use the same school-scoped spelling details data. DOCX export is available from the spelling details page and the spelling student roster, with navy table headers, pale alternating rows and clear pending/resolved status colours.

## Recommendation and scope

Use a dedicated **print view** and the browser's print dialog for the first release. The teacher chooses **Save as PDF** in that dialog. This approach:

- Produces a print-ready A4 report without adding a PDF dependency.
- Reuses the existing Recharts grade-performance chart.
- Avoids trying to make an interactive screen layout double as a report.
- Leaves paper size, printer and destination under the teacher's control.

Do not describe this as a silent one-click PDF download: browsers require the user to confirm printing or saving. If direct PDF download later becomes a firm requirement, evaluate server-side PDF generation separately.

Add **Export Word (.docx)** only if teachers need an editable copy. The server already declares `docx` (`^9.7.1`) in `package.json`. The Word file should contain the same report data and sections, but it does not need to reproduce the PDF's exact layout.

| Requirement | PDF / print view | Word |
|---|---|---|
| Best choice for reliable printing | Yes | Acceptable |
| Preserves the existing chart easily | Yes | Requires extra chart work or a data table |
| Teacher can edit the report | No | Yes |
| First-release priority | **Primary** | Optional Phase 2 |

## Report contents and data contract

Use the existing `studentDetails` response produced by `buildStudentSpellingDetails` in `services/spellingDetailsService.js`. Do not recalculate report totals separately in the UI or export code.

| Section | Data | Presentation |
|---|---|---|
| Header | `student.firstName`, `lastName`, `studentId` | Student name and ID |
| Current spelling level | `student.currentGrade`, `currentWeek` | For example, `KG · Week 30`; show a localized unavailable value if absent |
| Retest alert | `summary.pendingRetests`, `overdueRetests` | Clearly distinguish pending and overdue counts |
| Original tests | `summary.originalAttempts`, `originalCorrect`, `originalIncorrect`, `originalAccuracy` | Four summary metrics |
| Retests | `summary.retestAttempts`, `retestCorrect`, `retestIncorrect`, `retestRecoveryRate` | Four metrics; recovery displays `—` when there are no retest attempts |
| Words missed | `summary.uniqueWordsEverMissed` | Use the API's exact property name |
| Performance by grade | `byGrade[]` | Chart and accessible data table, always ordered KG, G1, G2, G3, G4, G5 |
| Missed words | `missedWords[]` | Word, grade, original incorrect count, retest attempts, retest correct, and Pending/Resolved status |
| Report metadata | Current date/time and school name if available | Generated date; don't invent school metadata if it isn't in the response |

The current service returns only grades with recorded attempts. Keep that behavior: don't imply that a missing grade has zero performance unless the product explicitly decides to show every grade.

Sort missed words with pending first, then by `originalIncorrectCount` descending, matching the details page. The details page also offers month and original-miss session filters, defaulted to **All months** and **All sessions**. These filters scope which words and original incorrect counts are shown; retest progress and pending status remain the current totals for each word. Keep status as visible text as well as colour.

## Print design

### Page and visual hierarchy

- A4 portrait, white background, 15 mm margins.
- A restrained navy (`#1F3A5F`) title and section headings, pale-blue (`#EAF1F8`) table headers, light-grey (`#D9DEE4`) borders.
- System font stack with Arabic-capable fallback. Body 10–11 pt, report title about 20 pt, section headings 13–15 pt.
- Put school name/logo in the header only if available; place report title and generated date opposite it.
- Show the student name prominently, then student ID, current grade/week and retest alert.
- Group metric cards under **Original tests** and **Retests**. Reflow to two columns or one column for narrow print widths.
- Accuracy/recovery colours may be used as cues, but labels and values must remain understandable in grayscale.

### Performance and missed-word sections

- Render the grade chart at a print-friendly fixed aspect ratio and cap its width to the printable page area.
- Keep the underlying grade-performance table in the report even when the chart renders; include grade, original correct and original incorrect counts. This makes exact values available in grayscale and to assistive technology.
- Keep the chart and its heading together where possible. Do not force the entire missed-word list onto one page.
- Use a semantic table for missed words, with a repeating header row where supported and `break-inside: avoid` on individual rows where supported.
- Avoid relying on background fills to communicate meaning. Pending/Resolved and correct/incorrect values must include text or numbers.
- Do not promise page numbering unless the selected print engine supports it reliably. A footer may show the app name and generation date.

### Arabic and mixed-direction content

- Set the report direction from the active locale (`rtl` for Arabic, `ltr` otherwise).
- Use an Arabic-capable font and verify mixed Arabic/Latin names, student IDs, grade labels and numbers in print preview.
- Localize report labels, empty states, statuses, dates and button text using the existing spelling translations.

## Phase 1 implementation: PDF / print view

### Frontend

1. Add an **Export PDF / Print** action next to the existing student controls in `StudentSpellingDetailsPage.jsx`.
2. Create a dedicated `StudentSpellingPrintReport` component. Pass it the loaded details object and current locale; keep report calculations and sorting aligned with the on-screen details page.
3. Render the print report in an isolated route/view or an isolated print-only region. Do not print the interactive details page: the student switcher, navigation, scroll containers, buttons and screen-only cards must not leak into the report.
4. Add print CSS scoped to the report: `@page` A4 size/margins, print visibility, typography, table layout, page-break rules, and `print-color-adjust: exact` as a best effort only.
5. Ensure the report data and chart have rendered before invoking `window.print()`. If data is loading, disable the action and show a clear loading state; on fetch failure, show the existing error feedback rather than printing stale or empty student data.
6. Add translated labels for the action, title, generated date, empty values and errors in `en/spelling.json` and `ar/spelling.json`.
7. Keep the existing authenticated spelling-details request as the source of data. It already scopes the student lookup to the current school; do not add a public export URL or send report data to a third party.

### User experience

- Button label: **Export PDF / Print** (or localized equivalent), with a print/download icon.
- Clicking opens the browser print dialog. The teacher may print or select **Save as PDF**.
- After the dialog closes, leave the teacher on the same student's details page.
- Make the print action available only when the displayed details belong to the route's current student ID.

## Phase 2 implementation: optional DOCX

1. Add `services/spellingReportDocxService.js` with `buildStudentSpellingReport(details, { schoolName, locale })`, returning a document buffer using the existing `docx` package.
2. Add an export handler to `controllers/spellingDetailsController.js`. Reuse `buildStudentSpellingDetails({ schoolId: req.schoolId, studentId: req.params.studentId })` and the existing details route's authentication, school-context and authorization middleware.
3. Register a DOCX download route in `routes/spellingRoutes.js` adjacent to the existing student-details route. Confirm route ordering and middleware match the current details endpoint.
4. Return the DOCX MIME type and a safe `Content-Disposition` filename. Include an ASCII fallback and correctly encode the UTF-8 filename for non-Latin student names.
5. Add an **Export Word** button with a loading state, authenticated blob download, localized error feedback, and cleanup of the temporary object URL.
6. Include a grade-performance table in the DOCX. Do not claim to include the Recharts image unless chart image generation is implemented and tested.

## Edge cases and expected behavior

- No attempts: export the student header, zero-valued metrics, `—` for recovery, and localized empty-state messages.
- No current grade/week: show the localized unavailable value; do not fail the export.
- No missed words: show a localized empty state instead of a blank table.
- Long missed-word list: flow across pages without clipping; repeat the table heading when the renderer supports it.
- Missing school name/logo: omit it cleanly.
- Pending retests with no corresponding missed-word detail: still show the pending count in the summary.
- Student switch during loading: never export the previous student's cached report under the newly selected student's name.
- Filename: `Spelling-Report-<First>-<Last>-<YYYY-MM-DD>.<ext>`; sanitize reserved filename characters and provide a safe fallback.

## Validation checklist

### Functional and data correctness

- [ ] The report is for the current route student, including after switching students.
- [ ] Summary metrics exactly match the on-screen details and API response.
- [ ] Recovery is `—` when `retestAttempts` is zero.
- [ ] Grades are always ordered KG, G1, G2, G3, G4, G5, regardless of attempt chronology.
- [ ] Pending missed words appear before resolved words; counts and status match the API.
- [ ] Empty and partial data render without errors.

### Print quality and accessibility

- [ ] Print preview contains only the report, not app navigation or controls.
- [ ] A4 output has no clipped chart, truncated columns, accidental blank pages or tiny text.
- [ ] The chart is accompanied by a table containing exact grade values.
- [ ] Black-and-white print remains understandable without colour.
- [ ] Arabic and mixed Arabic/Latin content render correctly in the chosen browser.
- [ ] Long tables continue cleanly over page boundaries.

### Security and download behavior

- [ ] Details are fetched through the authenticated, school-scoped API.
- [ ] Unauthorized roles and cross-school student IDs are rejected by the existing route protections.
- [ ] DOCX, if implemented, opens in Word and Google Docs without repair warnings.
- [ ] Download filenames are safe with spaces, punctuation and Arabic names.

## Out of scope for the first release

- One report containing every student in a class.
- Date-range filtering or report history.
- Silent/background PDF generation or automatic email delivery.
- Pixel-identical PDF and DOCX layouts.

These can be scoped separately after the single-student print report is validated with teachers.
