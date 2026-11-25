import Student from "../models/Student.js";
import Class from "../models/Class.js";
import Grade from "../models/Grade.js";
import SpellingWord from "../models/SpellingWord.js";
import SpellingRetestItem from "../models/SpellingRetestItem.js";
import SpellingSession from "../models/SpellingSession.js";
import SpellingEmailDelivery from "../models/SpellingEmailDelivery.js";
import { withTransaction } from "../utils/withTransaction.js";
import {
  evaluateSpellingAnswer,
  normalizeForGrading,
} from "../utils/spellingGrading.js";
import {
  buildFormalTestWordList,
  processSpellingEmailDelivery,
  queueFormalSpellingTestCancelledEmail,
  queueFormalSpellingTestWordListEmail,
  queueSpellingCompletionEmail,
} from "./spellingEmailService.js";
import gmailOAuthService from "./gmailOAuthService.js";
import {
  DEFAULT_SPELLING_EMAIL_AUDIENCE,
  isSpellingEmailAudience,
} from "../utils/spellingEmailSettings.js";
import SpellingClassSettings from "../models/SpellingClassSettings.js";
import {
  getNextSpellingGrade,
  SPELLING_CURRICULUM_GRADES,
} from "../utils/spellingProgress.js";
import {
  assertStudentProgressReady,
  getOrCreateLibraryState,
  getPlacementFloor,
  loadConsumedWordIds,
  recalculateStudentProjection,
  recordConsumedWord,
  sortedGrades,
} from "./spellingProgressService.js";
import { eligibleWords, isGradeTraversalComplete, nextEligibleWord } from "./spellingTraversal.js";
import { domainError } from "../utils/spellingLibraryErrors.js";
import { resolveSemesterForDate } from "./gradebookConfigService.js";
import {
  createRetestObligation,
  recordRetestAnswer,
  recordRetestEvent,
  snapshotRetestState,
} from "./spellingRetestStateService.js";
import logger from "../utils/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SPELLING_GRADE_MAX_WEEK = {
  KG: 40,
  G1: 36,
  G2: 36,
  G3: 36,
  G4: 36,
  G5: 36,
};

const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const conflict = (message) =>
  Object.assign(new Error(message), { statusCode: 409 });

export const migratePracticeResolvedRetests = async ({
  schoolId,
  studentId,
}) => {
  const resolvedItems = await SpellingRetestItem.find({
    school: schoolId,
    student: studentId,
    status: "resolved",
  })
    .select("_id resolvedAt resolvedBySession")
    .lean();
  if (!resolvedItems.length) return 0;

  const resolvedSessionIds = [
    ...new Set(
      resolvedItems
        .map((item) => item.resolvedBySession && String(item.resolvedBySession))
        .filter(Boolean),
    ),
  ];
  const resolvingSessions = resolvedSessionIds.length
    ? await SpellingSession.find({
        _id: { $in: resolvedSessionIds },
        school: schoolId,
      })
        .select("_id assessmentType")
        .lean()
    : [];
  const formalSessionIds = new Set(
    resolvingSessions
      .filter((session) => session.assessmentType === "formal-spelling-test")
      .map((session) => String(session._id)),
  );
  const itemsToRestore = resolvedItems.filter(
    (item) =>
      !item.resolvedBySession ||
      !formalSessionIds.has(String(item.resolvedBySession)),
  );
  if (!itemsToRestore.length) return 0;

  let migratedCount = 0;
  for (const item of itemsToRestore) {
    const row = await SpellingRetestItem.findOne({
      _id: item._id,
      school: schoolId,
      student: studentId,
      status: "resolved",
    });
    if (!row) continue;
    const before = snapshotRetestState(row);
    row.status = "practice-mastered";
    row.practiceMasteredAt = item.resolvedAt || new Date();
    row.practiceMasteredBySession = item.resolvedBySession || null;
    row.resolvedAt = null;
    row.resolvedBySession = null;
    row.revision = (Number(row.revision) || 1) + 1;
    const event = await recordRetestEvent({
      schoolId,
      studentId,
      sourceWord: row.sourceWord,
      kind: "legacy-practice-migration",
      before,
      after: snapshotRetestState(row),
      retestItemIds: [row._id],
      operationId: "legacy-practice-migration",
    });
    if (Number.isInteger(event?.sequence)) row.lastEventSequence = event.sequence;
    await row.save();
    migratedCount += 1;
  }
  return migratedCount;
};

const resolveFormalTestWordList = async ({ schoolId, studentId }) => {
  // Misses that were only cleared by practice rejoin the pool, so any count of
  // this word list must run the same normalization the scheduling guard runs.
  await migratePracticeResolvedRetests({ schoolId, studentId });
  const unresolvedRetests = await SpellingRetestItem.find({
    school: schoolId,
    student: studentId,
    status: { $in: ["pending", "practice-mastered"] },
  })
    .sort({ flaggedAt: 1, _id: 1 })
    .lean();
  return buildFormalTestWordList({ retestItems: unresolvedRetests });
};

export const getFormalTestPrepReadiness = async ({ schoolId, studentId }) => {
  const wordList = await resolveFormalTestWordList({ schoolId, studentId });
  return { wordCount: wordList.plannedWords.length };
};

