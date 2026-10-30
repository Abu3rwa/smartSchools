/**
 * Per-child newsletter drafting.
 *
 * One AI call writes one anonymous letter. Names, emails and ids are never in the
 * prompt: the model writes {{student}} where a name belongs and the server fills it
 * at render time. Every call goes through connectAi, so the existing AI credit gate
 * and ledger bill it under the newsletter feature automatically.
 */

import { connectAi } from "../utils/connectAi.js";
import { CONTENT_RULES, inspectGeneratedText, stripFlaggedFormulas } from "./aiPromptSafety.js";
import { countWords, parseNewsletterJson } from "./newsletterAiService.js";
import { getLanguageLabel, resolveRequestedLanguages, toLegacyLanguageValue } from "../utils/aiLanguageUtils.js";
import { STUDENT_TOKEN, inspectLetterText } from "./newsletterPrivacy.js";

const PROMPT_VERSION = "child-letter-v1";
const MIN_WORDS = 40;
const MAX_WORDS = 320;
export const MAX_NAME_TOKENS = 3;

const PRONOUNS = {
    female: { subject: "she", object: "her", possessive: "her" },
    male: { subject: "he", object: "him", possessive: "his" },
    unspecified: { subject: "they", object: "them", possessive: "their" },
};

export function clampWordTarget(value, fallback = 90) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(MAX_WORDS, Math.max(MIN_WORDS, Math.round(parsed)));
}

export function letterWordBounds(wordTarget) {
    const target = clampWordTarget(wordTarget);
    return {
        wordTarget: target,
        minWords: Math.max(MIN_WORDS, Math.round(target * 0.8)),
        maxWords: Math.min(MAX_WORDS, Math.round(target * 1.2)),
    };
}

function languageRule(languages) {
    if (languages.length > 1) {
        const [primary, secondary] = languages;
        return `Write two complete blocks: first ${getLanguageLabel(primary)} (${primary}), then ${getLanguageLabel(secondary)} (${secondary}). Separate the blocks with one blank line. Do not mix languages inside a block.`;
    }
    const only = languages[0] || "en";
    return `Write in ${getLanguageLabel(only)} (${only}) only.`;
}

function classTopicsBlock(classTopics = []) {
    const rows = classTopics
        .filter((row) => row?.subject && Array.isArray(row.topics) && row.topics.length)
        .slice(0, 8)
        .map((row) => `- ${row.subject}: ${row.topics.slice(0, 5).join("; ")}`);
    return rows.length ? rows.join("\n") : "(No class-level topics this period.)";
}

/** The class-level newsletter text, so the child letter stays consistent with it. */
function classNewsletterBlock(classNewsletter = []) {
    return classNewsletter
        .filter((row) => row?.subject && String(row.content || "").trim())
        .slice(0, 6)
        .map((row) => `- ${row.subject}: ${String(row.content).replace(/\s+/g, " ").trim()}`)
        .join("\n");
}

export function buildChildLetterPrompt({
    facts = {},
    classTopics = [],
    classNewsletter = [],
    periodLabel = "",
    wordTarget = 90,
    languages = ["en"],
    teacherNote = "",
}) {
    const { minWords, maxWords } = letterWordBounds(wordTarget);
    const pronouns = PRONOUNS[facts.gender] || PRONOUNS.unspecified;

    return `
You are the class teacher writing a short, private update to one student's family.

WHO YOU ARE WRITING ABOUT
- You do NOT know the student's name and must never invent one. Where a name belongs, write ${STUDENT_TOKEN} exactly. Use it at most ${MAX_NAME_TOKENS} times.
- Gender: ${facts.gender || "unspecified"}. Use ${pronouns.subject}/${pronouns.object}/${pronouns.possessive}. Never guess a different gender.
- Never write an email address, phone number, link, address, id or another person's name.
- Never mention marks, scores, percentages, grades, ranks or averages. Describe effort, habits and next steps in plain words.
- A teacher remark may be included, but rephrase it warmly; never copy it word for word.

${CONTENT_RULES}

WHAT TO WRITE
- Two short paragraphs, between ${minWords} and ${maxWords} words in total.
- Paragraph one: one or two concrete things that happened this period.
- Paragraph two: one thing to keep working on, and one simple way the family can help at home.
- If an upcoming test is listed, name it and its date only. Never describe what is on it.
- Voice: a real classroom teacher, warm and specific. No slogans, no marketing tone, no bullet lists.

PERIOD: ${periodLabel || "this period"}

HONEST FACTS ABOUT THIS STUDENT (JSON):
${JSON.stringify(facts, null, 2)}

WHAT THE WHOLE CLASS COVERED (use only if it helps the letter feel grounded):
${classTopicsBlock(classTopics)}

${classNewsletterBlock(classNewsletter) ? `WHAT THE CLASS NEWSLETTER SAYS (keep facts consistent; never copy its wording):\n${classNewsletterBlock(classNewsletter)}\n` : ""}
${teacherNote ? `TEACHER NOTE (rephrase, never quote):\n${teacherNote}` : ""}

LANGUAGE:
${languageRule(languages)}

OUTPUT RULES
- Return ONLY valid JSON. No Markdown, no code fences, no commentary.
- Keys exactly: content (string), highlights (array of up to 3 short strings)
- content must be complete sentences, not a list.

Return JSON only.
`.trim();
}

