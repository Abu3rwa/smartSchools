/**
 * Reading Assistant service: upload text, simplify by level, critical thinking,
 * vocabulary building, assignments, and progress.
 */

import { connectAi } from "../utils/connectAi.js";
import { logAIUsage } from "../utils/aiUsageTracker.js";
import StudentReadingProfile from "../models/StudentReadingProfile.js";
import SimplifiedText from "../models/SimplifiedText.js";
import ReadingAssignment from "../models/ReadingAssignment.js";
import ReadingCompletion from "../models/ReadingCompletion.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";
import VocabWord from "../models/VocabWord.js";
import VocabWordSource from "../models/VocabWordSource.js";
import WordAudio from "../models/WordAudio.js";
import { getAcademicYearDateRange } from "../utils/academicYear.js";
import {
  getLanguageLabel,
  resolveRequestedLanguages,
  toLegacyLanguageValue
} from "../utils/aiLanguageUtils.js";

/** Approximate syllables in a word (vowel groups). */
function countSyllables(word) {
  const w = word.toLowerCase().replace(/\W/g, "");
  if (!w) return 0;
  const matches = w.match(/[aeiouy]+/g);
  return matches ? matches.length : 1;
}

/**
 * Compute Flesch-Kincaid grade level (approximate). Returns grade level ~4–14.
 */
export function computeReadability(text) {
  if (!text || typeof text !== "string") return null;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);
  const words = text.split(/\s+/).filter((s) => s.length > 0);
  const wordCount = Math.max(1, words.length);
  let syllables = 0;
  words.forEach((w) => (syllables += countSyllables(w)));
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllables / wordCount;
  const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.round(Math.max(1, Math.min(14, grade)));
}

function parseJsonFromResponse(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
  return null;
}

function buildReadingLanguageRule(requestedLanguages = ["en"]) {
  const normalized = Array.isArray(requestedLanguages) && requestedLanguages.length > 0
    ? requestedLanguages.slice(0, 2)
    : ["en"];
  const primary = normalized[0] || "en";
  const primaryLabel = getLanguageLabel(primary);

  if (normalized.length > 1) {
    const secondary = normalized[1];
    const secondaryLabel = getLanguageLabel(secondary);
    return `Use bilingual output with two clear blocks: first ${primaryLabel} (${primary}), then ${secondaryLabel} (${secondary}). Do not mix languages within the same sentence.`;
  }

  return `Use ${primaryLabel} (${primary}) only.`;
}

async function callAiWithOptionalUsage(prompt, tracking, feature, metadata) {
  if (!tracking?.schoolId || !tracking?.userId) {
    return connectAi(prompt);
  }

  let response;
  let error = false;
  try {
    response = await connectAi(prompt);
  } catch (err) {
    error = true;
    response = err.response || {};
    throw err;
  } finally {
    await logAIUsage({
      model: "gemini-2.5-flash-lite",
      feature,
      schoolId: tracking.schoolId,
      userId: tracking.userId,
      studentId: tracking.studentId,
      entityType: tracking.entityType,
      entityId: tracking.entityId,
      metadata,
      response,
      error,
    });
  }

  return response;
}

/**
 * Generate subject area and topic tags from the text using the LLM.
 */
async function generateSubjectAndTopicTags(title, originalText, tracking, requestedLanguages = ["en"]) {
  const primaryLanguage = Array.isArray(requestedLanguages) && requestedLanguages.length > 0
    ? requestedLanguages[0]
    : "en";
  const primaryLabel = getLanguageLabel(primaryLanguage);
  const prompt = `You are an expert educator. Analyze this reading and suggest:
1. A single subject area (e.g. Science, History, English).
2. 3-8 topic tags (short keywords) that describe the content for filtering and discovery.

TITLE: ${title || "Reading"}

TEXT (excerpt):
${(originalText || "").slice(0, 4000)}

LANGUAGE RULE:
- Return "subjectArea" and "topicTags" in ${primaryLabel} (${primaryLanguage}) only.

Respond with a JSON object only, no other text:
{
  "subjectArea": "Subject name",
  "topicTags": ["tag1", "tag2", "tag3"]
}`;

  const response = await callAiWithOptionalUsage(
    prompt,
    tracking,
    "reading_subject_tags",
    {
      title,
      requestedLanguages,
    }
  );
  const parsed = parseJsonFromResponse(response?.text || "");
  if (!parsed) return { subjectArea: "", topicTags: [] };
  return {
    subjectArea:
      (parsed.subjectArea && String(parsed.subjectArea).trim()) || "",
    topicTags: Array.isArray(parsed.topicTags)
      ? parsed.topicTags.map((t) => String(t).trim()).filter(Boolean)
      : [],
  };
}

/**
 * Build a short summary of the target class/students for the LLM (reading levels, grade).
 */
async function getStudentContextSummary(schoolId, classId) {
  if (!classId) return "";

  const classDoc = await Class.findById(classId).select("name grade").lean();
  if (!classDoc) return "";

  const students = await Student.find({
    school: schoolId,
    currentClass: classId,
    status: "active",
  })
    .select("_id")
    .lean();

  if (students.length === 0) {
    return `Target audience: Class ${classDoc.name} (Grade ${classDoc.grade}). No enrolled students yet.`;
  }

  const studentIds = students.map((s) => s._id);
  const profiles = await StudentReadingProfile.find({
    school: schoolId,
    student: { $in: studentIds },
  })
    .select("currentReadingLevel comprehensionAccuracy")
    .lean();

  const levels = profiles
    .map((p) => p.currentReadingLevel)
    .filter((n) => n != null && !Number.isNaN(n));
  const avgLevel =
    levels.length > 0
      ? (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1)
      : null;
  const minMax =
    levels.length > 0
      ? `range ${Math.min(...levels)}–${Math.max(...levels)}`
      : "no levels yet";

  return `Target audience: Class ${classDoc.name}, Grade ${classDoc.grade}. ${
    students.length
  } students. Reading levels: ${minMax}${
    avgLevel ? `, average ${avgLevel}` : ""
  }. Use this to tailor vocabulary and complexity.`;
}