export const saveFormalSpellingGradebookEntry = async ({
  schoolId,
  session,
  dbSession,
}) => {
  if (
    session.assessmentType !== "formal-spelling-test" ||
    !session.attempts.length
  )
    return;
  if (
    !session.gradebookSubject ||
    !session.gradebookClass ||
    !session.gradebookAcademicYear ||
    !(session.createdBy || session.administeredBy)
  ) {
    throw conflict(
      "The formal spelling test is missing its Gradebook subject or class details",
    );
  }

  const date = session.completedAt || new Date();
  const month = date.getMonth() + 1;
  const semester = await resolveSemesterForDate(schoolId, date);
  await Grade.findOneAndUpdate(
    { school: schoolId, spellingSession: session._id },
    {
      $set: {
        subject: session.gradebookSubject,
        class: session.gradebookClass,
        teacher: session.createdBy || session.administeredBy,
        academicYear: session.gradebookAcademicYear,
        gradeType: "quiz",
        category: "quiz",
        date,
        marks: Math.min(session.correctCount, session.attempts.length),
        maxMarks: session.attempts.length,
        month,
        semester: semester || (month >= 8 && month <= 12 ? 1 : 2),
        title: `Formal spelling assessment - ${session.curriculumGrade} - Week ${session.curriculumWeek}`,
        description: `Spelling assessment score: ${Math.min(session.correctCount, session.attempts.length)} of ${session.attempts.length} words.`,
        notes: "",
        remarks: "",
        assessmentGroupId: `spelling-${session._id}`,
        gradingSource: "spelling_assessment",
      },
      $setOnInsert: {
        school: schoolId,
        student: session.student,
        spellingSession: session._id,
      },
    },
    { upsert: true, new: true, runValidators: true, session: dbSession },
  );
};

/**
 * Active word identities for one grade, in traversal order. Archived words are
 * returned with their tombstone so the shared traversal rule can exclude them.
 */
const loadGradeWords = async ({ schoolId, grade, dbSession }) => {
  let query = SpellingWord.find({ school: schoolId, grade })
    .select("grade week order word normalizedWord definition category revision deletedAt")
    .sort({ week: 1, order: 1 });
  if (dbSession) query = query.session(dbSession);
  return query.lean();
};

const getCurrentItemData = async (session, dbSession) => {
  const attemptedSequences = new Set(
    session.attempts.map((attempt) => attempt.sequence),
  );
  const attemptedWordIds = new Set(
    session.attempts.map((attempt) => String(attempt.wordId)).filter(Boolean),
  );
  const attemptedRetestIds = new Set(
    session.attempts
      .map((attempt) => String(attempt.retestItemId))
      .filter(Boolean),
  );
  const currentSequence = session.currentItem?.sequence;
  const currentWordId = session.currentItem?.wordId
    ? String(session.currentItem.wordId)
    : null;
  const currentRetestId = session.currentItem?.retestItemId
    ? String(session.currentItem.retestItemId)
    : null;
  const plannedWordIndex = session.currentItem?.plannedWordIndex;

  if (
    !currentSequence ||
    attemptedSequences.has(currentSequence) ||
    (Number.isInteger(plannedWordIndex) &&
      session.attempts.some(
        (attempt) => attempt.plannedWordIndex === plannedWordIndex,
      )) ||
    (currentWordId && attemptedWordIds.has(currentWordId)) ||
    (currentRetestId && attemptedRetestIds.has(currentRetestId))
  ) {
    return null;
  }

  if (
    Number.isInteger(plannedWordIndex) &&
    session.formalTestWordList?.[plannedWordIndex]
  ) {
    const plannedWord = session.formalTestWordList[plannedWordIndex];
    const sourceWord = await SpellingWord.findOne({
      _id: plannedWord.wordId,
      school: session.school,
    })
      .session(dbSession)
      .select("definition revision")
      .lean();
    return {
      wordId: plannedWord.wordId,
      retestItemId: plannedWord.retestItemId,
      plannedWordIndex,
      sequence: currentSequence,
      word: plannedWord.wordSnapshot,
      definition: sourceWord?.definition || "",
      grade: plannedWord.grade,
      week: plannedWord.week,
      category: plannedWord.category,
      order: plannedWord.order,
      wordRevision: sourceWord?.revision ?? null,
      isRetest: plannedWord.isRetest,
    };
  }

  if (session.currentItem?.retestItemId) {
    const retestItem = await SpellingRetestItem.findOne({
      _id: session.currentItem.retestItemId,
      school: session.school,
      status: "pending",
    })
      .session(dbSession)
      .lean();
    if (retestItem) {
      const sourceWord = retestItem.sourceWord
        ? await SpellingWord.findOne({
            _id: retestItem.sourceWord,
            school: session.school,
          })
            .session(dbSession)
            .lean()
        : null;
      return {
        wordId: retestItem.sourceWord,
        retestItemId: retestItem._id,
        sequence: session.currentItem.sequence,
        word: retestItem.wordSnapshot,
        definition: sourceWord?.definition || "",
        grade: retestItem.grade,
        week: retestItem.week,
        category: retestItem.category,
        wordRevision: retestItem.wordRevision ?? null,
        isRetest: true,
      };
    }
  }

  if (session.currentItem?.wordId) {
    const word = await SpellingWord.findOne({
      _id: session.currentItem.wordId,
      school: session.school,
    })
      .session(dbSession)
      .lean();
    if (word) {
      return {
        wordId: word._id,
        retestItemId: null,
        sequence: session.currentItem.sequence,
        word: word.word,
        definition: word.definition || "",
        grade: word.grade,
        week: word.week,
        category: word.category,
        order: word.order,
        wordRevision: word.revision ?? null,
        isRetest: false,
      };
    }
  }

  return null;
};

