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

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const text = (value) => String(value ?? '').trim();
const wholeNumber = (value) => {
    if (value === null || value === undefined || text(value) === '') return null;
    const number = Number(value);
    return Number.isInteger(number) ? number : NaN;
};

const STOPWORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this', 'that', 'what', 'how',
    'why', 'when', 'where', 'who', 'can', 'could', 'would', 'should', 'does', 'did', 'was', 'were',
    'have', 'has', 'had', 'from', 'about', 'into', 'them', 'they', 'their', 'there', 'then', 'than',
    'also', 'just', 'like', 'more', 'most', 'some', 'such', 'only', 'very', 'will', 'one', 'two',
    'من', 'في', 'على', 'عن', 'إلى', 'الى', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'ما', 'لماذا', 'كيف',
    'هل', 'أن', 'ان', 'أو', 'او', 'ثم', 'كل', 'بعد', 'قبل', 'هو', 'هي', 'هم', 'لكن', 'مع', 'كان'
]);

export const words = (value) => String(value ?? '')
    .normalize('NFKC')
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
        throw fail(`Row ${rowNumber}: lesson_number must be a whole number from 1.`);
    }
    const title = text(row.title);
    if (!title) throw fail(`Row ${rowNumber}: lesson_title is required.`);
    if (title.length > 200) throw fail(`Row ${rowNumber}: lesson_title must be 200 characters or fewer.`);
    const content = text(row.content);
    if (!content) throw fail(`Row ${rowNumber}: content is required.`);
    if (content.length > MAX_LESSON_CONTENT) {
        throw fail(`Row ${rowNumber}: content must be ${MAX_LESSON_CONTENT.toLocaleString('en-US')} characters or fewer.`);
    }

    const unitNumber = wholeNumber(row.unitNumber);
    const chapterNumber = wholeNumber(row.chapterNumber);
    if (unitNumber !== null && (!Number.isInteger(unitNumber) || unitNumber < 1)) {
        throw fail(`Row ${rowNumber}: unit_number must be a whole number from 1.`);
    }
    if (chapterNumber !== null && (!Number.isInteger(chapterNumber) || chapterNumber < 1)) {
        throw fail(`Row ${rowNumber}: chapter_number must be a whole number from 1.`);
    }
    const unitTitle = text(row.unitTitle);
    const chapterTitle = text(row.chapterTitle);
    if (unitNumber !== null && !unitTitle) throw fail(`Row ${rowNumber}: unit_title is required when unit_number is filled.`);
    if (unitNumber === null && (unitTitle || chapterNumber !== null || chapterTitle)) {
        throw fail(`Row ${rowNumber}: add unit_number before unit_title, chapter_number or chapter_title.`);
    }
    if (chapterNumber !== null && !chapterTitle) {
        throw fail(`Row ${rowNumber}: chapter_title is required when chapter_number is filled.`);
    }
    if (chapterNumber === null && chapterTitle) {
        throw fail(`Row ${rowNumber}: add chapter_number before chapter_title.`);
    }

    const toList = (value) => (Array.isArray(value) ? value : String(value ?? '').split('|'))
        .map((item) => text(item))
        .filter(Boolean);
    const standards = [...new Set(toList(row.standards).map((code) => code.toUpperCase()))];
    if (standards.length > 20) throw fail(`Row ${rowNumber}: a lesson can name no more than 20 standards.`);
    if (standards.some((code) => code.length > 40)) {
        throw fail(`Row ${rowNumber}: each standard code must be 40 characters or fewer.`);
    }
    const keywords = [...new Set(toList(row.keywords).map((word) => word.toLowerCase()))].slice(0, 20);

    return {
        unitNumber,
        unitTitle,
        chapterNumber,
        chapterTitle,
        lessonNumber,
        title,
        content,
        standards,
        keywords
    };
};

