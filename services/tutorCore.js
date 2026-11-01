/**
 * Pure rules for the student tutor: what a lesson row must contain, which lessons
 * answer a question, how the prompt is built, and how a practice set is marked.
 * No database and no AI in this file, so every rule here is testable on its own.
 */

export const MAX_LESSON_CONTENT = 20000;
export const MAX_LESSONS_PER_IMPORT = 400;
export const LESSONS_IN_ANSWER = 3;
export const LESSON_CHARS_IN_ANSWER = 3500;
export const STANDARDS_IN_ANSWER = 15;
export const ONE_QUESTION_COST = 1;
export const PRACTICE_QUESTION_COUNT = 5;
export const PRACTICE_OPTION_COUNT = 4;
export const FREE_AFTER_CREDITS = 3;
export const MAX_TRIES_BEFORE_ANSWER = 2;
export const HISTORY_IN_PROMPT = 10;
export const HISTORY_MESSAGE_CHARS = 700;

const fail = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const text = (value) => String(value ?? "").trim();
const wholeNumber = (value) => {
  if (value === null || value === undefined || text(value) === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "your",
  "with",
  "this",
  "that",
  "what",
  "how",
  "why",
  "when",
  "where",
  "who",
  "can",
  "could",
  "would",
  "should",
  "does",
  "did",
  "was",
  "were",
  "have",
  "has",
  "had",
  "from",
  "about",
  "into",
  "them",
  "they",
  "their",
  "there",
  "then",
  "than",
  "also",
  "just",
  "like",
  "more",
  "most",
  "some",
  "such",
  "only",
  "very",
  "will",
  "one",
  "two",
  "من",
  "في",
  "على",
  "عن",
  "إلى",
  "الى",
  "هذا",
  "هذه",
  "ذلك",
  "التي",
  "الذي",
  "ما",
  "لماذا",
  "كيف",
  "هل",
  "أن",
  "ان",
  "أو",
  "او",
  "ثم",
  "كل",
  "بعد",
  "قبل",
  "هو",
  "هي",
  "هم",
  "لكن",
  "مع",
  "كان",
]);

export const words = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

/**
 * Validates one imported lesson. A reject names the row so the admin can fix the
 * sheet, and one bad row rejects the whole file: a half-imported subject would
 * leave the tutor answering from a broken scope.
 */
export const validateLessonRow = (row = {}, rowNumber = 2) => {
  const lessonNumber = wholeNumber(row.lessonNumber);
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
    throw fail(
      `Row ${rowNumber}: lesson_number must be a whole number from 1.`,
    );
  }
  const title = text(row.title);
  if (!title) throw fail(`Row ${rowNumber}: lesson_title is required.`);
  if (title.length > 200)
    throw fail(
      `Row ${rowNumber}: lesson_title must be 200 characters or fewer.`,
    );
  const content = text(row.content);
  if (!content) throw fail(`Row ${rowNumber}: content is required.`);
  if (content.length > MAX_LESSON_CONTENT) {
    throw fail(
      `Row ${rowNumber}: content must be ${MAX_LESSON_CONTENT.toLocaleString("en-US")} characters or fewer.`,
    );
  }

  const unitNumber = wholeNumber(row.unitNumber);
  const chapterNumber = wholeNumber(row.chapterNumber);
  if (
    unitNumber !== null &&
    (!Number.isInteger(unitNumber) || unitNumber < 1)
  ) {
    throw fail(`Row ${rowNumber}: unit_number must be a whole number from 1.`);
  }
  if (
    chapterNumber !== null &&
    (!Number.isInteger(chapterNumber) || chapterNumber < 1)
  ) {
    throw fail(
      `Row ${rowNumber}: chapter_number must be a whole number from 1.`,
    );
  }
  const unitTitle = text(row.unitTitle);
  const chapterTitle = text(row.chapterTitle);
  if (unitNumber !== null && !unitTitle)
    throw fail(
      `Row ${rowNumber}: unit_title is required when unit_number is filled.`,
    );
  if (
    unitNumber === null &&
    (unitTitle || chapterNumber !== null || chapterTitle)
  ) {
    throw fail(
      `Row ${rowNumber}: add unit_number before unit_title, chapter_number or chapter_title.`,
    );
  }
  if (chapterNumber !== null && !chapterTitle) {
    throw fail(
      `Row ${rowNumber}: chapter_title is required when chapter_number is filled.`,
    );
  }
  if (chapterNumber === null && chapterTitle) {
    throw fail(`Row ${rowNumber}: add chapter_number before chapter_title.`);
  }

  const toList = (value) =>
    (Array.isArray(value) ? value : String(value ?? "").split("|"))
      .map((item) => text(item))
      .filter(Boolean);
  const standards = [
    ...new Set(toList(row.standards).map((code) => code.toUpperCase())),
  ];
  if (standards.length > 20)
    throw fail(
      `Row ${rowNumber}: a lesson can name no more than 20 standards.`,
    );
  if (standards.some((code) => code.length > 40)) {
    throw fail(
      `Row ${rowNumber}: each standard code must be 40 characters or fewer.`,
    );
  }
  const keywords = [
    ...new Set(toList(row.keywords).map((word) => word.toLowerCase())),
  ].slice(0, 20);

  return {
    unitNumber,
    unitTitle,
    chapterNumber,
    chapterTitle,
    lessonNumber,
    title,
    content,
    standards,
    keywords,
  };
};

/**
 * Validates a whole import. Duplicate slots inside the file are rejected instead
 * of silently overwriting, because two lessons sharing a slot usually means a
 * misspelt unit or chapter number.
 */