export async function startSpellingSession({
  schoolId,
  studentId,
  userId,
  mode,
  maxMistakesAllowed,
  retestDeadline,
  scheduledAt,
  formalAssessment = false,
  formalTestWordListEmail = false,
  formalTestWordListEmailAudience = null,
  formalTestWordListEmailTimezone = "UTC",
  curriculumGrade,
  curriculumWeek,
  emailNotification = null,
  passageEmailAudience = null,
  passageGeneration = {},
}) {
  const requestedMode = mode ?? "self-serve";
  if (formalAssessment && requestedMode !== "self-serve") {
    throw badRequest("Formal spelling assessments must be self-serve");
  }
  if (requestedMode === "teacher-led") {
    throw badRequest(
      "Teacher-led spelling sessions are no longer available. Use a self-serve assessment instead.",
    );
  }
  if (requestedMode !== "self-serve")
    throw badRequest("Invalid spelling session mode");
  if (typeof formalTestWordListEmail !== "boolean")
    throw badRequest("formalTestWordListEmail must be a boolean");
  if (
    formalTestWordListEmail &&
    (!formalAssessment || scheduledAt === undefined || scheduledAt === null)
  ) {
    throw badRequest(
      "Formal test word-list emails are only available for scheduled formal assessments",
    );
  }
  if (
    formalTestWordListEmailAudience !== null &&
    formalTestWordListEmailAudience !== undefined &&
    !isSpellingEmailAudience(formalTestWordListEmailAudience)
  ) {
    throw badRequest("Invalid formal test email audience");
  }
  if (
    typeof formalTestWordListEmailTimezone !== "string" ||
    !formalTestWordListEmailTimezone.trim()
  ) {
    throw badRequest(
      "formalTestWordListEmailTimezone must be a valid time zone",
    );
  }
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: formalTestWordListEmailTimezone,
    });
  } catch (error) {
    if (error instanceof RangeError)
      throw badRequest(
        "formalTestWordListEmailTimezone must be a valid time zone",
      );
    throw error;
  }
  if (
    maxMistakesAllowed !== undefined &&
    maxMistakesAllowed !== null &&
    (!Number.isInteger(maxMistakesAllowed) ||
      maxMistakesAllowed < 1 ||
      maxMistakesAllowed > 50)
  ) {
    throw badRequest(
      "maxMistakesAllowed must be a positive integer between 1 and 50",
    );
  }
  if (
    emailNotification !== null &&
    emailNotification !== undefined &&
    !isSpellingEmailAudience(emailNotification)
  ) {
    throw badRequest("Invalid spelling email audience");
  }
  if (
    passageEmailAudience !== null &&
    passageEmailAudience !== undefined &&
    !isSpellingEmailAudience(passageEmailAudience)
  ) {
    throw badRequest("Invalid passage email audience");
  }

  const now = new Date();
  const scheduledStartAt =
    scheduledAt === undefined || scheduledAt === null
      ? null
      : new Date(scheduledAt);
  if (
    scheduledAt !== undefined &&
    scheduledAt !== null &&
    (Number.isNaN(scheduledStartAt.getTime()) || scheduledStartAt <= now)
  ) {
    throw badRequest("scheduledAt must be a valid future date");
  }
  const startedAt = scheduledStartAt || now;
  const deadline = retestDeadline
    ? new Date(retestDeadline)
    : new Date(startedAt.getTime() + 7 * DAY_MS);
  if (Number.isNaN(deadline.getTime()) || deadline < startedAt)
    throw badRequest("retestDeadline must be a valid future date");

  const student = await Student.findOne({
    _id: studentId,
    school: schoolId,
  }).lean();
  if (!student) throw notFound("Student not found");

  let selectedGrade = curriculumGrade || student.spelling?.currentGrade;
  if (!selectedGrade || !SPELLING_CURRICULUM_GRADES.includes(selectedGrade)) {
    throw badRequest(
      "Select a valid spelling grade before starting an assessment",
    );
  }

  const activeSession = await SpellingSession.findOne({
    school: schoolId,
    student: studentId,
    status: "in-progress",
  }).sort({ startedAt: -1 });
  const assessmentType = formalAssessment
    ? "formal-spelling-test"
    : "spelling-assessment";
  if (activeSession) {
    if (
      activeSession.status === "in-progress" &&
      activeSession.mode === mode &&
      activeSession.assessmentType === assessmentType &&
      activeSession.curriculumGrade === selectedGrade
    ) {
      const current = await getCurrentSpellingItem({
        schoolId,
        sessionId: activeSession._id,
      });
      return current.session;
    }
    throw conflict(
      "This student already has an active spelling session. End it or wait for it to finish before starting another.",
    );
  }

  let gradeWords = [];
  let floorWeek = 1;
  await assertStudentProgressReady({ schoolId, grade: selectedGrade, student });
  gradeWords = await loadGradeWords({ schoolId, grade: selectedGrade });
  floorWeek = getPlacementFloor({ student, grade: selectedGrade });
  let consumedIds = await loadConsumedWordIds({
    schoolId,
    studentId,
    grade: selectedGrade,
  });

  if (student.spelling?.currentGrade === selectedGrade) {
    const completion = isGradeTraversalComplete({
      words: gradeWords,
      consumedIds,
      floorWeek,
    });
    if (completion.complete) {
      const nextGrade = getNextSpellingGrade(selectedGrade);
      if (!nextGrade) {
        throw badRequest(
          `The student has completed all available spelling grades (${selectedGrade})`,
        );
      }

      await assertStudentProgressReady({ schoolId, grade: nextGrade, student });
      const nextWords = await loadGradeWords({ schoolId, grade: nextGrade });
      const nextEligible = nextEligibleWord({
        words: nextWords,
        consumedIds: await loadConsumedWordIds({
          schoolId,
          studentId,
          grade: nextGrade,
        }),
        floorWeek: getPlacementFloor({ student, grade: nextGrade }),
      });
      if (!nextEligible) {
        throw badRequest(`No spelling words are available for ${nextGrade}`);
      }

      const promotedStudent = await Student.findOneAndUpdate(
        {
          _id: studentId,
          school: schoolId,
          "spelling.currentGrade": selectedGrade,
        },
        { $set: { "spelling.currentGrade": nextGrade } },
        { new: true },
      ).lean();

      if (promotedStudent) {
        student.spelling = promotedStudent.spelling;
      } else {
        const latestStudent = await Student.findOne({
          _id: studentId,
          school: schoolId,
        }).lean();
        if (!latestStudent) throw notFound("Student not found");
        if (latestStudent.spelling?.currentGrade !== nextGrade) {
          throw conflict(
            "The student grade changed while starting the spelling session. Refresh and try again.",
          );
        }
        student.spelling = latestStudent.spelling;
      }
      selectedGrade = nextGrade;
      gradeWords = nextWords;
      floorWeek = getPlacementFloor({ student, grade: nextGrade });
      await recalculateStudentProjection({
        schoolId,
        studentId,
        grade: nextGrade,
        words: nextWords,
      });
      consumedIds = await loadConsumedWordIds({
        schoolId,
        studentId,
        grade: nextGrade,
      });
    }
  }

  const firstEligible = nextEligibleWord({
    words: gradeWords,
    consumedIds,
    floorWeek,
  });
  const explicitWeek =
    curriculumWeek !== undefined &&
    curriculumWeek !== null &&
    curriculumWeek !== "";
  let selectedWeek = explicitWeek ? Number(curriculumWeek) : firstEligible?.week;
  if (!Number.isInteger(selectedWeek) || selectedWeek < 1) {
    throw badRequest(
      "Select a valid spelling week before starting an assessment",
    );
  }
  if (selectedWeek > SPELLING_GRADE_MAX_WEEK[selectedGrade]) {
    throw badRequest(
      `${selectedGrade} spelling weeks cannot exceed ${SPELLING_GRADE_MAX_WEEK[selectedGrade]}`,
    );
  }
  if (!firstEligible) {
    const hasRemaining = eligibleWords({ words: gradeWords, floorWeek }).some(
      (word) => word.week >= selectedWeek,
    );
    if (!hasRemaining) {
      throw badRequest(
        `No spelling words remain for ${selectedGrade} from week ${selectedWeek}`,
      );
    }
  }
  const targetClassId =
    student.currentClass ||
    (student.enrolledClasses && student.enrolledClasses[0]);
  const classSettings = targetClassId
    ? await SpellingClassSettings.findOne({
        school: schoolId,
        class: targetClassId,
      }).lean()
    : null;
  let gradebookDetails = {};
  if (formalAssessment) {
    const classDoc = targetClassId
      ? await Class.findOne({ _id: targetClassId, school: schoolId })
          .select("academicYear subjects.subject")
          .lean()
      : null;
    if (!classDoc || !classSettings?.gradebookSubject) {
      throw badRequest(
        "Link a Gradebook subject to this class in Spelling settings before starting a formal assessment",
      );
    }
    if (
      !classDoc.subjects.some(
        (entry) =>
          String(entry.subject) === String(classSettings.gradebookSubject),
      )
    ) {
      throw badRequest(
        "The linked Gradebook subject is no longer assigned to this class",
      );
    }
    gradebookDetails = {
      gradebookSubject: classSettings.gradebookSubject,
      gradebookClass: targetClassId,
      gradebookAcademicYear: classDoc.academicYear || student.academicYear,
    };
  }
  const retestIntervalDays = classSettings?.retestIntervalDays || 7;
  const effectiveRetestDeadline = retestDeadline
    ? deadline
    : new Date(startedAt.getTime() + retestIntervalDays * DAY_MS);

  // Resolve defaults from class settings if not explicitly specified by teacher
  const effectiveEmailNotification =
    emailNotification !== undefined && emailNotification !== null
      ? emailNotification
      : classSettings?.defaultEmailAudience || DEFAULT_SPELLING_EMAIL_AUDIENCE;
  const formalTestEmailAudience =
    formalTestWordListEmailAudience || effectiveEmailNotification;

  if (
    formalAssessment &&
    (effectiveEmailNotification !== "none" || formalTestWordListEmail)
  ) {
    const gmailStatus = await gmailOAuthService.getTokenStatus(userId);
    const hasSendScope = gmailStatus.grantedScopes?.includes(
      "https://www.googleapis.com/auth/gmail.send",
    );
    if (!gmailStatus.connected || !hasSendScope) {
      const error = new Error(
        "Connect or reconnect your Google account with Gmail sending access before starting a formal spelling quiz. No other sender will be used.",
      );
      error.statusCode = 401;
      error.code = "GMAIL_REAUTH_REQUIRED";
      throw error;
    }
  }

  const effectivePassageEmailAudience =
    passageEmailAudience !== undefined && passageEmailAudience !== null
      ? passageEmailAudience
      : classSettings?.passageGeneration?.passageEmailAudience || "none";

  const effectiveMaxMistakesAllowed =
    Number.isInteger(maxMistakesAllowed) && maxMistakesAllowed >= 1
      ? maxMistakesAllowed
      : classSettings?.defaultMaxMistakes || 3;

  const dictationMode = {
    enabled: classSettings?.dictationMode?.enabled === true,
    autoPlayOnShow: classSettings?.dictationMode?.autoPlayOnShow !== false,
  };

  const sessionData = {
    school: schoolId,
    student: studentId,
    mode,
    status: scheduledStartAt ? "scheduled" : "in-progress",
    scheduledAt: scheduledStartAt,
    assessmentType,
    ...gradebookDetails,
    maxMistakesAllowed: effectiveMaxMistakesAllowed,
    retestDeadline: effectiveRetestDeadline,
    retestIntervalDays,
    curriculumGrade: selectedGrade,
    curriculumWeek: selectedWeek,
    emailNotification: effectiveEmailNotification,
    passageEmailAudience: effectivePassageEmailAudience,
    passageGeneration: {
      enabled: passageGeneration.enabled === true,
      trigger: "manual",
      style:
        passageGeneration.style === "passage" ? "passage" : "sentence-list",
      requireTeacherApproval: true,
    },
    dictationMode,
    startedAt: now,
    createdBy: userId,
    administeredBy: mode === "teacher-led" ? userId : null,
  };

  // Formal tests only cover unresolved words, never curriculum words.
  let formalWordList = null;
  if (formalAssessment) {
    formalWordList = await resolveFormalTestWordList({ schoolId, studentId });
    if (formalWordList.plannedWords.length === 0) {
      throw badRequest(
        "No unresolved missed words are available for this preparation test",
      );
    }
    sessionData.formalTestWordList = formalWordList.plannedWords;
  }

  // Session creation and a library edit must contend on the same grade
  // coordination rows, so one of the two retries and re-checks the pinned
  // guard instead of both committing an inconsistent snapshot.
  const affectedGrades = sortedGrades([
    selectedGrade,
    ...(formalWordList?.plannedWords || []).map((word) => word.grade),
  ]);
  const scheduledResult = await withTransaction(async (dbSession) => {
    for (const grade of affectedGrades) {
      await getOrCreateLibraryState({
        schoolId,
        grade,
        actorId: userId,
        dbSession,
      });
    }
    const [createdSession] = await SpellingSession.create([sessionData], {
      session: dbSession,
    });
    if (!formalTestWordListEmail) {
      return { session: createdSession, deliveryId: null };
    }
    const delivery = await queueFormalSpellingTestWordListEmail({
      session: createdSession,
      ...formalWordList,
      audience: formalTestEmailAudience,
      timeZone: formalTestWordListEmailTimezone,
      dbSession,
    });
    return { session: createdSession, deliveryId: delivery._id };
  });
  let session = scheduledResult.session;

  if (scheduledStartAt) {
    if (!scheduledResult.deliveryId) return session;
    let emailDelivery;
    try {
      emailDelivery = await processSpellingEmailDelivery({
        deliveryId: scheduledResult.deliveryId,
      });
    } catch (error) {
      logger.error("formal_spelling_test_prep_email_processing_failed", {
        deliveryId: String(scheduledResult.deliveryId),
        sessionId: String(session._id),
        message: error.message,
      });
      emailDelivery = { status: "pending", lastError: error.message };
    }
    return {
      ...session.toObject(),
      formalTestPrepEmail: {
        status: emailDelivery?.status || "pending",
        lastError: emailDelivery?.lastError || "",
      },
    };
  }

  const current = await getCurrentSpellingItem({
    schoolId,
    sessionId: session._id,
  });
  return current.session;
}

