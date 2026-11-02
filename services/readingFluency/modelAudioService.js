/**
 * Cached model reading for fluency practice.
 *
 * Audio is generated once per text version and block on a teacher's request,
 * stored as our own bytes, and aligned back to the reference text with the same
 * word alignment that scores students. That gives a karaoke track for a
 * one-time text-to-speech and speech-to-text cost, and students never call AI
 * while practising.
 */
import { audioCentsPerMinute } from "../../config/aiPricing.js";
import { parseBooleanEnv } from "../../config/booleanEnv.js";
import ReadingAssignment from "../../models/ReadingAssignment.js";
import ReadingModelAudio from "../../models/ReadingModelAudio.js";
import SimplifiedText from "../../models/SimplifiedText.js";
import {
  buildLevelsForTextDocument,
  looksLikeListPart,
  readingBlocksFor,
  readingTextHash,
} from "../../utils/readingBlocks.js";
import logger from "../../utils/logger.js";
import {
  estimateSpeechSeconds,
  synthesizeSpeech,
  transcribeWithWordTimes,
} from "../voiceSpeech.js";
import {
  assertHasCredit,
  chargeUsage,
  roundCents,
} from "../aiCreditService.js";
import { alignReferenceToTranscript } from "./align.js";
import { normalizeReference, normalizeTranscript } from "./normalize.js";
import { isEnglishLanguage } from "./settings.js";
import { isAssignmentLocked, readingLockedError } from "../readingGate/publish.js";

export const MODEL_AUDIO_ENV = "READING_FLUENCY_AUDIO";
export const TTS_MODEL = "gpt-4o-mini-tts";
export const TTS_VOICE = "alloy";
export const STT_MODEL = "whisper-1";
export const MAX_BLOCKS_PER_REQUEST = 60;
export const DEFAULT_BATCH_SIZE = 6;
export const MAX_BATCH_SIZE = 10;
const MIN_ALIGNED_RATIO = 0.6;

const TTS_INSTRUCTIONS = [
  "Read this passage aloud clearly and naturally for a student practising reading.",
  "Keep a steady, moderate pace and pronounce every word.",
  "Say only the passage. Do not add any other words.",
].join(" ");

const fail = (message, statusCode, code) =>
  Object.assign(new Error(message), {
    statusCode,
    code,
  });

/** Unset means on; an explicit false is the platform kill switch. */
export const isModelAudioAllowed = (env = process.env) => {
  const raw = String(env[MODEL_AUDIO_ENV] ?? "").trim();
  return raw ? parseBooleanEnv(raw) : true;
};

/*
 * Playback asks for the same few clips over and over, and each miss loads the
 * whole Buffer from Mongo. Keep the served bytes in process, bounded and short
 * lived; regenerate and prune evict by text.
 */
const AUDIO_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const AUDIO_CACHE_TTL_MS = 10 * 60 * 1000;
const audioCache = new Map();

const docBytes = (doc) => {
  const data = doc?.data;
  if (!data) return 0;
  return Number(data.length) || Number(data.buffer?.length) || 0;
};

const cacheKeyFor = ({ schoolId, textId, blockKey, textHash, level }) =>
  [schoolId, textId, blockKey, textHash || `level:${level ?? ""}`].join("|");

const cacheGet = (key) => {
  const entry = audioCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > AUDIO_CACHE_TTL_MS) {
    audioCache.delete(key);
    return null;
  }
  // Re-insert so Map insertion order keeps working as LRU order.
  audioCache.delete(key);
  audioCache.set(key, entry);
  return entry.doc;
};

const cacheSet = (key, doc, textId) => {
  const size = docBytes(doc);
  if (!size || size > AUDIO_CACHE_MAX_BYTES) return;
  audioCache.delete(key);
  audioCache.set(key, { doc, size, textId: String(textId), at: Date.now() });
  let total = 0;
  for (const entry of audioCache.values()) total += entry.size;
  for (const [oldKey, entry] of audioCache) {
    if (total <= AUDIO_CACHE_MAX_BYTES) break;
    audioCache.delete(oldKey);
    total -= entry.size;
  }
};

export const clearModelAudioCache = () => audioCache.clear();

