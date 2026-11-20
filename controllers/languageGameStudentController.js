import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import GamePack from '../models/GamePack.js';
import GameAssignment from '../models/GameAssignment.js';
import GameSession from '../models/GameSession.js';
import GameAttempt from '../models/GameAttempt.js';
import GameSkill from '../models/GameSkill.js';
import GameSkillProgress from '../models/GameSkillProgress.js';
import GameProfile from '../models/GameProfile.js';
import GameRewardEvent from '../models/GameRewardEvent.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import { DEFAULT_SCHOOL_TIMEZONE, resolveTimeZone } from '../utils/schoolTimezone.js';
import { canonicalizeGameItems, publicSessionItem, revealForItem } from '../services/languageGameItems.js';
import {
    awardedXpForDay,
    dateKeyFor,
    earnedBadges,
    gradeGameItem,
    levelForXp,
    mergeBadges,
    registerPracticeDay,
    selectSessionItems,
    weekKeyForDateKey,
    xpForAttempt
} from '../services/languageGameScoring.js';

const RECENT_EVENTS_KEPT = 50;
const RECENT_ITEM_IDS_KEPT = 200;
const PRACTICE_DAYS_RETURNED = 42;

const studentForRequest = async (req) => Student.findOne({ user: req.user._id, school: req.schoolId })
    .select('_id firstName lastName currentClass enrolledClasses status')
    .sort({ createdAt: -1 })
    .lean();

const schoolTimeZone = async () => {
    const config = await SchoolCalendarConfig.findOne().select('timezone').lean();
    return resolveTimeZone(config?.timezone) || DEFAULT_SCHOOL_TIMEZONE;
};

const profileView = (profile) => {
    const xp = profile?.xp || 0;
    const level = levelForXp(xp);
    return {
        xp,
        level: level.level,
        intoLevel: level.intoLevel,
        nextLevelAt: level.nextLevelAt,
        badges: profile?.badges || [],
        weeklyGoalDays: profile?.weeklyGoalDays || 3,
        practiceDays: (profile?.practiceDays || []).slice(-PRACTICE_DAYS_RETURNED),
        streakWeeks: profile?.streakWeeks || 0,
        longestStreakWeeks: profile?.longestStreakWeeks || 0
    };
};

// Assignment rules bind the session for its whole life, not just its start:
// a session must not keep behaving like free practice after the teacher
// closes the assignment or the due date passes.
const assignmentBlockedMessage = async (session, student) => {
    if (!session.assignment) return null;
    const assignment = await GameAssignment.findOne({ _id: session.assignment, studentIds: student._id })
        .select('status settings')
        .lean();
    if (!assignment) return 'This assignment is no longer available.';
    if (assignment.status !== 'open') return 'This assignment is closed.';
    const dueDate = assignment.settings?.dueDate;
    if (dueDate && new Date(dueDate).getTime() < Date.now()) {
        return 'This assignment is past its due date.';
    }
    const completed = await GameSession.countDocuments({
        assignment: assignment._id,
        student: student._id,
        status: 'completed',
        _id: { $ne: session._id }
    });
    if (completed >= (assignment.settings?.attemptsAllowed || 1)) {
        return 'You have used all attempts for this assignment.';
    }
    return null;
};

const sessionView = (session, attempts = []) => ({
    _id: session._id,
    pack: session.pack,
    assignment: session.assignment || null,
    mode: session.mode,
    showAnswersAfter: session.showAnswersAfter,
    status: session.status,
    items: session.items.map((item) => publicSessionItem(item, String(session._id))),
    answered: attempts.map((attempt) => ({
        itemId: attempt.itemId,
        submissionId: attempt.submissionId,
        correct: attempt.correct
    })),
    answeredCount: session.answeredCount,
    correctCount: session.correctCount,
    total: session.items.length
});

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

