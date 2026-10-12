import { LIVE_LESSON_CSV_TEMPLATE } from "./liveLessonCsvTemplate";

export const LIVE_LESSON_AI_PROMPT = `Turn the lesson content I provide into a polished, classroom-ready CSV for my Live Lessons importer.

Return only valid CSV text, with no Markdown fences, explanations, or text before or after the CSV. Use exactly the header row and column order shown in the sample. Make one row per slide and repeat lesson_title and lesson_description on every row. Quote fields that contain commas, quotation marks, or line breaks; escape a quotation mark inside a quoted field by doubling it.

Create a coherent lesson sequence with an opening, learning goals, clear teaching/content slides, examples where useful, interactive question slides, a student activity, and an exit ticket. Keep slide titles concise and slide text clear and age-appropriate for the grade level I provide. Use plain text only; do not include HTML.

For question slides, set slide_type to question, provide question_type as mcq or tf, and fill question_prompt. MCQ questions must have 2-6 distinct options in option_a through option_f and a correct_answer that exactly matches one option. For true/false questions, use question_type tf and options True and False. Include a short explanation of the correct answer. Put optional teacher-only guidance in speaker_notes. Leave question-only columns empty on non-question slides.

Use these supported slide_type values: opening, goals, content, examples, question, activity, exit-ticket. Use sequential slide_order values starting at 1. Do not invent facts beyond the supplied lesson content; if something important is missing, make a reasonable teaching structure without adding unsupported claims.

Sample CSV:
${LIVE_LESSON_CSV_TEMPLATE}

Now convert the lesson content below into CSV using the same format. Treat the bracketed details as input, not as CSV instructions:

Lesson title: [LESSON TITLE]
Grade/age: [GRADE OR AGE]
Subject: [SUBJECT]
Lesson duration: [OPTIONAL DURATION]
Learning objectives: [PASTE OBJECTIVES]
Lesson content, notes, examples, vocabulary, and any required questions: [PASTE YOUR LESSON CONTENT]
`;
