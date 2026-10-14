# Live lessons: HTML slide CSV

The new CSV format contains exactly 17 columns:

`lesson_id,slide_order,slide_type,title,subject,grade,language,html,question_type,question_prompt,option_a,option_b,option_c,option_d,correct_answer,explanation,speaker_notes`

The first data row is the lesson metadata row (`slide_order=0`, `slide_type=lesson`). Following rows are HTML or question slides with continuous slide order. Presentation HTML and CSS belong in the `html` cell. The existing interactive question system remains structured and supports `mcq` and `true_false`.

## HTML safety

- HTML is reviewed on the server before a lesson is saved.
- Every HTML slide is displayed inside an iframe with a unique opaque origin and a restrictive Content Security Policy. Network requests, external resources, forms, nested frames, and navigation are blocked; slide scripts cannot access the parent application.
- CSS animation is supported without JavaScript.
- School admins control the optional AI safety review at `/api/live/settings`. It defaults to off. When off, HTML/CSS slides are allowed but scripts are rejected. When on, the server submits the HTML to the configured AI provider; scripts are saved only when deterministic checks and AI review both pass. Review failures stop the import.
- AI review supplements, but does not replace, the iframe isolation and deterministic checks. It is not a guarantee that arbitrary JavaScript is harmless.
- AI review accepts at most 80,000 combined HTML characters in a lesson. CSV upload is limited to 2 MB; a slide's HTML cell is limited to 100,000 characters.

## Existing lessons and session history

The legacy CSV importer and slide renderer remain available for existing records. Deleting a lesson now permanently deletes its associated non-live session records, answers, reports, and timeline events in the same database transaction. A lesson with a live session cannot be deleted until the session is ended. This supports removing old lessons and their history without silently migrating their content.

## Configuration

Live lessons continue to require `LIVE_LESSONS_ENABLED=true` on the server and the existing client build flag. AI script review requires the AI provider credentials already used by the application; `LIVE_LESSON_SAFETY_AI_MODEL` optionally selects the review model.