export const getHome = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });

    const assignments = await GameAssignment.find({ studentIds: student._id, status: 'open' })
        .sort({ createdAt: -1 })
        .limit(40)
        .lean();
    const packIds = [...new Set(assignments.map((assignment) => String(assignment.pack)))];
    const packs = await GamePack.find({ _id: { $in: packIds } }).select('title language gradeLevels').lean();
    const packMap = new Map(packs.map((pack) => [String(pack._id), pack]));
    const completed = await GameSession.aggregate([
        { $match: { student: student._id, assignment: { $in: assignments.map((assignment) => assignment._id) } } },
        { $group: { _id: '$assignment', sessions: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }
    ]);
    const completedMap = new Map(completed.map((row) => [String(row._id), row]));
    const now = Date.now();

    const assigned = assignments.map((assignment) => {
        const counts = completedMap.get(String(assignment._id)) || { sessions: 0, completed: 0 };
        const dueDate = assignment.settings?.dueDate || null;
        return {
            _id: assignment._id,
            pack: { _id: assignment.pack, title: packMap.get(String(assignment.pack))?.title || '' },
            mode: assignment.mode,
            settings: assignment.settings,
            itemCount: assignment.items.length,
            sessions: counts.sessions,
            completed: counts.completed,
            attemptsLeft: Math.max(0, (assignment.settings?.attemptsAllowed || 1) - counts.completed),
            overdue: Boolean(dueDate && new Date(dueDate).getTime() < now),
            dueDate
        };
    });

    const schoolPacks = await GamePack.find({ status: 'published', visibility: 'school' })
        .select('title description language gradeLevels subject publishedRevision')
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();

    const inProgressSessions = await GameSession.find({ student: student._id, status: 'in_progress' })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select('pack assignment items answeredCount correctCount updatedAt')
        .lean();
    // A session whose assignment was closed or ran past its due date is not
    // something to pick up again, so it never reaches the continue cards.
    const inProgressAssignmentIds = [...new Set(
        inProgressSessions.map((session) => session.assignment).filter(Boolean).map(String)
    )];
    const inProgressAssignments = inProgressAssignmentIds.length
        ? await GameAssignment.find({ _id: { $in: inProgressAssignmentIds } }).select('status settings').lean()
        : [];
    const inProgressAssignmentMap = new Map(inProgressAssignments.map((assignment) => [String(assignment._id), assignment]));
    const inProgressCompleted = inProgressAssignmentIds.length
        ? await GameSession.aggregate([
            {
                $match: {
                    student: student._id,
                    assignment: { $in: inProgressSessions.map((session) => session.assignment).filter(Boolean) },
                    status: 'completed'
                }
            },
            { $group: { _id: '$assignment', completed: { $sum: 1 } } }
        ])
        : [];
    const inProgressCompletedMap = new Map(inProgressCompleted.map((row) => [String(row._id), row.completed]));
    const resumableSessions = inProgressSessions.filter((session) => {
        if (!session.assignment) return true;
        const assignment = inProgressAssignmentMap.get(String(session.assignment));
        if (!assignment || assignment.status !== 'open') return false;
        const dueDate = assignment.settings?.dueDate;
        if (dueDate && new Date(dueDate).getTime() < now) return false;
        return (inProgressCompletedMap.get(String(session.assignment)) || 0) < (assignment.settings?.attemptsAllowed || 1);
    });
    const inProgressPackIds = [...new Set(resumableSessions.map((session) => String(session.pack)))];
    const inProgressPacks = await GamePack.find({ _id: { $in: inProgressPackIds } }).select('title').lean();
    const inProgressPackTitles = new Map(inProgressPacks.map((pack) => [String(pack._id), pack.title]));

    const profile = await GameProfile.findOne({ student: student._id }).lean();
    const homeTimeZone = await schoolTimeZone();
    const homeWeek = weekKeyForDateKey(dateKeyFor(new Date(), homeTimeZone));
    const skillProgress = await GameSkillProgress.find({ student: student._id })
        .sort({ lastPracticedAt: -1 })
        .limit(5)
        .lean();
    const skillIds = skillProgress.map((row) => row.skillId);
    const skills = await GameSkill.find({ _id: { $in: skillIds } }).select('name nameAr key').lean();
    const skillMap = new Map(skills.map((skill) => [String(skill._id), skill]));

    res.json({
        success: true,
        data: {
            student: { _id: student._id, firstName: student.firstName, lastName: student.lastName },
            profile: profileView(profile),
            week: {
                currentWeek: homeWeek,
                daysThisWeek: (profile?.practiceDays || []).filter((day) => weekKeyForDateKey(day) === homeWeek).length
            },
            assignments: assigned,
            inProgress: resumableSessions.map((session) => ({
                _id: session._id,
                packId: session.pack,
                packTitle: inProgressPackTitles.get(String(session.pack)) || '',
                answered: session.answeredCount,
                correct: session.correctCount,
                total: session.items.length,
                updatedAt: session.updatedAt
            })),
            practicePacks: schoolPacks.map((pack) => ({
                _id: pack._id,
                title: pack.title,
                description: pack.description,
                language: pack.language,
                gradeLevels: pack.gradeLevels,
                subject: pack.subject || null,
                itemCount: pack.publishedRevision?.items?.length || 0
            })),
            skills: skillProgress.map((row) => {
                const skill = skillMap.get(String(row.skillId));
                return {
                    skillId: row.skillId,
                    name: skill?.name || '',
                    nameAr: skill?.nameAr || '',
                    attempts: row.attempts,
                    correct: row.correct,
                    firstAttemptCorrect: row.firstAttemptCorrect,
                    distinctItems: row.distinctItems,
                    accuracy: row.attempts > 0 ? Math.round((row.correct / row.attempts) * 100) : null,
                    lastPracticedAt: row.lastPracticedAt
                };
            })
        }
    });
});

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export const myClasses = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });
    const classIds = [...new Set(
        [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean).map(String)
    )];
    const classes = classIds.length
        ? await Class.find({ _id: { $in: classIds }, school: req.schoolId }).select('name section').lean()
        : [];
    res.json({
        success: true,
        data: {
            classes: classes.map((entry) => ({ _id: entry._id, name: entry.name, section: entry.section || '' }))
        }
    });
});

