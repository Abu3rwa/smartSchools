/**
 * Prompt building and response parsing for the Writing Assistant.
 * Imported only by teacher-triggered code, never by a student request path.
 */
import {
    alignSections,
    countWords,
    draftDiffSummary,
    guardRecommendation,
    mergeRevisionLedger,
    rubricRatio,
    selectSpellingTargets,
    stalledTasksFrom,
    tasksForCheckback,
    tasksFromPriorities,
    verifiedSpellingWins
} from './writingAssistantLogic.js';
import {
    CONTENT_RULES,
    PRIVACY_RULES,
    STUDENT_TOKEN,
    scrubForPrompt
} from './aiPromptSafety.js';

const MAX_STUDENT_CHARS = 12000;
const MAX_LIST_ITEMS = 6;
const MAX_TEXT_CHARS = 700;

const clean = (value, max = MAX_TEXT_CHARS) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
};

const stringList = (value, max = MAX_LIST_ITEMS) => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => clean(item, 260)).filter(Boolean).slice(0, max);
};

const clampScore = (value, maxScore) => {
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0) return 0;
    return Math.min(score, maxScore);
};

/**
 * The student's own writing, section-labelled, with a hard budget. The key and
 * index are printed because feedback is filed back under them: without them the
 * model can only guess, and a guessed index leaves the note unattached.
 */
export const renderDraftForPrompt = (draft, { studentName = '' } = {}) => {
    let budget = MAX_STUDENT_CHARS;
    const blocks = [];
    for (const section of draft?.sections || []) {
        const index = Number(section.index) || 0;
        const heading = `${section.label || section.key} [key: ${section.key}, index: ${index}] (draft ${draft.number}, ${section.words ?? countWords(section.text)} words)`;
        const body = clean(scrubForPrompt(section.text, { name: studentName, phoneNumbers: false }), budget);
        if (!body) {
            blocks.push(`${heading}\n[empty]`);
            continue;
        }
        const cost = heading.length + body.length + 2;
        if (cost > budget) break;
        budget -= cost;
        blocks.push(`${heading}\n${body}`);
    }
    return blocks.join('\n\n');
};

const renderRubric = (snapshot) => {
    if (!(snapshot.rubric || []).length) return 'No rubric was supplied. Judge against the section criteria only.';
    return (snapshot.rubric || [])
        .map((criterion) => {
            const scope = (criterion.appliesToSections || ['*']).join(', ');
            return `- ${criterion.key}: ${criterion.label} (0–${criterion.maxScore} points, applies to: ${scope})${criterion.description ? `: ${criterion.description}` : ''}`;
        })
        .join('\n');
};

const renderCriteria = (snapshot) => (snapshot.sections || [])
    .map((section) => `- ${section.key}: ${section.label}${(section.criteria || []).length ? ` (${section.criteria.join('; ')})` : ''}`)
    .join('\n');

/**
 * What the AI may know about a student's current need, and the lines it may not
 * cross with it: the profile steers the explanation, never the student-facing text.
 */
const profileBlock = (profile) => {
    if (!profile) return '';
    const pitch = {
        emerging: 'This student is still building control. Give one clear improvement at a time, in plain words, with a short example.',
        developing: 'This student can work on two linked improvements at once. Explain each with one concrete example.',
        secure: 'This student is ready for precise, ambitious suggestions that stretch the piece.'
    }[profile.tier];
    const spelling = [];
    if (profile.spellingGrade) spelling.push(`their weekly spelling list is at ${profile.spellingGrade} level`);
    if (Number.isFinite(profile.spellingAccuracy)) {
        spelling.push(`recent spelling accuracy is about ${Math.round(profile.spellingAccuracy)}%`);
    }
    if (!pitch && !spelling.length) return '';
    return `\nHow to pitch this feedback (use it only to choose what to say; never name, label, quote or hint at a level, tier, grade or accuracy figure to the student):\n${pitch ? `- ${pitch}\n` : ''}${spelling.length ? `- Spelling context: ${spelling.join(', ')}. Pick corrections the student can act on at that level.\n` : ''}`;
};

const draftText = (draft) => (draft?.sections || []).map((section) => section?.text || '').join(' ');