export async function activateDueScheduledSpellingSessions({
  now = new Date(),
  limit = 500,
} = {}) {
  const dueSessions = await SpellingSession.find({
    status: "scheduled",
    scheduledAt: { $lte: now },
  })
    .sort({ scheduledAt: 1 })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 2000))
    .setOptions({ skipTenantFilter: true })
    .select("_id school student scheduledAt")
    .lean();
  let sessionsActivated = 0;

  for (const dueSession of dueSessions) {
    const activated = await withTransaction(async (dbSession) => {
      const session = await SpellingSession.findOne({
        _id: dueSession._id,
        status: "scheduled",
        scheduledAt: { $lte: now },
      })
        .setOptions({ skipTenantFilter: true })
        .session(dbSession);
      if (!session) return false;

      const activeSession = await SpellingSession.findOne({
        school: dueSession.school,
        student: dueSession.student,
        status: "in-progress",
      })
        .setOptions({ skipTenantFilter: true })
        .select("_id")
        .session(dbSession)
        .lean();
      if (activeSession) return false;

      // The emailed preparation list is a promise: activation keeps its
      // membership exactly as scheduled. Only a legacy session without a
      // saved list resolves one now.
      if (!session.formalTestWordList?.length) {
        const refreshed = await resolveFormalTestWordList({
          schoolId: dueSession.school,
          studentId: dueSession.student,
        });
        if (refreshed.plannedWords.length === 0) {
          session.status = "abandoned";
          session.completedAt = now;
          await session.save({ session: dbSession });
          return false;
        }
        session.formalTestWordList = refreshed.plannedWords;
      }

      const affectedGrades = sortedGrades([
        session.curriculumGrade,
        ...(session.formalTestWordList || []).map((word) => word.grade),
      ]);
      for (const grade of affectedGrades) {
        await getOrCreateLibraryState({
          schoolId: dueSession.school,
          grade,
          dbSession,
        });
      }

      session.status = "in-progress";
      session.startedAt = now;
      await session.save({ session: dbSession });
      return true;
    });
    if (activated) sessionsActivated += 1;
  }

  return { sessionsActivated };
}