export const startSession = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });
    const body = req.body || {};

    let sourceItems = [];
    let assignment = null;
    let pack = null;
    let mode = 'practice';
    let showAnswersAfter = true;
    let itemCount = 10;
    let shuffle = true;
    let revisionVersion = 0;

    if (body.assignmentId) {
        if (!mongoose.isValidObjectId(body.assignmentId)) {
            return res.status(400).json({ success: false, message: 'Choose an assignment first.' });
        }
        assignment = await GameAssignment.findOne({ _id: body.assignmentId, studentIds: student._id });
        if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });
        if (assignment.status !== 'open') {
            return res.status(409).json({ success: false, message: 'This assignment is closed.' });
        }
        const dueDate = assignment.settings?.dueDate;
        if (dueDate && new Date(dueDate).getTime() < Date.now()) {
            return res.status(409).json({ success: false, message: 'This assignment is past its due date.' });
        }
        const completed = await GameSession.countDocuments({ assignment: assignment._id, student: student._id, status: 'completed' });
        if (completed >= (assignment.settings?.attemptsAllowed || 1)) {
            return res.status(409).json({ success: false, message: 'You have used all attempts for this assignment.' });
        }
        sourceItems = assignment.items;
        pack = { _id: assignment.pack };
        mode = assignment.mode;
        showAnswersAfter = assignment.settings?.showAnswersAfter !== false;
        itemCount = assignment.settings?.itemCount || sourceItems.length;
        shuffle = assignment.settings?.shuffle !== false;
        revisionVersion = assignment.packRevisionVersion;
    } else if (body.packId) {
        if (!mongoose.isValidObjectId(body.packId)) {
            return res.status(400).json({ success: false, message: 'Choose a pack first.' });
        }
        const found = await GamePack.findOne({ _id: body.packId, status: 'published', visibility: 'school' });
        if (!found) return res.status(404).json({ success: false, message: 'Pack not found.' });
        pack = found;
        sourceItems = found.publishedRevision?.items || [];
        revisionVersion = found.publishedRevision?.version || 0;
        itemCount = sourceItems.length;
    } else {
        return res.status(400).json({ success: false, message: 'Choose an assignment or a pack.' });
    }

    if (sourceItems.length === 0) {
        return res.status(409).json({ success: false, message: 'This pack has no playable items yet.' });
    }

    const openSession = await GameSession.findOne({
        student: student._id,
        status: 'in_progress',
        assignment: assignment?._id || null,
        pack: pack._id
    });
    if (openSession) {
        const attempts = await GameAttempt.find({ session: openSession._id }).lean();
        const openPack = await GamePack.findById(openSession.pack).select('title language').lean();
        return res.json({
            success: true,
            data: {
                session: sessionView(openSession, attempts),
                resumed: true,
                packTitle: openPack?.title || '',
                packLanguage: openPack?.language || 'en'
            }
        });
    }

    const picked = selectSessionItems(canonicalizeGameItems(sourceItems), { itemCount, shuffle });
    const packInfo = await GamePack.findById(pack._id).select('title language').lean();
    const session = await GameSession.create({
        school: req.schoolId,
        student: student._id,
        assignment: assignment?._id || null,
        pack: pack._id,
        packRevisionVersion: revisionVersion,
        mode,
        showAnswersAfter,
        items: picked
    });
    res.status(201).json({
        success: true,
        data: {
            session: sessionView(session, []),
            resumed: false,
            packTitle: packInfo?.title || '',
            packLanguage: packInfo?.language || 'en'
        }
    });
});

