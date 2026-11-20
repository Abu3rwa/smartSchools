/**
 * Phase 4 revision intelligence: what really changed between two drafts, which
 * tasks are atomic, which improvement claims are computed facts, whether a
 * quoted task was verified, and how word-support and spelling-target lists are
 * ranked. Pure text and data only — nothing here calls the AI or the database.
 */

const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export const revisionTokens = (value) =>
  String(value || "")
    .toLowerCase()
    .match(TOKEN) || [];

// Function words carry no topic signal, so they never make a word "fit".
const STOP_WORDS = new Set(
  `a an and are as at be been but by can could did do does for from had has have he her him his how i if in into is it its just may me more most my no not of on or our she should so some than that the their them then there these they this those to too up us very was we were what when where which who why will with would you your yours`
    .split(/\s+/)
    .filter(Boolean),
);

export const contentTokens = (value) =>
  revisionTokens(value).filter((token) => token.length > 1 && !STOP_WORDS.has(token));

export const topicTokens = (...values) =>
  [...new Set(contentTokens(values.filter(Boolean).join(" ")))];

/* ------------------------------------------------------------------ */
/* D1. Atomic tasks                                                    */
/* ------------------------------------------------------------------ */

const ACTION_VERBS = new Set(
  `add answer avoid begin change check choose combine connect correct cut describe develop edit end explain finish fix give include join keep link list make move open outline proofread put read remove replace revise rewrite shorten simplify split start stop support tidy trim underline use write`
    .split(/\s+/)
    .filter(Boolean),
);

const DETERMINERS = new Set(
  "a an the your my our its his her their this that these those each every one two three".split(
    /\s+/,
  ),
);

const MAX_TASK_CHARS = 160;
const MAX_TASKS = 3;

const tidyTask = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:—–-]+/, "")
    .replace(/[\s,;:—–-]+$/, "")
    .trim();

const firstWord = (text) => revisionTokens(text)[0] || "";

const startsWithAction = (text) => {
  const word = firstWord(text);
  return ACTION_VERBS.has(word) || (word.length > 4 && word.endsWith("ing"));
};

const startsWithDeterminer = (text) => DETERMINERS.has(firstWord(text));

/**
 * A bundle is two actions in one sentence. Split it when the right side is its
 * own verb phrase, or when it is a noun phrase completing the left side's verb
 * ("Fix the spelling and clarity" → two fixes). Anything less clear stays one
 * task: a ledger row has to be checkable on its own.
 */
const splitBundle = (text) => {
  const parts = text.split(/\s+(?:and|&)\s+/i);
  if (parts.length !== 2) return [text];
  const [leftRaw, rightRaw] = parts.map(tidyTask);
  if (!leftRaw || !rightRaw) return [text];

  if (startsWithAction(rightRaw)) return [leftRaw, rightRaw];
  if (startsWithDeterminer(rightRaw) && startsWithAction(leftRaw)) {
    // The derived task starts with the verb as the teacher wrote it.
    const verb = leftRaw.split(/\s+/)[0];
    const right = tidyTask(`${verb} ${rightRaw}`);
    if (revisionTokens(right).length >= 2) return [leftRaw, right];
  }
  return [text];
};

/**
 * The priorities a student may be asked to act on. One action each, short
 * enough to check, and never a two-part bundle. Ids stay positional, so the
 * ledger sees stable slots.
 */