const spellingBlock = (candidates = []) => {
    if (!candidates.length) return '';
    const rows = candidates
        .map((row) => `- ${clean(row.word, 60)}${row.grade ? ` (${row.grade}` : ''}${row.grade && row.week ? `, week ${row.week}` : ''}${row.grade ? ')' : ''}`)
        .join('\n');
    return `\nSpelling words this student recently missed (the only words allowed as targets):\n${rows}\n`;
};

const spellingTargetRule = (hasCandidates) => (hasCandidates
    ? '- In "spellingTargets", return 0 to 3 exact words copied from the missed-word list, choosing only words that genuinely fit this assignment\'s topic. An empty list is normal: never force a word, translate it or invent one. Never claim or hint that the student used one of these words; whether they did is checked outside your reply.\n'
    : '- Return "spellingTargets": [] because no missed-word list was supplied.\n');

const guardrailBlock = (snapshot, aiConstraints) => `Rules you must follow:
- Writing is a process. Teach and guide; never rewrite the student's sentences or paragraphs. Word-level spelling corrections are allowed. Do not supply replacement sentences, model paragraphs, or answers the student has not attempted.
- Every improvement must quote the student's own words as evidence, and say why that matters for this assignment.
- Check spelling even when it is not a separate rubric criterion. For a clear misspelling whose intended word is clear from context, quote the exact word from the draft and give its correct spelling (original → correction). Example only, if present in the draft: "becues" → "because". Briefly explain how the correction helps the reader.
- If the intended word is unclear, quote it and ask the student to check and rewrite the word they meant. Do not guess or offer speculative replacements. Do not stop at vague comments such as "hard to read" or "check your spelling".
- Do not invent spelling errors or flag valid spelling variants or names. If no spelling errors are evident, do not add a spelling problem. Keep quoted words and spelling corrections in the draft's language, even when the feedback language differs.
- Spelling guidance must accompany, not replace, feedback on ideas and organisation. Deduct marks only where the supplied rubric covers spelling; do not change unrelated scores for spelling mistakes.
- Judge only what the assignment asks for. A student must not be marked down for a technique that was never required at their level.
- Do not treat longer text or more complicated sentences as automatically better. Reward clarity, support, and cohesion.
- Keep wording a ${snapshot.expectedLevel || 'school-age'} student can act on. No assessment jargon.
${aiConstraints ? `- Teacher constraints: ${clean(aiConstraints, 900)}` : ''}
- Reply with a single JSON object and nothing else.`;

export const buildFeedbackPrompt = ({
    snapshot,
    draft,
    studentName = '',
    goal = '',
    aiConstraints = '',
    stalledTasks = [],
    profile = null,
    spellingCandidates = [],
    language = 'en'
}) => {
    const stalledBlock = stalledTasks.length
        ? `\nTasks that have survived two revisions without being done:\n${stalledTasks.map((task) => `- ${clean(task.text, 260)}`).join('\n')}\nDo not repeat the same instruction in the same words. Break each one into the smallest next step, point at one line, and say plainly what is still missing.\n`
        : '';

    return `You are a writing teacher giving feedback on one submitted draft.

Assignment: ${clean(snapshot.title, 200)} (${snapshot.writingType})
Topic: ${clean(snapshot.topic, 300)}
Instructions given to the student: ${clean(snapshot.instructions, 1200) || 'None.'}
Length target: ${snapshot.minWords || 0}-${snapshot.maxWords || 0} words
Expected level: ${clean(snapshot.expectedLevel, 200) || 'Not stated'}
The draft was written by one student whose name you do not know. Write ${STUDENT_TOKEN} if a name is ever needed, and never invent one.${goal ? `\nIndividual goal for this student: ${clean(goal, 400)}` : ''}${profileBlock(profile)}${spellingBlock(spellingCandidates)}
Draft number: ${draft.number}${stalledBlock}
Structure required:
${renderCriteria(snapshot)}
Rubric:
${renderRubric(snapshot)}

The student's draft:
<<<
${renderDraftForPrompt(draft, { studentName })}
>>>

${guardrailBlock(snapshot, aiConstraints)}
${PRIVACY_RULES}

${CONTENT_RULES}
${spellingTargetRule(spellingCandidates.length > 0)}Put spelling corrections or clarification requests in the relevant section's "improvements", alongside content feedback. Keep each item under 260 characters and use at most 6 improvements per section; select useful examples rather than a long error list.
Write the feedback in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}.

JSON shape:
{
  "sections": [
    {
      "key": "<one of the section keys listed above, e.g. body>",
      "index": <the index printed with that section in the draft>,
      "strengths": ["<what is working well>"],
      "improvements": ["<what needs improvement>"],
      "evidence": "<a short quote from the student's own writing>",
      "why": "<why this matters for this assignment>",
      "nextStep": "<one specific action the student can take>",
      "score": <number 0 to the criterion maximum>
    }
  ],
  "overall": {
    "summary": "<3-4 sentences on the piece as a whole>",
    "organisation": "<how the pieces are ordered>",
    "centralIdea": "<whether one idea is held>",
    "flow": "<how paragraphs join>",
    "repetition": "<anything repeated or missing>",
    "requirements": "<how far the assignment brief is met>",
    "nextPriorities": ["<up to 3 things, most important first>"]
  },
  "scores": [
    { "key": "<one of the rubric keys listed above>", "score": <number>, "explanation": "<why>", "evidence": "<a short quote from the student's own writing>" }
  ],
  "spellingTargets": ["<0 to 3 exact words from the missed-word list, only if they fit this topic>"],
  "recommendation": { "path": "revise", "reason": "<one sentence>" }
}

Give one "sections" entry for every section the student wrote, including empty ones. Use only the section keys listed above.
Every rubric score needs "evidence": the exact short phrase from the draft the score is based on. Copy it word for word. If no single phrase shows that criterion, leave "evidence" empty rather than inventing one.`;
};

export const buildComparisonPrompt = ({
    snapshot,
    previousDraft,
    currentDraft,
    previousAssessment,
    studentName = '',
    goal = '',
    aiConstraints = '',
    profile = null,
    spellingCandidates = [],
    language = 'en'
}) => {
    const priorFeedback = (previousAssessment?.sections || [])
        .map((section) => `- ${section.label || section.key}: ${section.nextStep || (section.improvements || [])[0] || 'no next step recorded'}`)
        .join('\n') || 'No earlier feedback was recorded.';

    const priorTasks = tasksForCheckback(previousAssessment);
    const taskBlock = priorTasks.length
        ? `\nThe tasks the student was asked to do (check each one by its id):\n${priorTasks.map((task) => `- ${task.id}: ${task.text}`).join('\n')}\n`
        : '';

    return `You are comparing two submitted drafts by the same student on the same assignment, and saying what the revision achieved.

Assignment: ${clean(snapshot.title, 200)} (${snapshot.writingType})
Expected level: ${clean(snapshot.expectedLevel, 200) || 'Not stated'}
Length target: ${snapshot.minWords || 0}-${snapshot.maxWords || 0} words
The drafts were written by one student whose name you do not know. Write ${STUDENT_TOKEN} if a name is ever needed, and never invent one.${goal ? `\nIndividual goal: ${clean(goal, 400)}` : ''}${profileBlock(profile)}${spellingBlock(spellingCandidates)}
Structure required:
${renderCriteria(snapshot)}
Rubric:
${renderRubric(snapshot)}

Feedback given on draft ${previousDraft.number} (the next steps the student was asked to act on):
${priorFeedback}
${taskBlock}
Draft ${previousDraft.number}:
<<<
${renderDraftForPrompt(previousDraft, { studentName })}
>>>

Draft ${currentDraft.number}:
<<<
${renderDraftForPrompt(currentDraft, { studentName })}
>>>

${guardrailBlock(snapshot, aiConstraints)}
${PRIVACY_RULES}

${CONTENT_RULES}
${spellingTargetRule(spellingCandidates.length > 0)}Be specific and encouraging. Say which requested feedback was actually applied and which was not.
Report one "taskResults" entry for every task id listed above, even one the student ignored. Quote the new words that show a task was done; when it was not done, say what is still missing. Use the id exactly as given.
Name any new problem the revision introduced. Do not count a synonym swap as an improvement.
Report corrected spellings in "changedBySection", quoting the old and corrected words. Only flag spelling problems still present in the current draft: give corrections or clarification requests in that section's summary and, when a priority, in "overall.nextPriorities". Use "newIssues" only for errors newly introduced in this revision. Do not report a corrected old misspelling as a current problem.
Write the feedback in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}.

JSON shape:
{
  "changedBySection": [
    { "key": "<one of the section keys listed above>", "index": "<the index printed with that section>", "summary": "<what changed and whether it matters>", "meaningful": <true|false>, "kind": "changed" }
  ],
  "criteriaImproved": ["<rubric or section criterion labels that got stronger>"],
  "criteriaUnresolved": ["<criteria still not met>"],
  "feedbackApplied": [
    { "key": "<section key>", "note": "<the feedback you gave before>", "applied": <true|false> }
  ],
  "taskResults": [
    { "id": "<task id from the list above>", "applied": <true|false>, "note": "<what the student did, quoting their new words>" }
  ],
  "newIssues": ["<anything worse than before>"],
  "encouragement": "<one or two sentences the student should read first>",
  "overall": { "summary": "<how the piece as a whole moved>", "nextPriorities": ["<up to 3>"] },
  "scores": [ { "key": "<one of the rubric keys listed above>", "score": <number>, "explanation": "<change since the last draft>", "evidence": "<a short quote from the current draft>" } ],
  "spellingTargets": ["<0 to 3 exact words from the missed-word list, only if they fit this topic>"],
  "recommendation": { "path": "revise" | "notebook", "reason": "<one sentence>" }
}`;
};

/** Models wrap JSON in prose or fences often enough that it has to be handled. */
export const extractJsonObject = (raw) => {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const candidates = [];
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) candidates.push(fenced[1]);
    candidates.push(text);
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate.trim());
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
            // try the next candidate
        }
    }
    return null;
};

