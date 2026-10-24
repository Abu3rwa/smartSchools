import { LIVE_LESSON_AI_REFERENCE_CSV } from "./liveLessonCsvTemplate";

export const LIVE_LESSON_AI_PROMPT = `Create a polished, classroom-ready CSV for the app's Live Lessons importer from the lesson details I provide. The app imports this file as-is, in the same format as its own lesson Export, so the result must be exact.

Return only valid UTF-8 CSV text. Do not add Markdown fences, explanations, or text outside the CSV.

CSV columns (32, in this order, one field per column on every row):
format_version,lesson_id,lesson_title,lesson_description,subject,grade,language,assigned_class,assigned_subject,is_done,slide_order,slide_type,title,body,html,examples_json,image_url,question_kind,question_prompt,question_options_json,question_pairs_json,question_items_json,question_blanks_json,question_numeric_json,question_guidance,question_criteria,question_min_words,question_max_words,correct_answer,explanation,speaker_notes,levels_json

ROW RULES
- One row per slide, plus the header row. There is no separate lesson row.
- Repeat these ten lesson metadata cells identically on every single row: format_version (always 2), lesson_id (one short id you invent, such as L-SENTENCES), lesson_title, lesson_description, subject, grade, language, assigned_class and assigned_subject (leave both empty; the teacher picks the class in the app), is_done (false).
- slide_order is 1, 2, 3 … up to the number of slides, with no gaps and no duplicates. A lesson has between 1 and 200 slides.
- Quote every cell that contains a comma, a double quote, or a line break, and double the quotes inside it. The JSON cells always contain commas, so they are always quoted.
- levels_json must be empty on every row.
- Length limits: slide title 200 characters, body 5,000, html 100,000, speaker notes 2,000.

SLIDE RULES
- slide_type is one of: opening, goals, content, html, examples, question, activity, exit-ticket.
- How many slides the lesson has is my decision, not yours: build exactly the number of teaching slides and question slides I ask for at the end of this prompt. If I leave it open, choose the balance the objective needs (a new topic usually teaches more than it quizzes; a revision or practice lesson quizzes more than it teaches) and say what you chose in the opening slide's speaker notes.
- Use one opening slide and one goals slide, then teaching slides, then the questions, ending with an activity or exit-ticket slide.
- Teaching slides (opening, goals, content, html, examples, activity, exit-ticket) use only title, body, html, examples_json, image_url and speaker_notes. Leave question_kind, question_prompt, every question_* column, correct_answer and explanation empty on them.
- examples_json is a JSON array of short strings, for example ["Her laugh was as bright as a bell"].
- image_url is optional: leave it empty unless I give you a real https:// image address.
- Question slides use slide_type question with question_kind and the columns that kind needs.
- An exit-ticket slide is a closing instruction slide with title and body only. The final graded question is a separate question slide.
- html must be non-empty on html slides and empty on every other slide type. Never put question text, answer options, or answer keys inside HTML.

HTML SLIDE DESIGN
- An html slide is one full-screen presentation canvas, not a web page, and you supply its entire visual design in that cell. The app supplies lesson metadata and live-session controls only.
- There is no fixed template: choose each slide's own columns, structure and artwork so the sequence looks varied but consistent. Grids, cards, timelines, labelled diagrams, and comparison columns are all welcome.
- Make it cheerful and child-appropriate for the supplied grade: relevant colour, high contrast, emoji or self-contained inline artwork for icons, never icon or image files.
- Presentation-sized text: headings at least 2.5rem where supported, body at least 1.125rem, short lines, only a few key points per slide. Use responsive sizing such as CSS clamp() without letting text fall below those sizes, and never solve overflow by shrinking text.
- Fit the viewport edge to edge with no scrolling: include box-sizing:border-box; set html and body width and height to 100%, margin to 0, and overflow to hidden; size the main container to 100% width and height; keep the content short enough to fit a small screen.
- Prefer CSS animation and transition for gentle fades and reveals, and include a prefers-reduced-motion rule. CSS animation does not need JavaScript. Keep movement subtle and never make content flash.
- JavaScript is optional. Only add a small self-contained script when an interaction genuinely needs one. Never use external libraries, scripts, stylesheets, fonts, images, iframes, forms, or embedded content. Never use network requests, browser storage or cookies, eval/Function, navigation, or code that touches the parent page. The school may reject scripts if its safety review is off.
- Put every slide in the lesson language I give you. For Arabic, write right-to-left content and set dir="rtl" on the slide.

QUESTION RULES
- Supported question_kind values are mcq, tf, multi_select, matching, ordering, fill_in_blank, numeric, and text.
- Use the kinds that suit this subject and objective. A real lesson never uses all eight: pick the two to five that fit. A reference showing every kind at least once is included below, and it is a reference for the columns, not a lesson plan.
- mcq: 2-6 options in question_options_json as [{"id":"a","text":"…"}], exactly one correct_answer naming an option id (or its full text).
- tf: question_options_json must be exactly [{"id":"true","text":"True"},{"id":"false","text":"False"}] and correct_answer must be true or false.
- multi_select: 2-6 options like mcq, and correct_answer lists every correct id joined by a pipe, for example a|c. At least two must be correct.
- matching: question_pairs_json as [{"left":"term","right":"match"}], at least two pairs, each term used once, both sides under 300 characters. The app shuffles the right-hand column for students, so write the pairs in any order.
- ordering: question_items_json as [{"id":"s1","text":"…"}], 3-8 items, each under 300 characters. The array order is the correct order students must rebuild.
- fill_in_blank: write each blank in question_prompt as {{b1}}, {{b2}} … and give question_blanks_json as [{"id":"b1","accepts":["answer","alternative answer"]}]. Every token needs an entry and every entry needs a token, with matching ids.
- numeric: question_numeric_json is one object: {"mode":"exact","value":"3"}, or {"mode":"tolerance","value":"45","tolerance":"5","unit":"minutes"}, or {"mode":"relative","value":"45","tolerance":"10"}, or {"mode":"range","min":"10","max":"20"}. A tolerance or percentage mode needs a readable tolerance, a range needs both ends.
- text: a written answer the teacher marks live. question_guidance (what students are told, 500 characters max), question_criteria (what earns the mark, 1,000 max), and optional question_min_words / question_max_words (minimum never above maximum). Leave correct_answer empty; never hide the mark scheme from yourself by putting it in speaker_notes.
- Fill question_prompt (500 characters max) on every question. Fill explanation for auto-graded kinds; it is shown after the teacher reveals the answer. Keep answers short, unambiguous, and age-appropriate, and make wrong options genuinely plausible.
- Option ids are 20 characters or fewer and option text 300 or fewer.
- Put teacher-only guidance in speaker_notes. Never put an answer key there.

LESSON QUALITY
- Make the teaching slides one coherent sequence for my subject and grade: an engaging opener, the goals, ideas explained step by step, worked examples, then the questions checking what the goals promised.
- Write for the supplied grade and age: familiar vocabulary, short sentences, concrete examples, encouraging tone, no talking down. Explain new terms simply and avoid dense paragraphs.
- Do not invent unsupported facts. Build the best reasonable lesson from the content I supplied, and note any essential assumption briefly in that slide's speaker_notes.
- Quote any example sentence or term with single quotes inside cells, or double the CSV quotes, so the file still parses.

REFERENCE CSV (a reference, not a lesson plan: every slide type and every question kind appears once so each column is shown filled. Copy the header row and the cell conventions exactly. Delete the rows you do not need, keep the rest, and add as many slides of each kind as I asked for):
${LIVE_LESSON_AI_REFERENCE_CSV}

Before returning, verify: valid CSV quoting; 32 fields on every row; the ten metadata cells identical on every row with format_version 2 and is_done false; slide_order continuous from 1 to the number of slides with no gaps; html non-empty only on html slides; question columns and explanation empty on every teaching slide; exit-ticket slides carrying no question columns; every question_kind valid with its own required columns filled; every correct answer matching an option that exists; levels_json empty everywhere; and the slide counts matching what I asked for.

LESSON DETAILS
Lesson title: [LESSON TITLE]
Subject: [SUBJECT]
Grade: [GRADE]
Language: [LANGUAGE, such as en or ar]
Duration: [OPTIONAL DURATION]
Teaching slides: [NUMBER, for example 8 — the opener, goals, and what you teach]
Question slides: [NUMBER, for example 4]
Designed HTML slides: [HOW MANY, for example 3, or 0 if every teaching slide should use plain title and content]
Learning objectives: [PASTE OBJECTIVES]
Lesson content, vocabulary, examples, and required questions: [PASTE YOUR CONTENT]
`;