export const getSession = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });
    const session = await GameSession.findOne({ _id: req.params.id, student: student._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    if (session.status === 'in_progress') {
        const blocked = await assignmentBlockedMessage(session, student);
        if (blocked) return res.status(409).json({ success: false, message: blocked });
    }
    const attempts = await GameAttempt.find({ session: session._id }).sort({ answeredAt: 1 }).lean();
    const packInfo = await GamePack.findById(session.pack).select('title language').lean();
    res.json({
        success: true,
        data: {
            session: sessionView(session, attempts),
            packTitle: packInfo?.title || '',
            packLanguage: packInfo?.language || 'en'
        }
    });
});

const attemptResult = (session, item, attempt) => ({
    attempt: {
        itemId: attempt.itemId,
        submissionId: attempt.submissionId,
        correct: attempt.correct
    },
    progress: {
        answered: session.answeredCount,
        correct: session.correctCount,
        total: session.items.length,
        completed: session.status === 'completed'
    },
    ...(session.showAnswersAfter ? revealForItem(item) : {})
});

// One award per answered item, so practice shows on the board and in the
// level while the session is still running. The unique key makes retries and
// duplicate submissions incapable of paying twice, and the daily subject cap
// still applies across every award of the day.
const awardPracticeAnswer = async (req, student, session, itemId, graded) => {
    const pack = await GamePack.findOne({ _id: session.pack, school: req.schoolId }).select('subject').lean();
    const subject = pack?.subject || null;
    const timeZone = await schoolTimeZone();
    const dayKey = dateKeyFor(new Date(), timeZone);
    // A pack the student already finished earns the later-attempt rate.
    const replay = Boolean(await GameSession.exists({
        student: student._id,
        pack: session.pack,
        status: 'completed',
        _id: { $ne: session._id }
    }));
    const earned = xpForAttempt({ correct: graded.correct, firstAttempt: !replay });
    const usedTodayRows = await GameRewardEvent.aggregate([
        { $match: { school: new mongoose.Types.ObjectId(String(req.schoolId)), student: student._id, subject, dayKey } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const awarded = awardedXpForDay(earned, usedTodayRows[0]?.total || 0);

    let classes = [];
    if (session.assignment) {
        const assignment = await GameAssignment.findOne({ _id: session.assignment }).select('classIds').lean();
        classes = assignment?.classIds || [];
    }
    if (classes.length === 0) {
        classes = [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean);
    }
    classes = [...new Set(classes.map(String))];

    try {
        await GameRewardEvent.create({
            school: req.schoolId,
            student: student._id,
            source: 'practice',
            ruleKey: 'game-answer',
            amount: awarded,
            uniqueKey: `practice:${session._id}:${itemId}`,
            subject,
            classes,
            dayKey,
            attempts: 1,
            correct: graded.correct ? 1 : 0
        });
    } catch (error) {
        // This item was already paid (a retry, a duplicate submission, or the
        // completion catch-up); nothing new is owed.
        if (error?.code === 11000) return { xpEarned: 0 };
        throw error;
    }

    let profile = await GameProfile.findOne({ student: student._id });
    if (!profile) {
        profile = new GameProfile({ school: req.schoolId, student: student._id });
    }
    profile.xp += awarded;
    const dayState = registerPracticeDay(profile, dayKey);
    profile.practiceDays = dayState.practiceDays;
    profile.weeklyGoalDays = dayState.weeklyGoalDays;
    profile.lastQualifiedWeek = dayState.lastQualifiedWeek;
    profile.streakWeeks = dayState.streakWeeks;
    profile.longestStreakWeeks = dayState.longestStreakWeeks;
    const totalAttempts = await GameAttempt.countDocuments({ student: student._id });
    profile.badges = mergeBadges(profile.badges, earnedBadges({
        xp: profile.xp,
        streakWeeks: profile.streakWeeks,
        totalAttempts
    }));
    await profile.save();
    return { xpEarned: awarded };
};

export const answerSession = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });
    const session = await GameSession.findOne({ _id: req.params.id, student: student._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    if (session.status !== 'in_progress') {
        return res.status(409).json({ success: false, message: 'This session is already finished.' });
    }
    const blocked = await assignmentBlockedMessage(session, student);
    if (blocked) return res.status(409).json({ success: false, message: blocked });

    const body = req.body || {};
    const itemId = String(body.itemId || '').trim();
    const submissionId = String(body.submissionId || '').trim().slice(0, 80);
    const response = String(body.response ?? '').slice(0, 2000);
    if (!itemId) return res.status(400).json({ success: false, message: 'Missing item id.' });
    if (!submissionId) return res.status(400).json({ success: false, message: 'Missing submission id.' });
    const item = session.items.find((entry) => entry.externalId === itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found in this session.' });

    const existing = await GameAttempt.findOne({ session: session._id, itemId });
    if (existing) {
        if (existing.submissionId === submissionId) {
            // Idempotent: pays only if the original request never got this far.
            const { xpEarned } = await awardPracticeAnswer(req, student, session, itemId, { correct: existing.correct });
            return res.json({
                success: true,
                data: { ...attemptResult(session, item, existing), xpEarned },
                duplicate: true
            });
        }
        return res.status(409).json({ success: false, message: 'This item was already answered.' });
    }

    const graded = gradeGameItem(item, response);
    let attempt;
    try {
        attempt = await GameAttempt.create({
            school: req.schoolId,
            session: session._id,
            student: student._id,
            assignment: session.assignment || null,
            pack: session.pack,
            itemId,
            skillId: item.skillId,
            submissionId,
            response,
            correct: graded.correct,
            firstAttempt: true
        });
    } catch (error) {
        if (error?.code === 11000) {
            const raced = await GameAttempt.findOne({ session: session._id, itemId });
            if (raced && raced.submissionId === submissionId) {
                const { xpEarned } = await awardPracticeAnswer(req, student, session, itemId, { correct: raced.correct });
                return res.json({
                    success: true,
                    data: { ...attemptResult(session, item, raced), xpEarned },
                    duplicate: true
                });
            }
            return res.status(409).json({ success: false, message: 'This item was already answered.' });
        }
        throw error;
    }

    session.answeredCount += 1;
    if (graded.correct) session.correctCount += 1;
    await session.save();

    const newestItem = !(await GameSkillProgress.exists({ student: student._id, skillId: item.skillId, recentItemIds: itemId }));
    await GameSkillProgress.findOneAndUpdate(
        { student: student._id, skillId: item.skillId },
        {
            $set: { lastPracticedAt: new Date() },
            $inc: {
                attempts: 1,
                correct: graded.correct ? 1 : 0,
                firstAttemptCorrect: graded.correct ? 1 : 0,
                ...(newestItem ? { distinctItems: 1 } : {})
            },
            $push: {
                recent: {
                    $each: [{ itemId, correct: graded.correct, firstAttempt: true, at: new Date() }],
                    $slice: -RECENT_EVENTS_KEPT
                },
                recentItemIds: {
                    $each: [itemId],
                    $slice: -RECENT_ITEM_IDS_KEPT
                }
            },
            $setOnInsert: { school: req.schoolId, student: student._id, skillId: item.skillId }
        },
        { upsert: true, new: true }
    );

    const { xpEarned } = await awardPracticeAnswer(req, student, session, itemId, graded);
    res.json({ success: true, data: { ...attemptResult(session, item, attempt), xpEarned } });
});

export const completeSession = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });
    const session = await GameSession.findOne({ _id: req.params.id, student: student._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    if (session.status !== 'completed') {
        if (session.answeredCount < session.items.length) {
            return res.status(409).json({
                success: false,
                message: 'Answer every item before finishing.',
                data: { answered: session.answeredCount, total: session.items.length }
            });
        }
        session.status = 'completed';
        session.completedAt = new Date();
        await session.save();
    }

    const attempts = await GameAttempt.find({ session: session._id }).lean();
    // Answers taken before per-answer awards existed have no event yet; settle
    // each unpaid attempt. Checking per item (not per session) keeps the
    // answers of a session that straddles a deploy on the board.
    if (attempts.length > 0) {
        const paid = await GameRewardEvent.find({
            uniqueKey: { $regex: `^practice:${session._id}(:|$)` }
        }).select('uniqueKey').lean();
        const settledKeys = new Set(paid.map((event) => event.uniqueKey));
        for (const attempt of attempts) {
            if (!settledKeys.has(`practice:${session._id}:${attempt.itemId}`)) {
                await awardPracticeAnswer(req, student, session, attempt.itemId, { correct: attempt.correct });
            }
        }
    }

    const sessionAwards = await GameRewardEvent.aggregate([
        { $match: { student: student._id, uniqueKey: { $regex: `^practice:${session._id}(:|$)` } } },
        { $group: { _id: null, xp: { $sum: '$amount' } } }
    ]);
    const xpEarned = sessionAwards[0]?.xp || 0;

    const timeZone = await schoolTimeZone();
    const dayKey = dateKeyFor(new Date(), timeZone);

    const profile = await GameProfile.findOne({ student: student._id })
        || new GameProfile({ school: req.schoolId, student: student._id });

    const today = dayKey;
    const currentWeek = weekKeyForDateKey(today);
    res.json({
        success: true,
        data: {
            summary: {
                answered: session.answeredCount,
                correct: session.correctCount,
                total: session.items.length,
                accuracy: session.answeredCount > 0 ? Math.round((session.correctCount / session.answeredCount) * 100) : null,
                xpEarned
            },
            profile: profileView(profile),
            week: {
                currentWeek,
                daysThisWeek: profile.practiceDays.filter((day) => weekKeyForDateKey(day) === currentWeek).length
            }
        }
    });
});

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export const getProgress = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });
    const profile = await GameProfile.findOne({ student: student._id }).lean();
    const progressRows = await GameSkillProgress.find({ student: student._id })
        .sort({ lastPracticedAt: -1 })
        .limit(50)
        .lean();
    const skills = await GameSkill.find({ _id: { $in: progressRows.map((row) => row.skillId) } })
        .select('name nameAr key')
        .lean();
    const skillMap = new Map(skills.map((skill) => [String(skill._id), skill]));
    const recentSessions = await GameSession.find({ student: student._id, status: 'completed' })
        .sort({ completedAt: -1 })
        .limit(10)
        .select('pack items correctCount answeredCount completedAt mode')
        .lean();
    const timeZone = await schoolTimeZone();
    const today = dateKeyFor(new Date(), timeZone);
    const currentWeek = weekKeyForDateKey(today);

    res.json({
        success: true,
        data: {
            profile: profileView(profile),
            totals: progressRows.reduce((total, row) => ({
                attempts: total.attempts + row.attempts,
                correct: total.correct + row.correct,
                firstAttemptCorrect: total.firstAttemptCorrect + row.firstAttemptCorrect
            }), { attempts: 0, correct: 0, firstAttemptCorrect: 0 }),
            skills: progressRows.map((row) => ({
                skillId: row.skillId,
                name: skillMap.get(String(row.skillId))?.name || '',
                nameAr: skillMap.get(String(row.skillId))?.nameAr || '',
                attempts: row.attempts,
                correct: row.correct,
                firstAttemptCorrect: row.firstAttemptCorrect,
                distinctItems: row.distinctItems,
                accuracy: row.attempts > 0 ? Math.round((row.correct / row.attempts) * 100) : null,
                lastPracticedAt: row.lastPracticedAt
            })),
            week: {
                currentWeek,
                daysThisWeek: (profile?.practiceDays || []).filter((day) => weekKeyForDateKey(day) === currentWeek).length
            },
            sessions: recentSessions.map((session) => ({
                _id: session._id,
                pack: session.pack,
                mode: session.mode,
                answered: session.answeredCount,
                correct: session.correctCount,
                total: session.items.length,
                accuracy: session.answeredCount > 0 ? Math.round((session.correctCount / session.answeredCount) * 100) : null,
                completedAt: session.completedAt
            }))
        }
    });
});