function trimToMaxWords(text, maxWords) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return String(text || "").trim();
    const trimmed = words.slice(0, maxWords).join(" ");
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export class UnsafeChildLetterError extends Error {
    constructor(reasons) {
        super(`The AI letter did not pass the privacy check (${reasons.join(", ")}).`);
        this.name = "UnsafeChildLetterError";
        this.statusCode = 422;
        this.code = "NEWSLETTER_LETTER_UNSAFE";
        this.reasons = reasons;
    }
}

/**
 * Draft one letter. `forbiddenTerms` are the child's names/emails: they must be
 * absent from the output. Returns content that still contains {{student}}.
 */
export async function generateChildLetter({
    facts,
    classTopics = [],
    classNewsletter = [],
    periodLabel = "",
    wordTarget = 90,
    requestedLanguages = [],
    primaryLanguage,
    secondaryLanguage,
    language,
    teacherNote = "",
    forbiddenTerms = [],
}) {
    const languages = resolveRequestedLanguages({
        requestedLanguages,
        primaryLanguage,
        secondaryLanguage,
        language,
        subjectName: "newsletter",
        max: 2,
    });
    const bounds = letterWordBounds(wordTarget);

    const prompt = buildChildLetterPrompt({
        facts,
        classTopics,
        classNewsletter,
        periodLabel,
        wordTarget: bounds.wordTarget,
        languages,
        teacherNote,
    });

    const aiRes = await connectAi(prompt);
    let parsed = parseNewsletterJson(aiRes.text);
    let content = String(parsed?.content || "").trim();

    const inspectLetter = (value) => {
        const privacy = inspectLetterText(value, {
            forbiddenTerms,
            minWords: 0,
            maxWords: bounds.maxWords,
            maxTokens: MAX_NAME_TOKENS,
        });
        const safety = inspectGeneratedText(value, { allowToken: true });
        return {
            letterOk: privacy.ok,
            reasons: [...privacy.reasons, ...safety.problems],
            ok: privacy.ok && safety.ok,
        };
    };

    let check = inspectLetter(content);

    // A single corrective retry, only when the first answer broke a hard rule.
    // Word-count misses are trimmed locally instead of paying for another call.
    if (!check.ok) {
        const problems = check.reasons.join(", ");
        const retryPrompt = `${prompt}\n\nYOUR PREVIOUS ANSWER WAS REJECTED (${problems}). Rewrite it and fix exactly that. Rules: no email, no phone, no link, no real name anywhere, at most ${MAX_NAME_TOKENS} ${STUDENT_TOKEN} tokens, within ${bounds.minWords}-${bounds.maxWords} words.`;
        const retry = await connectAi(retryPrompt);
        const retryParsed = parseNewsletterJson(retry.text);
        const retryContent = String(retryParsed?.content || "").trim();
        const retryCheck = inspectLetter(retryContent);
        if (!retryCheck.letterOk) throw new UnsafeChildLetterError(retryCheck.reasons);
        content = retryContent;
        check = retryCheck;
        parsed = retryParsed;
    }

    content = stripFlaggedFormulas(trimToMaxWords(content, bounds.maxWords));

    return {
        content,
        wordCount: countWords(content),
        highlights: (Array.isArray(parsed?.highlights) ? parsed.highlights : [])
            .map((row) => String(row || "").trim())
            .filter(Boolean)
            .slice(0, 3),
        requestedLanguages: languages,
        language: toLegacyLanguageValue(languages),
        promptVersion: PROMPT_VERSION,
        aiUsage: {
            entryId: String(aiRes?.usage?.entryId || ""),
            charged: Boolean(aiRes?.usage?.charged),
            costCents: Number(aiRes?.usage?.costCents ?? aiRes?.usage?.providerCostCents) || 0,
            model: String(aiRes?.modelName || ""),
            totalTokens: Number(aiRes?.totalTokenCount) || 0,
        },
    };
}
