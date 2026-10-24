const csvRow = (values) => values.map((value) => {
  const cell = String(value ?? "");
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}).join(",");

// The format the app's own Export button writes (services/liveLessonCsvService.js, format_version 2).
// It is the only layout that carries a designed HTML slide next to every question kind, so it is the
// contract "Copy AI prompt" asks an external assistant to reproduce. Teachers who hand-author a lesson
// in a spreadsheet use LIVE_LESSON_SAMPLE_CSV below instead, which has no HTML column.
const AI_REFERENCE_HEADERS = [
  "format_version", "lesson_id", "lesson_title", "lesson_description", "subject", "grade", "language",
  "assigned_class", "assigned_subject", "is_done", "slide_order", "slide_type", "title", "body", "html",
  "examples_json", "image_url", "question_kind", "question_prompt", "question_options_json",
  "question_pairs_json", "question_items_json", "question_blanks_json", "question_numeric_json",
  "question_guidance", "question_criteria", "question_min_words", "question_max_words",
  "correct_answer", "explanation", "speaker_notes", "levels_json",
];

const AI_REFERENCE_METADATA = {
  format_version: "2",
  lesson_id: "REF-FIGURATIVE-LANGUAGE",
  lesson_title: "Figurative Language",
  lesson_description: "Similes, metaphors and personification.",
  subject: "English (ELA)",
  grade: "Grade 7",
  language: "en",
  assigned_class: "",
  assigned_subject: "",
  is_done: "false",
};

const AI_REFERENCE_HTML = "<style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#f8fafc;background:radial-gradient(ellipse at 85% 15%,#285c75 0,transparent 42%),linear-gradient(135deg,#101a32,#172c48)}@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}main{width:100%;height:100%;padding:clamp(1.25rem,5vw,4.5rem);display:flex;flex-direction:column;justify-content:center;gap:clamp(1rem,3vh,2rem);overflow:hidden}.eyebrow{margin:0;color:#8ee3d0;font-size:clamp(.72rem,1.4vw,.95rem);font-weight:750;letter-spacing:.16em;text-transform:uppercase}h1{max-width:14ch;margin:.55rem 0 0;font-size:clamp(2.25rem,6.5vw,5.5rem);line-height:.98;letter-spacing:-.045em;animation:rise .7s ease-out both}.intro{max-width:58ch;margin:.8rem 0 0;color:#c5d4e3;font-size:clamp(.95rem,1.8vw,1.25rem);line-height:1.5;animation:rise .7s .1s ease-out both}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(.55rem,1.8vw,1.25rem);animation:rise .7s .2s ease-out both}.card{min-width:0;padding:clamp(.8rem,2.2vw,1.5rem);border:1px solid #ffffff24;border-radius:1rem;background:#ffffff0d}.card span{display:block;margin-bottom:.65rem;color:#8ee3d0;font-size:clamp(.65rem,1.1vw,.78rem);font-weight:750;letter-spacing:.12em;text-transform:uppercase}.card h2{margin:0 0 .55rem;font-size:clamp(1rem,2.4vw,1.7rem);line-height:1.1}.card p{margin:0;color:#c5d4e3;font-size:clamp(.78rem,1.5vw,1rem);line-height:1.4}.card strong{color:#fff}@media(max-height:560px){main{padding:1rem 4vw;gap:.7rem}.intro{margin-top:.4rem}.card{padding:.65rem}.card span{margin-bottom:.35rem}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style><main><header><p class='eyebrow'>English · Grade 7</p><h1>Three ways to compare</h1><p class='intro'>A phrase can name a thing, picture it, or give it a human voice.</p></header><section class='cards'><article class='card'><span>01 · Uses like or as</span><h2>Simile</h2><p><strong>Ideas fell like rain.</strong><br>Two things compared openly.</p></article><article class='card'><span>02 · Says it is</span><h2>Metaphor</h2><p><strong>The classroom was a beehive.</strong><br>Two things compared directly.</p></article><article class='card'><span>03 · Human qualities</span><h2>Personification</h2><p><strong>The stars winked at us.</strong><br>A thing given human action.</p></article></section></main>";

const referenceRow = (cells) => csvRow(AI_REFERENCE_HEADERS.map((header) => cells[header] ?? ""));
const referenceSlide = (slide_order, cells) => referenceRow({ ...AI_REFERENCE_METADATA, slide_order, ...cells });