/**
 * Validates a whole import. Duplicate slots inside the file are rejected instead
 * of silently overwriting, because two lessons sharing a slot usually means a
 * misspelt unit or chapter number.
 */
export const validateLessonImport = ({ lessons, subjectId, grade } = {}) => {
    if (!subjectId) throw fail('Pick the subject before importing lessons.');
    const gradeNumber = wholeNumber(grade);
    if (!Number.isInteger(gradeNumber) || gradeNumber < 1 || gradeNumber > 12) {
        throw fail('Pick the grade before importing lessons.');
    }
    const rows = Array.isArray(lessons) ? lessons : [];
    if (!rows.length) throw fail('The file has no lesson rows.');
    if (rows.length > MAX_LESSONS_PER_IMPORT) {
        throw fail(`A file can hold no more than ${MAX_LESSONS_PER_IMPORT} lessons.`);
    }

    const seen = new Set();
    return rows.map((row, index) => {
        const lesson = validateLessonRow(row, index + 2);
        const slot = [lesson.unitNumber ?? '-', lesson.chapterNumber ?? '-', lesson.lessonNumber].join(':');
        if (seen.has(slot)) {
            throw fail(
                `Row ${index + 2}: lesson ${lesson.lessonNumber} is already used in `
                + `${lesson.unitTitle || 'this file'}${lesson.chapterTitle ? ` / ${lesson.chapterTitle}` : ''}.`
            );
        }
        seen.add(slot);
        return lesson;
    }).sort((left, right) => (
        (left.unitNumber ?? 0) - (right.unitNumber ?? 0)
        || (left.chapterNumber ?? 0) - (right.chapterNumber ?? 0)
        || left.lessonNumber - right.lessonNumber
    ));
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
    const title = String(lesson.title || '').toLowerCase();
    const keywords = (lesson.keywords || []).join(' ').toLowerCase();
    const headings = `${lesson.unitTitle || ''} ${lesson.chapterTitle || ''}`.toLowerCase();
    const body = String(lesson.searchText || lesson.content || '').toLowerCase();
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
export const selectLessons = ({ lessons = [], question = '', selectedLessonId = null } = {}) => {
    const terms = words(question);
    const scorer = lessons.map((lesson) => ({ lesson, score: scoreLesson(lesson, terms) }));
    const selected = selectedLessonId
        ? lessons.find((lesson) => String(lesson._id) === String(selectedLessonId))
        : null;

    const picked = [];
    if (selected) picked.push({ lesson: selected, score: Infinity });
    for (const row of scorer.sort((left, right) => right.score - left.score)) {
        if (picked.length >= LESSONS_IN_ANSWER) break;
        if (row.score <= 0) break;
        if (picked.some((entry) => String(entry.lesson._id) === String(row.lesson._id))) continue;
        picked.push(row);
    }
    return picked.map((row) => row.lesson);
};

export const lessonLabel = (lesson = {}) => {
    const unit = lesson.unitTitle ? `Unit ${lesson.unitNumber}: ${lesson.unitTitle}` : '';
    const chapter = lesson.chapterTitle ? `Chapter ${lesson.chapterNumber}: ${lesson.chapterTitle}` : '';
    return [unit, chapter, `Lesson ${lesson.lessonNumber}: ${lesson.title}`].filter(Boolean).join(' · ');
};

export const clip = (value, limit) => {
    const source = String(value ?? '');
    if (source.length <= limit) return source;
    return `${source.slice(0, limit)}\n[…lesson continues in the app]`;
};

const shorten = (value, limit) => {
    const source = String(value ?? '').trim();
    return source.length <= limit ? source : `${source.slice(0, limit)}…`;
};

/**
 * Every tutor reply opens with a stage tag on its own line. The tag is how the
 * server knows whether the ladder moved on; it is stripped before the student
 * ever sees the text. A reply without a tag is treated as "not a final answer",
 * so the try counter keeps the student's two attempts available.
 */
const STAGE_TAGS = { try: 'prompt', prompt: 'prompt', hint: 'hint', answer: 'answer' };

export const readTutorReply = (value) => {
    const source = String(value ?? '').trim();
    const match = source.match(/^\[{1,2}\s*(try|prompt|hint|answer)\s*\]{1,2}[ \t]*\n?/i);
    if (!match) return { stage: 'hint', text: source };
    return { stage: STAGE_TAGS[match[1].toLowerCase()], text: source.slice(match[0].length).trim() };
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
        if (message?.role === 'student') {
            students += 1;
            continue;
        }
        if (message?.stage === 'answer') break;
    }
    return Math.min(MAX_TRIES_BEFORE_ANSWER, Math.max(0, students - 1));
};

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

