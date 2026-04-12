import AssessmentNarrative from '../models/AssessmentNarrative.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import Standard from '../models/Standard.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import AssessmentAuditLog from '../models/AssessmentAuditLog.js';
import { writeAuditLog } from './assessmentAuditService.js';
import { getSettings } from './assessmentSettingsService.js';
import { connectAi } from '../utils/connectAi.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Build the evidence bundle for narrative generation.
 */
async function buildEvidenceBundle(schoolId, studentId, selectedStandardIds) {
  const standards = await Standard.find({
    _id: { $in: selectedStandardIds },
    school: schoolId,
  }).lean();

  const attempts = await PracticeAttempt.find({
    school: schoolId,
    student: studentId,
    standard: { $in: selectedStandardIds },
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const evidence = {};
  for (const std of standards) {
    const stdAttempts = attempts.filter(
      (a) => String(a.standard) === String(std._id)
    );
    const answered = stdAttempts.filter((a) => a.status === 'answered');
    const correct = answered.filter((a) => a.isCorrect);
    const incorrect = answered.filter((a) => !a.isCorrect);

    const scores = answered.map((a) => (a.isCorrect ? 100 : 0));
    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
        : 0;

    // Detect trend (last 5 attempts)
    const recent = answered.slice(0, 5).map((a) => (a.isCorrect ? 1 : 0));
    let trend = 'stable';
    if (recent.length >= 3) {
      const first = recent.slice(Math.floor(recent.length / 2)).reduce((s, v) => s + v, 0);
      const second = recent.slice(0, Math.floor(recent.length / 2)).reduce((s, v) => s + v, 0);
      if (second > first) trend = 'improving';
      else if (second < first) trend = 'declining';
    }

    // Common mistakes
    const mistakeTags = [];
    for (const a of incorrect.slice(0, 5)) {
      if (a.feedbackParts?.conceptChecks?.missing?.length > 0) {
        mistakeTags.push(...a.feedbackParts.conceptChecks.missing);
      }
    }

    // Mastery band
    let masteryBand = 'needs-support';
    if (avgScore >= 85) masteryBand = 'mastered';
    else if (avgScore >= 70) masteryBand = 'proficient';
    else if (avgScore >= 50) masteryBand = 'developing';

    evidence[String(std._id)] = {
      standard: { code: std.code, name: std.name, description: std.description },
      totalAttempts: answered.length,
      correctCount: correct.length,
      averageScore: avgScore,
      trend,
      masteryBand,
      commonMistakes: [...new Set(mistakeTags)].slice(0, 5),
      recentAnswers: answered.slice(0, 3).map((a) => ({
        questionText: a.questionText,
        studentAnswer: a.studentAnswer,
        correctAnswer: a.correctAnswer,
        isCorrect: a.isCorrect,
        feedback: a.feedback,
      })),
    };
  }

  return evidence;
}

/**
 * Build the AI prompt for narrative generation.
 */
function buildNarrativePrompt(studentName, evidence, language, toneProfile, includeEvidenceQuotes) {
  const standardsSummary = Object.values(evidence)
    .map((e) => {
      let section = `Standard: ${e.standard.code} – ${e.standard.name}\n`;
      section += `  Mastery: ${e.masteryBand} (${e.averageScore}% avg, ${e.totalAttempts} attempts, trend: ${e.trend})\n`;
      if (e.commonMistakes.length > 0) {
        section += `  Common gaps: ${e.commonMistakes.join(', ')}\n`;
      }
      if (includeEvidenceQuotes && e.recentAnswers.length > 0) {
        section += `  Recent answers:\n`;
        for (const a of e.recentAnswers) {
          section += `    Q: ${a.questionText}\n    Student: ${a.studentAnswer} | Correct: ${a.correctAnswer} | ${a.isCorrect ? 'Correct' : 'Incorrect'}\n`;
        }
      }
      return section;
    })
    .join('\n');

  const toneInstructions = {
    supportive: 'Use an encouraging, growth-oriented tone suitable for parents and students. Celebrate effort and progress.',
    neutral: 'Use a factual, balanced tone. Report findings objectively without emotional language.',
    formal: 'Use a formal report-card style tone. Professional and concise.',
  };

  return `You are a teacher's AI assistant generating a narrative progress report for a student.

STUDENT NAME: ${studentName}
LANGUAGE: ${language}
TONE: ${toneInstructions[toneProfile] || toneInstructions.supportive}

STANDARDS EVIDENCE:
${standardsSummary}

INSTRUCTIONS:
1. Write a structured narrative report with these sections:
   - **Strengths**: What the student does well based on evidence.
   - **Growth Areas**: Where the student needs improvement, citing specific standards.
   - **Evidence From Recent Answers**: Reference actual student answers (do NOT fabricate any).
   - **Recommended Next Steps**: Actionable, specific suggestions for improvement.
2. Only reference data provided above. Do NOT fabricate claims or invent evidence.
3. Do NOT use medical or diagnostic language.
4. Do NOT label the student negatively (e.g., "slow learner", "weak student").
5. Do NOT compare the student to other students.
6. Keep the report family-friendly and constructive.
7. Write in ${language === 'ar' ? 'Arabic' : language === 'fr' ? 'French' : 'English'}.
8. Output ONLY the narrative text (no JSON, no markdown code blocks).

Generate the narrative report now:`;
}

/**
 * Generate an AI narrative draft for selected standards.
 */
export async function generateNarrative({
  schoolId,
  userId,
  studentId,
  classId,
  subjectId,
  selectedStandardIds,
  language,
  toneProfile,
}) {
  const settings = await getSettings(schoolId);

  // Validate feature enabled
  if (!settings.enableNarrativeReports) {
    const err = new Error('AI narrative reports are currently disabled.');
    err.statusCode = 403;
    throw err;
  }

  // Validate standard count
  const maxStandards = settings.narrative?.maxStandardsPerNarrative || 10;
  if (selectedStandardIds.length > maxStandards) {
    const err = new Error(`Maximum ${maxStandards} standards per narrative.`);
    err.statusCode = 400;
    throw err;
  }

  // Rate limit
  const maxPerDay = settings.narrative?.maxNarrativeGenerationsPerDay || 50;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = await AssessmentNarrative.countDocuments({
    school: schoolId,
    createdByTeacherId: userId,
    createdAt: { $gte: todayStart },
  });
  if (todayCount >= maxPerDay) {
    const err = new Error(`Daily narrative generation limit reached (${maxPerDay}).`);
    err.statusCode = 429;
    throw err;
  }

  // Build evidence
  const evidence = await buildEvidenceBundle(schoolId, studentId, selectedStandardIds);

  // Minimum evidence threshold
  const minEvidence = settings.narrative?.minEvidenceThreshold || 1;
  for (const [stdId, data] of Object.entries(evidence)) {
    if (data.totalAttempts < minEvidence) {
      const err = new Error(
        `Standard ${data.standard.code} has only ${data.totalAttempts} attempt(s). Minimum ${minEvidence} required.`
      );
      err.statusCode = 400;
      throw err;
    }
  }

  // Get student name
  const student = await Student.findById(studentId)
    .populate('user', 'firstName lastName')
    .lean();
  const studentName = student?.user
    ? `${student.user.firstName || ''} ${student.user.lastName || ''}`.trim()
    : 'Student';

  // Resolve settings
  const resolvedLanguage = language || settings.narrative?.defaultLanguage || 'en';
  const resolvedTone = toneProfile || settings.narrative?.toneProfile || 'supportive';
  const includeQuotes = settings.narrative?.includeEvidenceQuotes !== false;

  // Build prompt and call AI
  const prompt = buildNarrativePrompt(studentName, evidence, resolvedLanguage, resolvedTone, includeQuotes);

  const aiResponse = await connectAi(prompt);
  let narrativeText = aiResponse.text || '';

  // Enforce length limits
  const maxLen = settings.narrative?.maxNarrativeLength || 2000;
  const minLen = settings.narrative?.minNarrativeLength || 150;
  if (narrativeText.length > maxLen) {
    narrativeText = narrativeText.substring(0, maxLen);
  }
  if (narrativeText.length < minLen) {
    logger.warn('AI narrative too short, may need regeneration', {
      length: narrativeText.length,
      min: minLen,
    });
  }

  // Profanity check
  if (settings.narrative?.enableProfanityFilter) {
    // Basic profanity filter – in production, integrate a proper library
    const bannedPhrases = settings.narrative?.bannedPhrases || [];
    for (const phrase of bannedPhrases) {
      if (narrativeText.toLowerCase().includes(phrase.toLowerCase())) {
        const err = new Error(`Generated narrative contains a banned phrase: "${phrase}". Please regenerate.`);
        err.statusCode = 422;
        throw err;
      }
    }
  }

  // Compute evidence hash for staleness detection
  const evidenceHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(evidence))
    .digest('hex');

  // Compute expiry
  const expiryHours = settings.narrative?.draftExpiryHours || 72;
  const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000);

  // Create narrative document
  const narrative = await AssessmentNarrative.create({
    school: schoolId,
    student: studentId,
    class: classId,
    subject: subjectId,
    gradeLevel: Object.values(evidence)[0]?.standard?.gradeLevel || 1,
    selectedStandardIds,
    evidenceHash,
    evidenceSummary: evidence,
    aiDraftText: narrativeText,
    language: resolvedLanguage,
    toneProfile: resolvedTone,
    status: 'draft',
    createdByTeacherId: userId,
    expiresAt,
    tokenUsage: {
      inputTokenCount: aiResponse.inputtokenCount || 0,
      outputTokenCount: aiResponse.outputtokenCount || 0,
      totalTokenCount: aiResponse.totalTokenCount || 0,
    },
  });

  await writeAuditLog({
    school: schoolId,
    action: 'narrative_generated',
    messageType: 'narrative',
    performedBy: userId,
    student: studentId,
    class: classId,
    subject: subjectId,
    narrativeReport: narrative._id,
    payload: { standardCount: selectedStandardIds.length, language: resolvedLanguage },
  });

  return {
    narrativeDraftId: narrative._id,
    aiDraftText: narrativeText,
    evidenceSummary: evidence,
    expiresAt,
  };
}

