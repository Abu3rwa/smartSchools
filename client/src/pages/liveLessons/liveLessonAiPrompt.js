import { LIVE_LESSON_CSV_TEMPLATE } from "./liveLessonCsvTemplate";

export const LIVE_LESSON_AI_PROMPT = `Create a polished, classroom-ready CSV for the app's Live Lessons importer from the lesson details I provide.

Return only valid UTF-8 CSV text. Do not add Markdown fences, explanations, or text outside the CSV. Use exactly the 17 columns and order from the sample. The first data row is the lesson metadata row; all following rows are slides. Every row must have exactly 17 fields. Quote cells containing commas, double quotes, or line breaks, and double quotes inside quoted cells.

CSV columns:
lesson_id,slide_order,slide_type,title,subject,grade,language,html,question_type,question_prompt,option_a,option_b,option_c,option_d,correct_answer,explanation,speaker_notes

FORMAT RULES
- Create one lesson row first with slide_order 0 and slide_type lesson. Fill lesson_id, the overall lesson title in title, subject, grade, and language. Leave all slide, HTML, and question fields empty.
- Create exactly 15 slide rows after it, in presentation order, with slide_order 1 through 15 and no gaps. Reuse the same lesson_id. Put each slide's own title in title; keep subject, grade, and language blank on slide rows.
- Slides 1–10 must be informational HTML slides. Use them to introduce the topic, explain key ideas step by step, show examples or guided practice, and prepare students for the questions.
- Slides 11–15 must be interactive question slides using the structured question columns. Include exactly five questions; do not make any of these five slides HTML slides.
- Use slide_type html for designed presentation slides and question for interactive question slides.
- HTML slides have their full, self-contained visual design in the html cell. Put markup and any slide-specific CSS in that cell. Give each slide a distinct but consistent visual style with cheerful, child-appropriate colors, high contrast, and relevant icons (use emoji or self-contained inline artwork; never load icon files). Make slides engaging and suitable for projection and mobile screens.
- Write for the supplied grade and children's age: use familiar vocabulary, short sentences, encouraging language, concrete examples, and a friendly tone without talking down to students. Explain new terms simply and avoid dense paragraphs.
- Make text presentation-sized and easy to read from across a classroom: use large headings (at least 2.5rem where supported), body text at least 1.125rem, short lines, and no more than a few key points on a slide. Use responsive sizing such as CSS clamp() without letting text fall below those readable sizes. Never solve overflow by shrinking text.
- Treat every HTML slide as one full-screen presentation canvas, not a web page: it must fit the available slide viewport from edge to edge with no vertical or horizontal scrolling. Include box-sizing:border-box; set html and body width and height to 100%, margin to 0, and overflow to hidden; size the main slide container to 100% width and height; and use viewport-aware spacing and responsive layouts. Keep the content concise enough to fit even on a small screen.
- Make the lesson engaging through varied visual layouts, simple diagrams, labeled examples, and purposeful CSS animation/transition effects such as gentle fades or reveals. Include a prefers-reduced-motion rule. CSS animations do not require JavaScript. Keep movement subtle and never make content flash.
- Do not rely on the app for slide layouts or styling; the imported HTML supplies each slide's creative design. The app supplies lesson metadata and live-session controls.
- JavaScript is optional, not required for animation. Prefer HTML and CSS. Only include a small self-contained script when an interaction genuinely needs it. Never use external libraries, scripts, stylesheets, fonts, images, iframes, forms, or embedded content. Never use network requests, browser storage/cookies, eval/Function, navigation, or code that accesses the parent page. The app may reject scripts if its school's safety review is disabled or considers them unsafe.
- Do not put question text, answer options, answer keys, or question controls inside HTML. Question slides use the structured columns below. Leave HTML empty for question rows.

QUESTION RULES
- The only supported question types are mcq and true_false.
- Make the five question slides varied and interactive for students: use a mix of MCQ and true/false when appropriate, check understanding of the lesson's objectives, and include one final review/exit question. Keep prompts and answers short, clear, and age-appropriate. The app displays the answer choices and lets students respond.
- MCQ: use 2–4 non-empty options in option_a through option_d. Set correct_answer to the option letter A, B, C, or D—not the option text.
- True/false: use question_type true_false, option_a True, option_b False, leave option_c and option_d empty, and set correct_answer to A or B.
- Fill question_prompt and explanation. The explanation is shown after the teacher reveals the answer. Ensure the key points to a populated option and there is exactly one correct answer.
- Put teacher-only guidance in speaker_notes. Never put the answer key there.

LESSON QUALITY
- Make the 10 information slides a coherent, child-friendly teaching sequence with an engaging opener, clear explanations, examples or guided practice, and a smooth lead-in to the five questions.
- Keep every slide focused and age-appropriate. Do not invent unsupported facts; make the best reasonable lesson from the provided content and note any essential assumptions briefly in teacher-only speaker_notes.

SAMPLE CSV (copy its header and row conventions only; this abbreviated example demonstrates formatting, not the required number of slides):
${LIVE_LESSON_CSV_TEMPLATE}

Before returning, verify valid CSV quoting, exactly 17 fields per row, one lesson row at order 0, exactly 15 slide rows (slides 1–10 are html and slides 11–15 are question), continuous slide orders 1–15, consistent lesson_id, required metadata, non-empty HTML for all 10 information slides, empty HTML for all five question slides, and valid question answers.

LESSON DETAILS
Lesson title: [LESSON TITLE]
Subject: [SUBJECT]
Grade: [GRADE]
Language: [LANGUAGE, such as en or ar]
Duration: [OPTIONAL DURATION]
Learning objectives: [PASTE OBJECTIVES]
Lesson content, vocabulary, examples, and required questions: [PASTE YOUR CONTENT]
`;