const LANGUAGE_NAMES = {
    en: 'English',
    ar: 'Arabic'
};

/* ------------------------------------------------------------------ */
/* Language level                                                      */
/* ------------------------------------------------------------------ */

export const LANGUAGE_LEVELS = ['support', 'on_level', 'stretch'];

/**
 * Bands a measured reading level against the class grade. Comprehension outranks
 * the level: a student who decodes above grade but understands little still needs
 * the simplest wording. Nothing measured means on-level rather than a guess.
 */
export const readingLevelBand = ({ readingLevel, accuracy, grade } = {}) => {
    const measuredAccuracy = Number(accuracy);
    if (accuracy !== null && accuracy !== undefined && accuracy !== ''
        && Number.isFinite(measuredAccuracy) && measuredAccuracy < 60) {
        return 'support';
    }
    const level = Number(readingLevel);
    const gradeNumber = Number(grade);
    if (!Number.isFinite(level) || !Number.isFinite(gradeNumber) || gradeNumber < 1) return null;
    const gap = level - gradeNumber;
    if (gap <= -1) return 'support';
    if (gap >= 2) return 'stretch';
    return 'on_level';
};

/** A teacher's override always wins; otherwise the measured reading level decides. */
export const resolveLanguageLevel = ({ override, readingLevel, accuracy, grade } = {}) => (
    LANGUAGE_LEVELS.includes(override)
        ? override
        : readingLevelBand({ readingLevel, accuracy, grade }) || 'on_level'
);

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
- Keep every reply under 140 words.`
};

export const languageLevelGuidance = (level) => LANGUAGE_LEVEL_GUIDANCE[
    LANGUAGE_LEVELS.includes(level) ? level : 'on_level'
];

/**
 * The tutor may only speak from the lessons handed to it. The student's name is
 * never part of this prompt: the model addresses "you" and knows nothing about
 * who the student is.
 */
export const buildTutorPrompt = ({
    question,
    lessons = [],
    standards = [],
    subjectName = 'this subject',
    grade = '',
    language = 'en',
    languageLevel = 'on_level',
    selectedLesson = null,
    history = [],
    tries = 0
}) => {
    const languageName = LANGUAGE_NAMES[String(language).slice(0, 2)] || LANGUAGE_NAMES.en;
    const lessonBlocks = lessons.map((lesson) => {
        const code = lesson.standards?.length ? ` (standards: ${lesson.standards.join(', ')})` : '';
        return `[${lessonLabel(lesson)}]${code}\n${clip(lesson.content, LESSON_CHARS_IN_ANSWER)}`;
    }).join('\n\n');
    const standardsBlock = standards.slice(0, STANDARDS_IN_ANSWER)
        .map((standard) => `- ${standard.code}: ${clip(standard.description || standard.name || '', 300)}`)
        .join('\n');
    const historyBlock = history.slice(-HISTORY_IN_PROMPT)
        .map((message) => `${message.role === 'student' ? 'Student' : 'You'}: ${shorten(message.text, HISTORY_MESSAGE_CHARS)}`)
        .join('\n');
    const attempts = Math.min(MAX_TRIES_BEFORE_ANSWER, Math.max(0, Number(tries) || 0));

    const ladder = attempts === 0
        ? `The student has not tried yet. Do NOT explain, hint or give the answer.