/**
 * Update a narrative draft with teacher edits and optional approval.
 */
export async function updateNarrative({
  schoolId,
  userId,
  narrativeId,
  teacherEditedText,
  approvalConfirmed,
}) {
  const settings = await getSettings(schoolId);

  const narrative = await AssessmentNarrative.findOne({
    _id: narrativeId,
    school: schoolId,
    isActive: true,
  });

  if (!narrative) {
    const err = new Error('Narrative draft not found.');
    err.statusCode = 404;
    throw err;
  }

  if (narrative.status === 'sent') {
    const err = new Error('Cannot edit a narrative that has already been sent.');
    err.statusCode = 400;
    throw err;
  }

  // Check expiry
  if (narrative.expiresAt && new Date() > narrative.expiresAt) {
    narrative.status = 'expired';
    await narrative.save();
    const err = new Error('Narrative draft has expired. Please regenerate.');
    err.statusCode = 410;
    throw err;
  }

  // Authorization: either the creator or someone with OVERRIDE permission
  const isOwner = String(narrative.createdByTeacherId) === String(userId);
  if (!isOwner) {
    // Override permission is checked at the controller/middleware level
    // Just allow it here and log
    logger.info('Narrative edited by non-creator (HOD override)', {
      narrativeId,
      originalCreator: narrative.createdByTeacherId,
      editor: userId,
    });
  }

  if (teacherEditedText !== undefined) {
    narrative.teacherEditedText = teacherEditedText;

    // Compute edit drift
    const original = narrative.aiDraftText || '';
    const edited = teacherEditedText || '';
    if (original.length > 0) {
      const commonLen = longestCommonSubsequenceLength(original, edited);
      const drift = Math.round((1 - commonLen / Math.max(original.length, 1)) * 100);
      narrative.editDriftPercent = Math.min(drift, 100);
    }
  }

  if (approvalConfirmed) {
    if (settings.narrative?.requireTeacherApproval && !approvalConfirmed) {
      const err = new Error('Teacher approval is required before sending.');
      err.statusCode = 400;
      throw err;
    }
    narrative.finalApprovedText = teacherEditedText || narrative.aiDraftText;
    narrative.status = 'approved';
    narrative.approvedAt = new Date();
    narrative.approvedByTeacherId = userId;

    await writeAuditLog({
      school: schoolId,
      action: 'narrative_approved',
      messageType: 'narrative',
      performedBy: userId,
      student: narrative.student,
      narrativeReport: narrative._id,
    });
  }

  await narrative.save();
  return narrative.toObject();
}