export const validateLessonImport = ({ lessons, subjectId, grade } = {}) => {
  if (!subjectId) throw fail("Pick the subject before importing lessons.");
  const gradeNumber = wholeNumber(grade);
  if (!Number.isInteger(gradeNumber) || gradeNumber < 1 || gradeNumber > 12) {
    throw fail("Pick the grade before importing lessons.");
  }
  const rows = Array.isArray(lessons) ? lessons : [];
  if (!rows.length) throw fail("The file has no lesson rows.");
  if (rows.length > MAX_LESSONS_PER_IMPORT) {
    throw fail(
      `A file can hold no more than ${MAX_LESSONS_PER_IMPORT} lessons.`,
    );
  }

  const seen = new Set();
  return rows
    .map((row, index) => {
      const lesson = validateLessonRow(row, index + 2);
      const slot = [
        lesson.unitNumber ?? "-",
        lesson.chapterNumber ?? "-",
        lesson.lessonNumber,
      ].join(":");
      if (seen.has(slot)) {
        throw fail(
          `Row ${index + 2}: lesson ${lesson.lessonNumber} is already used in ` +
            `${lesson.unitTitle || "this file"}${lesson.chapterTitle ? ` / ${lesson.chapterTitle}` : ""}.`,
        );
      }
      seen.add(slot);
      return lesson;
    })
    .sort(
      (left, right) =>
        (left.unitNumber ?? 0) - (right.unitNumber ?? 0) ||
        (left.chapterNumber ?? 0) - (right.chapterNumber ?? 0) ||
        left.lessonNumber - right.lessonNumber,
    );
};

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

const countIn = (haystack, needle) => {
  if (!needle) return 0;
  let total = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && total < 12) {
    total += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return total;
};

/** A lesson's pull on one question: title and keywords first, body last. */
export const scoreLesson = (lesson = {}, terms = []) => {
  const title = String(lesson.title || "").toLowerCase();
  const keywords = (lesson.keywords || []).join(" ").toLowerCase();
  const headings =
    `${lesson.unitTitle || ""} ${lesson.chapterTitle || ""}`.toLowerCase();
  const body = String(lesson.searchText || lesson.content || "").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 8;
    if (keywords.includes(term)) score += 5;
    if (headings.includes(term)) score += 2;
    score += countIn(body, term);
  }
  return score;
};

/**
 * The scope of one answer: the lesson the student opened always comes first, then
 * the lessons that actually mention the question's words.
 */
export const selectLessons = ({
  lessons = [],
  question = "",
  selectedLessonId = null,
} = {}) => {
  const terms = words(question);
  const scorer = lessons.map((lesson) => ({
    lesson,
    score: scoreLesson(lesson, terms),
  }));
  const selected = selectedLessonId
    ? lessons.find((lesson) => String(lesson._id) === String(selectedLessonId))
    : null;

  const picked = [];
  if (selected) picked.push({ lesson: selected, score: Infinity });
  for (const row of scorer.sort((left, right) => right.score - left.score)) {
    if (picked.length >= LESSONS_IN_ANSWER) break;
    if (row.score <= 0) break;
    if (
      picked.some(
        (entry) => String(entry.lesson._id) === String(row.lesson._id),
      )
    )
      continue;
    picked.push(row);
  }
  return picked.map((row) => row.lesson);
};

export const lessonLabel = (lesson = {}) => {
  const unit = lesson.unitTitle
    ? `Unit ${lesson.unitNumber}: ${lesson.unitTitle}`
    : "";
  const chapter = lesson.chapterTitle
    ? `Chapter ${lesson.chapterNumber}: ${lesson.chapterTitle}`
    : "";
  return [unit, chapter, `Lesson ${lesson.lessonNumber}: ${lesson.title}`]
    .filter(Boolean)
    .join(" · ");
};

export const clip = (value, limit) => {
  const source = String(value ?? "");
  if (source.length <= limit) return source;
  return `${source.slice(0, limit)}\n[…lesson continues in the app]`;
};

const shorten = (value, limit) => {
  const source = String(value ?? "").trim();
  return source.length <= limit ? source : `${source.slice(0, limit)}…`;
};

/**
 * Every tutor reply opens with a stage tag on its own line. The tag is how the
 * server knows whether the ladder moved on; it is stripped before the student
 * ever sees the text. A reply without a tag is treated as "not a final answer",
 * so the try counter keeps the student's two attempts available.
 */
const STAGE_TAGS = {
  try: "prompt",
  prompt: "prompt",
  hint: "hint",
  answer: "answer",
};

export const readTutorReply = (value) => {
  const source = String(value ?? "").trim();
  const match = source.match(
    /^\[{1,2}\s*(try|prompt|hint|answer)\s*\]{1,2}[ \t]*\n?/i,
  );
  if (!match) return { stage: "hint", text: source };
  return {
    stage: STAGE_TAGS[match[1].toLowerCase()],
    text: source.slice(match[0].length).trim(),
  };
};

/**
 * How many real attempts the student has made at the question they are on now.
 * The message that opened the question is not an attempt, and a finished
 * explanation closes the ladder so the next question starts over.
 */
export const countTries = (messages = []) => {
  let students = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "student") {
      students += 1;
      continue;
    }
    if (message?.stage === "answer") break;
  }
  return Math.min(MAX_TRIES_BEFORE_ANSWER, Math.max(0, students - 1));
};

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

const LANGUAGE_NAMES = {
  en: "English",
  ar: "Arabic",
};

/* ------------------------------------------------------------------ */
/* Language level                                                      */
/* ------------------------------------------------------------------ */

export const LANGUAGE_LEVELS = ["support", "on_level", "stretch"];

/**
 * Bands a measured reading level against the class grade. Comprehension outranks
 * the level: a student who decodes above grade but understands little still needs
 * the simplest wording. Nothing measured means on-level rather than a guess.
 */