Ask them to explain in their own words what they already understand about this, or to make a first try.
Keep it to one or two friendly sentences.
If they are instead explaining back something you just taught them, check their explanation and correct what is wrong; do not ask them to explain again.`
        : attempts === 1
            ? `The student has tried once. Give ONE hint only — a single nudge, clue or leading question that moves them one step closer.
Do NOT explain the whole idea and do NOT give the answer. Finish by asking them to try again.`
            : `The student has tried ${attempts} times. You may now explain the idea fully, step by step.
After the explanation, ask the student to explain it back in their own words so you can check it.`;

    return `You are a patient ${subjectName} tutor for one student in grade ${grade}. You coach; the student does the thinking.

WHAT YOU MAY ANSWER FROM
Use ONLY the lesson material below. Do not use outside knowledge, and never invent facts, dates, formulas, names or page numbers.
${selectedLesson ? `The student opened this lesson: ${lessonLabel(selectedLesson)}.\n` : ''}
LESSON MATERIAL
${lessonBlocks || '(no lesson material matched this question)'}

${standardsBlock ? `STANDARDS THIS GRADE MUST MASTER\n${standardsBlock}\n` : ''}
${historyBlock ? `CONVERSATION SO FAR\n${historyBlock}\n\n` : ''}HOW THIS TURN MUST GO
${ladder}

HOW YOU TEACH
- The student explains things back. You do not lecture unless they have tried twice.
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
export const VOICE_POINT_WORDS = 15;
export const VOICE_REPLY_MAX_CHARS = 700;