const evidenceIsReal = (evidence, draft) => {
    const quote = String(evidence || '').trim();
    if (quote.length < 4) return false;
    const haystack = (draft?.sections || [])
        .map((section) => String(section.text || ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
    return haystack.includes(quote.replace(/\s+/g, ' ').toLowerCase());
};

const keySlug = (value) => String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * The key a reply meant, matched against the real keys and their labels. A model
 * that answers "Body paragraph" instead of "body" is still describing a section
 * the draft has, so the note is filed under the real key rather than thrown away
 * and leaving the email with nothing to anchor a comment to.
 */
const resolveKey = (candidates, raw) => {
    const wanted = keySlug(raw);
    if (!wanted) return null;
    const rows = candidates || [];
    const match = rows.find((row) => row.key === raw)
        || rows.find((row) => keySlug(row.key) === wanted)
        || rows.find((row) => keySlug(row.label) === wanted);
    return match ? match.key : null;
};

/** Rubric rows, each keeping only a quote that really is in the draft judged. */
const normalizeScores = (rows, snapshot, draft) => {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => ({ row, key: resolveKey(snapshot?.rubric, row?.key) }))
        .filter(({ key }) => key)
        .map(({ row, key }) => {
            const criterion = (snapshot.rubric || []).find((item) => item.key === key);
            const evidence = clean(row.evidence, 300);
            return {
                key,
                label: clean(criterion?.label || key, 120),
                score: clampScore(row.score, criterion?.maxScore),
                maxScore: Number(criterion?.maxScore) || 0,
                explanation: clean(row.explanation, 400),
                evidence: evidenceIsReal(evidence, draft) ? evidence : ''
            };
        });
};

/** One verdict per task the student was given; unknown or repeated ids drop out. */
const normalizeTaskResults = (rows, tasks) => {
    const known = new Set(tasks.map((task) => task.id));
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
        .filter((row) => {
            const id = String(row?.id || '');
            if (!known.has(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .map((row) => ({
            id: String(row.id),
            applied: row.applied === true,
            note: clean(row.note, 400)
        }));
};

const validSectionRef = (snapshot, key) => Boolean(resolveKey(snapshot?.sections, key));

/**
 * A reply that numbers every body paragraph 0 still fills each slot once. The
 * draft's own slots decide what exists, so a note never lands on a paragraph
 * the student did not write.
 */
const freeSlot = ({ draft, key, requested, taken }) => {
    const slots = (draft?.sections || [])
        .filter((row) => row?.key === key)
        .map((row) => Number(row?.index) || 0);
    const id = (index) => `${key}:${index}`;
    const free = slots.filter((index) => !taken.has(id(index)));
    if (!free.length) return null;
    return free.includes(requested) ? requested : free[0];
};

export const normalizeFeedback = ({
    parsed,
    draft,
    snapshot,
    assignment = {},
    spellingCandidates = []
}) => {
    if (!parsed) {
        return { ok: false, error: 'The AI reply could not be read as JSON.' };
    }

    const maxFor = (key) => {
        const criterion = (snapshot?.rubric || []).find((row) => row.key === key);
        return criterion ? Number(criterion.maxScore) || 0 : 0;
    };

    const taken = new Set();
    const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
        .map((row) => ({ row, key: resolveKey(snapshot?.sections, row?.key) }))
        .filter(({ key }) => key)
        .map(({ row, key }) => {
            const definition = (snapshot.sections || []).find((item) => item.key === key);
            const requested = Number.isFinite(Number(row.index)) ? Number(row.index) : 0;
            const index = freeSlot({ draft, key, requested, taken });
            if (index === null) return null;
            taken.add(`${key}:${index}`);
            const evidence = clean(row.evidence, 300);
            const limit = maxFor((snapshot.rubric || [])[0]?.key) || 5;
            return {
                key,
                index,
                label: clean(definition?.label || key, 120),
                strengths: stringList(row.strengths),
                improvements: stringList(row.improvements),
                evidence: evidenceIsReal(evidence, draft) ? evidence : '',
                why: clean(row.why, 400),
                nextStep: clean(row.nextStep, 400),
                score: clampScore(row.score, limit),
                maxScore: limit
            };
        })
        .filter(Boolean);

    const scores = normalizeScores(parsed.scores, snapshot, draft);

    const overallSource = parsed.overall || {};
    const overall = {
        summary: clean(overallSource.summary, 1200),
        organisation: clean(overallSource.organisation, 600),
        centralIdea: clean(overallSource.centralIdea, 600),
        flow: clean(overallSource.flow, 600),
        repetition: clean(overallSource.repetition, 600),
        requirements: clean(overallSource.requirements, 600),
        nextPriorities: stringList(overallSource.nextPriorities, 3)
    };

    if (!sections.length && !overall.summary) {
        return { ok: false, error: 'The AI reply contained no usable feedback.' };
    }

    return {
        ok: true,
        sections,
        overall,
        scores,
        tasks: tasksFromPriorities(overall.nextPriorities),
        spellingTargets: selectSpellingTargets({
            suggestions: parsed?.spellingTargets,
            candidates: spellingCandidates,
            assignment,
            draftText: draftText(draft)
        }),
        totalScore: scores.reduce((sum, row) => sum + row.score, 0),
        recommendation: {
            path: parsed?.recommendation?.path === 'notebook' ? 'notebook' : 'revise',
            reason: clean(parsed?.recommendation?.reason, 400)
        }
    };
};

export const normalizeComparison = ({
    parsed,
    previousDraft,
    currentDraft,
    previousAssessment,
    snapshot,
    ledger = [],
    assignment = {},
    spellingCandidates = [],
    // The words the student was actually shown for the previous draft, whatever
    // kind of assessment published them. Falls back to that draft's feedback.
    priorSpellingTargets = null
}) => {
    if (!parsed) {
        return { ok: false, error: 'The AI reply could not be read as JSON.' };
    }

    const alignment = alignSections(previousDraft?.sections, currentDraft?.sections);
    const summary = draftDiffSummary(alignment);
    const tasks = tasksForCheckback(previousAssessment);

    const seen = new Set(alignment.matched.map((row) => `${row.key}:${row.index}`));
    const changedBySection = (Array.isArray(parsed.changedBySection) ? parsed.changedBySection : [])
        .filter((row) => row && validSectionRef(snapshot, row?.key))
        .map((row) => {
            const key = resolveKey(snapshot?.sections, row.key);
            const index = Number.isFinite(Number(row.index)) ? Number(row.index) : 0;
            const definition = (snapshot.sections || []).find((item) => item.key === key);
            return {
                key,
                index,
                label: clean(definition?.label || key, 120),
                summary: clean(row.summary, 500),
                meaningful: row.meaningful === true,
                kind: row.kind === 'added' || row.kind === 'removed'
                    ? row.kind
                    : (seen.has(`${key}:${index}`) ? 'changed' : 'added')
            };
        });

    // Sections the student added or deleted are reported even if the AI ignored them.
    for (const section of alignment.added) {
        const id = `${section.key}:${section.index}`;
        if (changedBySection.some((row) => `${row.key}:${row.index}` === id)) continue;
        const definition = (snapshot.sections || []).find((item) => item.key === section.key);
        changedBySection.push({
            key: section.key,
            index: section.index,
            label: clean(definition?.label || section.key, 120),
            summary: 'A new section appears in this draft.',
            meaningful: countWords(section.text) > 0,
            kind: 'added'
        });
    }
    for (const section of alignment.removed) {
        const id = `${section.key}:${section.index}`;
        if (changedBySection.some((row) => `${row.key}:${row.index}` === id)) continue;
        const definition = (snapshot.sections || []).find((item) => item.key === section.key);
        changedBySection.push({
            key: section.key,
            index: section.index,
            label: clean(definition?.label || section.key, 120),
            summary: 'A section from the previous draft is no longer there.',
            meaningful: true,
            kind: 'removed'
        });
    }

    const priorNotes = new Map(
        (previousAssessment?.sections || []).map((section) => [
            `${section.key}:${section.index}`,
            section.nextStep || (section.improvements || [])[0] || ''
        ])
    );
    const feedbackApplied = (Array.isArray(parsed.feedbackApplied) ? parsed.feedbackApplied : [])
        .filter((row) => row && validSectionRef(snapshot, row?.key))
        .map((row) => {
            const key = resolveKey(snapshot?.sections, row.key);
            const index = Number.isFinite(Number(row.index)) ? Number(row.index) : 0;
            const id = `${key}:${index}`;
            return {
                key,
                index,
                note: clean(row.note, 400) || priorNotes.get(id) || '',
                applied: row.applied === true
            };
        });

    const overallSource = parsed.overall || {};
    const taskResults = normalizeTaskResults(parsed.taskResults, tasks);
    const revisionLedger = mergeRevisionLedger({
        ledger,
        tasks,
        taskResults,
        draftNumber: Number(currentDraft?.number) || 1
    });
    return {
        ok: true,
        alignment,
        summary,
        changedBySection,
        tasks,
        taskResults,
        revisionLedger,
        stalledTasks: stalledTasksFrom(revisionLedger),
        spellingTargets: selectSpellingTargets({
            suggestions: parsed?.spellingTargets,
            candidates: spellingCandidates,
            assignment,
            draftText: draftText(currentDraft)
        }),
        // A used word is a fact read from the draft, never a model claim.
        spellingWins: verifiedSpellingWins({
            targets: Array.isArray(priorSpellingTargets)
                ? priorSpellingTargets
                : (previousAssessment?.publish?.state === 'published'
                    ? previousAssessment?.spellingTargets || []
                    : []),
            draftText: draftText(currentDraft)
        }),
        criteriaImproved: stringList(parsed.criteriaImproved, 8),
        criteriaUnresolved: stringList(parsed.criteriaUnresolved, 8),
        feedbackApplied,
        newIssues: [
            ...stringList(parsed.newIssues, 6),
            ...alignment.removed.map((section) => `Section “${section.label || section.key}” was removed.`)
        ],
        wordDelta: summary.wordDelta,
        encouragement: clean(parsed.encouragement, 600),
        overall: {
            summary: clean(overallSource.summary, 1200),
            nextPriorities: stringList(overallSource.nextPriorities, 3)
        },
        scores: normalizeScores(parsed.scores, snapshot, currentDraft),
        recommendation: {
            path: parsed?.recommendation?.path === 'notebook' ? 'notebook' : 'revise',
            reason: clean(parsed?.recommendation?.reason, 400)
        }
    };
};

/** The teacher-visible recommendation, held to the numbers. */
export const decideRecommendation = ({ normalized }) => {
    const ratio = rubricRatio({ scores: normalized.scores || [] });
    const comparison = normalized.comparison || {
        criteriaUnresolved: normalized.criteriaUnresolved || [],
        newIssues: normalized.newIssues || []
    };
    const decision = guardRecommendation({
        aiPath: normalized.recommendation?.path,
        assessment: {
            comparison,
            scores: normalized.scores || []
        },
        stalled: (normalized.stalledTasks || []).length
    });
    return { ...decision, ratio };
};
