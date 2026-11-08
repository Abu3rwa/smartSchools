/**
 * Writing word support: the words a student may lean on while writing.
 *
 * Reads only. Nothing here writes to spelling or vocabulary records, calls the
 * AI, or affects a grade. Vocabulary lists are intersected with the lists the
 * student is actually assigned, so a teacher's selection can never widen what a
 * student sees.
 */
import Student from "../models/Student.js";
import SpellingRetestItem from "../models/SpellingRetestItem.js";
import VocabWord from "../models/VocabWord.js";
import { getAssignedLists, resolveSelection } from "./vocabularyService.js";
import { textTokens } from "./writingAssistantLogic.js";

export const SPELLING_MAX_DEFAULT = 5;
export const SPELLING_MAX_LIMIT = 10;
export const VOCABULARY_WORD_LIMIT = 60;

const LIST_ID = /^S[12]-L\d{1,2}$/;
const normal = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

export const normalizeWordSupport = (input = {}) => {
  const listIds = (Array.isArray(input?.vocabulary?.listIds)
    ? input.vocabulary.listIds
    : []
  )
    .map((id) => String(id || "").trim().toUpperCase())
    .filter((id) => LIST_ID.test(id))
    .filter((id, index, rows) => rows.indexOf(id) === index)
    .slice(0, 24);
  const maxWords = Math.min(
    Math.max(Number(input?.spelling?.maxWords) || SPELLING_MAX_DEFAULT, 1),
    SPELLING_MAX_LIMIT,
  );
  return {
    vocabulary: {
      enabled: input?.vocabulary?.enabled === true && listIds.length > 0,
      listIds,
    },
    spelling: {
      enabled: input?.spelling?.enabled === true,
      maxWords,
    },
  };
};

const disabled = (config) => ({
  enabled: false,
  spelling: {
    ...config.spelling,
    status: "disabled",
    words: [],
  },
  vocabulary: {
    ...config.vocabulary,
    status: "disabled",
    lists: [],
    words: [],
  },
});

const spellingWords = async ({
  schoolId,
  studentId,
  config,
  priorTargets,
}) => {
  const maxWords = config.maxWords;
  const rows = [];
  const seen = new Set();
  const push = (row, source) => {
    const key = normal(row?.word ?? row?.wordSnapshot);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push({
      word: String((row?.word ?? row?.wordSnapshot) || "").trim(),
      grade: row?.grade || "",
      week: Number(row?.week) || 0,
      source,
    });
  };

  // Words a teacher already published on an earlier round come first: the
  // student is being asked to apply them.
  for (const row of priorTargets || []) push(row, "feedback");

  if (rows.length < maxWords) {
    const items = await SpellingRetestItem.find({
      school: schoolId,
      student: studentId,
      status: { $in: ["pending", "practice-mastered"] },
    })
      .sort({ flaggedAt: -1 })
      .limit(Math.min(maxWords * 4, 40))
      .select("wordSnapshot grade week")
      .lean();
    for (const row of items) {
      if (rows.length >= maxWords) break;
      push(row, "spelling");
    }
  }

  return rows.slice(0, maxWords);
};

const vocabularyWords = async ({ schoolId, studentId, config }) => {
  const student = await Student.findOne({
    school: schoolId,
    _id: studentId,
  })
    .select("currentClass enrolledClasses")
    .lean();
  if (!student) return { lists: [], words: [] };

  const assigned = await getAssignedLists({ schoolId, student });
  const allowed = resolveSelection(assigned, {
    listIds: config.listIds,
  });
  if (!allowed.length) return { lists: [], words: [] };

  const allowedSet = new Set(allowed);
  const docs = await VocabWord.find({
    school: schoolId,
    listId: { $in: allowed },
  })
    .sort({ listId: 1, word: 1 })
    .limit(VOCABULARY_WORD_LIMIT * 2)
    .select(
      "listId word baseWord partOfSpeech meaning arabicMeaning exampleSentence",
    )
    .lean();

  const seen = new Set();
  const words = [];
  for (const doc of docs) {
    if (words.length >= VOCABULARY_WORD_LIMIT) break;
    const key = normal(doc.word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    words.push({
      word: doc.word,
      baseWord: doc.baseWord || "",
      listId: doc.listId,
      partOfSpeech: Array.isArray(doc.partOfSpeech)
        ? doc.partOfSpeech.join(", ")
        : "",
      meaning: doc.meaning || "",
      arabicMeaning: doc.arabicMeaning || "",
      example: doc.exampleSentence || "",
    });
  }

  return {
    lists: assigned
      .filter((list) => allowedSet.has(list.listId))
      .map((list) => ({
        listId: list.listId,
        title: list.title || list.listId,
        semester: list.semester,
        wordCount: list.wordCount || 0,
      })),
    words,
  };
};

/**
 * Resolve every enabled source for one student. A source with no eligible words
 * reports `unavailable`, which the rail explains instead of hiding silently.
 */
export const resolveWritingWordSupport = async ({
  schoolId,
  studentId,
  assignment,
  priorTargets = [],
}) => {
  const config = normalizeWordSupport(assignment?.supports?.wordSupport);
  if (!config.spelling.enabled && !config.vocabulary.enabled) {
    return disabled(config);
  }

  const [spelling, vocabulary] = await Promise.all([
    config.spelling.enabled
      ? spellingWords({ schoolId, studentId, config: config.spelling, priorTargets })
      : Promise.resolve([]),
    config.vocabulary.enabled
      ? vocabularyWords({
          schoolId,
          studentId,
          config: config.vocabulary,
        })
      : Promise.resolve({ lists: [], words: [] }),
  ]);

  return {
    enabled: true,
    spelling: {
      ...config.spelling,
      status: spelling.length ? "available" : "unavailable",
      words: spelling,
    },
    vocabulary: {
      ...config.vocabulary,
      status: vocabulary.words.length ? "available" : "unavailable",
      lists: vocabulary.lists,
      words: vocabulary.words,
    },
  };
};

/* ------------------------------------------------------------------ */
/* Deterministic word-use evidence                                     */
/* ------------------------------------------------------------------ */

const editDistance = (a, b, limit) => {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const previous = new Array(b.length + 1);
  const current = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let best = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      if (current[j] < best) best = current[j];
    }
    if (best > limit) return limit + 1;
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
};