export const atomicTasks = (texts = []) => {
  const out = [];
  const seen = new Set();
  for (const raw of texts || []) {
    for (const piece of splitBundle(tidyTask(raw))) {
      if (piece.length < 6 || piece.length > MAX_TASK_CHARS) continue;
      const key = piece.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(piece);
      if (out.length === MAX_TASKS) return out;
    }
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* D3. Computed improvement claims                                     */
/* ------------------------------------------------------------------ */

const labelKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The only things "got stronger" may say. Every fact is read from saved data:
 * a rubric score that rose, a task the revision verified, a target word the
 * draft now uses, a section that did not exist before. The model narrates
 * this list; it cannot extend it.
 */
export const computedImprovements = ({
  previousScores = [],
  currentScores = [],
  taskResults = [],
  spellingWins = [],
  addedSections = [],
  sectionLabels = {},
} = {}) => {
  const facts = [];
  const before = new Map(
    (previousScores || []).map((row) => [String(row.key || ""), row]),
  );
  for (const row of currentScores || []) {
    const earlier = before.get(String(row.key || ""));
    if (!earlier || row.focusExcluded === true) continue;
    const delta = (Number(row.score) || 0) - (Number(earlier.score) || 0);
    if (delta <= 0) continue;
    facts.push({
      kind: "rubric",
      label: String(row.label || row.key || ""),
      detail: `Score rose by ${delta}.`,
    });
  }
  for (const task of taskResults || []) {
    if (task?.applied !== true) continue;
    facts.push({
      kind: "task",
      label: String(task.text || ""),
      detail: "The requested change was found in the new draft.",
    });
  }
  for (const row of spellingWins || []) {
    const word = String(row?.word || "").trim();
    if (!word) continue;
    facts.push({
      kind: "spelling",
      label: word,
      detail: "A target word now appears in the draft.",
    });
  }
  for (const section of addedSections || []) {
    const label = sectionLabels[`${section.key}:${section.index}`] || section.label || section.key;
    facts.push({
      kind: "structure",
      label: String(label || ""),
      detail: "A new section appears in this draft.",
    });
  }
  return facts.filter((fact) => fact.label);
};

const claimMatches = (claim, fact) => {
  const a = labelKey(claim);
  const b = labelKey(fact.label);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(" "));
  const bTokens = b.split(" ").filter((token) => token && !STOP_WORDS.has(token));
  if (!bTokens.length) return false;
  const shared = bTokens.filter((token) => aTokens.has(token)).length;
  return shared / bTokens.length >= 0.6;
};

/**
 * The model's "got stronger" list, kept only where a computed fact backs it.
 * Facts the reply did not name are added from the data, so the panel never
 * shows an empty claim list while the numbers say something rose.
 */
export const filterImprovementClaims = ({ claims = [], facts = [] }) => {
  const kept = [];
  const used = new Set();
  for (const claim of claims || []) {
    const index = facts.findIndex((fact, position) => {
      if (used.has(position)) return false;
      return claimMatches(claim, fact);
    });
    if (index === -1) continue;
    used.add(index);
    kept.push(String(claim).trim());
  }
  for (let position = 0; position < facts.length; position += 1) {
    if (used.has(position)) continue;
    const label = String(facts[position].label || "").trim();
    if (label && !kept.some((claim) => claimMatches(claim, facts[position]))) {
      kept.push(label);
    }
  }
  return kept;
};

/* ------------------------------------------------------------------ */
/* D4. New issues must be new                                          */
/* ------------------------------------------------------------------ */

const containsSpan = (text, span) => {
  const haystack = ` ${revisionTokens(text).join(" ")} `;
  const needle = revisionTokens(span).join(" ");
  if (!needle) return false;
  return haystack.includes(` ${needle} `);
};

/**
 * An issue is new only when the words that show it were not in the earlier
 * draft. A problem present in both is unresolved, never new. An issue with no
 * quote cannot prove either, so it is kept as unverified and the teacher sees
 * that instead of a false claim.
 */
export const classifyNewIssue = ({
  text,
  evidence,
  previousText = "",
  currentText = "",
} = {}) => {
  const label = tidyTask(text);
  if (!label) return null;
  const quote = tidyTask(evidence);
  if (!quote) return { text: label, evidence: "", verified: false };
  if (containsSpan(previousText, quote)) return null;
  return {
    text: label,
    evidence: quote,
    verified: containsSpan(currentText, quote),
  };
};

/* ------------------------------------------------------------------ */
/* D5. Task evidence quoting                                           */
/* ------------------------------------------------------------------ */

const longestSharedRun = (noteTokens, otherTokens, minimum = 3) => {
  for (let length = Math.min(6, noteTokens.length); length >= minimum; length -= 1) {
    for (let start = 0; start + length <= noteTokens.length; start += 1) {
      const run = noteTokens.slice(start, start + length).join(" ");
      const haystack = ` ${otherTokens.join(" ")} `;
      if (haystack.includes(` ${run} `)) return run;
    }
  }
  return "";
};

/**
 * A task is done only when its note quotes words that are in the new draft and
 * were not in the earlier one. Without that quote the model's word is not
 * enough: the row stays unresolved and the teacher is told it is unverified.
 */
export const verifyTaskQuote = ({
  note = "",
  currentText = "",
  previousText = "",
} = {}) => {
  const noteTokens = revisionTokens(note);
  if (!noteTokens.length) return { verified: false, quote: "" };
  const currentTokens = revisionTokens(currentText);
  const previousTokens = revisionTokens(previousText);
  const quoted = longestSharedRun(noteTokens, currentTokens);
  if (!quoted) return { verified: false, quote: "" };
  const inEarlier = ` ${previousTokens.join(" ")} `.includes(` ${quoted} `);
  if (inEarlier) return { verified: false, quote: "" };
  return { verified: true, quote: quoted };
};

/* ------------------------------------------------------------------ */
/* D6. Meaningful change detection                                     */
/* ------------------------------------------------------------------ */

const tokensOf = (text) => revisionTokens(text);

const similarityOf = (beforeText, afterText) => {
  const before = new Set(tokensOf(beforeText));
  const after = new Set(tokensOf(afterText));
  if (!before.size || !after.size) return 0;
  let shared = 0;
  for (const token of after) if (before.has(token)) shared += 1;
  return shared / Math.max(before.size, after.size);
};

/**
 * What the revision did, in words, before any word count. A 44-word increase
 * that only swaps synonyms is "mostly reworded", not progress; a rebuilt
 * paragraph is "rewritten"; a new or removed part is named outright.
 */
export const diffStory = (alignment, { sectionLabels = {} } = {}) => {
  const changes = [];
  const labelFor = (row) =>
    sectionLabels[`${row.key}:${row.index}`] || row.label || row.key;
  for (const section of alignment?.added || []) {
    changes.push({
      kind: "added",
      key: section.key,
      index: Number(section.index) || 0,
      label: labelFor(section),
      wordDelta: revisionTokens(section.text).length,
    });
  }
  for (const section of alignment?.removed || []) {
    changes.push({
      kind: "removed",
      key: section.key,
      index: Number(section.index) || 0,
      label: labelFor(section),
      wordDelta: -revisionTokens(section.text).length,
    });
  }
  let reworded = 0;
  for (const row of alignment?.matched || []) {
    if (row.changed !== true) continue;
    const beforeText = String(row.before?.text || "");
    const afterText = String(row.after?.text || "");
    const similarity = similarityOf(beforeText, afterText);
    const wordDelta =
      revisionTokens(afterText).length - revisionTokens(beforeText).length;
    let kind = "developed";
    if (similarity >= 0.85 && Math.abs(wordDelta) <= 6) kind = "reworded";
    else if (similarity < 0.6) kind = "rewritten";
    if (kind === "reworded") reworded += 1;
    changes.push({
      kind,
      key: row.key,
      index: Number(row.index) || 0,
      label: sectionLabels[`${row.key}:${row.index}`] || row.key,
      wordDelta,
      similarity: Math.round(similarity * 100) / 100,
    });
  }
  const changedCount = changes.filter((row) => row.kind !== "added" && row.kind !== "removed").length;
  const mostlyReworded =
    changedCount > 0 &&
    reworded >= Math.ceil(changedCount / 2) &&
    !changes.some((row) => row.kind === "added" || row.kind === "removed");
  return { mostlyReworded, changes };
};

/* ------------------------------------------------------------------ */
/* D2. Stall suggestions                                               */
/* ------------------------------------------------------------------ */

/**
 * After two ignored checks the teacher gets a concrete move, not a label. The
 * escalation is deterministic so the same stall always reads the same way.
 */
export const stallSuggestion = (row = {}) => {
  const streak = Number(row.unresolvedStreak) || 0;
  if (streak >= 4) return "conference";
  if (streak >= 3) return "model";
  return "reduce";
};

/* ------------------------------------------------------------------ */
/* G1/G3/G4/G6. Spelling targets and word support                      */
/* ------------------------------------------------------------------ */

// Topic fit compares base forms, so "playgrounds" still fits "playground".
// Stripping is a hint only; a wrong stem can at worst tie two candidates.
const stem = (token) => {
  const value = String(token || "").toLowerCase();
  if (value.length > 4 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 4 && /(?:ches|shes|sses|xes|zes)$/.test(value)) {
    return value.slice(0, -2);
  }
  if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) {
    return value.slice(0, -1);
  }
  if (value.length > 5 && value.endsWith("ing")) return value.slice(0, -3);
  if (value.length > 4 && value.endsWith("ed")) return value.slice(0, -2);
  return value;
};