export const invalidateModelAudioCache = (textId) => {
  const wanted = String(textId || "");
  for (const [key, entry] of [...audioCache.entries()]) {
    if (entry.textId === wanted) audioCache.delete(key);
  }
};

const loadVisibleText = async ({
  schoolId,
  textId,
  userId,
  isAdmin = false,
}) => {
  const query = { _id: textId, school: schoolId, isArchived: { $ne: true } };
  if (!isAdmin) {
    query.$or = [
      { createdBy: userId },
      { isShared: true },
      { createdBy: null },
    ];
  }
  const text = await SimplifiedText.findOne(query).lean();
  if (!text) {
    throw fail("Reading not found.", 404, "MODEL_AUDIO_TEXT_NOT_FOUND");
  }
  if (!isEnglishLanguage(text.language)) {
    throw fail(
      "Model voice is only available for English readings.",
      409,
      "MODEL_AUDIO_ENGLISH_ONLY",
    );
  }
  return text;
};

const candidatesFor = (text) =>
  buildLevelsForTextDocument(text).map((level) => {
    const targetLevel = level.targetLevel ?? null;
    return {
      level: targetLevel,
      blocks: readingBlocksFor(level)
        .filter((block) => String(block.text || "").trim())
        .map((block) => {
          const reference = normalizeReference(block.text);
          return {
            key: block.key,
            title: block.title || "",
            text: block.text,
            reference,
            wordCount: reference.wordCount,
            estimatedSeconds: Math.max(1, estimateSpeechSeconds(block.text)),
            textHash: readingTextHash({
              targetLevel,
              blockKey: block.key,
              text: block.text,
            }),
          };
        }),
    };
  });

const centsForSeconds = (seconds, env) => {
  const perMinute =
    (audioCentsPerMinute(TTS_MODEL, env) || 0) +
    (audioCentsPerMinute(STT_MODEL, env) || 0);
  return roundCents((Math.max(0, Number(seconds) || 0) / 60) * perMinute);
};

const existingHashes = async ({ schoolId, textId, hashes }) => {
  if (!hashes.length) return new Set();
  const rows = await ReadingModelAudio.find({
    school: schoolId,
    text: textId,
    textHash: { $in: hashes },
  })
    .select("textHash")
    .lean();
  return new Set(rows.map((row) => row.textHash));
};

const coverageLevels = ({ levels, existing, env }) =>
  levels.map((level) => {
    const blocks = level.blocks.map((block) => ({
      key: block.key,
      title: block.title,
      wordCount: block.wordCount,
      isList: looksLikeListPart(block),
      estimatedSeconds: block.estimatedSeconds,
      estimatedCents: centsForSeconds(block.estimatedSeconds, env),
      textHash: block.textHash,
      generated: existing.has(block.textHash),
    }));
    return {
      level: level.level,
      blocks,
      generated: blocks.filter((block) => block.generated).length,
      total: blocks.length,
      estimatedCents: roundCents(
        blocks
          .filter((block) => !block.generated)
          .reduce((sum, block) => sum + block.estimatedCents, 0),
      ),
    };
  });

const summaryFor = (levels) => {
  const blocks = levels.flatMap((level) => level.blocks);
  const missing = blocks.filter((block) => !block.generated);
  return {
    blocks: blocks.length,
    generated: blocks.length - missing.length,
    missing: missing.length,
    missingSeconds: missing.reduce(
      (sum, block) => sum + block.estimatedSeconds,
      0,
    ),
    estimatedCents: roundCents(
      missing.reduce((sum, block) => sum + block.estimatedCents, 0),
    ),
  };
};

/**
 * Teacher view before generating: which parts already have audio and what the
 * missing ones would cost.
 */
export async function getModelAudioCoverage({
  schoolId,
  textId,
  userId,
  isAdmin = false,
  env = process.env,
}) {
  const text = await loadVisibleText({ schoolId, textId, userId, isAdmin });
  const levels = candidatesFor(text);
  const hashes = levels.flatMap((level) =>
    level.blocks.map((block) => block.textHash),
  );
  const existing = await existingHashes({ schoolId, textId, hashes });
  const shaped = coverageLevels({ levels, existing, env });
  return {
    available: isModelAudioAllowed(env),
    textId: String(text._id),
    title: text.title || "",
    ttsModel: TTS_MODEL,
    voice: TTS_VOICE,
    levels: shaped,
    summary: summaryFor(shaped),
  };
}