const VOICE_BLOCK_TYPES = ['bullets', 'contrast', 'example', 'steps', 'keyIdea'];
const VOICE_ITEM_CHARS = 200;
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
    subjectName = 'this subject',
    grade = '',
    language = 'en',
    languageLevel = 'on_level',
    lesson = null,
    board = [],
    tries = 0
}) => {
    const languageName = LANGUAGE_NAMES[String(language).slice(0, 2)] || LANGUAGE_NAMES.en;
    const lessonBlocks = lessons.map((row) => {
        const code = row.standards?.length ? ` (standards: ${row.standards.join(', ')})` : '';
        return `[${lessonLabel(row)}]${code}\n${clip(row.content, LESSON_CHARS_IN_ANSWER)}`;
    }).join('\n\n');
    const standardsBlock = standards.slice(0, STANDARDS_IN_ANSWER)
        .map((standard) => `- ${standard.code}: ${clip(standard.description || standard.name || '', 300)}`)
        .join('\n');
    const boardBlock = board.slice(-8)
        .map((message) => (
            message.role === 'student'
                ? `Student said: ${shorten(message.text, 300)}`
                : `You said: ${shorten(message.spoken || message.text, 400)}`
        ))
        .join('\n');
    const attempts = Math.min(MAX_TRIES_BEFORE_ANSWER, Math.max(0, Number(tries) || 0));

    const ladder = attempts === 0
        ? `The student has not tried yet. Do NOT explain, hint or give the answer.
Ask them to say in their own words what they already understand, or to make a first try.
If they are instead explaining back something you just taught them, check it and correct what is wrong.`
        : attempts === 1
            ? `The student has tried once. Give ONE hint only — a single nudge or leading question.
Do NOT explain the whole idea and do NOT give the answer. Ask them to try again.`
            : `The student has tried ${attempts} times. You may now explain the idea fully, one step at a time.
Then ask them to say it back in their own words so you can check it.`;

    return `You are a warm, patient ${subjectName} tutor talking out loud with one student in grade ${grade}.
Everything you write is spoken aloud by a voice. Never write anything that only works on a screen.

WHAT YOU MAY ANSWER FROM
Use ONLY the lesson material below. Do not use outside knowledge, and never invent facts, dates, formulas, names or page numbers.
${lesson ? `The student chose this lesson: ${lessonLabel(lesson)}.\n` : ''}
LESSON MATERIAL
${lessonBlocks || '(no lesson material matched this question)'}

${standardsBlock ? `STANDARDS THIS GRADE MUST MASTER\n${standardsBlock}\n` : ''}
${boardBlock ? `BOARD SO FAR (this session)\n${boardBlock}\n\n` : ''}HOW THIS TURN MUST GO
${ladder}

HOW YOU TALK
${languageLevelGuidance(languageLevel)}
- Speak ${languageName} only, including every item and the follow-up question.
- Short spoken sentences. Contractions are welcome. Sound like a kind teacher, not a textbook.
- Numbers, symbols and formulas are said in words. No markdown, no bullet characters, no emoji, no code.
- If the lesson material does not cover the question, say exactly that in one short sentence, name the closest lesson, and offer what it does cover.
- If the student asks about another subject or something personal, say you only help with ${subjectName} lessons for grade ${grade}.
- Never mention the student's name, class, school, teacher or any personal detail.
- Do not hand over finished homework. Guide, then check.

REPLY FORMAT
Return exactly one JSON object and nothing else:
{"stage":"prompt|hint|answer","lead":"one or two short sentences","emphasis":"a few words copied from lead, or empty","blocks":[{"type":"bullets","items":["short point"]}],"followUp":"one short question"}
- "stage" follows how this turn must go: prompt for an invitation to try, hint for one hint, answer for a full explanation.
- "lead" reacts to what the student just said, in one or two sentences. The board shows it largest.
- "emphasis" repeats the one word or phrase inside "lead" that the board should underline. Copy it exactly. Leave it empty when nothing deserves the underline.
- "blocks" holds only the blocks this turn needs: none, one, two, or three. Never pad the reply to a fixed number. A short answer can be one lead sentence and the follow-up, with no blocks.
  {"type":"bullets","items":["...","..."]} — two to four short parallel points.
  {"type":"contrast","items":[{"word":"and","text":"adds another idea"},{"word":"but","text":"shows a difference"}]} — two or three words, each with the job it does.
  {"type":"example","text":"one concrete example"} — one sentence.
  {"type":"steps","items":["...","..."]} — two to four steps in order.
  {"type":"keyIdea","text":"one sentence worth remembering"} — the idea to keep.
- Every list item is under ${VOICE_POINT_WORDS} words and a plain sentence: no numbering, no bullet characters, no symbols.
- "followUp" is one short question that makes the student think or answer back.

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
    subjectName = 'this subject',
    grade = '',
    language = 'en',
    languageLevel = 'on_level',
    lesson = null
}) => {
    const languageName = LANGUAGE_NAMES[String(language).slice(0, 2)] || LANGUAGE_NAMES.en;
    const lessonBlocks = lessons.map((row) => {
        const code = row.standards?.length ? ` (standards: ${row.standards.join(', ')})` : '';
        return `[${lessonLabel(row)}]${code}\n${clip(row.content, LESSON_CHARS_IN_ANSWER)}`;
    }).join('\n\n');
    const standardsBlock = standards.slice(0, STANDARDS_IN_ANSWER)
        .map((standard) => `- ${standard.code}: ${clip(standard.description || standard.name || '', 300)}`)
        .join('\n');

    return `You are a warm, patient ${subjectName} tutor opening a spoken lesson with one student in grade ${grade}.
This is the very first thing the student hears. Everything you write is spoken aloud by a voice.

WHAT YOU MAY USE
Use ONLY the lesson material below for the hook. Do not use outside knowledge, and never invent facts, dates, formulas, names or page numbers.
${lesson ? `The student chose this lesson: ${lessonLabel(lesson)}.\n` : ''}
LESSON MATERIAL
${lessonBlocks || '(no lesson material matched)'}

${standardsBlock ? `STANDARDS THIS GRADE MUST MASTER\n${standardsBlock}\n` : ''}
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

/** One typed block, normalized. A list of one is not a list, so it is dropped. */
const readVoiceBlock = (raw) => {
    const type = text(raw?.type);
    if (!VOICE_BLOCK_TYPES.includes(type)) return null;
    if (type === 'bullets' || type === 'steps') {
        const items = (Array.isArray(raw?.items) ? raw.items : [])
            .map((item) => voiceBlockText(typeof item === 'string' ? item : item?.text))
            .filter(Boolean)
            .slice(0, VOICE_BLOCK_ITEMS_MAX);
        return items.length >= 2 ? { type, items } : null;
    }
    if (type === 'contrast') {
        const items = (Array.isArray(raw?.items) ? raw.items : [])
            .map((item) => ({ word: shorten(text(item?.word), 40), text: voiceBlockText(item?.text) }))
            .filter((item) => item.word && item.text)
            .slice(0, VOICE_CONTRAST_ITEMS_MAX);
        return items.length >= 2 ? { type, items } : null;
    }
    const body = voiceBlockText(raw?.text);
    return body ? { type, text: body } : null;
};

const blockAsSpeech = (block) => {
    if (block.type !== 'contrast') {
        return Array.isArray(block.items) ? block.items.join(' ') : block.text;
    }
    return block.items.map((item) => `${item.word} ${item.text}`).join(', ');
};

/** Parses the spoken reply. A reply that is not usable JSON is rejected, never guessed at. */
export const readVoiceReply = (value) => {
    const source = String(value ?? '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    let parsed;
    try {
        parsed = JSON.parse(source);
    } catch {
        return null;
    }
    const lead = shorten(text(parsed?.lead), VOICE_LEAD_CHARS);
    const emphasisRaw = text(parsed?.emphasis);
    const emphasis = emphasisRaw && emphasisRaw.length <= 60 && lead.includes(emphasisRaw) ? emphasisRaw : '';
    const blocks = (Array.isArray(parsed?.blocks) ? parsed.blocks : [])
        .map(readVoiceBlock)
        .filter(Boolean)
        .slice(0, VOICE_BLOCKS_MAX);
    // Old sessions and any model that still answers with "points" keep working.
    if (!blocks.length && Array.isArray(parsed?.points)) {
        const points = parsed.points.map(voiceBlockText).filter(Boolean).slice(0, VOICE_BLOCK_ITEMS_MAX);
        if (points.length) blocks.push({ type: 'bullets', items: points });
    }
    const followUp = shorten(text(parsed?.followUp), VOICE_FOLLOWUP_CHARS);
    const stage = ['opening', 'prompt', 'hint', 'answer'].includes(parsed?.stage) ? parsed.stage : 'hint';
    if (!lead && !blocks.length && !followUp) return null;
    const spoken = [lead, ...blocks.map(blockAsSpeech), followUp]
        .filter(Boolean)
        .join(' ')
        .slice(0, VOICE_REPLY_MAX_CHARS);
    return { stage, lead, emphasis, blocks, followUp, spoken };
};

export const buildPracticePrompt = ({
    lessons = [],
    standards = [],
    subjectName = 'this subject',
    grade = '',
    language = 'en'
}) => {
    const languageName = LANGUAGE_NAMES[String(language).slice(0, 2)] || LANGUAGE_NAMES.en;
    const lessonBlocks = lessons.map((lesson) => `[${lessonLabel(lesson)}]\n${clip(lesson.content, LESSON_CHARS_IN_ANSWER)}`).join('\n\n');
    const standardsBlock = standards.slice(0, STANDARDS_IN_ANSWER)
        .map((standard) => `- ${standard.code}: ${clip(standard.description || standard.name || '', 200)}`)
        .join('\n');

    return `Build ${PRACTICE_QUESTION_COUNT} exam-style multiple-choice questions for one student in grade ${grade} on ${subjectName}.

Use ONLY the lesson material below. Every question must be answerable from it.

LESSON MATERIAL
${lessonBlocks}

${standardsBlock ? `STANDARDS\n${standardsBlock}\n` : ''}
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

const normalizeOptions = (value) => (Array.isArray(value) ? value : [])
    .map((option) => text(option))
    .filter(Boolean);

/** Tolerant parser for the model's question list; anything malformed is dropped. */
export const normalizePracticeQuestions = (parsed) => {
    const rows = Array.isArray(parsed?.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : [];
    const seen = new Set();
    const questions = [];
    for (const row of rows) {
        const question = text(row?.question);
        const options = normalizeOptions(row?.options);
        if (!question || options.length < 2 || options.length > 6) continue;
        const key = question.toLowerCase();
        if (seen.has(key)) continue;

        let correctIndex = Number(row?.correctIndex ?? row?.answer);
        if (!Number.isInteger(correctIndex) && typeof row?.answer === 'string') {
            correctIndex = options.findIndex((option) => option.toLowerCase() === text(row.answer).toLowerCase());
        }
        if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) continue;

        seen.add(key);
        questions.push({
            question,
            options,
            correctIndex,
            explanation: text(row?.explanation)
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
    if (!Array.isArray(questions) || !questions.length) throw fail('This practice set has no questions.');
    if (!Array.isArray(answers) || answers.length !== questions.length) {
        throw fail('Answer every question before you submit the set.');
    }
    const results = questions.map((question, index) => {
        const choiceIndex = Number(answers[index]);
        if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= (question.options || []).length) {
            throw fail(`Question ${index + 1} has no valid answer.`);
        }
        return { choiceIndex, correct: choiceIndex === Number(question.correctIndex) };
    });
    return {
        results,
        score: results.filter((row) => row.correct).length,
        total: questions.length
    };
};

/* ------------------------------------------------------------------ */
/* Access and credit                                                   */
/* ------------------------------------------------------------------ */

/** The school switch plus the class switch, in that order. */
export const resolveAccess = ({ settings, classAccess, walletPaid = false } = {}) => {
    if (!settings?.enabled) return { allowed: false, reason: 'school_off' };
    if (classAccess?.status === 'locked') return { allowed: false, reason: 'class_locked' };
    if (classAccess?.status === 'paused') return { allowed: false, reason: 'class_paused' };
    if (walletPaid) return { allowed: false, reason: 'wallet_paused' };
    return { allowed: true, reason: '' };
};

/** What the student needs to be told about their own credit, in plain words. */
export const walletNotice = ({ credits = 0, lowThreshold = FREE_AFTER_CREDITS } = {}) => {
    const left = Math.max(0, Number(credits) || 0);
    if (left <= 0) return { level: 'empty', credits: 0 };
    if (left <= lowThreshold) return { level: 'low', credits: left };
    return { level: 'ok', credits: left };
};

export const clampCredits = (value) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) {
        throw fail('Credits must be a whole number, zero or more.');
    }
    if (number > 1000) throw fail('The most you can give at once is 1000 questions.');
    return number;
};

export const summarizeLessonsByUnit = (lessons = []) => {
    const units = new Map();
    for (const lesson of lessons) {
        const key = lesson.unitNumber == null ? 'flat' : `u${lesson.unitNumber}`;
        if (!units.has(key)) {
            units.set(key, {
                unitNumber: lesson.unitNumber ?? null,
                unitTitle: lesson.unitTitle || '',
                chapters: new Map(),
                lessons: []
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
                chapterTitle: lesson.chapterTitle || '',
                lessons: []
            });
        }
        unit.chapters.get(chapterKey).lessons.push(lesson);
    }
    return [...units.values()]
        .sort((left, right) => (left.unitNumber ?? 0) - (right.unitNumber ?? 0))
        .map((unit) => ({
            ...unit,
            chapters: [...unit.chapters.values()].sort((left, right) => left.chapterNumber - right.chapterNumber)
        }));
};