/**
 * A reference, not a lesson: every slide type and every question kind appears exactly once so each
 * column is shown filled at least one time. A real lesson uses a subset of the kinds and as many
 * slides of each type as the teacher asks for.
 */
export const LIVE_LESSON_AI_REFERENCE_CSV = [
  csvRow(AI_REFERENCE_HEADERS),
  referenceSlide(1, { slide_type: "opening", title: "Figurative Language", body: "Explore similes, metaphors and personification.", speaker_notes: "Welcome students and set the listening expectation." }),
  referenceSlide(2, { slide_type: "goals", title: "Learning goals", body: "Define each technique and identify it in a sentence." }),
  referenceSlide(3, { slide_type: "content", title: "How to spot the technique", body: "Read the sentence carefully, look for a comparison or a human action, then decide whether it is literal." }),
  referenceSlide(4, { slide_type: "html", title: "Three ways to compare", html: AI_REFERENCE_HTML, speaker_notes: "Let students read each card aloud before the definition slides." }),
  referenceSlide(5, { slide_type: "examples", title: "Simile", body: "A simile compares two things using like or as.", examples_json: '["Her laugh was as bright as a bell","Ideas fell like rain"]' }),
  referenceSlide(6, {
    slide_type: "question",
    title: "Check for understanding",
    question_kind: "mcq",
    question_prompt: "The classroom was a beehive. Which technique is used?",
    question_options_json: '[{"id":"a","text":"Simile"},{"id":"b","text":"Metaphor"},{"id":"c","text":"Personification"}]',
    correct_answer: "b",
    explanation: "It says the classroom is a beehive, without like or as.",
  }),
  referenceSlide(7, {
    slide_type: "question",
    title: "Select the similes",
    question_kind: "multi_select",
    question_prompt: "Which sentences use a simile? Select all that apply.",
    question_options_json: '[{"id":"a","text":"Her laugh was as bright as a bell."},{"id":"b","text":"The classroom was a beehive."},{"id":"c","text":"Ideas fell like rain."}]',
    correct_answer: "a|c",
    explanation: "Both compare two things using like.",
  }),
  referenceSlide(8, {
    slide_type: "question",
    title: "True or false",
    question_kind: "tf",
    question_prompt: "A metaphor compares two things using like or as.",
    question_options_json: '[{"id":"true","text":"True"},{"id":"false","text":"False"}]',
    correct_answer: "false",
    explanation: "That is a simile. A metaphor says one thing is another.",
  }),
  referenceSlide(9, {
    slide_type: "question",
    title: "Match the technique",
    question_kind: "matching",
    question_prompt: "Match each technique to its definition.",
    question_pairs_json: '[{"left":"Simile","right":"a comparison using like or as"},{"left":"Personification","right":"human qualities given to a thing"}]',
  }),
  referenceSlide(10, {
    slide_type: "question",
    title: "Order the steps",
    question_kind: "ordering",
    question_prompt: "Put the steps for naming a tense in order.",
    question_items_json: '[{"id":"s1","text":"Read the sentence"},{"id":"s2","text":"Find the verb"},{"id":"s3","text":"Name the tense"}]',
  }),
  referenceSlide(11, {
    slide_type: "question",
    title: "Complete the definition",
    question_kind: "fill_in_blank",
    question_prompt: "A {{b1}} compares two things using {{b2}}.",
    question_blanks_json: '[{"id":"b1","accepts":["simile"]},{"id":"b2","accepts":["like or as","like and as"]}]',
  }),
  referenceSlide(12, {
    slide_type: "question",
    title: "How many techniques",
    question_kind: "numeric",
    question_prompt: "How many techniques does this lesson define?",
    question_numeric_json: '{"mode":"exact","value":"3"}',
  }),
  referenceSlide(13, { slide_type: "activity", title: "Your turn", body: "Write one simile, one metaphor, and one example of personification." }),
  referenceSlide(14, { slide_type: "exit-ticket", title: "Before you go", body: "Say one technique you will watch for in your reading tonight." }),
  referenceSlide(15, {
    slide_type: "question",
    title: "Exit ticket",
    question_kind: "text",
    question_prompt: "Name the technique in “The stars winked at us” and explain how a metaphor differs from a simile.",
    question_guidance: "Two sentences, one example of each.",
    question_criteria: "Names both techniques and the difference between them.",
    question_min_words: "20",
  }),
].join("\r\n");