const normalizeRequest = (blocks) => {
  if (!Array.isArray(blocks)) return null;
  const seen = new Set();
  const result = [];
  for (const raw of blocks) {
    const key = String(raw?.key ?? raw?.blockKey ?? "").trim();
    if (!key) continue;
    const levelRaw = raw?.level;
    const level =
      levelRaw === null ||
      levelRaw === undefined ||
      levelRaw === "" ||
      levelRaw === "null"
        ? null
        : Number(levelRaw);
    if (level !== null && !Number.isFinite(level)) continue;
    const id = `${level ?? ""}|${key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ key, level });
  }
  return result;
};

const selectedBlocks = ({ levels, requested }) => {
  if (!requested?.length) {
    return levels.flatMap((level) =>
      level.blocks.map((block) => ({
        ...block,
        level: level.level,
      })),
    );
  }
  const byId = new Map();
  for (const level of levels) {
    for (const block of level.blocks) {
      byId.set(`${level.level ?? ""}|${block.key}`, {
        ...block,
        level: level.level,
      });
    }
  }
  return requested.map((entry) => {
    const found = byId.get(`${entry.level ?? ""}|${entry.key}`);
    if (!found) {
      throw fail(
        `Part ${entry.key}${entry.level == null ? "" : ` in level ${entry.level}`} is not in this reading.`,
        400,
        "MODEL_AUDIO_PART_UNKNOWN",
      );
    }
    return found;
  });
};

const roundTime = (value) =>
  Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;

/** One request must fit inside a proxy timeout, so generation is batched. */
export const batchSizeFor = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(size)));
};

/**
 * One [start, end] pair per reference word. A matched word takes the timing of
 * the heard tokens it spans; gaps are shared evenly between the known times on
 * either side, so a highlight never jumps backwards.
 */
export const buildWordTimes = ({
  reference,
  transcript,
  alignment,
  duration = 0,
}) => {
  const words = reference?.words || [];
  const heard = transcript?.words || [];
  const times = new Array(words.length).fill(null);

  for (const match of alignment?.matches || []) {
    const first = heard[match.heardStart];
    const last = heard[match.heardEnd];
    const start = Number(first?.start);
    const end = Number(last?.end);
    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      match.refIndex >= 0 &&
      match.refIndex < words.length
    ) {
      times[match.refIndex] = [start, Math.max(start, end)];
    }
  }

  const fallback = Math.max(
    0.2,
    Math.min(
      0.7,
      (Math.max(0, Number(duration) || 0) || words.length * 0.35) /
        Math.max(1, words.length),
    ),
  );

  let index = 0;
  while (index < words.length) {
    if (times[index]) {
      index += 1;
      continue;
    }
    let runEnd = index;
    while (runEnd < words.length && !times[runEnd]) runEnd += 1;
    const runLength = runEnd - index;
    const previousEnd = index > 0 && times[index - 1] ? times[index - 1][1] : 0;
    const nextStart = runEnd < words.length ? times[runEnd][0] : null;
    const span =
      nextStart !== null && nextStart > previousEnd
        ? nextStart - previousEnd
        : runLength * fallback;
    const step = span / Math.max(1, runLength);
    for (let offset = 0; offset < runLength; offset += 1) {
      const start = previousEnd + step * offset;
      times[index + offset] = [start, start + step];
    }
    index = runEnd;
  }

  return times.map(([start, end]) => [
    roundTime(start),
    roundTime(Math.max(start + 0.05, end)),
  ]);
};

const mapWithConcurrency = async (items, limit, worker) => {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
};

/**
 * Generates the model voice for the requested blocks, or every block when the
 * request names none. Existing audio is skipped, never regenerated.
 */
export async function generateModelAudio(
  {
    schoolId,
    textId,
    userId,
    isAdmin = false,
    blocks = null,
    regenerate = false,
    limit = DEFAULT_BATCH_SIZE,
    env = process.env,
  },
  deps = {},
) {
  const synthesize = deps.synthesize || synthesizeSpeech;
  const transcribe = deps.transcribe || transcribeWithWordTimes;
  const credit = deps.credit || { assertHasCredit, chargeUsage };

  if (!isModelAudioAllowed(env)) {
    throw fail(
      "Model voice is turned off for this platform.",
      409,
      "MODEL_AUDIO_DISABLED",
    );
  }

  const text = await loadVisibleText({ schoolId, textId, userId, isAdmin });
  const levels = candidatesFor(text);
  const requested = normalizeRequest(blocks);
  const selected = selectedBlocks({ levels, requested });
  if (!selected.length) {
    throw fail(
      "This reading has no parts to generate.",
      400,
      "MODEL_AUDIO_NO_PARTS",
    );
  }
  if (selected.length > MAX_BLOCKS_PER_REQUEST) {
    throw fail(
      `Generate at most ${MAX_BLOCKS_PER_REQUEST} parts at a time.`,
      400,
      "MODEL_AUDIO_TOO_MANY_PARTS",
    );
  }

  const existing = regenerate
    ? new Set()
    : await existingHashes({
        schoolId,
        textId,
        hashes: selected.map((block) => block.textHash),
      });
  const missing = selected.filter((block) => !existing.has(block.textHash));
  const batch = missing.slice(0, batchSizeFor(limit));

  let generated = 0;
  let skipped = existing.size;
  let failed = 0;
  let duplicates = 0;
  let speechSeconds = 0;
  let transcriptSeconds = 0;
  const failures = [];

  if (batch.length) {
    await credit.assertHasCredit({ schoolId, userId });
    await mapWithConcurrency(batch, 2, async (block) => {
      try {
        const speech = await synthesize({
          text: block.text,
          model: TTS_MODEL,
          voice: TTS_VOICE,
          instructions: TTS_INSTRUCTIONS,
        });
        const heard = await transcribe({
          buffer: speech.buffer,
          mimeType: speech.contentType || "audio/mpeg",
          language: "en",
        });
        const transcript = normalizeTranscript(heard?.text, {
          words: heard?.words,
        });
        const alignment = alignReferenceToTranscript(
          block.reference,
          transcript,
        );
        if (
          block.reference.wordCount &&
          alignment.alignedCount / block.reference.wordCount < MIN_ALIGNED_RATIO
        ) {
          throw fail(
            "The model voice could not be lined up with this part.",
            502,
            "MODEL_AUDIO_ALIGNMENT_FAILED",
          );
        }

        const seconds =
          Number(heard?.duration) > 0
            ? Number(heard.duration)
            : block.estimatedSeconds;
        const wordTimes = buildWordTimes({
          reference: block.reference,
          transcript,
          alignment,
          duration: seconds,
        });

        const audioFields = {
          school: schoolId,
          text: text._id,
          blockKey: block.key,
          level: block.level,
          textHash: block.textHash,
          voice: TTS_VOICE,
          model: TTS_MODEL,
          contentType: speech.contentType || "audio/mpeg",
          speechSeconds: seconds,
          wordTimes,
          data: speech.buffer,
        };
        if (regenerate) {
          // Replace only after the new clip exists, so a failure keeps the old one.
          await ReadingModelAudio.findOneAndUpdate(
            {
              school: schoolId,
              text: text._id,
              blockKey: block.key,
              level: block.level,
              textHash: block.textHash,
            },
            { $set: audioFields },
            { upsert: true, setDefaultsOnInsert: true },
          );
        } else {
          await ReadingModelAudio.create(audioFields);
        }
        generated += 1;
        speechSeconds += seconds;
        transcriptSeconds += seconds;
      } catch (error) {
        if (error?.code === 11000) {
          duplicates += 1;
          skipped += 1;
          return;
        }
        failed += 1;
        failures.push({
          level: block.level,
          key: block.key,
          code: error?.code || "",
          message: String(error?.message || "").slice(0, 200),
        });
        logger.warn("reading_model_audio_failed", {
          textId: String(text._id),
          blockKey: block.key,
          level: block.level,
          error: error?.message,
        });
      }
    });
  }

  if (generated > 0) invalidateModelAudioCache(text._id);

  const extraCostCents = roundCents(
    (speechSeconds / 60) * (audioCentsPerMinute(TTS_MODEL, env) || 0) +
      (transcriptSeconds / 60) * (audioCentsPerMinute(STT_MODEL, env) || 0),
  );

  if (generated > 0) {
    await credit.chargeUsage({
      schoolId,
      userId,
      feature: "reading-fluency",
      outcome: "model-audio",
      extraCostCents,
      refs: { assignmentTitle: text.title || "" },
      audio: {
        transcriptSeconds,
        speechSeconds,
        sttModel: STT_MODEL,
        ttsModel: TTS_MODEL,
      },
    });
  }

  const coverage = await getModelAudioCoverage({
    schoolId,
    textId,
    userId,
    isAdmin,
    env,
  });

  return {
    generated,
    remaining: Math.max(0, missing.length - generated - duplicates),
    skipped,
    failed,
    failures,
    speechSeconds,
    transcriptSeconds,
    costCents: generated > 0 ? extraCostCents : 0,
    coverage,
  };
}

/**
 * Drops clips the current text can no longer produce: an edited block gets a
 * new hash, and a shortened text stops producing its old parts.
 */
export async function pruneModelAudioForText({ schoolId, textId }) {
  const text = await SimplifiedText.findOne({ _id: textId, school: schoolId }).lean();
  if (!text) return { removed: 0 };
  const hashes = candidatesFor(text)
    .flatMap((level) => level.blocks.map((block) => block.textHash));
  const filter = { school: schoolId, text: textId };
  if (hashes.length) filter.textHash = { $nin: hashes };
  const result = await ReadingModelAudio.deleteMany(filter);
  invalidateModelAudioCache(textId);
  return { removed: Number(result?.deletedCount) || 0 };
}

/** An archived text can never play its clips again, so none are worth keeping. */
export async function dropModelAudioForText({ schoolId, textId }) {
  const result = await ReadingModelAudio.deleteMany({
    school: schoolId,
    text: textId,
  });
  invalidateModelAudioCache(textId);
  return { removed: Number(result?.deletedCount) || 0 };
}

/**
 * Student playback. The audio is served from our database, never regenerated
 * on the practice path.
 */
export async function getModelAudio({
  schoolId,
  textId,
  blockKey,
  level = null,
  hash = null,
  studentId = null,
  userId = null,
  isAdmin = false,
  academicYear = null,
}) {
  if (studentId) {
    const query = { school: schoolId, text: textId, students: studentId };
    if (academicYear) query.academicYear = academicYear;
    const assignment = await ReadingAssignment.findOne(query)
      .select("_id isPublished publishAt")
      .lean();
    if (!assignment) {
      throw fail("Reading not found.", 404, "MODEL_AUDIO_TEXT_NOT_FOUND");
    }
    if (isAssignmentLocked(assignment)) throw readingLockedError();
  } else {
    await loadVisibleText({ schoolId, textId, userId, isAdmin });
  }

  const query = {
    school: schoolId,
    text: textId,
    blockKey: String(blockKey || "").trim(),
  };
  const textHash = String(hash || "").trim();
  if (textHash) {
    if (!/^[a-f0-9]{64}$/i.test(textHash)) {
      throw fail(
        "That model voice is not valid.",
        400,
        "MODEL_AUDIO_HASH_INVALID",
      );
    }
    query.textHash = textHash.toLowerCase();
  } else if (level !== null && level !== undefined && level !== "") {
    const numericLevel = Number(level);
    if (!Number.isFinite(numericLevel)) {
      throw fail("That level is not valid.", 400, "MODEL_AUDIO_LEVEL_INVALID");
    }
    query.level = numericLevel;
  }

  const cacheKey = cacheKeyFor({
    schoolId,
    textId,
    blockKey: query.blockKey,
    textHash: query.textHash,
    level: query.level,
  });
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const doc = await ReadingModelAudio.findOne(query)
    .select(
      "+data blockKey level contentType speechSeconds wordTimes model voice",
    )
    .lean();
  if (!doc?.data) {
    throw fail(
      "The model voice is not ready for this part yet.",
      404,
      "MODEL_AUDIO_NOT_FOUND",
    );
  }
  cacheSet(cacheKey, doc, textId);
  return doc;
}
