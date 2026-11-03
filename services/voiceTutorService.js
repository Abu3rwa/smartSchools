/**
 * The premium voice tutor. A session is one lesson and one board; every spoken
 * message costs a fixed number of student credits, while the ledger records the
 * real provider cost (tokens plus seconds of speech) so profit stays visible.
 */
import mongoose from "mongoose";

import TutorVoiceSession from "../models/TutorVoiceSession.js";
import TutorLesson from "../models/TutorLesson.js";
import TutorWallet from "../models/TutorWallet.js";
import Subject from "../models/Subject.js";
import Student from "../models/Student.js";
import AiCreditAccount from "../models/AiCreditAccount.js";

import { connectAi } from "../utils/connectAi.js";
import logger from "../utils/logger.js";
import { allocateCredit, chargeUsage, reclaimCredit, tokenCounts } from "./aiCreditService.js";
import {
  countTries,
  buildVoicePrompt,
  buildVoiceOpeningPrompt,
  lessonLabel,
  nextQuestionType,
  readVoiceReply,
  resolveAccess,
  voiceSpeechSegments,
} from "./tutorCore.js";
import {
  getClassAccess,
  getStudentTutorHome,
  getTutorSettings,
  lessonOutline,
  pickLessons,
  standardsForGrade,
  studentLanguageLevel,
  studentScope,
} from "./tutorService.js";
import { getVoiceConfig } from "./voiceTutorConfig.js";
import { voiceCostCents } from "./voiceTutorPricing.js";
import {
  estimateSpeechSeconds,
  synthesizeSpeech,
  synthesizeSpeechSegments,
  synthesizeWithRetry,
  transcribeAudio,
} from "./voiceSpeech.js";
import { classRoster, scrubVoiceTurn } from "./voiceTutorPrivacy.js";

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message, code) =>
  Object.assign(new Error(message), { statusCode: 403, code });
const paymentRequired = (message, code = "VOICE_TUTOR_NO_CREDIT") =>
  Object.assign(new Error(message), { statusCode: 402, code });

const MAX_SESSION_MESSAGES = 60;
const MAX_TRANSCRIPT_CHARS = 1000;
const SESSION_CACHE_TTL_MS = 60 * 1000;
const SESSION_CACHE_LIMIT = 200;
const ACTIVE_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Turn timing (Phase 0)                                               */
/* ------------------------------------------------------------------ */

/**
 * Millisecond marks between the steps of one request. The controller logs one
 * line per turn and mirrors the numbers in the Server-Timing header.
 */
export const createTurnTiming = () => {
  let last = process.hrtime.bigint();
  const rows = [];
  return {
    rows,
    step(name) {
      const now = process.hrtime.bigint();
      rows.push({ name, ms: Math.round(Number(now - last) / 1e4) / 100 });
      last = now;
      return rows;
    },
  };
};

/** The log line carries numbers and the school id only: no text, no student id. */
export const logVoiceTurnTiming = ({ schoolId, timing, responseBytes = 0 }) => {
  const rows = timing?.rows || [];
  const steps = {};
  for (const row of rows) steps[row.name] = row.ms;
  logger.info("voice_tutor_turn_timing", {
    schoolId: String(schoolId || ""),
    responseBytes: Math.max(0, Number(responseBytes) || 0),
    totalMs: Math.round(rows.reduce((total, row) => total + row.ms, 0) * 100) / 100,
    steps,
  });
};

export const serverTimingHeader = (timing) =>
  (timing?.rows || []).map((row) => `${row.name};dur=${row.ms}`).join(", ");

/* ------------------------------------------------------------------ */
/* Small TTL caches                                                    */
/* ------------------------------------------------------------------ */

const ttlCache = (ttlMs) => {
  const store = new Map();
  return {
    async get(key, load) {
      const hit = store.get(key);
      if (hit && Date.now() - hit.at <= ttlMs) return hit.value;
      if (hit) store.delete(key);
      // A throw skips the set below, so a failure is never cached.
      const value = await load();
      store.set(key, { at: Date.now(), value });
      while (store.size > SESSION_CACHE_LIMIT) {
        store.delete(store.keys().next().value);
      }
      return value;
    },
    clear() {
      store.clear();
    },
  };
};

const configCache = ttlCache(SESSION_CACHE_TTL_MS);
const standardsCache = ttlCache(SESSION_CACHE_TTL_MS);

/** Test seam: both caches live for the process lifetime. */
export const clearVoiceSessionCaches = () => {
  configCache.clear();
  standardsCache.clear();
};

const sessionConfig = (schoolId) =>
  configCache.get(String(schoolId), () => voiceConfig(schoolId));

const sessionStandards = ({ schoolId, subjectId, grade }) =>
  standardsCache.get(
    `${schoolId}|${subjectId}|${grade}`,
    () =>
      standardsForGrade({ schoolId, subjectId, grade, limit: 15 }),
  );