export async function getCurrentSpellingItem({ schoolId, sessionId }) {
  return withTransaction(async (dbSession) => {
    const session = await SpellingSession.findOne({
      _id: sessionId,
      school: schoolId,
    }).session(dbSession);
    if (!session) throw notFound("Spelling session not found");
    if (session.status !== "in-progress") return { session, item: null };

    const existing = await getCurrentItemData(session, dbSession);
    if (existing) return { session, item: existing };

    if (session.formalTestWordList?.length) {
      const attemptedPlannedWordIndexes = new Set(
        session.attempts
          .map((attempt) => attempt.plannedWordIndex)
          .filter(Number.isInteger),
      );
      const plannedWordIndex = session.formalTestWordList.findIndex(
        (word, index) => !attemptedPlannedWordIndexes.has(index),
      );
      if (plannedWordIndex === -1) {
        session.status = "completed";
        session.completedAt = new Date();
        session.completionReason = "word-list-complete";
        await session.save({ session: dbSession });
        await queueSpellingCompletionEmail({ session, dbSession });
        await saveFormalSpellingGradebookEntry({
          schoolId,
          session,
          dbSession,
        });
        return { session, item: null };
      }

      const plannedWord = session.formalTestWordList[plannedWordIndex];
      const sourceWord = await SpellingWord.findOne({
        _id: plannedWord.wordId,
        school: session.school,
      })
        .session(dbSession)
        .select("definition")
        .lean();
      const item = {
        wordId: plannedWord.wordId,
        retestItemId: plannedWord.retestItemId,
        plannedWordIndex,
        sequence: session.nextSequence,
        word: plannedWord.wordSnapshot,
        definition: sourceWord?.definition || "",
        grade: plannedWord.grade,
        week: plannedWord.week,
        category: plannedWord.category,
        order: plannedWord.order,
        isRetest: plannedWord.isRetest,
      };
      session.currentItem = {
        wordId: item.wordId,
        retestItemId: item.retestItemId,
        plannedWordIndex,
        sequence: item.sequence,
      };
      await session.save({ session: dbSession });
      return { session, item };
    }

    const student = await Student.findOne({
      _id: session.student,
      school: schoolId,
    })
      .session(dbSession)
      .lean();
    if (!student) throw notFound("Student not found");

    const attemptedWordIds = session.attempts
      .map((attempt) => attempt.wordId)
      .filter(Boolean);
    const attemptedRetestIds = session.attempts
      .map((attempt) => attempt.retestItemId)
      .filter(Boolean);

    let retestItem = null;
    if (session.assessmentType === "retest-quiz") {
      retestItem = await SpellingRetestItem.findOne({
        school: schoolId,
        student: session.student,
        status: "pending",
        _id: { $in: session.retestQuizItems, $nin: attemptedRetestIds },
      })
        .sort({
          correctRetestStreak: 1,
          incorrectRetestCount: -1,
          lastRetestedAt: 1,
          flaggedAt: 1,
          _id: 1,
        })
        .session(dbSession)
        .lean();
    } else if (
      ["spelling-assessment", "formal-spelling-test"].includes(
        session.assessmentType,
      )
    ) {
      retestItem = await SpellingRetestItem.findOne({
        school: schoolId,
        student: session.student,
        status: "pending",
        sourceSession: { $ne: session._id },
        _id: { $nin: attemptedRetestIds },
      })
        .sort({ flaggedAt: 1, _id: 1 })
        .session(dbSession)
        .lean();
    }

    let item;
    if (retestItem) {
      const sourceWord = retestItem.sourceWord
        ? await SpellingWord.findOne({
            _id: retestItem.sourceWord,
            school: schoolId,
          })
            .session(dbSession)
            .lean()
        : null;
      item = {
        wordId: retestItem.sourceWord,
        retestItemId: retestItem._id,
        sequence: session.nextSequence,
        word: retestItem.wordSnapshot,
        definition: sourceWord?.definition || "",
        grade: retestItem.grade,
        week: retestItem.week,
        category: retestItem.category,
        isRetest: true,
      };
    } else if (
      session.assessmentType === "spelling-assessment" &&
      session.curriculumGrade &&
      session.curriculumWeek
    ) {
      await assertStudentProgressReady({
        schoolId,
        grade: session.curriculumGrade,
        student,
        dbSession,
      });
      const gradeWords = await loadGradeWords({
        schoolId,
        grade: session.curriculumGrade,
        dbSession,
      });
      const consumedIds = await loadConsumedWordIds({
        schoolId,
        studentId: session.student,
        grade: session.curriculumGrade,
        dbSession,
      });
      const excluded = new Set(consumedIds);
      for (const wordId of attemptedWordIds) excluded.add(String(wordId));
      const word = nextEligibleWord({
        words: gradeWords,
        consumedIds: excluded,
        floorWeek: getPlacementFloor({ student, grade: session.curriculumGrade }),
      });
      if (word) session.curriculumWeek = word.week;
      item = word
        ? {
            wordId: word._id,
            retestItemId: null,
            sequence: session.nextSequence,
            word: word.word,
            definition: word.definition || "",
            grade: word.grade,
            week: word.week,
            category: word.category,
            order: word.order,
            isRetest: false,
          }
        : null;
    }

    if (!item) {
      session.status = "completed";
      session.completedAt = new Date();
      session.completionReason =
        session.assessmentType === "retest-quiz"
          ? "retest-quiz-complete"
          : "curriculum-exhausted";
      await session.save({ session: dbSession });
      return { session, item: null };
    }

    session.currentItem = {
      wordId: item.wordId,
      retestItemId: item.retestItemId,
      sequence: item.sequence,
    };
    await session.save({ session: dbSession });
    return { session, item };
  });
}

