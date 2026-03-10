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
    title: title.trim(),
    originalText: originalText.trim(),
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
  const { requireAssignment = false } = options;

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
    const hasAssignment = await ReadingAssignment.exists(assignmentQuery);
    if (!hasAssignment) {
      const error = new Error("No active assignment found for this reading");
      error.statusCode = 403;
      throw error;
    }
  }

  let targetLevel = 8;
  const profile = await StudentReadingProfile.findOne({
    school: schoolId,
    student: studentId,
  });
  if (profile?.currentReadingLevel != null) {
    targetLevel = profile.currentReadingLevel;
  }

  const versions = text.simplifiedVersions || [];
  if (versions.length === 0) {
    return {
      text: text.toObject(),
      simplifiedContent: text.originalText,
      vocabularySubstitutions: [],
      targetLevel: text.originalComplexity || targetLevel,
      criticalThinkingQuestions: text.criticalThinkingQuestions || [],
      comprehensionQuestions: text.comprehensionQuestions || [],
    };
  }

  const sorted = [...versions].sort(
    (a, b) =>
      Math.abs(a.targetLevel - targetLevel) -
      Math.abs(b.targetLevel - targetLevel)
  );
  const best = sorted[0];

  return {
    text: text.toObject(),
    simplifiedContent: best.simplifiedText,
    vocabularySubstitutions: best.vocabularySubstitutions || [],
    targetLevel: best.targetLevel,
    availableLevels: versions.map((v) => v.targetLevel),
    criticalThinkingQuestions: text.criticalThinkingQuestions || [],
    comprehensionQuestions: text.comprehensionQuestions || [],
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
  academicYear = null
) {
  const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

  const profile = await StudentReadingProfile.findOneAndUpdate(
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
    const assignment = await ReadingAssignment.findOne(assignmentQuery).select("_id text");
    if (!assignment) {
      const error = new Error("Assignment not found for current academic year");
      error.statusCode = 404;
      throw error;
    }

    await ReadingCompletion.findOneAndUpdate(
      { school: schoolId, student: studentId, assignment: assignmentId },
      {
        school: schoolId,
        student: studentId,
        assignment: assignmentId,
        text: textId,
        correctCount,
        totalCount,
        completedAt: new Date(),
      },
      { upsert: true }
    );
  }

  return profile;
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
  schoolStartMonth = null
) {
  const { textId, classId, studentIds, dueDate, instructions } = payload;

  if (!textId) throw new Error("textId is required");
  const text = await SimplifiedText.findById(textId);
  if (!text) throw new Error("Text not found");

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

  const completedIds = await ReadingCompletion.find({
    school: schoolId,
    student: studentId,
    assignment: { $in: assignments.map((a) => a._id) },
  })
    .select("assignment")
    .lean();

  const completedSet = new Set(
    completedIds.map((c) => c.assignment.toString())
  );
  return assignments.map((a) => ({
    ...a,
    completed: completedSet.has(a._id.toString()),
  }));
}

/**
 * List all texts (for teacher admin).
 */
export async function getTexts(schoolId, filters = {}) {
  const query = { school: schoolId };
  if (filters.subjectArea) query.subjectArea = filters.subjectArea;
  const list = await SimplifiedText.find(query)
    .select(
      "title subjectArea originalComplexity topicTags createdAt simplifiedVersions.targetLevel"
    )
    .sort({ createdAt: -1 })
    .lean();
  return list;
}

/**
 * Get single text by id (for teacher).
 */
export async function getTextById(textId, schoolId) {
  const text = await SimplifiedText.findOne({ _id: textId, school: schoolId });
  if (!text) throw new Error("Text not found");
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
  return assignments;
}