export const readingLevelBand = ({ readingLevel, accuracy, grade } = {}) => {
  const measuredAccuracy = Number(accuracy);
  if (
    accuracy !== null &&
    accuracy !== undefined &&
    accuracy !== "" &&
    Number.isFinite(measuredAccuracy) &&
    measuredAccuracy < 60
  ) {
    return "support";
  }
  const level = Number(readingLevel);
  const gradeNumber = Number(grade);
  if (
    !Number.isFinite(level) ||
    !Number.isFinite(gradeNumber) ||
    gradeNumber < 1
  )
    return null;
  const gap = level - gradeNumber;
  if (gap <= -1) return "support";
  if (gap >= 2) return "stretch";
  return "on_level";
};

/** A teacher's override always wins; otherwise the measured reading level decides. */
export const resolveLanguageLevel = ({
  override,
  readingLevel,
  accuracy,
  grade,
} = {}) =>
  LANGUAGE_LEVELS.includes(override)
    ? override
    : readingLevelBand({ readingLevel, accuracy, grade }) || "on_level";

const LANGUAGE_LEVEL_GUIDANCE = {
  support: `This student needs language support.
- Use short, simple sentences (under 12 words) and everyday words.
- Explain any subject word the first time you use it, in one short phrase.
- One idea at a time. At most two points.
- Keep every reply under 80 words. Avoid idioms and long examples.`,
  on_level: `This student reads at their grade level.
- Use clear, everyday words and short sentences.
- Up to three points, each explained in one sentence.
- Keep every reply under 120 words.`,
  stretch: `This student is a strong reader for their grade.
- Use precise subject vocabulary; explain any word above grade level in a short phrase.
- Up to three points, each stated crisply.
- Keep every reply under 140 words.`,
};

export const languageLevelGuidance = (level) =>
  LANGUAGE_LEVEL_GUIDANCE[LANGUAGE_LEVELS.includes(level) ? level : "on_level"];

/**
 * The tutor may only speak from the lessons handed to it. The student's name is
 * never part of this prompt: the model addresses "you" and knows nothing about
 * who the student is.
 */
export const buildTutorPrompt = ({
  question,
  lessons = [],
  standards = [],
  subjectName = "this subject",
  grade = "",
  language = "en",
  languageLevel = "on_level",
  selectedLesson = null,
  history = [],
  tries = 0,
}) => {
  const languageName =
    LANGUAGE_NAMES[String(language).slice(0, 2)] || LANGUAGE_NAMES.en;
  const lessonBlocks = lessons
    .map((lesson) => {
      const code = lesson.standards?.length
        ? ` (standards: ${lesson.standards.join(", ")})`
        : "";
      return `[${lessonLabel(lesson)}]${code}\n${clip(lesson.content, LESSON_CHARS_IN_ANSWER)}`;
    })
    .join("\n\n");
  const standardsBlock = standards
    .slice(0, STANDARDS_IN_ANSWER)
    .map(
      (standard) =>
        `- ${standard.code}: ${clip(standard.description || standard.name || "", 300)}`,
    )
    .join("\n");
  const historyBlock = history
    .slice(-HISTORY_IN_PROMPT)
    .map(
      (message) =>
        `${message.role === "student" ? "Student" : "You"}: ${shorten(message.text, HISTORY_MESSAGE_CHARS)}`,
    )
    .join("\n");
  const attempts = Math.min(
    MAX_TRIES_BEFORE_ANSWER,
    Math.max(0, Number(tries) || 0),
  );

  const ladder =
    attempts === 0
      ? `The student has not tried yet. Do NOT explain, hint or give the answer.
Ask them to explain in their own words what they already understand about this, or to make a first try.
Keep it to one or two friendly sentences.
If they are instead explaining back something you just taught them, check their explanation and correct what is wrong; do not ask them to explain again.`
      : attempts === 1
        ? `The student has tried once. Start with one short sentence that says plainly whether their answer is right, partly right, or not right — for a matching or multi-part answer, say which parts were right.
Then give ONE hint only — a single nudge, clue or leading question that moves them one step closer.
Do NOT explain the whole idea and do NOT give the answer. Finish by asking them to try again.`
        : `The student has tried ${attempts} times. Start with one short sentence that says plainly whether their answer is right, partly right, or not right.
You may now explain the idea fully, step by step.
After the explanation, ask the student to explain it back in their own words so you can check it.`;

  return `You are a patient ${subjectName} tutor for one student in grade ${grade}. You coach; the student does the thinking.

WHAT YOU MAY ANSWER FROM
Use ONLY the lesson material below. Do not use outside knowledge, and never invent facts, dates, formulas, names or page numbers.
${selectedLesson ? `The student opened this lesson: ${lessonLabel(selectedLesson)}.\n` : ""}
LESSON MATERIAL
${lessonBlocks || "(no lesson material matched this question)"}

${standardsBlock ? `STANDARDS THIS GRADE MUST MASTER\n${standardsBlock}\n` : ""}
${historyBlock ? `CONVERSATION SO FAR\n${historyBlock}\n\n` : ""}HOW THIS TURN MUST GO
${ladder}

HOW YOU TEACH
- The student explains things back. You do not lecture unless they have tried twice.
- When the student answers a question, your first sentence says plainly whether it is right, partly right, or not right. Never reply to an attempt with only encouragement or "try again".
- One hint at a time. Never stack two hints or slip the answer into a hint.
- Reply in ${languageName} only. Write plain text: no markdown headings, no tables, no code fences.
- Short paragraphs. A short numbered list only when giving steps.
- If the question is not covered by the lesson material, say exactly that in one sentence, name the closest lesson you can see, and offer to explain what that lesson does cover. Never fill the gap with invented content.
- If the student asks about another subject or something personal, say you only help with ${subjectName} lessons for grade ${grade} and name one lesson you can help with.
- Never mention the student's name, class, school, teacher or any personal detail. Address the student as "you".
- Do not hand over finished homework. Guide, then check.

HOW YOU TALK TO THIS STUDENT
${languageLevelGuidance(languageLevel)}

REPLY FORMAT
Start every reply with one tag on its own line, then your reply on the next line:
[TRY] when you ask the student to try or explain back
[HINT] when you give a single hint
[ANSWER] when you give the full explanation
The tag is removed before the student reads your reply, so never repeat it in the text.

STUDENT MESSAGE
${text(question)}`;
};

