import { LIVE_LESSON_CSV_TEMPLATE } from "./liveLessonCsvTemplate";

export const LIVE_LESSON_AI_PROMPT = `Create a polished, classroom-ready CSV for the app's Live Lessons importer from the lesson details I provide.

Return only valid UTF-8 CSV text. Do not add Markdown fences, explanations, or text outside the CSV. Use exactly the 17 columns and order from the sample. The first data row is the lesson metadata row; all following rows are slides. Every row must have exactly 17 fields. Quote cells containing commas, double quotes, or line breaks, and double quotes inside quoted cells.

CSV columns:
lesson_id,slide_order,slide_type,title,subject,grade,language,html,question_type,question_prompt,option_a,option_b,option_c,option_d,correct_answer,explanation,speaker_notes

FORMAT RULES
- Create one lesson row first with slide_order 0 and slide_type lesson. Fill lesson_id, the overall lesson title in title, subject, grade, and language. Leave all slide, HTML, and question fields empty.
- Create 1–200 slide rows after it, in presentation order, with slide_order 1, 2, 3, without gaps. Reuse the same lesson_id. Put each slide's own title in title; keep subject, grade, and language blank on slide rows.
- Use slide_type html for designed presentation slides and question for interactive question slides.
- HTML slides have their full, self-contained visual design in the html cell. Put markup and any slide-specific CSS in that cell. Use varied, attractive layouts appropriate to the lesson and age group. Make them responsive, readable, high-contrast, and suitable for projection and mobile screens.
- Treat every HTML slide as one presentation screen, not a web page: all slide content must fit within the visible viewport with no vertical or horizontal scrolling. Set overflow hidden on the slide document, size and space content to the viewport, and keep text concise; never shrink text to an unreadable size just to make it fit. Use a clean visual hierarchy, generous spacing, strong typography, and polished presentation-style layouts.
- Include purposeful CSS animations and transitions, such as fades, reveals, moving shapes, and emphasis. Include a prefers-reduced-motion rule. CSS animations do not require JavaScript.
- Do not rely on the app for slide layouts or styling; the imported HTML supplies each slide's creative design. The app supplies lesson metadata and live-session controls.
- JavaScript is optional, not required for animation. Prefer HTML and CSS. Only include a small self-contained script when an interaction genuinely needs it. Never use external libraries, scripts, stylesheets, fonts, images, iframes, forms, or embedded content. Never use network requests, browser storage/cookies, eval/Function, navigation, or code that accesses the parent page. The app may reject scripts if its school's safety review is disabled or considers them unsafe.
- Do not put question text, answer options, answer keys, or question controls inside HTML. Question slides use the structured columns below. Leave HTML empty for question rows.

QUESTION RULES
- The only supported question types are mcq and true_false.
- MCQ: use 2–4 non-empty options in option_a through option_d. Set correct_answer to the option letter A, B, C, or D—not the option text.
- True/false: use question_type true_false, option_a True, option_b False, leave option_c and option_d empty, and set correct_answer to A or B.
- Fill question_prompt and explanation. The explanation is shown after the teacher reveals the answer. Ensure the key points to a populated option and there is exactly one correct answer.
- Put teacher-only guidance in speaker_notes. Never put the answer key there.

LESSON QUALITY
- Build a coherent lesson with an opening, clear instruction, examples or guided practice, useful question checks, and a final check/exit question.
- Keep each slide focused and age-appropriate. Do not invent unsupported facts; ask for missing source details in the content structure by making the best reasonable lesson from what is provided.

SAMPLE CSV (copy its header and row conventions):
${LIVE_LESSON_CSV_TEMPLATE}

Before returning, verify valid CSV quoting, exactly 17 fields per row, one lesson row at order 0, continuous slide orders, consistent lesson_id, required metadata, non-empty HTML for html slides, empty HTML for question slides, and valid question answers.

LESSON DETAILS
Lesson title: [LESSON TITLE]
Subject: [SUBJECT]
Grade: [GRADE]
Language: [LANGUAGE, such as en or ar]
Duration: [OPTIONAL DURATION]
Learning objectives: [PASTE OBJECTIVES]
Lesson content, vocabulary, examples, and required questions: [PASTE YOUR CONTENT]
`;