/**
 * Generate one simplified version for target grade level with vocabulary list.
 */
async function generateSimplifiedVersion(
  originalText,
  targetLevel,
  title,
  studentContext = "",
  tracking,
  requestedLanguages = ["en"]
) {
  const languageRule = buildReadingLanguageRule(requestedLanguages);
  const contextBlock = studentContext
    ? `\nAUDIENCE (use to tailor vocabulary and examples):\n${studentContext}\n`
    : "";

  const prompt = `You are an expert educator. Simplify the following text to a grade ${targetLevel} reading level. Preserve all key concepts and learning objectives. Replace complex words with simpler synonyms; break long sentences into shorter ones.
${contextBlock}
LANGUAGE RULE:
- ${languageRule}

TITLE: ${title || "Reading"}

ORIGINAL TEXT:
${originalText}

Respond with a JSON object only, no other text:
{
  "simplifiedText": "the full simplified text here",
  "vocabularySubstitutions": [
    { "original": "complex word", "simple": "simpler word", "definition": "brief definition" }
  ],
  "conceptsPreserved": ["concept1", "concept2"]
}
Include 8-15 vocabulary entries for important terms (original, simple, definition).`;

  const response = await callAiWithOptionalUsage(
    prompt,
    tracking,
    "reading_simplified_version",
    { title, targetLevel, requestedLanguages }
  );
  const parsed = parseJsonFromResponse(response?.text || "");
  if (!parsed || !parsed.simplifiedText) {
    throw new Error("AI did not return valid simplified text");
  }
  return {
    targetLevel: Number(targetLevel),
    simplifiedText: parsed.simplifiedText,
    vocabularySubstitutions: Array.isArray(parsed.vocabularySubstitutions)
      ? parsed.vocabularySubstitutions.map((v) => ({
          original: v.original || "",
          simple: v.simple || "",
          definition: v.definition || "",
        }))
      : [],
    conceptsPreserved: Array.isArray(parsed.conceptsPreserved)
      ? parsed.conceptsPreserved
      : [],
  };
}

/**
 * Generate 3-5 critical thinking questions for the text.
 */
async function generateCriticalThinkingQuestions(
  originalText,
  title,
  studentContext = "",
  tracking,
  requestedLanguages = ["en"]
) {
  const languageRule = buildReadingLanguageRule(requestedLanguages);
  const contextBlock = studentContext
    ? `\nAUDIENCE (tailor question difficulty and relevance):\n${studentContext}\n`
    : "";

  const prompt = `You are an expert educator. Create 3-5 critical thinking questions for this reading. Questions should encourage analysis, inference, and reflection—not just recall.
${contextBlock}
LANGUAGE RULE:
- ${languageRule}

TITLE: ${title || "Reading"}

TEXT (excerpt):
${(originalText || "").slice(0, 3000)}

Respond with a JSON array only, no other text:
[
  { "question": "First question?", "prompt": "Optional hint or prompt", "order": 1 },
  { "question": "Second question?", "prompt": "", "order": 2 }
]`;

  const response = await callAiWithOptionalUsage(
    prompt,
    tracking,
    "reading_critical_questions",
    { title, requestedLanguages }
  );
  const parsed = parseJsonFromResponse(response?.text || "");
  if (!Array.isArray(parsed)) return [];
  return parsed
    .slice(0, 5)
    .map((q, i) => ({
      question: q.question || "",
      prompt: q.prompt || "",
      order: q.order ?? i + 1,
    }))
    .filter((q) => q.question);
}

/**
 * Generate 3-5 multiple-choice comprehension questions.
 */
async function generateComprehensionQuestions(
  originalText,
  title,
  studentContext = "",
  tracking,
  requestedLanguages = ["en"]
) {
  const languageRule = buildReadingLanguageRule(requestedLanguages);
  const contextBlock = studentContext
    ? `\nAUDIENCE (tailor difficulty and distractors):\n${studentContext}\n`
    : "";

  const prompt = `You are an expert educator. Create 3-5 multiple-choice comprehension questions for this reading. Each question has 4 options; one is correct.
${contextBlock}
LANGUAGE RULE:
- ${languageRule}

TITLE: ${title || "Reading"}

TEXT (excerpt):
${(originalText || "").slice(0, 3000)}

Respond with a JSON array only:
[
  {
    "question": "Question text?",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0,
    "order": 1
  }
]`;

  const response = await callAiWithOptionalUsage(
    prompt,
    tracking,
    "reading_comprehension_questions",
    { title, requestedLanguages }
  );
  const parsed = parseJsonFromResponse(response?.text || "");
  if (!Array.isArray(parsed)) return [];
  return parsed
    .slice(0, 5)
    .map((q, i) => ({
      question: q.question || "",
      options: Array.isArray(q.options) ? q.options : [],
      correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
      order: q.order ?? i + 1,
    }))
    .filter((q) => q.question && q.options?.length >= 2);
}

/**
 * Upload and analyze text; optionally generate simplified versions and questions.
 * Subject area and topic tags are generated from the text by the LLM when not provided.
 * If classId is provided, student context (class name, grade, reading levels) is included for the LLM.
 */