export const VOICE_BLOCKS_MAX = 3;
export const VOICE_BLOCK_ITEMS_MAX = 4;
export const VOICE_CONTRAST_ITEMS_MAX = 3;
export const VOICE_COMPARE_COLUMNS_MAX = 3;
export const VOICE_COMPARE_POINTS_MAX = 3;
export const VOICE_TIMELINE_MAX = 5;
export const VOICE_POINT_WORDS = 15;
export const VOICE_REPLY_MAX_CHARS = 700;

const VOICE_BLOCK_TYPES = [
  "bullets",
  "contrast",
  "example",
  "steps",
  "keyIdea",
  "compare",
  "evidence",
  "timeline",
  "mistake",
  "recap",
  "math",
];
const VOICE_ITEM_CHARS = 200;
const VOICE_MATH_CHARS = 120;

/** Check-question types the board can answer, in the order the tutor cycles them. */
export const VOICE_QUESTION_TYPES = ["short", "mcq", "yesno", "match"];
const VOICE_QUESTION_LABELS = {
  short: "short-answer",
  mcq: "multiple-choice",
  yesno: "yes/no",
  match: "matching",
};

/** The server, not the model, picks the next type so a session never repeats one shape. */
export const nextQuestionType = (board = []) => {
  const last = [...board].reverse().find((message) => message.role === "tutor");
  const index = VOICE_QUESTION_TYPES.indexOf(last?.questionType || "short");
  return VOICE_QUESTION_TYPES[(index + 1) % VOICE_QUESTION_TYPES.length];
};
const VOICE_LEAD_CHARS = 280;
const VOICE_FOLLOWUP_CHARS = 220;

/**
 * The spoken tutor. Same grounding and the same try-hint-answer ladder as the
 * text tutor, but every reply is a short spoken turn shaped as JSON so the board
 * can lay out typed blocks and the voice can read them without symbols. A reply
 * may carry no blocks at all: a one-line answer stays one line.
 */
