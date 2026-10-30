/**
 * One place for the two rules every AI prompt in the app must follow:
 * the model never receives a student's identity, and the model never produces
 * biased, religious or age-inappropriate text.
 *
 * Callers interpolate PRIVACY_RULES / CONTENT_RULES into their prompt and use
 * the helpers to scrub inputs, restore real names after the reply, and inspect
 * the reply before anyone sees it.
 */

import {
    STUDENT_TOKEN,
    STUDENT_PLACEHOLDER,
    scrubPersonalText
} from "./newsletterPrivacy.js";

export { STUDENT_TOKEN, STUDENT_PLACEHOLDER };

export const CLASSMATE_PLACEHOLDER = "a classmate";

export const PRIVACY_RULES = `PRIVACY (must always hold):
- You do not know the student's name, email, phone, address or any identifier, and you must never invent one. Where a name belongs, write ${STUDENT_TOKEN} exactly.
- Never write the name of any other student, family member or school staff member, except the reporting teacher named in the prompt when one is given.
- Never describe or infer the student's appearance, family composition, nationality, religion, health or disability.
- Use only the attributes given in this prompt (such as gender and grade). Never guess a different gender or grade.`;

export const CONTENT_RULES = `CONTENT SAFETY (must always hold):
- Stay neutral on religion and belief. Never mention, promote, compare or criticise any religion, sect, scripture, place of worship, prayer or religious holiday, and never add religious phrases or formulas (for example "God willing", "Alhamdulillah", "Inshallah", "God bless") to any text.
- If the source material you were given is itself about religion or culture, keep it factual and neutral; never favour, criticise or add to it.
- Never assume the student's family. Write "the family" or "the guardian". Never write "your mother and father", "both parents" or "your parents" unless the prompt lists both as present.
- Never use gender stereotypes or claim that one gender is better at any subject, activity or behaviour.
- Use neutral, culture-neutral examples and names. Do not build examples on religious practice, holidays, food restrictions, alcohol or politics.
- Language must suit children: no profanity, insults, violence, sexual content, self-harm or frightening imagery.
- When marking, scoring or giving feedback, judge the work shown only. Never comment on the child as a person, their family, faith, background or appearance.
- Arabic output uses Modern Standard Arabic: no dialect, no religious formulas, no honorifics.`;

const RELIGIOUS_FORMULAS = [
    "inshallah", "insha'allah", "insha allah", "alhamdulillah", "alhamdu lillah",
    "mashallah", "ma sha allah", "bismillah", "subhanallah", "astaghfirullah",
    "allahu akbar", "god willing", "praise be to god", "thank god", "thanks be to god",
    "by the grace of god", "god bless", "blessed by god", "amen",
    "إن شاء الله", "ان شاء الله", "الحمد لله", "ما شاء الله", "بسم الله",
    "سبحان الله", "أستغفر الله", "الله أكبر", "بارك الله", "صلى الله عليه وسلم"
];

const RELIGIOUS_HOLIDAYS = [
    "christmas", "easter", "ramadan", "eid al", "eid mubarak", "diwali",
    "hanukkah", "passover", "عيد الفطر", "عيد الأضحى", "رمضان"
];

const FAMILY_ASSUMPTIONS = [
    "mother and father", "mum and dad", "mom and dad", "both parents",
    "both of your parents", "your parents", "your mum", "your mom", "your dad",
    "الأم والأب", "أمك وأبوك", "والديك", "كلا الوالدين", "الوالدين"
];

const PROFANITY = [
    "fuck", "shit", "bitch", "bastard", "asshole", "cunt", "slut", "whore",
    "porn", "nude", "rape", "suicide", "kill yourself",
    "stupid", "idiot", "moron", "dumb", "worthless",
    "حقير", "غبي", "تافه"
];

