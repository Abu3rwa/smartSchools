// Deterministic student-name detection for the observation logger.
//
// The teacher speaks a sentence such as "Ahmed helped Sara in maths". The class
// roster is the authority on who Ahmed is; this module only finds which roster
// names appear in the sentence. A first name shared by two students is never
// guessed — it comes back as ambiguous so the teacher picks.

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const INVISIBLE_MARKS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

// Arabic is written with several forms of the same letter and with optional
// diacritics; the teacher's dictation will not match the roster spelling byte
// for byte. Latin letters are case-folded.
export const normalizeNameToken = (value) => String(value || '')
    .normalize('NFKD')
    .replace(INVISIBLE_MARKS, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '')
    .trim();

const fullNameOf = (student) => `${student?.firstName || ''} ${student?.lastName || ''}`.trim();

const buildRosterIndex = (students = []) => students
    .map((student) => {
        const id = String(student?._id || student?.id || '');
        const first = normalizeNameToken(student?.firstName);
        const last = normalizeNameToken(student?.lastName);
        return {
            id,
            name: fullNameOf(student),
            first,
            full: [first, last].filter(Boolean).join(' '),
        };
    })
    .filter((entry) => entry.id && entry.full);

export const matchStudentsInText = (text, students = []) => {
    const tokens = String(text || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((raw) => ({ raw, norm: normalizeNameToken(raw) }));

    const roster = buildRosterIndex(students);
    const used = new Array(tokens.length).fill(false);
    const matches = [];
    const matchedIds = new Set();
    const ambiguous = [];

    // Full names first: "Ahmed Ali" must win over a bare "Ahmed", and the
    // longer name must be tried first so the span is not consumed by a
    // shorter, unrelated match.
    const byLength = [...roster].sort((left, right) => (
        right.full.split(' ').length - left.full.split(' ').length
        || right.full.length - left.full.length
    ));

    for (const entry of byLength) {
        if (matchedIds.has(entry.id)) continue;
        const parts = entry.full.split(' ');
        for (let start = 0; start + parts.length <= tokens.length; start += 1) {
            const slice = tokens.slice(start, start + parts.length);
            if (slice.some((token, offset) => !token.norm || used[start + offset])) continue;
            if (!parts.every((part, offset) => slice[offset].norm === part)) continue;

            matches.push({
                studentId: entry.id,
                name: entry.name,
                matchedText: slice.map((token) => token.raw).join(' '),
                matchType: 'full',
            });
            matchedIds.add(entry.id);
            for (let offset = 0; offset < parts.length; offset += 1) used[start + offset] = true;
            break;
        }
    }

    const byFirstName = new Map();
    for (const entry of roster) {
        if (entry.first.length < 2) continue;
        const list = byFirstName.get(entry.first) || [];
        list.push(entry);
        byFirstName.set(entry.first, list);
    }

    for (let index = 0; index < tokens.length; index += 1) {
        if (used[index]) continue;
        const candidates = byFirstName.get(tokens[index].norm);
        if (!candidates) continue;

        const stillUnmatched = candidates.filter((entry) => !matchedIds.has(entry.id));
        if (stillUnmatched.length === 0) {
            used[index] = true;
            continue;
        }
        if (stillUnmatched.length === 1) {
            const entry = stillUnmatched[0];
            matches.push({
                studentId: entry.id,
                name: entry.name,
                matchedText: tokens[index].raw,
                matchType: 'first',
            });
            matchedIds.add(entry.id);
            used[index] = true;
            continue;
        }

        const alreadyReported = ambiguous.some((item) => item.matchedText === tokens[index].raw);
        if (!alreadyReported) {
            ambiguous.push({
                matchedText: tokens[index].raw,
                candidateIds: stillUnmatched.map((entry) => entry.id),
            });
        }
        used[index] = true;
    }

    return {
        matches,
        ambiguous,
        matchedStudentIds: [...matchedIds],
    };
};

export const rosterNames = (students = []) => students
    .map((student) => fullNameOf(student))
    .filter(Boolean);