export const buildVoicePrompt = ({
  transcript,
  lessons = [],
  standards = [],
  subjectName = "this subject",
  grade = "",
  language = "en",
  languageLevel = "on_level",
  lesson = null,
  board = [],
  tries = 0,
  assessmentMode = false,
  questionType = "",
}) => {
  const languageName =
    LANGUAGE_NAMES[String(language).slice(0, 2)] || LANGUAGE_NAMES.en;
  const lessonBlocks = lessons
    .map((row) => {
      const code = row.standards?.length
        ? ` (standards: ${row.standards.join(", ")})`
        : "";
      return `[${lessonLabel(row)}]${code}\n${clip(row.content, LESSON_CHARS_IN_ANSWER)}`;
    })
    .join("\n\n");
  const standardsBlock = standards
    .slice(0, STANDARDS_IN_ANSWER)
    .map(
      (standard) =>
        `- ${standard.code}: ${clip(standard.description || standard.name || "", 300)}`,
    )
    .join("\n");
  const boardBlock = board
    .slice(-8)
    .map((message) =>
      message.role === "student"
        ? `Student said: ${shorten(message.text, 300)}`
        : `You said: ${shorten(message.spoken || message.text, 400)}`,
    )
    .join("\n");
  const attempts = Math.min(
    MAX_TRIES_BEFORE_ANSWER,
    Math.max(0, Number(tries) || 0),
  );

  const teachingLadder =
    attempts === 0
      ? `The student has not tried yet. Do NOT explain, hint or give the answer.
Ask them to say in their own words what they already understand, or to make a first try.
If they are instead explaining back something you just taught them, check it and correct what is wrong.`
      : attempts === 1
        ? `The student has tried once. The first sentence of "lead" must say plainly whether their answer is right, partly right, or not right.
Then give ONE hint only — a single nudge or leading question.
Do NOT explain the whole idea or reveal the answer in the lead or blocks. Ask them to try again only if the answer has not already been revealed in this session.`
        : `The student has tried ${attempts} times. The first sentence of "lead" must say plainly whether their answer is right, partly right, or not right.
Then you may explain the idea fully, one step at a time.
Then ask a different question that checks understanding, such as why or how the idea works.`;

  const guidedCheckLadder =
    attempts === 0
      ? `You are in guided check mode. Start with a short understanding check question.
Do NOT reveal the final answer in the lead, blocks or follow-up.`
      : attempts === 1
        ? `The student has tried once. First say plainly, in one short sentence, whether their answer is right, partly right, or not right — for a matching answer, say which pairs were right and which were not.
Then give ONE hint and ask one more check question. Do NOT reveal the final answer.`
        : `The student has tried ${attempts} times. Say plainly in one short sentence whether their answer was right, partly right, or not right, then give a small scaffold.
Keep the final answer hidden, then ask a fresh check question that tests the same idea.`;

  const ladder = assessmentMode ? guidedCheckLadder : teachingLadder;

  return `You are a warm, patient ${subjectName} tutor talking out loud with one student in grade ${grade}.
Everything you write is spoken aloud by a voice. Never write anything that only works on a screen.

WHAT YOU MAY ANSWER FROM
Use ONLY the lesson material below. Do not use outside knowledge, and never invent facts, dates, formulas, names or page numbers.
${lesson ? `The student chose this lesson: ${lessonLabel(lesson)}.\n` : ""}
LESSON MATERIAL
${lessonBlocks || "(no lesson material matched this question)"}

${standardsBlock ? `STANDARDS THIS GRADE MUST MASTER\n${standardsBlock}\n` : ""}
${boardBlock ? `BOARD SO FAR (this session)\n${boardBlock}\n\n` : ""}HOW THIS TURN MUST GO
${ladder}

HOW YOU TALK
${languageLevelGuidance(languageLevel)}
- Speak ${languageName} only, including every item and the follow-up question.
- Short spoken sentences. Contractions are welcome. Sound like a kind teacher, not a textbook.
- Numbers, symbols and formulas are said in words, except the screen text of a math block. No markdown, no bullet characters, no emoji, no code.
- If the lesson material does not cover the question, say exactly that in one short sentence, name the closest lesson, and offer what it does cover.
- If the student asks about another subject or something personal, say you only help with ${subjectName} lessons for grade ${grade}.
- Never mention the student's name, class, school, teacher or any personal detail.
- Do not hand over finished homework. Guide, then check.
- When the student has just answered a question, "lead" opens with a clear verdict — right, partly right, or not right. For a matching answer, name which pairs were right. Never answer an attempt with only praise or "try again".

REPLY FORMAT
Return exactly one JSON object and nothing else:
${
  assessmentMode
    ? '{"stage":"prompt|hint|answer","questionType":"short|mcq|yesno|match","lead":"one or two short sentences","emphasis":"a few words copied from lead, or empty","blocks":[{"type":"bullets","items":["short point"]}],"followUp":"one short question","options":["only for multiple-choice: three or four short answers"]}'
    : '{"stage":"prompt|hint|answer","lead":"one or two short sentences","emphasis":"a few words copied from lead, or empty","blocks":[{"type":"bullets","items":["short point"]}],"followUp":"one short question"}'
}
- "stage" follows how this turn must go: prompt for an invitation to try, hint for one hint, answer for a full explanation.${assessmentMode ? ' In guided check mode, use "prompt" or "hint" by default; use "answer" only if the student explicitly asks for the full answer.' : ""}
- "lead" reacts to what the student just said, in one or two sentences. The board shows it largest.
- "emphasis" repeats the one word or phrase inside "lead" that the board should underline. Copy it exactly. Leave it empty when nothing deserves the underline.
- "blocks" holds up to three blocks, each a different type. A turn that teaches (explains, corrects or wraps up) uses two or three. A turn that only gives a hint or asks a check question uses one or none, so the blocks never give away what you ask. Never pad with a block that adds nothing.
  {"type":"bullets","items":["...","..."]} — two to four short parallel points.
  {"type":"contrast","items":[{"word":"and","text":"adds another idea"},{"word":"but","text":"shows a difference"}]} — two or three words, each with the job it does.
  {"type":"example","text":"one concrete example"} — one sentence.
  {"type":"steps","items":["...","..."]} — two to four steps in order.
  {"type":"keyIdea","text":"one sentence worth remembering"} — the idea to keep.
  {"type":"compare","items":[{"heading":"gas","points":["no fixed shape","spreads out"]},{"heading":"liquid","points":["no fixed shape","stays together"]}]} — two or three columns, each with a short heading and one to three short points. Use it to set things side by side.
  {"type":"timeline","items":[{"label":"first","text":"what happens"},{"label":"then","text":"what happens next"}]} — three to five events or stages in order. A label is a date, a word like first, or a short name.
  {"type":"evidence","text":"words copied exactly from the lesson material"} — one short quote under 200 characters, copied word for word from the lesson material. The board adds the lesson name. Use it when the lesson's own words prove the point; skip it if you cannot copy a line exactly.
  {"type":"mistake","text":"a common slip","fix":"the right idea"} — one common mistake and how to fix it. Use it when the student slipped or a slip is likely.
  {"type":"recap","items":["...","..."]} — two to four things learned. Use it only when wrapping up an idea, never on a hint.
  {"type":"math","text":"3/4 + 1/4 = 1","spoken":"three quarters plus one quarter equals one"} — a formula or worked line. "text" is for the screen only, in plain characters (digits and + − × ÷ = / ^). "spoken" says the same in words.
- Every list item is under ${VOICE_POINT_WORDS} words and a plain sentence: no numbering, no bullet characters, no symbols.
- "followUp" is one short question that makes the student think or answer back.
- Consider the entire response and BOARD SO FAR when choosing the follow-up. If the answer has already been spoken or shown, do not ask the student to list or repeat it; instead ask a different question that checks understanding. If asking the student to retry, do not reveal the answer anywhere in the response.
${
  assessmentMode
    ? `- Guided check mode rules: evaluate what the student just answered, then ask exactly one new check question.
- Rotate question types across turns: short answer, multiple-choice, yes/no, and matching.${VOICE_QUESTION_TYPES.includes(questionType) ? ` This turn, ask a ${VOICE_QUESTION_LABELS[questionType]} question and set "questionType" to "${questionType}".` : ""}
- For multiple-choice, write the question itself in "followUp" and give three or four possible answers in "options": a JSON array of short strings, a few words each, with no letters or numbers in front. Every option must be a possible answer to the question. Never put the question, a hint, an explanation or a statement in "options", and never use a "steps" block for them.
- For yes/no, make the follow-up one statement or question the student answers with yes or no, and leave "options" out. They may then explain why aloud.
- For matching, put two or three pairs in one "contrast" block.
- Never use compare, timeline, evidence, mistake, recap or math to show the answer to the question you are asking.
- Never reveal the final answer key, the correct option letter, or a full model answer unless the student explicitly asks for it.`
    : ""
}

STUDENT SAID
${text(transcript)}`;
};

/**
 * The first thing a student hears when a voice lesson opens: a warm greeting, a
 * hook drawn from the chosen lesson, and one warm-up question. Generated from the
 * lesson content and the student's language level, never a fixed template.
 */