export async function uploadText(schoolId, payload, options = {}) {
  const {
    title,
    originalText,
    sourceDocument,
    subjectArea: subjectAreaInput,
    topicTags: topicTagsInput,
    classId,
    generateVersions = true,
    targetLevels = [6, 8, 10],
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    tracking,
  } = { ...payload, ...options };

  if (!title || !originalText) {
    throw new Error("title and originalText are required");
  }

  const originalComplexity = computeReadability(originalText);

  const usageTracking = tracking ? { ...tracking, schoolId } : null;
  const normalizedRequestedLanguages = resolveRequestedLanguages({
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    subjectName: subjectAreaInput || title || "",
    max: 2
  });
  let subjectArea = subjectAreaInput?.trim();
  let topicTags = Array.isArray(topicTagsInput)
    ? topicTagsInput.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (!subjectArea || topicTags.length === 0) {
    try {
      const generated = await generateSubjectAndTopicTags(
        title,
        originalText,
        usageTracking,
        normalizedRequestedLanguages
      );
      if (!subjectArea) subjectArea = generated.subjectArea;
      if (topicTags.length === 0) topicTags = generated.topicTags;
    } catch (err) {
      console.error("Failed to generate subject/topic tags:", err.message);
    }
  }

  const doc = {
    school: schoolId,
    createdBy: usageTracking?.userId,
    isShared: payload.isShared === true,
    title: title.trim(),
    originalText: String(originalText).replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, ""),
    sourceDocument: sourceDocument?.trim(),
    originalComplexity,
    subjectArea: subjectArea || "",
    topicTags,
    language: toLegacyLanguageValue(normalizedRequestedLanguages),
    requestedLanguages: normalizedRequestedLanguages,
    simplifiedVersions: [],
    criticalThinkingQuestions: [],
    comprehensionQuestions: [],
  };

  const studentContext = await getStudentContextSummary(
    schoolId,
    classId || null
  );

  if (generateVersions && targetLevels.length > 0) {
    for (const level of targetLevels) {
      try {
        const version = await generateSimplifiedVersion(
          originalText,
          level,
          title,
          studentContext,
          usageTracking,
          normalizedRequestedLanguages
        );
        doc.simplifiedVersions.push(version);
      } catch (err) {
        console.error(`Failed to generate level ${level}:`, err.message);
      }
    }
    try {
      doc.criticalThinkingQuestions = await generateCriticalThinkingQuestions(
        originalText,
        title,
        studentContext,
        usageTracking,
        normalizedRequestedLanguages
      );
    } catch (err) {
      console.error(
        "Failed to generate critical thinking questions:",
        err.message
      );
    }
    try {
      doc.comprehensionQuestions = await generateComprehensionQuestions(
        originalText,
        title,
        studentContext,
        usageTracking,
        normalizedRequestedLanguages
      );
    } catch (err) {
      console.error("Failed to generate comprehension questions:", err.message);
    }
  }

  const simplified = await SimplifiedText.create(doc);
  return simplified;
}

/**
 * Get simplified version for a student (by reading level); fallback to closest level.
 */