const overlapScore = (word, tokens, weight) => {
  if (!tokens.length) return { score: 0, tokens: [] };
  const wordStems = new Set(revisionTokens(word).map(stem));
  const matched = tokens.filter((token) => wordStems.has(stem(token)));
  return { score: matched.length * weight, tokens: matched };
};

const fitReason = ({ matchedTopic, matchedDraft, priorTarget, wasTarget }) => {
  if (matchedTopic.length) {
    return `Fits the topic (${matchedTopic.slice(0, 2).join(", ")}).`;
  }
  if (priorTarget) return "Was a target in earlier feedback.";
  if (matchedDraft.length) {
    return `Uses words from this draft (${matchedDraft.slice(0, 2).join(", ")}).`;
  }
  if (wasTarget) return "Was a target before and is still fragile.";
  return "On the student's missed-word list.";
};

/**
 * Rank every eligible missed word by topic fit, then by the model's ordering,
 * and take the small number a child can act on (2 for emerging, 3 otherwise).
 * The model's list is a hint that breaks ties; a weak-fit word never wins over
 * a better candidate, and each row carries the reason the teacher can check.
 */
export const rankSpellingCandidates = ({
  candidates = [],
  suggestions = [],
  assignment = {},
  draftText = "",
  tier = "developing",
  publishedTargets = [],
  graduatedWords = [],
} = {}) => {
  const topic = topicTokens(assignment.title, assignment.topic, assignment.instructions);
  const draft = [...new Set(contentTokens(draftText))];
  const used = new Set(revisionTokens(draftText));
  // Words the assignment itself supplies are busywork if suggested back.
  const owned = new Set(
    revisionTokens(
      [
        assignment.title,
        assignment.topic,
        assignment.instructions,
        (assignment?.supports?.wordBank || []).join(" "),
        assignment?.supports?.modelText,
      ].join(" "),
    ),
  );
  const suggested = new Map();
  (suggestions || []).forEach((raw, index) => {
    const word = String(raw?.word ?? raw ?? "").trim().toLowerCase();
    // A word named twice keeps its first, strongest position.
    if (word && !suggested.has(word)) suggested.set(word, index);
  });
  const priorWords = new Set(
    (publishedTargets || []).map((row) => String(row?.word || "").trim().toLowerCase()),
  );
  const graduated = new Set(
    (graduatedWords || []).map((word) => String(word || "").trim().toLowerCase()),
  );
  const limit = tier === "emerging" ? 2 : 3;
  const scored = [];
  const seen = new Set();
  for (const row of candidates || []) {
    const word = String(row?.word || "").trim();
    const key = word.toLowerCase();
    if (!word || key.length < 3 || seen.has(key) || graduated.has(key)) continue;
    if (used.has(key) || owned.has(key)) continue;
    seen.add(key);
    const topicFit = overlapScore(word, topic, 4);
    const draftFit = overlapScore(word, draft, 2);
    const order = suggested.has(key) ? suggested.get(key) : null;
    const priorTarget = priorWords.has(key);
    const score =
      topicFit.score +
      draftFit.score +
      (order === null ? 0 : Math.max(0, 3 - order)) +
      (priorTarget ? 2 : 0);
    scored.push({
      word,
      grade: row.grade || "",
      week: Number(row.week) || 0,
      score,
      reason: fitReason({
        matchedTopic: topicFit.tokens,
        matchedDraft: draftFit.tokens,
        priorTarget,
        wasTarget: priorTarget,
      }),
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, limit)
    // The stored target is the word and why it was picked; `score` is a
    // ranking detail that never leaves this function.
    .map((row) => ({
      word: row.word,
      grade: row.grade,
      week: row.week,
      reason: row.reason,
    }));
};

const SUPPORT_DEFAULT_SHOWN = 8;

/**
 * The rail and the review list, in the order a student needs them: words the
 * draft already uses first, then near misses, then the words that fit this
 * assignment. A word the teacher set aside drops to the end. Only the default
 * view is capped; the full list stays available.
 */
export const rankSupportWords = ({
  rows = [],
  assignment = {},
  draftText = "",
  setAside = [],
  source = "",
} = {}) => {
  const topic = topicTokens(assignment.title, assignment.topic);
  const draft = new Set(revisionTokens(draftText));
  const aside = new Set((setAside || []).map((word) => String(word || "").toLowerCase()));
  return (rows || [])
    .map((row) => {
      const key = String(row?.word || "").toLowerCase();
      const used = draft.has(key) || (row.nearMisses || []).length > 0;
      const fit = overlapScore(key, topic, 1);
      // A spelling row knows where it came from; anything else is a list word.
      const rowSource = row?.source || source;
      const bucket = aside.has(key)
        ? 3
        : used
          ? 0
          : rowSource === "feedback"
            ? 1
            : 2;
      return {
        bucket,
        fit: fit.score,
        row: { ...row, setAside: aside.has(key) },
      };
    })
    .sort(
      (a, b) =>
        a.bucket - b.bucket ||
        b.fit - a.fit ||
        Number(b.row.week) - Number(a.row.week) ||
        String(a.row.word).localeCompare(String(b.row.word)),
    )
    .map((entry) => entry.row);
};

export const supportDefaultShown = () => SUPPORT_DEFAULT_SHOWN;

/* ------------------------------------------------------------------ */
/* G6. Graduation                                                      */
/* ------------------------------------------------------------------ */

/**
 * A missed word that appears correctly in two consecutive published drafts is
 * no longer fragile. Wins are server-verified facts stored on each published
 * assessment; the newest two decide.
 */
export const graduatedWords = (assessments = []) => {
  const published = (assessments || []).filter(
    (row) => row?.publish?.state === "published",
  );
  if (published.length < 2) return [];
  const [latest, previous] = published;
  const previousWins = new Set(
    (previous.spellingWins || []).map((row) =>
      String(row?.word || "").toLowerCase(),
    ),
  );
  return (latest.spellingWins || [])
    .map((row) => String(row?.word || "").trim())
    .filter((word) => word && previousWins.has(word.toLowerCase()));
};

/* ------------------------------------------------------------------ */
/* D7. Ledger integrity                                                */
/* ------------------------------------------------------------------ */

const LEDGER_STATUSES = new Set(["open", "resolved", "stalled", "dropped"]);

/** One plain, valid ledger row per id — never ORM internals, never duplicates. */
export const sanitizeLedgerRows = (rows = []) => {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      text: String(row?.text || ""),
      introducedDraft: Number(row?.introducedDraft) || 1,
      checks: Number(row?.checks) || 0,
      unresolvedStreak: Number(row?.unresolvedStreak) || 0,
      status: LEDGER_STATUSES.has(row?.status) ? row.status : "open",
      ...(row?.lastCheckedDraft !== undefined && row?.lastCheckedDraft !== null
        ? { lastCheckedDraft: Number(row.lastCheckedDraft) }
        : {}),
      ...(row?.resolvedDraft !== undefined && row?.resolvedDraft !== null
        ? { resolvedDraft: Number(row.resolvedDraft) }
        : {}),
      ...(row?.note ? { note: String(row.note) } : {}),
    });
  }
  return out;
};