export const buildVoiceOpeningPrompt = ({
  lessons = [],
  standards = [],
  subjectName = "this subject",
  grade = "",
  language = "en",
  languageLevel = "on_level",
  lesson = null,
}) => {
  const languageName =
    LANGUAGE_NAMES[String(language).slice(0, 2)] || LANGUAGE_NAMES.en;
  const lessonBlocks = lessons
    .map((row) => {
      const code = row.standards?.length
        ? ` (standards: ${row.standards.join(", ")})`
        : "";
      return `[${lessonLabel(row)}]${code}\n${clip(row.content, LESSON_CHARS_IN_ANSWER)}`;
    })
    .join("\n\n");
  const standardsBlock = standards
    .slice(0, STANDARDS_IN_ANSWER)
    .map(
      (standard) =>
        `- ${standard.code}: ${clip(standard.description || standard.name || "", 300)}`,
    )
    .join("\n");

  return `You are a warm, patient ${subjectName} tutor opening a spoken lesson with one student in grade ${grade}.
This is the very first thing the student hears. Everything you write is spoken aloud by a voice.

WHAT YOU MAY USE
Use ONLY the lesson material below for the hook. Do not use outside knowledge, and never invent facts, dates, formulas, names or page numbers.
${lesson ? `The student chose this lesson: ${lessonLabel(lesson)}.\n` : ""}
LESSON MATERIAL
${lessonBlocks || "(no lesson material matched)"}

${standardsBlock ? `STANDARDS THIS GRADE MUST MASTER\n${standardsBlock}\n` : ""}
HOW THIS OPENING MUST GO
- Greet the student warmly in one short sentence. No name, no personal detail.
- Give ONE hook: a single interesting idea or observation drawn from this lesson's material, to make them curious.
- Then ask ONE warm-up question they can answer from what they already know or have seen in everyday life — not from the lesson's answer.
- Do NOT explain the lesson, give a hint, or reveal the answer. You are opening a conversation, not teaching yet.
- Keep the whole opening short: a greeting, a hook, and one question.

HOW YOU TALK
${languageLevelGuidance(languageLevel)}
- Speak ${languageName} only, including the follow-up question.
- Short spoken sentences. Contractions are welcome. Sound like a kind teacher, not a textbook.
- Numbers, symbols and formulas are said in words. No markdown, no bullet characters, no emoji, no code.
- Never mention the student's name, class, school, teacher or any personal detail.

REPLY FORMAT
Return exactly one JSON object and nothing else:
{"stage":"opening","lead":"the greeting and hook, one or two short sentences","emphasis":"a few words copied from lead, or empty","blocks":[],"followUp":"one short warm-up question"}
- "stage" is always "opening".
- "lead" is the greeting plus the hook. The board shows it largest.
- "emphasis" repeats one word or phrase inside "lead" to underline, copied exactly, or empty.
- "blocks" is usually empty for an opening; at most one short "example" or "keyIdea" block if it truly helps the hook.
- "followUp" is the single warm-up question.`;
};

const voiceBlockText = (value) => shorten(text(value), VOICE_ITEM_CHARS);

/** Letters and digits only, so a quote still matches when punctuation or spacing differs. */
const quoteKey = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const lessonHoldingQuote = (quote, lessons) => {
  const wanted = quoteKey(quote);
  if (wanted.length < 12) return null;
  return lessons.find((row) => quoteKey(row?.content).includes(wanted)) || null;
};

const asSentence = (value) => (/[.!?؟]$/.test(value) ? value : `${value}.`);

/** One typed block, normalized. A list of one is not a list, so it is dropped. */
const readVoiceBlock = (raw, lessons = []) => {
  const type = text(raw?.type);
  if (!VOICE_BLOCK_TYPES.includes(type)) return null;
  if (type === "bullets" || type === "steps" || type === "recap") {
    const items = (Array.isArray(raw?.items) ? raw.items : [])
      .map((item) =>
        voiceBlockText(typeof item === "string" ? item : item?.text),
      )
      .filter(Boolean)
      .slice(0, VOICE_BLOCK_ITEMS_MAX);
    return items.length >= 2 ? { type, items } : null;
  }
  if (type === "contrast") {
    const items = (Array.isArray(raw?.items) ? raw.items : [])
      .map((item) => ({
        word: shorten(text(item?.word), 40),
        text: voiceBlockText(item?.text),
      }))
      .filter((item) => item.word && item.text)
      .slice(0, VOICE_CONTRAST_ITEMS_MAX);
    return items.length >= 2 ? { type, items } : null;
  }
  if (type === "compare") {
    const items = (Array.isArray(raw?.items) ? raw.items : [])
      .map((item) => ({
        heading: shorten(text(item?.heading), 40),
        points: (Array.isArray(item?.points) ? item.points : [])
          .map(voiceBlockText)
          .filter(Boolean)
          .slice(0, VOICE_COMPARE_POINTS_MAX),
      }))
      .filter((item) => item.heading && item.points.length)
      .slice(0, VOICE_COMPARE_COLUMNS_MAX);
    return items.length >= 2 ? { type, items } : null;
  }
  if (type === "timeline") {
    const items = (Array.isArray(raw?.items) ? raw.items : [])
      .map((item) => ({
        label: shorten(text(item?.label), 40),
        text: voiceBlockText(item?.text),
      }))
      .filter((item) => item.label && item.text)
      .slice(0, VOICE_TIMELINE_MAX);
    return items.length >= 2 ? { type, items } : null;
  }
  if (type === "evidence") {
    // A quote the lesson does not contain is dropped, never shown as the lesson's words.
    const quote = text(raw?.text);
    if (!quote || quote.length > VOICE_ITEM_CHARS) return null;
    const lesson = lessonHoldingQuote(quote, lessons);
    return lesson
      ? { type, text: quote, source: shorten(lessonLabel(lesson), 120) }
      : null;
  }
  if (type === "mistake") {
    const slip = voiceBlockText(raw?.text);
    const fix = voiceBlockText(raw?.fix);
    return slip && fix ? { type, text: slip, fix } : null;
  }
  if (type === "math") {
    // The voice cannot read symbols, so a formula without its spoken wording is dropped.
    const display = shorten(text(raw?.text), VOICE_MATH_CHARS);
    const spoken = voiceBlockText(raw?.spoken);
    return display && spoken ? { type, text: display, spoken } : null;
  }
  const body = voiceBlockText(raw?.text);
  return body ? { type, text: body } : null;
};