// Mirrors LIVE_LESSON_CSV_TEMPLATE in server/services/liveLessonCsvService.js, which a browser
// bundle cannot import. tests/liveLessonCsvService.test.js asserts the two files match cell for
// cell, so the sample a teacher downloads stays the sample the importer is tested against.
const sampleHeaders = [
  "lesson_title", "lesson_description", "slide_order", "slide_type", "title", "body", "examples",
  "image_url", "question_type", "question_prompt", "option_a", "option_b", "option_c", "option_d",
  "correct_answer", "explanation", "speaker_notes", "matching_pairs", "ordering_items",
  "blank_answers", "numeric_rule", "guidance", "criteria", "min_words", "max_words",
];

const sampleRow = (cells) => csvRow(sampleHeaders.map((header) => cells[header] ?? ""));

const sampleLesson = { lesson_title: "Figurative Language", lesson_description: "ELA lesson" };

/**
 * One row per live question kind, so the sample lesson teaches every column without a separate
 * reference sheet. Type cells take either JSON or the shared practice grammar: `term::match` joined
 * by `|`, steps joined by `>`, and `blank::answer~alternative`.
 */
export const LIVE_LESSON_SAMPLE_CSV = [
  csvRow(sampleHeaders),
  sampleRow({ ...sampleLesson, slide_order: 1, slide_type: "opening", title: "Figurative Language", body: "Explore similes, metaphors and personification.", speaker_notes: "Welcome students" }),
  sampleRow({ ...sampleLesson, slide_order: 2, slide_type: "goals", title: "Learning goals", body: "Define each technique and identify it in a sentence." }),
  sampleRow({ ...sampleLesson, slide_order: 3, slide_type: "content", title: "How to spot the technique", body: "Read carefully; look for a comparison or human action; decide if it is literal." }),
  sampleRow({ ...sampleLesson, slide_order: 4, slide_type: "examples", title: "Simile", body: "A simile compares two things using like or as.", examples: "Her laugh was as bright as a bell|Ideas fell like rain" }),
  sampleRow({ ...sampleLesson, slide_order: 5, slide_type: "question", title: "Check for understanding", question_type: "mcq", question_prompt: "The classroom was a beehive. Which technique is used?", option_a: "Simile", option_b: "Metaphor", option_c: "Personification", correct_answer: "Metaphor", explanation: "It says the classroom is a beehive without like or as." }),
  sampleRow({ ...sampleLesson, slide_order: 6, slide_type: "question", title: "Select the similes", question_type: "multi_select", question_prompt: "Which sentences use a simile? Select all that apply.", option_a: "Her laugh was as bright as a bell.", option_b: "The classroom was a beehive.", option_c: "Ideas fell like rain.", correct_answer: "a|c", explanation: "Both compare using like." }),
  sampleRow({ ...sampleLesson, slide_order: 7, slide_type: "question", title: "True or false", question_type: "tf", question_prompt: "A metaphor compares two things using like or as.", correct_answer: "false", explanation: "That is a simile." }),
  sampleRow({ ...sampleLesson, slide_order: 8, slide_type: "question", title: "Match the technique", question_type: "matching", question_prompt: "Match each technique to its definition.", matching_pairs: "Simile::a comparison using like or as|Personification::human qualities given to a thing" }),
  sampleRow({ ...sampleLesson, slide_order: 9, slide_type: "question", title: "Order the steps", question_type: "ordering", question_prompt: "Put the steps for naming a tense in order.", ordering_items: "Read the sentence > Find the verb > Name the tense" }),
  sampleRow({ ...sampleLesson, slide_order: 10, slide_type: "question", title: "Complete the definition", question_type: "fill_in_blank", question_prompt: "A {{b1}} compares two things using {{b2}}.", blank_answers: "b1::simile|b2::like or as~like and as" }),
  sampleRow({ ...sampleLesson, slide_order: 11, slide_type: "question", title: "How many techniques", question_type: "numeric", question_prompt: "How many techniques does this lesson define?", numeric_rule: "exact::3" }),
  sampleRow({ ...sampleLesson, slide_order: 12, slide_type: "activity", title: "Your turn", body: "Write one simile, one metaphor, and one example of personification." }),
  sampleRow({ ...sampleLesson, slide_order: 13, slide_type: "question", title: "Exit ticket", question_type: "text", question_prompt: "Name the technique in “The stars winked at us” and explain how a metaphor differs from a simile.", guidance: "Two sentences, one example of each.", criteria: "Names both techniques and the difference between them.", min_words: 20 }),
].join("\r\n");