/**
 * Send an approved narrative to recipients.
 */
export async function sendNarrative({
  schoolId,
  userId,
  narrativeId,
  sendToStudent,
  sendToParent,
  attachProgressTable,
  selectedRows,
  ipAddress,
}) {
  const narrative = await AssessmentNarrative.findOne({
    _id: narrativeId,
    school: schoolId,
    isActive: true,
  });

  if (!narrative) {
    const err = new Error('Narrative not found.');
    err.statusCode = 404;
    throw err;
  }

  if (narrative.status !== 'approved') {
    const err = new Error('Narrative must be approved before sending.');
    err.statusCode = 400;
    throw err;
  }

  if (!sendToStudent && !sendToParent) {
    const err = new Error('Select at least one recipient.');
    err.statusCode = 400;
    throw err;
  }

  // Idempotency key
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`narrative:${narrativeId}:${userId}:${Date.now()}`)
    .digest('hex');

  // Resolve recipients
  const recipientTypes = [];
  const recipientIds = [];
  const channelStatus = { email: null, inApp: null };

  const student = await Student.findById(narrative.student)
    .populate('user', '_id email firstName lastName')
    .lean();

  if (sendToStudent && student?.user) {
    recipientTypes.push('student');
    recipientIds.push(student.user._id);
    channelStatus.inApp = 'pending';
    if (student.user.email) channelStatus.email = 'pending';
  }

  if (sendToParent) {
    recipientTypes.push('parent');
    const parentUsers = await User.find({
      school: schoolId,
      role: 'parent',
      children: narrative.student,
      isActive: true,
    }).select('_id email').lean();
    for (const p of parentUsers) {
      recipientIds.push(p._id);
    }
  }

  // Create in-app notifications
  const notifications = recipientIds.map((rid) => ({
    school: schoolId,
    user: rid,
    type: 'assessment_narrative_report',
    title: 'Standards Narrative Report',
    message: 'Your teacher has shared a narrative progress report.',
    data: {
      narrativeId: narrative._id,
      studentId: narrative.student,
      finalText: narrative.finalApprovedText,
      attachedTable: attachProgressTable ? selectedRows : undefined,
    },
  }));

  if (notifications.length > 0) {
    await Notification.insertMany(notifications).catch((err) => {
      logger.error('Failed to create narrative notifications', { error: err.message });
    });
  }

  // Mark as sent
  narrative.status = 'sent';
  narrative.sentAt = new Date();
  narrative.sentToStudent = !!sendToStudent;
  narrative.sentToParent = !!sendToParent;
  narrative.attachedProgressTable = !!attachProgressTable;
  await narrative.save();

  // Determine message type
  const messageType = attachProgressTable ? 'table+narrative' : 'narrative';

  await writeAuditLog({
    school: schoolId,
    action: 'narrative_sent',
    messageType,
    performedBy: userId,
    student: narrative.student,
    class: narrative.class,
    subject: narrative.subject,
    narrativeReport: narrative._id,
    recipientTypes,
    recipientIds,
    payload: {
      finalText: narrative.finalApprovedText,
      attachedTable: !!attachProgressTable,
    },
    channelStatus,
    idempotencyKey,
    ipAddress,
  });

  return {
    sent: true,
    narrativeId: narrative._id,
    recipientCount: recipientIds.length,
    messageType,
  };
}

/**
 * Simplified LCS length for edit drift calculation.
 */
function longestCommonSubsequenceLength(a, b) {
  const m = Math.min(a.length, 500);
  const n = Math.min(b.length, 500);
  const sa = a.slice(0, m);
  const sb = b.slice(0, n);
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        sa[i - 1] === sb[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export default { generateNarrative, updateNarrative, sendNarrative };