/**
 * The answer choices for a multiple-choice question. A line that is the question
 * itself, or any question, is not a choice, so a model that slips the question
 * into the list cannot shift every option down a letter.
 */
const VOICE_OPTION_CHARS = 90;
const readChoiceOptions = (raw, { followUp = "", lead = "" } = {}) => {
  const banned = new Set([quoteKey(followUp), quoteKey(lead)].filter(Boolean));
  const seen = new Set();
  const options = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const option = shorten(
      text(typeof item === "string" ? item : item?.text).replace(
        /^[A-Da-d][.):]\s+/,
        "",
      ),
      VOICE_OPTION_CHARS,
    );
    const key = quoteKey(option);
    if (!option || /[?\u061f]/.test(option) || banned.has(key) || seen.has(key))
      continue;
    seen.add(key);
    options.push(option);
  }
  return options.length >= 3 ? options.slice(0, 4) : [];
};

const blockAsSpeech = (block) => {
  switch (block.type) {
    case "contrast":
      return block.items.map((item) => `${item.word} ${item.text}`).join(", ");
    case "compare":
      return block.items
        .map(
          (item) => `${item.heading}. ${item.points.map(asSentence).join(" ")}`,
        )
        .join(" ");
    case "timeline":
      return block.items
        .map((item) => `${item.label}, ${asSentence(item.text)}`)
        .join(" ");
    case "mistake":
      return `${asSentence(block.text)} ${asSentence(block.fix)}`;
    case "math":
      return block.spoken;
    default:
      return Array.isArray(block.items) ? block.items.join(" ") : block.text;
  }
};

/**
 * One spoken segment per part the board shows, in board order. The voice then
 * moves through lead, blocks and follow-up one clip at a time, so a part can be
 * revealed exactly when it is said instead of all at once.
 */
export const voiceSpeechSegments = ({
  lead = "",
  blocks = [],
  followUp = "",
  options = [],
} = {}) => {
  const raw = [];
  if (lead) raw.push({ kind: "lead", text: lead });
  blocks.forEach((block, index) => {
    const text = blockAsSpeech(block);
    if (text) raw.push({ kind: "block", index, text });
  });
  // Choices are read right after their question, as part of the same board card.
  if (followUp)
    raw.push({
      kind: "followUp",
      text: options.length ? `${followUp} ${options.join(", ")}.` : followUp,
    });

  // The old single-clip cap still applies, so segment text never speaks more
  // than the stored "spoken" reply contains.
  let budget = VOICE_REPLY_MAX_CHARS;
  const segments = [];
  for (const segment of raw) {
    if (budget <= 0) break;
    const text = segment.text.slice(0, budget).trim();
    if (text) segments.push({ ...segment, text });
    budget -= segment.text.length + 1;
  }
  return segments;
};

/** Parses the spoken reply. A reply that is not usable JSON is rejected, never guessed at. */
export const readVoiceReply = (value, { lessons = [] } = {}) => {
  const source = String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  const lead = shorten(text(parsed?.lead), VOICE_LEAD_CHARS);
  const emphasisRaw = text(parsed?.emphasis);
  const emphasis =
    emphasisRaw && emphasisRaw.length <= 60 && lead.includes(emphasisRaw)
      ? emphasisRaw
      : "";
  const seenTypes = new Set();
  const blocks = (Array.isArray(parsed?.blocks) ? parsed.blocks : [])
    .map((raw) => readVoiceBlock(raw, lessons))
    .filter(Boolean)
    // One block per type keeps a page varied instead of repeating a shape.
    .filter((block) => !seenTypes.has(block.type) && seenTypes.add(block.type))
    .slice(0, VOICE_BLOCKS_MAX);
  // Old sessions and any model that still answers with "points" keep working.
  if (!blocks.length && Array.isArray(parsed?.points)) {
    const points = parsed.points
      .map(voiceBlockText)
      .filter(Boolean)
      .slice(0, VOICE_BLOCK_ITEMS_MAX);
    if (points.length) blocks.push({ type: "bullets", items: points });
  }
  const followUp = shorten(text(parsed?.followUp), VOICE_FOLLOWUP_CHARS);
  const stage = ["opening", "prompt", "hint", "answer"].includes(parsed?.stage)
    ? parsed.stage
    : "hint";
  if (!lead && !blocks.length && !followUp) return null;
  // Choices need their own options list; without one the question is a plain short answer.
  const asked = text(parsed?.questionType);
  const options =
    asked === "mcq" && followUp
      ? readChoiceOptions(parsed?.options, { followUp, lead })
      : [];
  const questionType =
    asked === "mcq" && options.length
      ? "mcq"
      : asked === "match" && blocks.some((block) => block.type === "contrast")
        ? "match"
        : asked === "yesno" && followUp
          ? "yesno"
          : followUp
            ? "short"
            : "";
  const segments = voiceSpeechSegments({ lead, blocks, followUp, options });
  const spoken = segments.map((segment) => segment.text).join(" ");
  return {
    stage,
    questionType,
    lead,
    emphasis,
    blocks,
    followUp,
    options,
    spoken,
    segments,
  };
};

