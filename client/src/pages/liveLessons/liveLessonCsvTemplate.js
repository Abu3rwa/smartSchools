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
    "<style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#f8fafc;background:radial-gradient(ellipse at 85% 15%,#285c75 0,transparent 42%),linear-gradient(135deg,#101a32,#172c48)}@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}main{width:100%;height:100%;padding:clamp(1.25rem,5vw,4.5rem);display:flex;flex-direction:column;justify-content:center;gap:clamp(1rem,3vh,2rem);overflow:hidden}.eyebrow{margin:0;color:#8ee3d0;font-size:clamp(.72rem,1.4vw,.95rem);font-weight:750;letter-spacing:.16em;text-transform:uppercase}h1{max-width:14ch;margin:.55rem 0 0;font-size:clamp(2.25rem,6.5vw,5.5rem);line-height:.98;letter-spacing:-.045em;animation:rise .7s ease-out both}.intro{max-width:58ch;margin:.8rem 0 0;color:#c5d4e3;font-size:clamp(.95rem,1.8vw,1.25rem);line-height:1.5;animation:rise .7s .1s ease-out both}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(.55rem,1.8vw,1.25rem);animation:rise .7s .2s ease-out both}.card{min-width:0;padding:clamp(.8rem,2.2vw,1.5rem);border:1px solid #ffffff24;border-radius:1rem;background:#ffffff0d}.card span{display:block;margin-bottom:.65rem;color:#8ee3d0;font-size:clamp(.65rem,1.1vw,.78rem);font-weight:750;letter-spacing:.12em;text-transform:uppercase}.card h2{margin:0 0 .55rem;font-size:clamp(1rem,2.4vw,1.7rem);line-height:1.1}.card p{margin:0;color:#c5d4e3;font-size:clamp(.78rem,1.5vw,1rem);line-height:1.4}.card strong{color:#fff}@media(max-height:560px){main{padding:1rem 4vw;gap:.7rem}.intro{margin-top:.4rem}.card{padding:.65rem}.card span{margin-bottom:.35rem}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style><main><header><p class='eyebrow'>English · Grade 7</p><h1>Three ways sentences work</h1><p class='intro'>A sentence can share one idea, connect ideas, or show how ideas depend on each other.</p></header><section class='cards'><article class='card'><span>01 · One idea</span><h2>Simple</h2><p><strong>The bell rang.</strong><br>One independent clause.</p></article><article class='card'><span>02 · Joined ideas</span><h2>Compound</h2><p><strong>The bell rang, and we lined up.</strong><br>Two independent clauses.</p></article><article class='card'><span>03 · Connected ideas</span><h2>Complex</h2><p><strong>When the bell rang, we lined up.</strong><br>One independent and one dependent clause.</p></article></section></main>",
    "", "", "", "", "", "", "", "", "Introduce the lesson and invite students to listen for sentence structure.",
  ]),
  csvRow([
    "LANG-001", 2, "question", "Check for understanding", "", "", "", "",
    "mcq", "Which sentence contains a dependent clause?", "The bell rang.", "When the bell rang, we lined up.", "The bell rang, and we lined up.", "",
    "B", "“When the bell rang” cannot stand alone, so it is a dependent clause.", "Ask students to explain why the first clause cannot stand alone.",
  ]),
].join("\r\n");