export async function recordSpellingAttempt({
  schoolId,
  sessionId,
  userId,
  sequence,
  correct,
  studentInput,
  skipped = false,
  idempotencyKey,
}) {
  if (!Number.isInteger(sequence) || sequence < 1)
    throw badRequest("sequence must be a positive integer");
  if (!idempotencyKey || typeof idempotencyKey !== "string")
    throw badRequest("idempotencyKey is required");

  return withTransaction(async (dbSession) => {
    const session = await SpellingSession.findOne({
      _id: sessionId,
      school: schoolId,
    }).session(dbSession);
    if (!session) throw notFound("Spelling session not found");

    const duplicate = session.attempts.find(
      (attempt) => attempt.idempotencyKey === idempotencyKey,
    );
    if (duplicate) return { session, attempt: duplicate, idempotent: true };
    if (session.status !== "in-progress")
      throw conflict("Spelling session is no longer active");

    const item = await getCurrentItemData(session, dbSession);
    if (!item || item.sequence !== sequence)
      throw conflict("The requested spelling item is no longer current");

    // A canonical word made only of punctuation normalizes to "" and would
    // grade any punctuation input as correct. Fail closed before recording.
    if (!normalizeForGrading(item.word)) {
      throw domainError("LIBRARY_INVALID", {
        details: [
          {
            grade: item.grade ?? null,
            week: item.week ?? null,
            wordId: item.wordId ? String(item.wordId) : null,
          },
        ],
      });
    }

    const outcome = evaluateSpellingAnswer({
      mode: session.mode,
      studentInput,
      correct,
      skipped,
      canonicalWord: item.word,
    });
    const evaluatedCorrect = outcome.correct;
    const isSkipped = outcome.skipped;
    const now = new Date();
    const attempt = {
      sequence,
      wordId: item.wordId,
      plannedWordIndex: item.plannedWordIndex ?? null,
      wordSnapshot: item.word,
      grade: item.grade,
      week: item.week,
      category: item.category,
      order: item.order || null,
      retestItemId: item.retestItemId,
      isRetest: item.isRetest,
      correct: evaluatedCorrect,
      skipped: isSkipped,
      originalCorrect: evaluatedCorrect,
      originalCountsAsMistake: outcome.countsAsMistake,
      provenanceVersion: 1,
      recordedSequence: sequence,
      studentInput:
        session.mode === "self-serve" ? String(studentInput ?? "") : null,
      normalizedInput:
        session.mode === "self-serve"
          ? normalizeForGrading(studentInput)
          : null,
      answeredAt: now,
      answeredBy: userId,
      idempotencyKey,
    };

    session.attempts.push(attempt);
    const attemptDocument = session.attempts[session.attempts.length - 1];
    session.correctCount += evaluatedCorrect ? 1 : 0;
    session.mistakeCount += outcome.countsAsMistake ? 1 : 0;
    session.currentItem = {
      wordId: null,
      retestItemId: null,
      plannedWordIndex: null,
      sequence: null,
    };
    session.nextSequence += 1;

    let retestTouched = [];
    if (item.isRetest) {
      retestTouched = await recordRetestAnswer({
        schoolId,
        studentId: session.student,
        retestItemId: item.retestItemId,
        correct: evaluatedCorrect,
        skipped: isSkipped,
        sessionId: session._id,
        sourceAttempt: attemptDocument._id,
        formalTest: session.assessmentType === "formal-spelling-test",
        at: now,
        dbSession,
      });
    } else if (outcome.countsAsMistake) {
      const obligation = await createRetestObligation({
        schoolId,
        studentId: session.student,
        session,
        attempt: attemptDocument,
        item,
        at: now,
        dbSession,
      });
      if (obligation?.created) {
        retestTouched = [
          {
            retestItemId: obligation.item._id,
            before: null,
            after: snapshotRetestState(obligation.item),
          },
        ];
      }
    }
    attemptDocument.retestSnapshot = retestTouched.map(({ retestItemId, after }) => ({
      retestItemId,
      ...(after || {}),
    }));

    if (!item.isRetest) {
      await assertStudentProgressReady({
        schoolId,
        studentId: session.student,
        grade: item.grade,
        dbSession,
      });
      await recordConsumedWord({
        schoolId,
        studentId: session.student,
        wordId: item.wordId,
        grade: item.grade,
        source: "attempt",
        sourceSession: session._id,
        sourceAttempt: attemptDocument._id,
        dbSession,
      });
      const gradeWords = await loadGradeWords({
        schoolId,
        grade: item.grade,
        dbSession,
      });
      await recalculateStudentProjection({
        schoolId,
        studentId: session.student,
        grade: item.grade,
        words: gradeWords,
        dbSession,
      });
    }

    if (
      session.assessmentType !== "retest-quiz" &&
      session.mistakeCount >= session.maxMistakesAllowed
    ) {
      session.status = "completed";
      session.completedAt = now;
      session.completionReason = "mistake-limit";
    } else if (
      session.formalTestWordList?.length &&
      session.attempts.filter((entry) =>
        Number.isInteger(entry.plannedWordIndex),
      ).length >= session.formalTestWordList.length
    ) {
      session.status = "completed";
      session.completedAt = now;
      session.completionReason = "word-list-complete";
    }
    await session.save({ session: dbSession });
    if (
      session.status === "completed" &&
      session.assessmentType !== "retest-quiz"
    ) {
      await queueSpellingCompletionEmail({ session, dbSession });
      await saveFormalSpellingGradebookEntry({ schoolId, session, dbSession });
    }
    return { session, attempt: attemptDocument, idempotent: false };
  });
}