/**
 * Near misses are evidence, never a correction: a longer word must be one edit
 * away, a very long word may be two. Short words are skipped so `the`/`she`
 * does not surface as a misspelling.
 */
const nearMissLimit = (word) => {
  if (word.length >= 8) return 2;
  if (word.length >= 5) return 1;
  return 0;
};

const nearMissesFor = (word, tokens, knownWords) => {
  const limit = nearMissLimit(word);
  if (!limit) return [];
  const found = [];
  for (const token of tokens) {
    // Another supported word is not a misspelling of this one.
    if (token === word || knownWords.has(token)) continue;
    if (editDistance(token, word, limit) <= limit) {
      found.push(token);
      if (found.length === 2) break;
    }
  }
  return found;
};

/**
 * Compare the submitted text with the words the student was offered. Whole
 * tokens only, case-insensitive; vocabulary also accepts the word's base form.
 */
export const analyzeWordUse = ({ draftText = "", wordSupport = null } = {}) => {
  if (!wordSupport?.enabled) return null;
  const tokens = textTokens(draftText);
  const used = new Set(tokens);

  const knownWords = new Set();
  for (const row of wordSupport.spelling?.words || []) {
    knownWords.add(normal(row.word));
  }
  for (const row of wordSupport.vocabulary?.words || []) {
    knownWords.add(normal(row.word));
    if (row.baseWord) knownWords.add(normal(row.baseWord));
  }

  const spelling = (wordSupport.spelling?.words || []).map((row) => {
    const word = normal(row.word);
    return {
      word: row.word,
      grade: row.grade || "",
      week: Number(row.week) || 0,
      used: used.has(word),
      count: used.has(word) ? tokens.filter((token) => token === word).length : 0,
      nearMisses: used.has(word)
        ? []
        : nearMissesFor(word, tokens, knownWords),
    };
  });

  const vocabulary = [];
  for (const row of wordSupport.vocabulary?.words || []) {
    const word = normal(row.word);
    const base = row.baseWord ? normal(row.baseWord) : word;
    const hit = used.has(word) || used.has(base);
    const count = hit
      ? tokens.filter((token) => token === word || token === base).length
      : 0;
    if (!hit) {
      const misses = nearMissesFor(word, tokens, knownWords);
      if (!misses.length) continue;
      vocabulary.push({
        word: row.word,
        listId: row.listId,
        used: false,
        count: 0,
        nearMisses: misses,
      });
      continue;
    }
    vocabulary.push({
      word: row.word,
      listId: row.listId,
      used: true,
      count,
      nearMisses: [],
    });
  }

  if (!spelling.length && !vocabulary.length) return null;
  return {
    spelling: spelling.map((row) => ({ ...row, teacherDecision: "" })),
    vocabulary: vocabulary.map((row) => ({ ...row, teacherDecision: "" })),
  };
};

/** Teacher decisions are additive: only the named row changes, nothing is scored. */
export const applyWordUseDecisions = ({ evidence, decisions = [] } = {}) => {
  if (!evidence) return [];
  const changed = [];
  for (const incoming of decisions || []) {
    if (!incoming?.word) continue;
    const source = incoming.source === "vocabulary" ? "vocabulary" : "spelling";
    const word = normal(incoming.word);
    const row = (evidence[source] || []).find(
      (candidate) => normal(candidate.word) === word,
    );
    if (!row) continue;
    const decision =
      incoming.decision === "confirmed" || incoming.decision === "rejected"
        ? incoming.decision
        : "";
    if (row.teacherDecision !== decision) {
      row.teacherDecision = decision;
      changed.push(`${source}.${row.word}`);
    }
  }
  return changed;
};