const normalize = (text) => String(text || "").replace(/\s+/g, " ").toLowerCase();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Latin terms must match whole words, so "amen" never hits "lament" and
// "rape" never hits "grape". Arabic terms are matched as written.
const termPattern = (term, flags = "i") => {
    const bounded = /^[a-z' -]+$/i.test(term)
        ? `(?<![a-z0-9])${escapeRegExp(term)}(?![a-z0-9])`
        : escapeRegExp(term);
    return new RegExp(bounded, flags);
};

const hitsAny = (haystack, terms, ignore) => terms.find((term) => {
    if (ignore.has(term)) return false;
    return termPattern(term).test(haystack);
});

/**
 * Safe, non-identifying facts a prompt may carry. Everything here is group
 * context (grade, gender, periods, scores); nothing points at a person.
 */
export function buildStudentFacts({
    gender,
    grade,
    academicYear,
    period,
    language,
    average,
    subjects
} = {}) {
    const lines = [];
    const normalizedGender = String(gender || "").trim().toLowerCase();
    if (["male", "female"].includes(normalizedGender)) lines.push(`Gender: ${normalizedGender}`);
    if (grade) lines.push(`Grade level: ${grade}`);
    if (academicYear) lines.push(`Academic year: ${academicYear}`);
    if (period) lines.push(`Period: ${period}`);
    if (average != null) lines.push(`Overall average: ${average}%`);
    if (subjects) lines.push(`Subjects: ${subjects}`);
    if (language) lines.push(`Preferred language of the family: ${language}`);
    return lines.join("\n");
}

/**
 * Replaces every occurrence of the child's own name with the name token, and
 * every classmate name with a neutral placeholder. Emails and long numbers are
 * scrubbed too. The reply is filled back with fillStudentTokens* after the call.
 */
export function scrubForPrompt(value, {
    name,
    roster = [],
    placeholder = STUDENT_TOKEN,
    rosterPlaceholder = CLASSMATE_PLACEHOLDER,
    phoneNumbers = true
} = {}) {
    const own = String(name || "").trim();
    const ownParts = new Set(own.toLowerCase().split(/\s+/).filter(Boolean));
    let text = scrubPersonalText(value, { names: own ? [own] : [] }, { placeholder, phoneNumbers });

    const others = Array.from(new Set(
        roster
            .flatMap((entry) => {
                const clean = String(entry || "").trim();
                if (!clean) return [];
                // Roster entries are full names; the prose usually names only the
                // first or last part, so each part has to be scrubbed as well.
                return [clean, ...clean.split(/\s+/)];
            })
            .filter((entry) => entry.length > 2)
    )).filter((entry) => {
        const lower = entry.toLowerCase();
        return lower !== own.toLowerCase() && !ownParts.has(lower);
    });
    if (others.length) {
        text = scrubPersonalText(text, { names: others }, { caseSensitive: true, placeholder: rosterPlaceholder, phoneNumbers: false });
    }
    return text;
}

/** Server-side name insertion for a single string. */
export function fillStudentTokens(content, name) {
    const value = String(name || "").trim() || "your child";
    return String(content || "").replace(/\{\{\s*student\s*\}\}/gi, value);
}

/**
 * Server-side name insertion for a nested JSON reply. Assessment replies quote
 * the student's own words, so the name token can appear inside any string.
 */
export function fillStudentTokensDeep(value, name) {
    if (typeof value === "string") return fillStudentTokens(value, name);
    if (Array.isArray(value)) return value.map((entry) => fillStudentTokensDeep(entry, name));
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, fillStudentTokensDeep(entry, name)])
        );
    }
    return value;
}

/**
 * Stable S1..Sn labels for a list of students. The prompt sees only the label;
 * the reply is restored to real names before a teacher reads it.
 */
export function createStudentRefs(rows = [], {
    keyOf = (row) => row?.id,
    labelOf = (row) => row?.name
} = {}) {
    const entries = (Array.isArray(rows) ? rows : []).map((row, index) => ({
        row,
        ref: `S${index + 1}`,
        label: String(labelOf(row) || "").trim(),
        key: String(keyOf(row) ?? index)
    }));
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));

    const restore = (text) => String(text || "").replace(/\b[Ss](\d{1,3})\b/g, (match, digits) => {
        const entry = entries[Number(digits) - 1];
        return entry?.label || match;
    });

    const scrubText = (text) => {
        let output = String(text || "");
        for (const entry of [...entries].sort((a, b) => b.label.length - a.label.length)) {
            if (entry.label.length < 3) continue;
            const pattern = new RegExp(`\\b${entry.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
            output = output.replace(pattern, entry.ref);
        }
        return output;
    };

    return {
        entries,
        refFor: (key) => byKey.get(String(key))?.ref || "",
        scrubText,
        restore,
        restoreDeep(value) {
            if (typeof value === "string") return restore(value);
            if (Array.isArray(value)) return value.map((entry) => this.restoreDeep(entry));
            if (value && typeof value === "object") {
                return Object.fromEntries(
                    Object.entries(value).map(([key, entry]) => [key, this.restoreDeep(entry)])
                );
            }
            return value;
        }
    };
}

/**
 * Inspects prose that will reach a family or a child. Returns the problem codes
 * so the caller can retry with a corrective prompt instead of shipping the text.
 */
export function inspectGeneratedText(content, { ignore = [], allowToken = false } = {}) {
    const text = String(content || "").trim();
    if (!text) return { ok: false, problems: ["empty"] };

    const haystack = normalize(text);
    const ignored = new Set((ignore || []).map((word) => normalize(word)).filter(Boolean));
    const problems = [];

    const formula = hitsAny(haystack, RELIGIOUS_FORMULAS, ignored);
    if (formula) problems.push(`religious-formula:${formula}`);

    const holiday = hitsAny(haystack, RELIGIOUS_HOLIDAYS, ignored);
    if (holiday) problems.push(`religious-holiday:${holiday}`);

    const family = hitsAny(haystack, FAMILY_ASSUMPTIONS, ignored);
    if (family) problems.push(`family-assumption:${family}`);

    const profanity = hitsAny(haystack, PROFANITY, ignored);
    if (profanity) problems.push(`inappropriate-language:${profanity}`);

    if (!allowToken && /\{\{\s*student\s*\}\}/i.test(text)) problems.push("unfilled-name-token");

    return { ok: problems.length === 0, problems };
}

/** Removes only the phrase-class problems, leaving sentences otherwise intact. */
export function stripFlaggedFormulas(content) {
    let text = String(content || "");
    for (const term of [...RELIGIOUS_FORMULAS, ...FAMILY_ASSUMPTIONS]) {
        const bounded = /^[a-z' -]+$/i.test(term)
            ? `(?<![a-z0-9])${escapeRegExp(term)}(?![a-z0-9])`
            : escapeRegExp(term);
        const pattern = new RegExp(`\\s*(?:,\\s*)?${bounded}\\s*(?:,\\s*)?`, "gi");
        text = text.replace(pattern, " ");
    }
    return text.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
}

/** The single corrective retry used when an inspection fails. */
export function correctivePrompt(prompt, problems) {
    return `${prompt}

Your previous answer was rejected. Fix exactly these problems and change nothing else: ${problems.join(", ")}.
Rewrite the whole answer with those problems removed.`;
}