export async function completeSpellingSession({
  schoolId,
  sessionId,
  reason = "manual-complete",
}) {
  return withTransaction(async (dbSession) => {
    const session = await SpellingSession.findOne({
      _id: sessionId,
      school: schoolId,
    }).session(dbSession);
    if (!session) throw notFound("Spelling session not found");
    if (session.status === "completed") return { session, idempotent: true };
    if (session.status === "abandoned")
      throw conflict("Spelling session was abandoned");
    if (!["teacher-ended", "manual-complete"].includes(reason))
      throw badRequest("Invalid completion reason");

    session.status = "completed";
    session.completedAt = new Date();
    session.completionReason = reason;
    session.currentItem = { wordId: null, retestItemId: null, sequence: null };
    await session.save({ session: dbSession });
    await queueSpellingCompletionEmail({ session, dbSession });
    await saveFormalSpellingGradebookEntry({ schoolId, session, dbSession });
    return { session, idempotent: false };
  });
}

export async function cancelScheduledSpellingSession({ schoolId, sessionId }) {
  const { session, deliveryId } = await withTransaction(async (dbSession) => {
    const session = await SpellingSession.findOneAndUpdate(
      { _id: sessionId, school: schoolId, status: "scheduled" },
      { $set: { status: "abandoned", completedAt: new Date() } },
      { new: true, session: dbSession },
    );
    if (!session) {
      const existing = await SpellingSession.findOne({
        _id: sessionId,
        school: schoolId,
      })
        .select("status")
        .session(dbSession)
        .lean();
      if (!existing) throw notFound("Spelling session not found");
      throw conflict("Only a scheduled spelling session can be cancelled");
    }

    await SpellingEmailDelivery.updateMany(
      {
        school: schoolId,
        session: session._id,
        kind: "formal-test-prep",
        status: { $in: ["staging", "pending"] },
      },
      {
        $set: {
          status: "cancelled",
          lastError: "Scheduled spelling test cancelled",
        },
      },
      { session: dbSession },
    );
    const notice = await queueFormalSpellingTestCancelledEmail({
      session,
      dbSession,
    });
    return { session, deliveryId: notice?._id || null };
  });

  if (deliveryId) {
    try {
      await processSpellingEmailDelivery({ deliveryId });
    } catch (error) {
      logger.error("formal_spelling_test_cancel_email_processing_failed", {
        deliveryId: String(deliveryId),
        sessionId: String(session._id),
        message: error.message,
      });
    }
  }
  return session;
}

export async function abandonSpellingSession({ schoolId, sessionId }) {
  const session = await SpellingSession.findOneAndUpdate(
    { _id: sessionId, school: schoolId, status: "in-progress" },
    {
      $set: {
        status: "abandoned",
        completedAt: new Date(),
        completionReason: null,
      },
    },
    { new: true },
  );
  if (!session) throw notFound("Active spelling session not found");
  return session;
}