export async function getSimplifiedForStudent(
  textId,
  studentId,
  schoolId,
  academicYear = null,
  options = {}
) {
  const { requireAssignment = false, assignmentId = null } = options;

  const text = await SimplifiedText.findOne({ _id: textId, school: schoolId });
  if (!text) throw new Error("Text not found");

  if (requireAssignment) {
    const assignmentQuery = {
      school: schoolId,
      text: textId,
      students: studentId,
      isActive: true,
    };
    if (academicYear) {
      assignmentQuery.academicYear = academicYear;
    }
    if (assignmentId) assignmentQuery._id = assignmentId;
    const assignment = await ReadingAssignment.findOne(assignmentQuery).select("_id").lean();
    if (!assignment) {
      const error = new Error("No active assignment found for this reading");
      error.statusCode = 403;
      throw error;
    }
    options.assignmentId = assignment._id;
  }

  let targetLevel = 8;
  const profile = await StudentReadingProfile.findOne({
    school: schoolId,
    student: studentId,
  });
  const hasMeasuredLevel = profile?.currentReadingLevel != null;
  if (hasMeasuredLevel) {
    targetLevel = profile.currentReadingLevel;
  }

  const attachVocabularyAudio = async (items, passageText) => {
    const lessonVocabulary = Array.isArray(items) ? items : [];
    const passageTerms = new Set(
      (String(passageText || "").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [])
        .map((word) => word.normalize("NFKC").toLocaleLowerCase().trim())
        .filter(Boolean)
    );
    const terms = [...new Set([
      ...passageTerms,
      ...lessonVocabulary.flatMap((item) => [item.original, item.simple])
        .map((word) => String(word || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ])];
    const vocabularyWords = [];
    for (let index = 0; index < terms.length; index += 1000) {
      vocabularyWords.push(...await VocabWord.find({
        school: schoolId,
        normalizedWord: { $in: terms.slice(index, index + 1000) },
      }).select("_id word normalizedWord meaning arabicMeaning form baseWord").lean());
    }
    const mergedVocabulary = new Map();
    for (const word of vocabularyWords) {
      const key = String(word.normalizedWord || word.word).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
      if (!key) continue;
      mergedVocabulary.set(key, {
        original: word.word,
        simple: "",
        definition: word.meaning || "",
        meaning: word.meaning || "",
        arabicMeaning: word.arabicMeaning || "",
        form: word.form || "",
        baseWord: word.baseWord || "",
      });
    }
    for (const item of lessonVocabulary) {
      const key = String(item.original || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
      if (key && !mergedVocabulary.has(key)) mergedVocabulary.set(key, item);
    }
    const substitutions = [...mergedVocabulary.values()];
    if (!terms.length) return substitutions;
    const audioTerms = [...new Set([
      ...vocabularyWords.map((word) => word.normalizedWord),
      ...lessonVocabulary.flatMap((item) => [item.original, item.simple]),
    ].map((word) => String(word || "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean))];

    const [sources, dictionaryAudio] = await Promise.all([
      vocabularyWords.length
        ? VocabWordSource.find({ school: schoolId, word: { $in: vocabularyWords.map((word) => word._id) } })
          .select("word source audioUsUrl audioUkUrl exampleAudioUrl").lean()
        : [],
      WordAudio.find({ word: { $in: audioTerms } })
        .select("word longmanUS longmanUK oxfordUS oxfordUK googleUS googleUK examples.longman examples.oxford examples.webster examples.google").lean(),
    ]);

    const byVocabularyId = new Map(vocabularyWords.map((word) => [String(word._id), word.normalizedWord]));
    const audioByTerm = new Map();
    const addAudio = (term, dictionary, audio) => {
      if (!term || !audio || Object.keys(audio).length === 0) return;
      const entry = audioByTerm.get(term) || {};
      entry[dictionary] = { ...audio, ...(entry[dictionary] || {}) };
      audioByTerm.set(term, entry);
    };
    for (const source of sources) {
      const term = byVocabularyId.get(String(source.word));
      addAudio(term, source.source, {
        ...(source.audioUsUrl ? { us: source.audioUsUrl } : {}),
        ...(source.audioUkUrl ? { uk: source.audioUkUrl } : {}),
        ...(source.exampleAudioUrl ? { examples: [source.exampleAudioUrl] } : {}),
      });
    }
    for (const doc of dictionaryAudio) {
      const fields = {
        longman: { us: doc.longmanUS, uk: doc.longmanUK, examples: doc.examples?.longman },
        oxford: { us: doc.oxfordUS, uk: doc.oxfordUK, examples: doc.examples?.oxford },
        google: { us: doc.googleUS, uk: doc.googleUK, examples: doc.examples?.google },
      };
      for (const [dictionary, audio] of Object.entries(fields)) {
        addAudio(doc.word, dictionary, {
          ...(audio.us ? { us: audio.us } : {}),
          ...(audio.uk ? { uk: audio.uk } : {}),
          ...(audio.examples?.length ? { examples: audio.examples } : {}),
        });
      }
    }
    return substitutions.map((item) => {
      const original = String(item.original || "").normalize("NFKC").trim().toLocaleLowerCase();
      const simple = String(item.simple || "").normalize("NFKC").trim().toLocaleLowerCase();
      const dictionaries = audioByTerm.get(original) || audioByTerm.get(simple);
      return dictionaries ? { ...item, audio: { dictionaries } } : item;
    });
  };

  const orderedSections = [...(text.sections || [])]
    .sort((a, b) => a.order - b.order)
    .map((section) => ({ order: section.order, title: section.title || "", text: section.text }));

  const versions = text.simplifiedVersions || [];
  if (versions.length === 0) {
    const vocabularySubstitutions = await attachVocabularyAudio(
      text.vocabularySubstitutions || [],
      text.sections?.length ? text.sections.map((section) => section.text).join("\n\n") : text.originalText
    );
    return {
      text: text.toObject(),
      simplifiedContent: text.originalText,
      vocabularySubstitutions,
      targetLevel: text.originalComplexity || targetLevel,
      levelIsRecommended: false,
      availableLevels: [],
      readingLevels: [
        {
          targetLevel: text.originalComplexity || targetLevel,
          text: text.originalText,
          sections: orderedSections,
          vocabularySubstitutions,
        },
      ],
      criticalThinkingQuestions: text.criticalThinkingQuestions || [],
      comprehensionQuestions: text.comprehensionQuestions || [],
      assignmentId: options.assignmentId || undefined,
    };
  }

  const sorted = [...versions].sort(
    (a, b) =>
      Math.abs(a.targetLevel - targetLevel) -
      Math.abs(b.targetLevel - targetLevel)
  );
  const best = sorted[0];
  const vocabularyByOriginal = new Map();
  for (const item of [
    ...(text.vocabularySubstitutions || []),
    ...(best.vocabularySubstitutions || []),
  ]) {
    const normalizedOriginal = String(item.original || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (normalizedOriginal && !vocabularyByOriginal.has(normalizedOriginal)) {
      vocabularyByOriginal.set(normalizedOriginal, item);
    }
  }

  return {
    text: text.toObject(),
    simplifiedContent: best.simplifiedText,
    vocabularySubstitutions: await attachVocabularyAudio(
      [...vocabularyByOriginal.values()],
      best.simplifiedText
    ),
    targetLevel: best.targetLevel,
    levelIsRecommended: hasMeasuredLevel,
    availableLevels: versions.map((v) => v.targetLevel),
    readingLevels: [...versions]
      .sort((a, b) => a.targetLevel - b.targetLevel)
      .map((version) => ({
        targetLevel: version.targetLevel,
        text: version.simplifiedText,
        sections: [],
        vocabularySubstitutions: version.vocabularySubstitutions || [],
      })),
    criticalThinkingQuestions: text.criticalThinkingQuestions || [],
    comprehensionQuestions: text.comprehensionQuestions || [],
    assignmentId: options.assignmentId || undefined,
  };
}

/**
 * Assess reading level (diagnostic); store in StudentReadingProfile.
 */
export async function assessLevel(studentId, assessmentResult, schoolId) {
  const { level, accuracy, lexileScore, vocabularySize, readingSpeedWpm } =
    assessmentResult || {};

  const profile = await StudentReadingProfile.findOneAndUpdate(
    { school: schoolId, student: studentId },
    {
      $set: {
        ...(level != null && { currentReadingLevel: level }),
        ...(accuracy != null && { comprehensionAccuracy: accuracy }),
        ...(lexileScore != null && { lexileScore }),
        ...(vocabularySize != null && { vocabularySize }),
        ...(readingSpeedWpm != null && { readingSpeedWpm }),
      },
      $push: {
        progressHistory: {
          $each: [
            {
              assessedAt: new Date(),
              level: level ?? null,
              accuracy: accuracy ?? null,
            },
          ],
          $slice: -50,
        },
      },
    },
    { upsert: true, new: true }
  );
  return profile;
}

/**
 * Get student's current reading level.
 */
export async function getStudentLevel(studentId, schoolId) {
  const profile = await StudentReadingProfile.findOne({
    school: schoolId,
    student: studentId,
  });
  return (
    profile || {
      currentReadingLevel: null,
      comprehensionAccuracy: null,
      progressHistory: [],
    }
  );
}

/**
 * Update progress after comprehension quiz; optionally create completion record.
 */
export async function updateProgress(
  studentId,
  textId,
  correctCount,
  totalCount,
  schoolId,
  assignmentId = null,
  academicYear = null,
  shortAnswers = {}
) {
  let assignment;
  if (assignmentId) {
    const assignmentQuery = {
      _id: assignmentId,
      school: schoolId,
      students: studentId,
      isActive: true,
    };
    if (academicYear) {
      assignmentQuery.academicYear = academicYear;
    }
    assignment = await ReadingAssignment.findOne(assignmentQuery).select("_id text");
    if (!assignment) {
      const error = new Error("Assignment not found for current academic year");
      error.statusCode = 404;
      throw error;
    }
    if (String(assignment.text) !== String(textId)) {
      throw Object.assign(new Error("Assignment does not match this reading."), { statusCode: 400 });
    }
  }

  let profile;
  if (totalCount > 0) {
    const accuracy = (correctCount / totalCount) * 100;
    profile = await StudentReadingProfile.findOneAndUpdate(
      { school: schoolId, student: studentId },
      {
        $set: { comprehensionAccuracy: accuracy },
        $push: {
          progressHistory: {
            $each: [{ assessedAt: new Date(), level: null, accuracy }],
            $slice: -50,
          },
        },
      },
      { upsert: true, new: true }
    );
  } else {
    profile = await StudentReadingProfile.findOne({ school: schoolId, student: studentId });
  }

  if (assignmentId) {
    await ReadingCompletion.findOneAndUpdate(
      { school: schoolId, student: studentId, assignment: assignmentId },
      {
        school: schoolId,
        student: studentId,
        assignment: assignmentId,
        text: textId,
        correctCount,
        totalCount,
        responses: Object.entries(shortAnswers).map(([questionId, answer]) => ({ questionId, answer })),
        completedAt: new Date(),
      },
      { upsert: true }
    );
  }

  return profile || { currentReadingLevel: null, comprehensionAccuracy: null, progressHistory: [] };
}

/**
 * Evaluate a student's critical thinking answer and return AI feedback.
 */
export async function evaluateCriticalThinkingAnswer(schoolId, payload) {
  const {
    textId,
    question,
    studentAnswer,
    textExcerpt,
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    tracking
  } = payload;

  if (!question || !studentAnswer || typeof studentAnswer !== "string") {
    throw new Error("question and studentAnswer are required");
  }

  const usageTracking = tracking ? { ...tracking, schoolId } : null;
  const normalizedRequestedLanguages = resolveRequestedLanguages({
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    max: 2
  });
  const languageRule = buildReadingLanguageRule(normalizedRequestedLanguages);
  let excerpt = textExcerpt;
  if (!excerpt && textId) {
    const text = await SimplifiedText.findById(textId)
      .select("originalText simplifiedVersions")
      .lean();
    if (text) {
      excerpt =
        text.simplifiedVersions?.[0]?.simplifiedText || text.originalText || "";
      excerpt = (excerpt || "").slice(0, 2500);
    }
  }
  excerpt = (excerpt || "").slice(0, 2500);

  const prompt = `You are an expert teacher. A student has answered a critical thinking question about a reading. Evaluate their answer and give constructive feedback in 2-4 sentences.

Focus on:
- Whether they engaged with the question and used reasoning (not just recall).
- Clarity and specificity of their answer.
- What they did well and one specific suggestion to improve (without giving away the "right" answer).

If the answer is very short or off-topic, encourage them to re-read the text and try again with more detail.

LANGUAGE RULE:
- ${languageRule}

CRITICAL THINKING QUESTION:
${question}

STUDENT'S ANSWER:
${(studentAnswer || "").trim()}

${excerpt ? `RELEVANT READING (for context):\n${excerpt}\n` : ""}

Respond with ONLY the feedback text. No labels, no "Feedback:" prefix. Write directly to the student.`;

  const response = await callAiWithOptionalUsage(
    prompt,
    usageTracking,
    "reading_critical_feedback",
    { textId, requestedLanguages: normalizedRequestedLanguages }
  );
  const feedback = (response?.text || "").trim();
  return { feedback };
}

/**
 * Create assignment: teacher assigns text to a class or specific students.
 */
export async function createAssignment(
  schoolId,
  payload,
  assignedByUserId,
  academicYear = null,
  schoolStartMonth = null,
  isAdmin = false
) {
  const { textId, classId, studentIds, dueDate, instructions } = payload;

  if (!textId) throw new Error("textId is required");
  await getTextById(textId, schoolId, assignedByUserId, isAdmin);

  let students = [];
  if (studentIds?.length) {
    const studentQuery = {
      school: schoolId,
      _id: { $in: studentIds },
      status: "active",
    };
    if (academicYear) {
      studentQuery.academicYear = academicYear;
    }
    const selectedStudents = await Student.find(studentQuery).select("_id").lean();
    students = selectedStudents.map((s) => s._id);
  } else if (classId) {
    const classQuery = { _id: classId, school: schoolId };
    if (academicYear) {
      classQuery.academicYear = academicYear;
    }
    const classDoc = await Class.findOne(classQuery).select("_id");
    if (!classDoc) {
      throw new Error(
        academicYear
          ? `Class not found in academic year ${academicYear}`
          : "Class not found"
      );
    }

    const inClass = await Student.find({
      school: schoolId,
      currentClass: classId,
      status: "active",
      ...(academicYear ? { academicYear } : {}),
    }).select("_id");
    students = inClass.map((s) => s._id);
  }
  if (students.length === 0) {
    throw new Error("Specify either classId or at least one studentId");
  }

  if (dueDate && academicYear) {
    const range = getAcademicYearDateRange(academicYear, schoolStartMonth);
    const due = new Date(dueDate);
    if (range && (due < range.startDate || due > range.endDate)) {
      throw new Error(`Due date must be inside academic year ${academicYear}`);
    }
  }

  const assignment = await ReadingAssignment.create({
    school: schoolId,
    academicYear: academicYear || undefined,
    text: textId,
    assignedBy: assignedByUserId,
    class: classId || undefined,
    students,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    instructions: instructions?.trim(),
  });
  return assignment.populate("text", "title subjectArea originalComplexity");
}

/**
 * List assignments for a student (assigned to them).
 */
export async function getAssignmentsForStudent(studentId, schoolId, academicYear = null) {
  const assignmentQuery = {
    school: schoolId,
    students: studentId,
    isActive: true,
  };
  if (academicYear) {
    assignmentQuery.academicYear = academicYear;
  }

  const assignments = await ReadingAssignment.find(assignmentQuery)
    .populate("text", "title subjectArea originalComplexity topicTags")
    .sort({ createdAt: -1 })
    .lean();

  const completions = await ReadingCompletion.find({
    school: schoolId,
    student: studentId,
    assignment: { $in: assignments.map((a) => a._id) },
  })
    .select("assignment completedAt correctCount totalCount")
    .lean();

  const completedByAssignment = new Map(
    completions
      .filter((completion) => completion.completedAt)
      .map((completion) => [String(completion.assignment), completion])
  );
  return assignments.map((a) => {
    const completion = completedByAssignment.get(String(a._id));
    return {
      ...a,
      completed: Boolean(completion),
      score: completion && completion.totalCount > 0
        ? { correctCount: completion.correctCount, totalCount: completion.totalCount }
        : null,
    };
  });
}

/**
 * List all texts (for teacher admin).
 */
export async function getTexts(schoolId, filters = {}) {
  const query = { school: schoolId, isArchived: { $ne: true } };
  if (filters.userId && !filters.isAdmin) {
    query.$or = [
      { createdBy: filters.userId },
      { isShared: true },
      { createdBy: null },
    ];
  }
  if (filters.subjectArea) query.subjectArea = filters.subjectArea;
  const list = await SimplifiedText.find(query)
    .select(
      "title subjectArea originalComplexity topicTags createdAt simplifiedVersions.targetLevel createdBy isShared comprehensionQuestions._id criticalThinkingQuestions._id"
    )
    .populate("createdBy", "firstName lastName")
    .sort({ createdAt: -1 })
    .lean();
  return list;
}

function buildReadingPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("Reading details must be an object."), { statusCode: 400 });
  }
  const title = String(payload?.title || "").trim();
  const providedOriginalText = String(payload?.originalText || "").replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, "");
  if (payload.sections !== undefined && !Array.isArray(payload.sections)) {
    throw Object.assign(new Error("sections must be a list."), { statusCode: 400 });
  }
  const sections = (payload.sections || []).map((section, index) => {
    const order = Number(section?.order);
    const sectionTitle = String(section?.title || "").trim();
    const text = String(section?.text || "").replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, "");
    const audioUrl = String(section?.audioUrl || "").trim();
    if (!Number.isInteger(order) || order !== index + 1 || order > 100) {
      throw Object.assign(new Error("Section orders must start at 1 and have no gaps."), { statusCode: 400 });
    }
    if (!text.trim() || text.length > 50000 || sectionTitle.length > 200) {
      throw Object.assign(new Error(`Section ${index + 1} needs text (up to 50,000 characters) and a title up to 200 characters.`), { statusCode: 400 });
    }
    if (audioUrl) {
      let parsedUrl;
      try {
        parsedUrl = new URL(audioUrl);
      } catch {
        throw Object.assign(new Error(`Section ${index + 1} audio URL must be a valid HTTPS URL.`), { statusCode: 400 });
      }
      if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password || audioUrl.length > 1000) {
        throw Object.assign(new Error(`Section ${index + 1} audio URL must be a valid HTTPS URL of 1,000 characters or fewer.`), { statusCode: 400 });
      }
    }
    return { order, title: sectionTitle, text, audioUrl };
  });
  if (sections.length > 100) {
    throw Object.assign(new Error("A reading can include no more than 100 sections."), { statusCode: 400 });
  }
  const originalText = sections.length
    ? sections.map((section) => section.text).join("\n\n")
    : providedOriginalText;
  if (!title || title.length > 200 || !originalText.trim() || originalText.length > 200000) {
    throw Object.assign(new Error("A title (up to 200 characters) and passage (up to 200,000 characters) are required."), { statusCode: 400 });
  }
  if (sections.length && providedOriginalText && providedOriginalText !== originalText) {
    throw Object.assign(new Error("originalText must match the ordered section text."), { statusCode: 400 });
  }
  if (payload.questions !== undefined && !Array.isArray(payload.questions)) {
    throw Object.assign(new Error("questions must be a list."), { statusCode: 400 });
  }
  if (payload.isShared !== undefined && typeof payload.isShared !== "boolean") {
    throw Object.assign(new Error("isShared must be true or false."), { statusCode: 400 });
  }
  if (payload.topicTags !== undefined && !Array.isArray(payload.topicTags)) {
    throw Object.assign(new Error("topicTags must be a list."), { statusCode: 400 });
  }
  if (payload.vocabularySubstitutions !== undefined && !Array.isArray(payload.vocabularySubstitutions)) {
    throw Object.assign(new Error("vocabularySubstitutions must be a list."), { statusCode: 400 });
  }
  if (Array.isArray(payload.vocabularySubstitutions) && payload.vocabularySubstitutions.length > 30) {
    throw Object.assign(new Error("A reading can include no more than 30 vocabulary words."), { statusCode: 400 });
  }
  if (Array.isArray(payload.topicTags) && payload.topicTags.length > 20) {
    throw Object.assign(new Error("A reading can include no more than 20 topic tags."), { statusCode: 400 });
  }
  const sourceDocument = String(payload.sourceDocument || "").trim();
  const subjectArea = String(payload.subjectArea || "").trim();
  const language = String(payload.language || "en").trim().toLowerCase();
  if (sourceDocument.length > 200 || subjectArea.length > 100 || language.length > 20) {
    throw Object.assign(new Error("Source document, subject, or language exceeds the allowed length."), { statusCode: 400 });
  }
  const vocabularySubstitutions = (payload.vocabularySubstitutions || []).map((item, index) => {
    const original = String(item?.original || "").trim();
    const simple = String(item?.simple || "").trim();
    const definition = String(item?.definition || "").trim();
    if (!original || original.length > 200 || !definition || definition.length > 1000 || simple.length > 200) {
      throw Object.assign(new Error(`Vocabulary item ${index + 1} must include a word or phrase (up to 200 characters) and a definition.`), { statusCode: 400 });
    }
    const normalizedTerm = original.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
    const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const termPattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapedTerm}(?=$|[^\\p{L}\\p{N}])`, "u");
    if (!termPattern.test(originalText.normalize("NFKC").toLocaleLowerCase())) {
      throw Object.assign(new Error(`Vocabulary word "${original}" was not found in the passage.`), { statusCode: 400 });
    }
    return { original, simple, definition };
  });

  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  if (questions.length > 30) {
    throw Object.assign(new Error("A reading can include no more than 30 questions."), { statusCode: 400 });
  }

  const comprehensionQuestions = [];
  const criticalThinkingQuestions = [];
  for (const [index, item] of questions.entries()) {
    const question = String(item?.question || "").trim();
    const type = String(item?.type || "").trim();
    if (!question || question.length > 2000) {
      throw Object.assign(new Error(`Question ${index + 1} must contain up to 2,000 characters.`), { statusCode: 400 });
    }
    const rawOrder = item.order == null ? "" : String(item.order).trim();
    const order = rawOrder ? Number(rawOrder) : index + 1;
    if (!Number.isInteger(order) || order < 1) {
      throw Object.assign(new Error(`Question ${index + 1} must have a positive whole-number order.`), { statusCode: 400 });
    }
    if (type === "short_answer") {
      const prompt = String(item.prompt || "").trim();
      if (prompt.length > 2000) {
        throw Object.assign(new Error(`Short-answer prompt ${index + 1} cannot exceed 2,000 characters.`), { statusCode: 400 });
      }
      criticalThinkingQuestions.push({
        question,
        prompt,
        type,
        order,
      });
      continue;
    }

    let options;
    let correctIndex = Number(item.correctIndex);
    if (type === "true_false") {
      if (![true, false, "true", "false"].includes(item.correctAnswer)) {
        throw Object.assign(new Error(`True/false question ${index + 1} must identify True or False as the correct answer.`), { statusCode: 400 });
      }
      options = ["True", "False"];
      correctIndex = item.correctAnswer === true || item.correctAnswer === "true" ? 0 : 1;
    } else if (type === "multiple_choice") {
      options = Array.isArray(item.options)
        ? item.options.map((option) => String(option || "").trim())
        : [];
      if (options.length < 2 || options.length > 6 || options.some((option) => !option || option.length > 500)) {
        throw Object.assign(new Error(`Multiple-choice question ${index + 1} must have 2 to 6 non-empty options (up to 500 characters each).`), { statusCode: 400 });
      }
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
        throw Object.assign(new Error(`Multiple-choice question ${index + 1} must identify a valid correct option.`), { statusCode: 400 });
      }
    } else {
      throw Object.assign(new Error(`Question ${index + 1} has an unsupported question type.`), { statusCode: 400 });
    }
    comprehensionQuestions.push({ question, type, options, correctIndex, order });
  }

  return {
    isShared: payload.isShared === true,
    title,
    originalText,
    sections,
    sourceDocument,
    subjectArea,
    topicTags: Array.isArray(payload.topicTags)
      ? [...new Set(payload.topicTags.map((tag) => String(tag || "").trim()).filter(Boolean))].slice(0, 20)
      : [],
    vocabularySubstitutions,
    language,
    requestedLanguages: [language],
    originalComplexity: computeReadability(originalText),
    simplifiedVersions: [],
    criticalThinkingQuestions,
    comprehensionQuestions,
  };
}

export async function createReadingFromCsv(schoolId, userId, payload) {
  const document = buildReadingPayload(payload);
  return SimplifiedText.create({
    ...document,
    school: schoolId,
    createdBy: userId,
  });
}

/**
 * Get single text by id (for teacher).
 */
export async function getTextById(textId, schoolId, userId, isAdmin = false) {
  const query = { _id: textId, school: schoolId, isArchived: { $ne: true } };
  if (userId && !isAdmin) {
    query.$or = [
      { createdBy: userId },
      { isShared: true },
      { createdBy: null },
    ];
  }
  const text = await SimplifiedText.findOne(query);
  if (!text) throw new Error("Text not found");
  return text;
}

export async function updateReading(textId, schoolId, userId, isAdmin, payload) {
  const reading = await SimplifiedText.findOne({
    _id: textId,
    school: schoolId,
    isArchived: { $ne: true },
  });
  if (!reading) throw Object.assign(new Error("Reading not found"), { statusCode: 404 });
  if (!isAdmin && String(reading.createdBy || "") !== String(userId)) {
    throw Object.assign(new Error("Only the reading owner or a school admin can edit this reading."), { statusCode: 403 });
  }
  const document = buildReadingPayload(payload);
  if (document.originalText === reading.originalText) {
    document.simplifiedVersions = reading.simplifiedVersions;
    if (document.language === reading.language) {
      document.requestedLanguages = reading.requestedLanguages;
    }
  }
  Object.assign(reading, document);
  await reading.save();
  return reading;
}

export async function archiveReading(textId, schoolId, userId, isAdmin) {
  const reading = await SimplifiedText.findOne({
    _id: textId,
    school: schoolId,
    isArchived: { $ne: true },
  });
  if (!reading) throw Object.assign(new Error("Reading not found"), { statusCode: 404 });
  if (!isAdmin && String(reading.createdBy || "") !== String(userId)) {
    throw Object.assign(new Error("Only the reading owner or a school admin can delete this reading."), { statusCode: 403 });
  }
  reading.isArchived = true;
  await reading.save();
  return { _id: reading._id, isArchived: true };
}

export async function updateTextSharing(textId, schoolId, userId, isAdmin, isShared) {
  if (typeof isShared !== "boolean") {
    throw Object.assign(new Error("isShared must be true or false."), { statusCode: 400 });
  }
  const text = await SimplifiedText.findOne({ _id: textId, school: schoolId, isArchived: { $ne: true } });
  if (!text) throw Object.assign(new Error("Text not found"), { statusCode: 404 });
  if (!isAdmin && String(text.createdBy || "") !== String(userId)) {
    throw Object.assign(new Error("Only the reading owner or a school admin can change sharing."), { statusCode: 403 });
  }
  text.isShared = isShared;
  await text.save();
  return text;
}

/**
 * List assignments created by teacher or for a class.
 */
export async function getAssignmentsForTeacher(schoolId, filters = {}, academicYear = null) {
  const query = { school: schoolId };
  if (academicYear) query.academicYear = academicYear;
  if (filters.classId) query.class = filters.classId;
  if (filters.textId) query.text = filters.textId;
  const assignments = await ReadingAssignment.find(query)
    .populate("text", "title subjectArea")
    .populate("assignedBy", "firstName lastName")
    .populate("class", "name")
    .sort({ createdAt: -1 })
    .lean();
  if (assignments.length === 0) return assignments;
  const completions = await ReadingCompletion.find({
    school: schoolId,
    assignment: { $in: assignments.map((assignment) => assignment._id) },
  })
    .select("assignment correctCount totalCount")
    .lean();
  const statsByAssignment = new Map();
  for (const completion of completions) {
    const key = String(completion.assignment);
    const stats = statsByAssignment.get(key) || { completed: 0, correct: 0, possible: 0 };
    stats.completed += 1;
    if (completion.totalCount > 0) {
      stats.correct += completion.correctCount || 0;
      stats.possible += completion.totalCount;
    }
    statsByAssignment.set(key, stats);
  }
  return assignments.map((assignment) => {
    const stats = statsByAssignment.get(String(assignment._id)) || { completed: 0, correct: 0, possible: 0 };
    return {
      ...assignment,
      studentCount: (assignment.students || []).length,
      completedCount: stats.completed,
      averagePercent: stats.possible > 0 ? Math.round((stats.correct / stats.possible) * 100) : null,
    };
  });
}

/**
 * Teacher-facing results for one assignment: the roster, each student's score, and
 * their saved answers next to the question text and answer key.
 */
export async function getAssignmentResults(schoolId, assignmentId) {
  const assignment = await ReadingAssignment.findOne({ school: schoolId, _id: assignmentId })
    .populate("text", "title subjectArea comprehensionQuestions criticalThinkingQuestions")
    .populate("class", "name")
    .populate("assignedBy", "firstName lastName")
    .lean();
  if (!assignment) {
    throw Object.assign(new Error("Reading assignment not found"), { statusCode: 404 });
  }

  const rosterIds = (assignment.students || []).map(String);
  const completions = await ReadingCompletion.find({ school: schoolId, assignment: assignment._id })
    .select("student correctCount totalCount responses completedAt")
    .lean();
  // A student can submit and then move class or year, so their result must still appear.
  const lookupIds = [...new Set([
    ...rosterIds,
    ...completions.map((completion) => String(completion.student)),
  ])];
  const roster = await Student.find({ school: schoolId, _id: { $in: lookupIds } })
    .select("_id firstName lastName")
    .lean();

  const completionByStudent = new Map(
    completions.map((completion) => [String(completion.student), completion]),
  );

  const students = roster
    .filter((student) => rosterIds.includes(String(student._id))
      || completionByStudent.has(String(student._id)))
    .map((student) => ({
      ...student,
      assigned: rosterIds.includes(String(student._id)),
      completed: completionByStudent.get(String(student._id)) || null,
    }))
    .sort((a, b) => {
      const nameA = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLocaleLowerCase();
      const nameB = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLocaleLowerCase();
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });

  const graded = students.filter((student) => student.completed?.totalCount > 0);
  const correctSum = graded.reduce((sum, student) => sum + student.completed.correctCount, 0);
  const possibleSum = graded.reduce((sum, student) => sum + student.completed.totalCount, 0);

  return {
    assignment: {
      _id: assignment._id,
      dueDate: assignment.dueDate || null,
      instructions: assignment.instructions || "",
      isActive: assignment.isActive !== false,
      createdAt: assignment.createdAt,
      className: assignment.class?.name || "",
      assignedBy: [assignment.assignedBy?.firstName, assignment.assignedBy?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
      text: {
        _id: assignment.text?._id || null,
        title: assignment.text?.title || "",
        subjectArea: assignment.text?.subjectArea || "",
        comprehensionQuestions: (assignment.text?.comprehensionQuestions || [])
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0)),
        criticalThinkingQuestions: (assignment.text?.criticalThinkingQuestions || [])
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0)),
      },
    },
    students,
    totals: {
      assigned: students.filter((student) => student.assigned).length,
      completed: students.filter((student) => student.completed).length,
      averagePercent: possibleSum > 0
        ? Math.round((correctSum / possibleSum) * 100)
        : null,
    },
  };
}