export const buildPracticePrompt = ({
  lessons = [],
  standards = [],
  subjectName = "this subject",
  grade = "",
  language = "en",
}) => {
  const languageName =
    LANGUAGE_NAMES[String(language).slice(0, 2)] || LANGUAGE_NAMES.en;
  const lessonBlocks = lessons
    .map(
      (lesson) =>
        `[${lessonLabel(lesson)}]\n${clip(lesson.content, LESSON_CHARS_IN_ANSWER)}`,
    )
    .join("\n\n");
  const standardsBlock = standards
    .slice(0, STANDARDS_IN_ANSWER)
    .map(
      (standard) =>
        `- ${standard.code}: ${clip(standard.description || standard.name || "", 200)}`,
    )
    .join("\n");

  return `Build ${PRACTICE_QUESTION_COUNT} exam-style multiple-choice questions for one student in grade ${grade} on ${subjectName}.

Use ONLY the lesson material below. Every question must be answerable from it.

LESSON MATERIAL
${lessonBlocks}

${standardsBlock ? `STANDARDS\n${standardsBlock}\n` : ""}
RULES
- Write in ${languageName} only.
- Exactly ${PRACTICE_OPTION_COUNT} options per question, one clearly correct.
- Vary the difficulty: two recall, two understanding, one application.
- Never mention the student's name or any personal detail.
- Return ONLY one JSON object, with no markdown:
{"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}
"answer" is the zero-based index of the correct option.`;
};

/* ------------------------------------------------------------------ */
/* Practice                                                            */
/* ------------------------------------------------------------------ */

const normalizeOptions = (value) =>
  (Array.isArray(value) ? value : [])
    .map((option) => text(option))
    .filter(Boolean);

/** Tolerant parser for the model's question list; anything malformed is dropped. */
export const normalizePracticeQuestions = (parsed) => {
  const rows = Array.isArray(parsed?.questions)
    ? parsed.questions
    : Array.isArray(parsed)
      ? parsed
      : [];
  const seen = new Set();
  const questions = [];
  for (const row of rows) {
    const question = text(row?.question);
    const options = normalizeOptions(row?.options);
    if (!question || options.length < 2 || options.length > 6) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;

    let correctIndex = Number(row?.correctIndex ?? row?.answer);
    if (!Number.isInteger(correctIndex) && typeof row?.answer === "string") {
      correctIndex = options.findIndex(
        (option) => option.toLowerCase() === text(row.answer).toLowerCase(),
      );
    }
    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= options.length
    )
      continue;

    seen.add(key);
    questions.push({
      question,
      options,
      correctIndex,
      explanation: text(row?.explanation),
    });
    if (questions.length >= PRACTICE_QUESTION_COUNT) break;
  }
  return questions;
};

/**
 * Marks a finished set. Anything unanswered counts as wrong, and an out-of-range
 * choice is rejected instead of being quietly discounted.
 */
export const gradePractice = (questions = [], answers = []) => {
  if (!Array.isArray(questions) || !questions.length)
    throw fail("This practice set has no questions.");
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    throw fail("Answer every question before you submit the set.");
  }
  const results = questions.map((question, index) => {
    const choiceIndex = Number(answers[index]);
    if (
      !Number.isInteger(choiceIndex) ||
      choiceIndex < 0 ||
      choiceIndex >= (question.options || []).length
    ) {
      throw fail(`Question ${index + 1} has no valid answer.`);
    }
    return {
      choiceIndex,
      correct: choiceIndex === Number(question.correctIndex),
    };
  });
  return {
    results,
    score: results.filter((row) => row.correct).length,
    total: questions.length,
  };
};

/* ------------------------------------------------------------------ */
/* Access and credit                                                   */
/* ------------------------------------------------------------------ */

/** The school switch plus the class switch, in that order. */
export const resolveAccess = ({
  settings,
  classAccess,
  walletPaid = false,
} = {}) => {
  if (!settings?.enabled) return { allowed: false, reason: "school_off" };
  if (classAccess?.status === "locked")
    return { allowed: false, reason: "class_locked" };
  if (classAccess?.status === "paused")
    return { allowed: false, reason: "class_paused" };
  if (walletPaid) return { allowed: false, reason: "wallet_paused" };
  return { allowed: true, reason: "" };
};

/** What the student needs to be told about their own credit, in plain words. */
export const walletNotice = ({
  credits = 0,
  lowThreshold = FREE_AFTER_CREDITS,
} = {}) => {
  const left = Math.max(0, Number(credits) || 0);
  if (left <= 0) return { level: "empty", credits: 0 };
  if (left <= lowThreshold) return { level: "low", credits: left };
  return { level: "ok", credits: left };
};

export const clampCredits = (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw fail("Credits must be a whole number, zero or more.");
  }
  if (number > 1000)
    throw fail("The most you can give at once is 1000 questions.");
  return number;
};

export const summarizeLessonsByUnit = (lessons = []) => {
  const units = new Map();
  for (const lesson of lessons) {
    const key = lesson.unitNumber == null ? "flat" : `u${lesson.unitNumber}`;
    if (!units.has(key)) {
      units.set(key, {
        unitNumber: lesson.unitNumber ?? null,
        unitTitle: lesson.unitTitle || "",
        chapters: new Map(),
        lessons: [],
      });
    }
    const unit = units.get(key);
    if (lesson.chapterNumber == null) {
      unit.lessons.push(lesson);
      continue;
    }
    const chapterKey = `c${lesson.chapterNumber}`;
    if (!unit.chapters.has(chapterKey)) {
      unit.chapters.set(chapterKey, {
        chapterNumber: lesson.chapterNumber,
        chapterTitle: lesson.chapterTitle || "",
        lessons: [],
      });
    }
    unit.chapters.get(chapterKey).lessons.push(lesson);
  }
  return [...units.values()]
    .sort((left, right) => (left.unitNumber ?? 0) - (right.unitNumber ?? 0))
    .map((unit) => ({
      ...unit,
      chapters: [...unit.chapters.values()].sort(
        (left, right) => left.chapterNumber - right.chapterNumber,
      ),
    }));
};