/** The clip list a lazy client fetches by index, in board order. */
export const clipMetadata = (segments = []) =>
  (Array.isArray(segments) ? segments : []).map((segment, index) => ({
    index,
    kind: segment.kind || "",
  }));

const speechSegmentsFor = (parsed) =>
  Array.isArray(parsed?.segments) && parsed.segments.length
    ? parsed.segments
    : parsed?.spoken
      ? [{ kind: "lead", text: parsed.spoken }]
      : [];

const objectId = (value) =>
  mongoose.isValidObjectId(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
const creditsOf = (account) =>
  Math.max(0, Math.floor(Number(account?.balanceCents) || 0));

/* ------------------------------------------------------------------ */
/* Speech                                                              */
/* ------------------------------------------------------------------ */

const speechSecondsFor = (segments, spoken) => {
  const seconds = segments.length
    ? segments.reduce(
        (total, segment) => total + estimateSpeechSeconds(segment.text),
        0,
      )
    : estimateSpeechSeconds(spoken);
  return Math.round(seconds * 10) / 10;
};

/**
 * One clip per board part so the board can follow the voice exactly. If the
 * segmented batch still fails, one full clip keeps the turn audible (just not
 * segmented); if even that fails, the words stay on the board and nothing is
 * spoken.
 */
const speakReply = async ({
  segments = [],
  spoken,
  config,
  schoolId,
  event,
}) => {
  let clips = [];
  let speech = null;
  let audioFailed = false;

  if (segments.length) {
    try {
      clips = await synthesizeSpeechSegments({
        segments,
        model: config.ttsModel,
        voice: config.ttsVoice,
      });
    } catch (error) {
      logger.warn(`${event}_segments_failed`, {
        schoolId: String(schoolId),
        error: error?.message,
      });
    }
  }
  if (!clips.length) {
    try {
      speech = await synthesizeSpeech({
        text: spoken,
        model: config.ttsModel,
        voice: config.ttsVoice,
      });
    } catch (error) {
      audioFailed = true;
      logger.warn(`${event}_failed`, {
        schoolId: String(schoolId),
        error: error?.message,
      });
    }
  }
  return { clips, speech, audioFailed };
};

const audioSource = (speech) =>
  speech
    ? `data:${speech.contentType};base64,${speech.buffer.toString("base64")}`
    : null;

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

export const voiceWallet = async ({ schoolId, user }) => {
  const account = await AiCreditAccount.findOne({ school: schoolId, user })
    .select("balanceCents paused")
    .lean();
  return {
    credits: creditsOf(account),
    paused: Boolean(account?.paused),
    exists: Boolean(account),
  };
};

const walletCopy = (wallet, price) => ({
  credits: wallet.credits,
  price,
  canAsk: wallet.credits >= price,
  paused: wallet.paused,
  notice:
    wallet.credits < price
      ? "empty"
      : wallet.credits - price < price
        ? "last"
        : "ok",
});

/** The school switch, the class switch and the student's own balance, in that order. */
const assertVoiceAccess = async ({
  schoolId,
  student,
  config,
  needCredit = true,
}) => {
  if (!student?.user) {
    throw paymentRequired(
      "The voice tutor needs a student account with credit. Ask the school office.",
    );
  }
  const [settings, classAccess, wallet, tutorWallet] = await Promise.all([
    getTutorSettings(schoolId),
    getClassAccess(schoolId, student.currentClass),
    voiceWallet({ schoolId, user: student.user }),
    // The tutor pause switch stops voice too; it is one tutor, two modes.
    TutorWallet.findOne({ school: schoolId, student: student._id })
      .select("paused")
      .lean(),
  ]);
  const decision = resolveAccess({
    settings,
    classAccess,
    walletPaid: wallet.paused || Boolean(tutorWallet?.paused),
  });
  if (!decision.allowed) {
    const copy = {
      school_off: [
        "The AI tutor is turned off for your school right now.",
        "TUTOR_SCHOOL_OFF",
      ],
      class_locked: [
        "The AI tutor is not available for your class.",
        "TUTOR_CLASS_LOCKED",
      ],
      class_paused: [
        "The AI tutor is paused for your class right now.",
        "TUTOR_CLASS_PAUSED",
      ],
      wallet_paused: [
        "Your voice tutor is paused. Ask your teacher or the school office.",
        "TUTOR_STUDENT_PAUSED",
      ],
    }[decision.reason] || [
      "The AI tutor is not available right now.",
      "TUTOR_UNAVAILABLE",
    ];
    throw forbidden(copy[0], copy[1]);
  }
  if (needCredit && wallet.credits < config.messageCredits) {
    throw paymentRequired(
      `Each voice message costs ${config.messageCredits} credits, and you have ${wallet.credits}. Ask your teacher or the school office for more.`,
    );
  }
  return wallet;
};

/* ------------------------------------------------------------------ */
/* Funding                                                             */
/* ------------------------------------------------------------------ */

const MAX_VOICE_GRANT = 100000;

/**
 * Moves reserve credit from the school pool into student balances. One credit is
 * one cent, so an admin can see exactly what a message costs. Nothing is
 * created: the pool must already hold the money.
 */
export const giveVoiceCredit = async ({
  schoolId,
  studentIds = [],
  classId = null,
  credits,
  adminId,
}) => {
  const amountCents = Number(credits);
  if (
    !Number.isInteger(amountCents) ||
    amountCents < 1 ||
    amountCents > MAX_VOICE_GRANT
  ) {
    throw badRequest(
      `Enter a whole number of voice credits from 1 to ${MAX_VOICE_GRANT}.`,
    );
  }
  const filter = { school: schoolId, user: { $ne: null } };
  if (Array.isArray(studentIds) && studentIds.length) {
    const ids = studentIds.map(objectId).filter(Boolean);
    if (!ids.length) throw badRequest("Pick at least one student.");
    filter._id = { $in: ids };
  } else if (objectId(classId)) {
    filter.$or = [{ currentClass: classId }, { enrolledClasses: classId }];
  } else {
    throw badRequest("Pick a class or at least one student.");
  }

  const students = await Student.find(filter).select("_id user").lean();
  if (!students.length)
    throw badRequest("No students with a sign-in were found for this choice.");

  const rows = [];
  let shortPool = false;
  for (const student of students) {
    try {
      const { account } = await allocateCredit({
        schoolId,
        userId: student.user,
        amountCents,
        note: "Voice tutor",
        adminId,
      });
      rows.push({
        studentId: String(student._id),
        voiceCredits: creditsOf(account),
      });
    } catch (error) {
      if (error?.code === "AI_CREDIT_RESERVE_SHORT") {
        shortPool = true;
        break;
      }
      throw error;
    }
  }
  if (!rows.length) {
    throw Object.assign(
      new Error(
        "The school reserve does not have enough credit. Ask the platform owner to top up the school.",
      ),
      { statusCode: 409, code: "AI_CREDIT_RESERVE_SHORT" },
    );
  }
  return { credits: amountCents, students: rows.length, rows, shortPool };
};

/**
 * Takes unspent school-allocated voice credit back into the reserve. Only the
 * `schoolCents` part of the account is reclaimable; platform grants stay put.
 * A student who spent some of it simply has less to give back.
 */
export const takeBackVoiceCredit = async ({
  schoolId,
  studentIds = [],
  classId = null,
  credits,
  all = false,
  adminId,
  note = "",
}) => {
  const requested = all === true ? null : Number(credits);
  if (
    requested !== null &&
    (!Number.isInteger(requested) ||
      requested < 1 ||
      requested > MAX_VOICE_GRANT)
  ) {
    throw badRequest(
      `Enter a whole number of voice credits from 1 to ${MAX_VOICE_GRANT}.`,
    );
  }
  const filter = { school: schoolId, user: { $ne: null } };
  if (Array.isArray(studentIds) && studentIds.length) {
    const ids = studentIds.map(objectId).filter(Boolean);
    if (!ids.length) throw badRequest("Pick at least one student.");
    filter._id = { $in: ids };
  } else if (objectId(classId)) {
    filter.$or = [{ currentClass: classId }, { enrolledClasses: classId }];
  } else {
    throw badRequest("Pick a class or at least one student.");
  }

  const students = await Student.find(filter).select("_id user").lean();
  if (!students.length)
    throw badRequest("No students with a sign-in were found for this choice.");

  const trimmed = String(note || "").trim().slice(0, 300);
  const rows = [];
  let takenTotal = 0;
  for (const student of students) {
    const account = await AiCreditAccount.findOne({
      school: schoolId,
      user: student.user,
    })
      .select("balanceCents schoolCents")
      .lean();
    const available = Math.max(0, Math.floor(Number(account?.schoolCents) || 0));
    if (available < 1) continue;
    const take =
      requested === null
        ? Math.min(available, MAX_VOICE_GRANT)
        : Math.min(requested, available);
    if (take < 1) continue;
    try {
      const result = await reclaimCredit({
        schoolId,
        userId: student.user,
        amountCents: take,
        note: trimmed || "Voice tutor take-back",
        adminId,
      });
      takenTotal += take;
      rows.push({
        studentId: String(student._id),
        taken: take,
        voiceCredits: creditsOf(result.account),
        reclaimableCredits: Math.max(
          0,
          Math.floor(Number(result.account?.schoolCents) || 0),
        ),
      });
    } catch (error) {
      // A message bought between the read and the reclaim left less to take.
      if (error?.code !== "AI_CREDIT_RECLAIM_EXCEEDS") throw error;
    }
  }

  const pool = await AiCreditAccount.findOne({
    school: schoolId,
    user: null,
    kind: "school",
  })
    .select("balanceCents")
    .lean();
  return {
    students: rows.length,
    takenTotal,
    rows,
    reserveCredits: Math.max(0, Math.floor(Number(pool?.balanceCents) || 0)),
  };
};

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

/** Pricing failure is an ops problem: log the reason, tell the student something usable. */
const voiceConfig = async (schoolId) => {
  try {
    return await getVoiceConfig();
  } catch (error) {
    logger.warn("voice_tutor_config_failed", {
      schoolId: String(schoolId),
      error: error?.message,
    });
    throw Object.assign(
      new Error(
        "The voice tutor is not set up yet. Ask your teacher or the school office.",
      ),
      { statusCode: 422, code: "VOICE_NOT_CONFIGURED" },
    );
  }
};

/**
 * The most recent live session, so a refresh can continue the same board.
 * Scoped to this student and the last 24 hours, with the fields the card needs.
 */
export const activeVoiceSession = async ({ schoolId, student }) => {
  const row = await TutorVoiceSession.findOne({
    school: schoolId,
    student: student._id,
    status: "active",
    updatedAt: { $gte: new Date(Date.now() - ACTIVE_SESSION_WINDOW_MS) },
  })
    .sort({ updatedAt: -1 })
    .select("_id lessonLabel subjectName updatedAt")
    .lean();
  if (!row) return null;
  return {
    id: String(row._id),
    lessonLabel: row.lessonLabel || "",
    subjectName: row.subjectName || "",
    updatedAt: row.updatedAt || null,
  };
};

/** The picker: the same subjects and lessons as the text tutor, plus the voice wallet. */
export const getVoiceHome = async ({ schoolId, student, subjectId = null }) => {
  const [home, configResult, wallet, activeSession] = await Promise.all([
    getStudentTutorHome({ schoolId, student, subjectId }),
    sessionConfig(schoolId)
      .then((config) => ({ config }))
      .catch((error) => ({ problem: error.message })),
    voiceWallet({ schoolId, user: student?.user }),
    activeVoiceSession({ schoolId, student }),
  ]);
  const config = configResult.config || null;
  // A student with one subject still gets its outline here, so the picker opens
  // with one request instead of fetching the same home again for the lessons.
  let resolved = home;
  if (
    !subjectId &&
    home.access?.allowed &&
    home.subjects?.length === 1 &&
    !home.outline?.length
  ) {
    const only = home.subjects[0];
    resolved = {
      ...home,
      subject: only,
      outline: await lessonOutline({
        schoolId,
        subjectId: only.id,
        grade: home.grade,
      }),
    };
  }
  return {
    ...resolved,
    activeSession,
    voice: {
      ready: Boolean(config) && home.access.allowed,
      problem: configResult.problem || "",
      price: config?.messageCredits ?? 0,
      listenSeconds: config?.maxTranscriptSeconds ?? 30,
      wallet: config ? walletCopy(wallet, config.messageCredits) : null,
    },
  };
};

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

const publicMessage = (message = {}) => ({
  role: message.role,
  turnId: message.turnId ? String(message.turnId) : "",
  clips: clipMetadata(message.segments),
  text: message.text || "",
  spoken: message.spoken || "",
  lead: message.lead || "",
  emphasis: message.emphasis || "",
  blocks: Array.isArray(message.blocks) ? message.blocks : [],
  points: Array.isArray(message.points) ? message.points : [],
  followUp: message.followUp || "",
  options: Array.isArray(message.options) ? message.options : [],
  questionType: message.questionType || "",
  stage: message.stage || "",
  at: message.at || null,
});

const shapeSession = (session, wallet, config) => ({
  id: String(session._id),
  status: session.status,
  grade: session.grade,
  language: session.language || "en",
  languageLevel: session.languageLevel,
  subject: session.subject
    ? { id: String(session.subject), name: session.subjectName || "" }
    : null,
  lesson: session.lesson
    ? { id: String(session.lesson), label: session.lessonLabel || "" }
    : null,
  messages: (session.messages || []).map(publicMessage),
  messageCount: session.messageCount || 0,
  creditsSpent: session.creditsSpent || 0,
  voice: walletCopy(wallet, config.messageCredits),
  pricing: {
    price: config.messageCredits,
    creditCents: config.creditCents,
    ttsVoice: config.ttsVoice,
  },
});

const findSession = async ({ schoolId, student, sessionId }) => {
  const id = objectId(sessionId);
  if (!id) throw notFound("Session not found.");
  const session = await TutorVoiceSession.findOne({
    _id: id,
    school: schoolId,
    student: student._id,
  });
  if (!session) throw notFound("This voice session is not yours.");
  return session;
};

const openingTurn = (lessonTitle, language = "en") => {
  const arabic = language === "ar";
  const lead = arabic
    ? `لنتحدّث عن ${lessonTitle}.`
    : `Let's talk about ${lessonTitle}.`;
  const followUp = arabic
    ? "قل لي ما تعرفه عنه بالفعل."
    : "Tell me what you already know about it.";
  const spoken = arabic
    ? `${lead} قل لي ما تعرفه، وسنكتشف الباقي معًا.`
    : `${lead} Tell me what you already know, and we'll work the rest out together.`;
  return {
    role: "tutor",
    text: `${lead} ${followUp}`,
    spoken,
    lead,
    emphasis: "",
    blocks: [],
    followUp,
    stage: "prompt",
    credits: 0,
    at: new Date(),
  };
};

export const startVoiceSession = async ({
  schoolId,
  student,
  subjectId,
  lessonId,
  language = "en",
  lazy = false,
  timing = null,
}) => {
  const marks = timing || createTurnTiming();
  const config = await sessionConfig(schoolId);
  marks.step("config");
  const wallet = await assertVoiceAccess({ schoolId, student, config });
  marks.step("access");

  const subject = objectId(subjectId);
  if (!subject)
    throw badRequest("Pick the subject you want to talk about first.");
  const subjectDoc = await Subject.findOne({ _id: subject, school: schoolId })
    .select("name")
    .lean();
  if (!subjectDoc) throw notFound("Subject not found.");

  const { grade, classDoc } = await studentScope({ schoolId, student });
  const lesson = objectId(lessonId)
    ? await TutorLesson.findOne({
        _id: lessonId,
        school: schoolId,
        subject,
        grade,
        isActive: true,
      })
        .select(
          "unitNumber unitTitle chapterNumber chapterTitle lessonNumber title content standards",
        )
        .lean()
    : null;
  if (!lesson)
    throw badRequest("Pick a lesson before you start a voice session.");
  marks.step("context");

  const [languageLevel, standards] = await Promise.all([
    studentLanguageLevel({ schoolId, student, grade }),
    sessionStandards({ schoolId, subjectId: subject, grade }),
  ]);
  const sessionLanguage =
    String(language).slice(0, 2).toLowerCase() === "ar" ? "ar" : "en";

  // The opening is generated from this lesson and the student's level, then
  // spoken. If the model or the voice fails, a plain opening still opens the
  // board so a session never starts on silence and an empty screen.
  let opening = null;
  let openingReply = null;
  try {
    const prompt = buildVoiceOpeningPrompt({
      lessons: [lesson],
      standards,
      subjectName: subjectDoc.name,
      grade,
      language: sessionLanguage,
      languageLevel,
      lesson,
    });
    openingReply = await connectAi(prompt, {
      usage: false,
      provider: "openai",
      modelName: config.model,
    });
    opening = readVoiceReply(openingReply?.text, { lessons: [lesson] });
  } catch (error) {
    logger.warn("voice_tutor_opening_failed", {
      schoolId: String(schoolId),
      error: error?.message,
    });
  }
  marks.step("ai");

  const turnId = new mongoose.Types.ObjectId();
  const message = opening
    ? {
        role: "tutor",
        turnId,
        text: opening.spoken,
        spoken: opening.spoken,
        lead: opening.lead,
        emphasis: opening.emphasis,
        blocks: opening.blocks,
        followUp: opening.followUp,
        stage: "opening",
        lessonIds: [lesson._id],
        tokens: Number(openingReply?.totalTokenCount) || 0,
        credits: 0,
        at: new Date(),
      }
    : { ...openingTurn(lesson.title, sessionLanguage), turnId };

  // The opening is spoken in the same board parts a turn uses, so the first
  // thing a student sees follows the first thing they hear.
  const speechSegments = opening
    ? voiceSpeechSegments({
        lead: message.lead,
        blocks: message.blocks,
        followUp: message.followUp,
      })
    : [{ kind: "lead", text: message.spoken }];
  const speechSeconds = Math.min(
    config.maxSpeechSeconds,
    speechSecondsFor(speechSegments, message.spoken),
  );
  message.segments = speechSegments.map((segment, index) => ({
    kind: segment.kind || "",
    index,
    text: segment.text,
  }));
  let clips = [];
  let speech = null;
  let audioFailed = false;
  if (!lazy) {
    ({ clips, speech, audioFailed } = await speakReply({
      segments: speechSegments,
      spoken: message.spoken,
      config,
      schoolId,
      event: "voice_tutor_opening_tts",
    }));
  }
  // In lazy mode the voice is priced from its estimated length, not from a
  // synthesis that has not happened yet.
  message.speechSeconds =
    lazy || clips.length || speech ? speechSeconds : 0;
  marks.step("speech");

  // The opening is free to the student, but its real provider cost still lands
  // on the ledger so the school sees what the warm-up costs.
  let providerCostCents = 0;
  if (openingReply) {
    const tokens = tokenCounts(openingReply);
    const tokenCostCents = voiceCostCents({
      tokens,
      modelRates: config.meters.modelRates,
    });
    providerCostCents = voiceCostCents({
      tokens,
      speechSeconds: message.speechSeconds,
      modelRates: config.meters.modelRates,
      ttsCentsPerMinute: config.meters.ttsCentsPerMinute,
    });
    await chargeUsage({
      schoolId,
      userId: student.user,
      reply: openingReply,
      feature: "voice-tutor-opening",
      outcome: "done",
      rates: config.meters.modelRates,
      extraCostCents: Math.max(0, providerCostCents - tokenCostCents),
      chargedCents: 0,
      audio: {
        transcriptSeconds: 0,
        speechSeconds: message.speechSeconds,
        sttModel: config.sttModel,
        ttsModel: config.ttsModel,
      },
      refs: { student: student._id },
    });
  }

  const session = await TutorVoiceSession.create({
    school: schoolId,
    student: student._id,
    user: student.user,
    subject,
    subjectName: subjectDoc.name,
    lesson: lesson._id,
    lessonLabel: lessonLabel(lesson),
    classId: classDoc?._id,
    grade,
    language: sessionLanguage,
    languageLevel,
    messages: [message],
    messageCount: 1,
    providerCostCents,
    chargedCents: 0,
    profitCents: -providerCostCents,
  });
  marks.step("save");
  const shaped = shapeSession(session.toObject(), wallet, config);
  const base = {
    ...shaped,
    subject: { id: String(subject), name: subjectDoc.name },
    lesson: { id: String(lesson._id), label: lessonLabel(lesson) },
    turnId: String(turnId),
    audioFailed,
  };
  if (lazy) {
    return {
      ...base,
      audio: null,
      segments: [],
      clips: clipMetadata(message.segments),
      audioPending: true,
    };
  }
  return {
    ...base,
    audio: audioSource(speech),
    segments: clips,
  };
};

export const getVoiceSession = async ({ schoolId, student, sessionId }) => {
  const session = await findSession({ schoolId, student, sessionId });
  const [config, wallet, lesson, subject] = await Promise.all([
    sessionConfig(schoolId),
    voiceWallet({ schoolId, user: student.user }),
    session.lesson
      ? TutorLesson.findOne({ _id: session.lesson, school: schoolId })
          .select(
            "unitNumber unitTitle chapterNumber chapterTitle lessonNumber title",
          )
          .lean()
      : null,
    session.subject
      ? Subject.findOne({ _id: session.subject, school: schoolId })
          .select("name")
          .lean()
      : null,
  ]);
  const shaped = shapeSession(session.toObject(), wallet, config);
  if (lesson)
    shaped.lesson = { id: String(lesson._id), label: lessonLabel(lesson) };
  if (subject)
    shaped.subject = { id: String(session.subject), name: subject.name };
  return shaped;
};

export const endVoiceSession = async ({ schoolId, student, sessionId }) => {
  const session = await findSession({ schoolId, student, sessionId });
  if (session.status !== "ended") {
    session.status = "ended";
    session.endedAt = new Date();
    await session.save();
  }
  const [config, wallet] = await Promise.all([
    sessionConfig(schoolId),
    voiceWallet({ schoolId, user: student.user }),
  ]);
  return {
    id: String(session._id),
    status: session.status,
    voice: config ? walletCopy(wallet, config.messageCredits) : null,
  };
};

/* ------------------------------------------------------------------ */
/* One spoken turn                                                     */
/* ------------------------------------------------------------------ */

/** The turn only needs its scope and the last few messages, never the document. */
const findTurnSession = async ({ schoolId, student, sessionId }) => {
  const id = objectId(sessionId);
  if (!id) throw notFound("Session not found.");
  const session = await TutorVoiceSession.findOne({
    _id: id,
    school: schoolId,
    student: student._id,
  })
    .select(
      "status classId language languageLevel grade subject lesson messages.role messages.text messages.spoken messages.stage messages.questionType",
    )
    .slice("messages", -8)
    .lean();
  if (!session) throw notFound("This voice session is not yours.");
  return session;
};

/** The two messages one turn adds, with the clip texts kept for lazy playback. */
export const buildTurnMessages = ({
  transcript,
  transcriptSeconds = 0,
  parsed = {},
  segments = null,
  lessons = [],
  reply = null,
  turnId,
  price = 0,
  speechSeconds = 0,
  at = new Date(),
}) => {
  const storedSegments = (segments || speechSegmentsFor(parsed)).map(
    (segment, index) => ({
      kind: segment.kind || "",
      index,
      text: String(segment.text || ""),
    }),
  );
  return {
    segments: storedSegments,
    messages: [
      {
        role: "student",
        text: transcript,
        transcriptSeconds,
        at,
      },
      {
        role: "tutor",
        turnId,
        segments: storedSegments,
        text: parsed.spoken,
        spoken: parsed.spoken,
        lead: parsed.lead,
        emphasis: parsed.emphasis,
        blocks: parsed.blocks,
        followUp: parsed.followUp,
        options: parsed.options,
        questionType: parsed.questionType,
        stage: parsed.stage,
        lessonIds: lessons.map((lesson) => lesson._id),
        tokens: Number(reply?.totalTokenCount) || 0,
        credits: price,
        speechSeconds,
        at,
      },
    ],
  };
};

/**
 * Audio in, spoken turn out. Nothing is charged until a usable turn exists, so a
 * failed transcription or a tongue-tied model costs the student nothing.
 */
export const askVoice = async ({
  schoolId,
  student,
  sessionId,
  audio = null,
  mimeType = "audio/webm",
  text = "",
  durationMs = 0,
  lazy = false,
  timing = null,
}) => {
  const marks = timing || createTurnTiming();
  const session = await findTurnSession({ schoolId, student, sessionId });
  if (session.status !== "active")
    throw badRequest(
      "This voice session has ended. Start a new lesson to keep talking.",
    );
  marks.step("session");

  const config = await sessionConfig(schoolId);
  marks.step("config");

  const wallet = await assertVoiceAccess({ schoolId, student, config });
  marks.step("access");

  let transcript = String(text || "")
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARS);
  let transcriptSeconds = 0;
  if (!transcript) {
    const audioResult = await transcribeAudio({
      buffer: audio,
      mimeType,
      model: config.sttModel,
      language: session.language || "en",
    });
    transcript = audioResult.text.slice(0, MAX_TRANSCRIPT_CHARS);
    transcriptSeconds = Math.max(
      0,
      Math.min(config.maxTranscriptSeconds, Number(durationMs) / 1000 || 0),
    );
  }
  if (!transcript) throw badRequest("Say something first, then send it.");
  marks.step("transcribe");

  const [subjectDoc, standards, lessons, roster] = await Promise.all([
    Subject.findOne({ _id: session.subject, school: schoolId })
      .select("name")
      .lean(),
    sessionStandards({
      schoolId,
      subjectId: session.subject,
      grade: session.grade,
    }),
    // The session is pinned to one lesson, so the turn reads that lesson only.
    pickLessons({
      schoolId,
      subjectId: session.subject,
      grade: session.grade,
      question: transcript,
      lessonId: session.lesson,
      pinned: true,
    }),
    classRoster({
      schoolId,
      classId: session.classId || student.currentClass,
    }),
  ]);
  if (!lessons.length)
    throw badRequest(
      "This lesson is no longer available. Ask your teacher to check it.",
    );
  marks.step("context");

  const lessonRow =
    lessons.find((row) => String(row._id) === String(session.lesson)) || null;
  const prior = (session.messages || []).map((message) => ({
    role: message.role,
    text: message.text,
    spoken: message.spoken,
    stage: message.stage || null,
    questionType: message.questionType || "",
  }));
  // Everything a child said is scrubbed on its way into the prompt only; the
  // stored turn and the "You said" line keep the original words.
  const safe = scrubVoiceTurn({
    transcript,
    prior,
    student,
    roster,
  });
  const prompt = buildVoicePrompt({
    transcript: safe.transcript,
    lessons,
    standards,
    subjectName: subjectDoc?.name || "this subject",
    grade: session.grade,
    language: session.language,
    languageLevel: session.languageLevel,
    lesson: lessonRow,
    board: safe.prior,
    tries: countTries(prior),
    assessmentMode: true,
    questionType: nextQuestionType(prior),
  });

  let reply;
  try {
    reply = await connectAi(prompt, {
      usage: false,
      provider: "openai",
      modelName: config.model,
    });
  } catch (error) {
    logger.warn("voice_tutor_ai_failed", {
      schoolId: String(schoolId),
      error: error?.message,
    });
    throw Object.assign(
      new Error(
        "The tutor could not answer just now. Nothing was charged — try again.",
      ),
      {
        statusCode: 502,
        code: "VOICE_TUTOR_AI_FAILED",
      },
    );
  }
  marks.step("ai");

  const parsed = readVoiceReply(reply?.text, { lessons });
  if (!parsed) {
    logger.warn("voice_tutor_reply_unusable", { schoolId: String(schoolId) });
    throw Object.assign(
      new Error("The tutor got tongue-tied. Nothing was charged — try again."),
      {
        statusCode: 502,
        code: "VOICE_TUTOR_EMPTY",
      },
    );
  }

  const speechSegments = speechSegmentsFor(parsed);
  const speechSeconds = Math.min(
    config.maxSpeechSeconds,
    speechSecondsFor(speechSegments, parsed.spoken),
  );
  let clips = [];
  let speech = null;
  let audioFailed = false;
  if (!lazy) {
    ({ clips, speech, audioFailed } = await speakReply({
      segments: speechSegments,
      spoken: parsed.spoken,
      config,
      schoolId,
      event: "voice_tutor_tts",
    }));
  }
  // Lazy playback is priced from the estimated length of the reply it will fetch.
  const billedSpeechSeconds =
    lazy || clips.length || speech ? speechSeconds : 0;
  marks.step("speech");

  const tokens = tokenCounts(reply);
  const tokenCostCents = voiceCostCents({
    tokens,
    modelRates: config.meters.modelRates,
  });
  const providerCostCents = voiceCostCents({
    tokens,
    transcriptSeconds,
    speechSeconds: billedSpeechSeconds,
    modelRates: config.meters.modelRates,
    sttCentsPerMinute: config.meters.sttCentsPerMinute,
    ttsCentsPerMinute: config.meters.ttsCentsPerMinute,
  });
  const price = config.messageCredits;
  const turnId = new mongoose.Types.ObjectId();
  const { segments: storedSegments, messages } = buildTurnMessages({
    transcript,
    transcriptSeconds,
    parsed,
    segments: speechSegments,
    lessons,
    reply,
    turnId,
    price,
    speechSeconds: billedSpeechSeconds,
  });

  const [charge] = await Promise.all([
    chargeUsage({
      schoolId,
      userId: student.user,
      reply,
      feature: "voice-tutor",
      outcome: "done",
      rates: config.meters.modelRates,
      extraCostCents: Math.max(0, providerCostCents - tokenCostCents),
      chargedCents: price,
      audio: {
        transcriptSeconds,
        speechSeconds: billedSpeechSeconds,
        sttModel: config.sttModel,
        ttsModel: config.ttsModel,
      },
      refs: { student: student._id },
    }),
    // One atomic write: no read-modify-write of the whole document.
    TutorVoiceSession.updateOne(
      { _id: session._id, school: schoolId, student: student._id },
      {
        $push: {
          messages: { $each: messages, $slice: -MAX_SESSION_MESSAGES },
        },
        $inc: {
          messageCount: 1,
          creditsSpent: price,
          providerCostCents,
          chargedCents: price,
          profitCents: price - providerCostCents,
        },
      },
    ),
  ]);
  marks.step("charge");

  const after = Number.isFinite(charge?.balanceCents)
    ? {
        credits: creditsOf({ balanceCents: charge.balanceCents }),
        paused: wallet.paused,
        exists: true,
      }
    : await voiceWallet({ schoolId, user: student.user });
  marks.step("wallet");

  const base = {
    sessionId: String(session._id),
    transcript,
    stage: parsed.stage,
    lead: parsed.lead,
    emphasis: parsed.emphasis,
    blocks: parsed.blocks,
    followUp: parsed.followUp,
    options: parsed.options,
    questionType: parsed.questionType,
    spoken: parsed.spoken,
    lesson: lessonRow
      ? { id: String(lessonRow._id), label: lessonLabel(lessonRow) }
      : null,
    turnId: String(turnId),
    audioFailed,
    voice: walletCopy(after, price),
  };
  if (lazy) {
    return {
      ...base,
      audio: null,
      segments: [],
      clips: clipMetadata(storedSegments),
      audioPending: true,
    };
  }
  return {
    ...base,
    audio: audioSource(speech),
    segments: clips,
  };
};

