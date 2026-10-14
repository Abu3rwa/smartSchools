const headers = [
  "lesson_id", "slide_order", "slide_type", "title", "subject", "grade", "language", "html",
  "question_type", "question_prompt", "option_a", "option_b", "option_c", "option_d",
  "correct_answer", "explanation", "speaker_notes",
];

const csvRow = (values) => values.map((value) => {
  const cell = String(value ?? "");
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}).join(",");

export const LIVE_LESSON_CSV_TEMPLATE = [
  csvRow(headers),
  csvRow(["LANG-001", 0, "lesson", "Simple, Compound, and Complex Sentences", "English (ELA)", "Grade 7", "en", ...Array(10).fill("")]),
  csvRow([
    "LANG-001", 1, "html", "Sentence types", "", "", "",
    "<style>@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}body{margin:0;padding:8vw;font-family:system-ui,sans-serif;background:linear-gradient(135deg,#10243b,#376b83);color:white}h1{font-size:clamp(2.5rem,7vw,6rem);animation:rise .8s ease-out both}p{font-size:clamp(1.2rem,3vw,2rem);animation:rise .8s .2s ease-out both}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}</style><main><h1>Simple, Compound, and Complex</h1><p>Today we compare three kinds of sentences and learn how to build complex sentences.</p></main>",
    "", "", "", "", "", "", "", "", "Introduce the lesson and invite students to listen for sentence structure.",
  ]),
  csvRow([
    "LANG-001", 2, "question", "Check for understanding", "", "", "", "",
    "mcq", "Which sentence contains a dependent clause?", "The bell rang.", "When the bell rang, we lined up.", "The bell rang, and we lined up.", "",
    "B", "“When the bell rang” cannot stand alone, so it is a dependent clause.", "Ask students to explain why the first clause cannot stand alone.",
  ]),
].join("\r\n");
