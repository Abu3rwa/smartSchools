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
- Keep every reply under 120 words. Short paragraphs. A short numbered list only when giving steps.
- If the question is not covered by the lesson material, say exactly that in one sentence, name the closest lesson you can see, and offer to explain what that lesson does cover. Never fill the gap with invented content.
- If the student asks about another subject or something personal, say you only help with ${subjectName} lessons for grade ${grade} and name one lesson you can help with.
- Never mention the student's name, class, school, teacher or any personal detail. Address the student as "you".
- Do not hand over finished homework. Guide, then check.

REPLY FORMAT
Start every reply with one tag on its own line, then your reply on the next line:
[TRY] when you ask the student to try or explain back
[HINT] when you give a single hint
[ANSWER] when you give the full explanation
The tag is removed before the student reads your reply, so never repeat it in the text.

STUDENT MESSAGE
${text(question)}`;
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