/**
 * One clip of a saved tutor turn, as MP3 bytes. The speech cache makes a replay
 * free, and only the session's own student can read it.
 */
export const getVoiceClip = async ({
  schoolId,
  student,
  sessionId,
  turnId,
  clipIndex,
}) => {
  const sessionObjectId = objectId(sessionId);
  const turnObjectId = objectId(turnId);
  const index = Number(clipIndex);
  if (
    !sessionObjectId ||
    !turnObjectId ||
    !Number.isInteger(index) ||
    index < 0
  ) {
    throw notFound("That sound clip was not found.");
  }
  const session = await TutorVoiceSession.findOne({
    _id: sessionObjectId,
    school: schoolId,
    student: student._id,
    "messages.turnId": turnObjectId,
  })
    .select("messages.$")
    .lean();
  const segments = session?.messages?.[0]?.segments || [];
  const segment = segments[index];
  if (!segment?.text) throw notFound("That sound clip was not found.");

  const config = await sessionConfig(schoolId);
  let speech;
  try {
    speech = await synthesizeWithRetry({
      text: segment.text,
      model: config.ttsModel,
      voice: config.ttsVoice,
    });
  } catch (error) {
    // No clip text, no transcript: only the provider status is safe to log.
    logger.warn("voice_clip_failed", {
      schoolId: String(schoolId),
      statusCode: Number(error?.statusCode) || 0,
    });
    throw Object.assign(
      new Error("The sound could not be prepared. Try again."),
      { statusCode: 502, code: "VOICE_CLIP_FAILED" },
    );
  }
  return {
    buffer: speech.buffer,
    contentType: speech.contentType || "audio/mpeg",
  };
};
