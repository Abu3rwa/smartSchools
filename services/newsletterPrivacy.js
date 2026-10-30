/**
 * Privacy rules for per-child newsletters.
 *
 * The AI never receives a student's name, email, phone or any other personal
 * detail. It writes anonymous prose and leaves a name token where a name belongs;
 * the server fills that token at render time from the child's own record.
 */

export const STUDENT_TOKEN = "{{student}}";
export const STUDENT_PLACEHOLDER = "the student";

const TOKEN_PATTERN = /\{\{\s*student\s*\}\}/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const EMAIL_TEST = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const URL_PATTERN = /https?:\/\//i;

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every spelling of a person's name that must never reach a prompt. */
export function personalIdentifiers({ firstName, lastName, email, studentEmail } = {}) {
    const first = String(firstName || "").trim();
    const last = String(lastName || "").trim();
    const full = [first, last].filter(Boolean).join(" ");
    const names = [full, first, last]
        .map((name) => name.trim())
        .filter((name) => name.length > 2);
    const emails = [email, studentEmail].map((value) => String(value || "").trim()).filter(Boolean);
    return { names: Array.from(new Set(names)), emails: Array.from(new Set(emails)) };
}

/**
 * Removes names, emails and long digit runs (phones, ids) from free teacher text
 * before it is allowed anywhere near a prompt. The student's own name becomes
 * "the student", so the model still understands the sentence. Callers that fill
 * the name back afterwards pass STUDENT_TOKEN as the placeholder instead.
 */
export function scrubPersonalText(value, identifiers = {}, { caseSensitive = false, placeholder = STUDENT_PLACEHOLDER, phoneNumbers = true } = {}) {
    let text = String(value || "").trim();
    if (!text) return "";

    for (const email of identifiers.emails || []) {
        if (email.length < 4) continue;
        text = text.replace(new RegExp(escapeRegExp(email), "gi"), "[email]");
    }
    text = text.replace(EMAIL_PATTERN, "[email]");

    // A whole class roster is matched case-sensitively: a child called May or
    // Grace must not turn the word "may" or "grace" in the prose into a name.
    const flags = caseSensitive ? "g" : "gi";
    const names = [...(identifiers.names || [])]
        .filter((name) => name.length > 2)
        .sort((a, b) => b.length - a.length);
    for (const name of names) {
        text = text.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, flags), placeholder);
    }

    if (phoneNumbers) {
        text = text.replace(/(?:\+?\d[\s().-]?){7,}\d/g, "[number]");
    }
    return text.replace(/\s{2,}/g, " ").trim();
}

/**
 * A letter is safe to store and send only when it carries no personal data and
 * no more than a few name slots. Runs on AI output and on every teacher edit.
 */
export function inspectLetterText(content, { forbiddenTerms = [], minWords = 0, maxWords = 0, maxTokens = 3 } = {}) {
    const text = String(content || "").trim();
    const reasons = [];
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const tokenCount = (text.match(TOKEN_PATTERN) || []).length;

    if (!text) reasons.push("empty");
    else {
        if (EMAIL_TEST.test(text)) reasons.push("email");
        if (URL_PATTERN.test(text)) reasons.push("link");
        const digitRuns = text.match(/\d[\d\s().-]*\d/g) || [];
        if (digitRuns.some((run) => run.replace(/\D/g, "").length >= 9)) reasons.push("long-number");
        if (tokenCount > maxTokens) reasons.push("too-many-name-tokens");
        if (minWords && words < minWords) reasons.push("too-short");
        if (maxWords && words > maxWords) reasons.push("too-long");

        const lower = text.toLowerCase();
        const leaked = forbiddenTerms
            .map((term) => String(term || "").trim().toLowerCase())
            .filter((term) => term.length > 2)
            .some((term) => lower.includes(term));
        if (leaked) reasons.push("personal-name");
    }

    return { ok: reasons.length === 0, reasons, words, tokenCount };
}

/** Server-side name insertion. The only place a child's name joins the letter. */
export function fillStudentToken(content, firstName) {
    const name = String(firstName || "").trim() || "your child";
    return String(content || "").replace(TOKEN_PATTERN, name);
}

/**
 * Prompt-safe view of a letter the model already produced: identical text, but
 * a literal "student" where the token stood, in case a draft is re-sent to AI.
 */
export function withoutStudentToken(content) {
    return String(content || "").replace(TOKEN_PATTERN, STUDENT_PLACEHOLDER);
}
