import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveSchoolFeatureContext } from '../middleware/featureGate.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import GameProfile from '../models/GameProfile.js';
import GameRewardEvent from '../models/GameRewardEvent.js';
import GameClassSetting from '../models/GameClassSetting.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import { DEFAULT_SCHOOL_TIMEZONE, resolveTimeZone } from '../utils/schoolTimezone.js';
import { getTeacherClassIds, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import {
    accuracyFor,
    compareLeaderboardRows,
    displayNameFor,
    leaderboardMatch,
    leaderboardPipeline,
    settlePreviousPodium,
    windowBoundsFor
} from '../services/languageGameLeaderboard.js';

const roleSet = (req) => new Set([req.user?.role, ...(req.user?.roles || [])].filter(Boolean));
const isAdmin = (req) => ['admin', 'super_admin'].some((role) => roleSet(req).has(role));
const isStaff = (req) => ['teacher', 'admin', 'super_admin'].some((role) => roleSet(req).has(role));

const schoolTimeZone = async () => {
    const config = await SchoolCalendarConfig.findOne().select('timezone').lean();
    return resolveTimeZone(config?.timezone) || DEFAULT_SCHOOL_TIMEZONE;
};

const studentClasses = (student) => [...new Set(
    [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean).map(String)
)];

const unavailable = (res, reason, extra = {}) => res.json({
    success: true,
    data: { available: false, reason, rows: [], myRow: null, ...extra }
});

export const getLeaderboard = asyncHandler(async (req, res) => {
    const scope = req.query.scope === 'school' ? 'school' : 'class';
    const window = ['week', 'month', 'all'].includes(req.query.window) ? req.query.window : 'week';
    const limit = Math.min(100, Math.max(1, Math.round(Number(req.query.limit) || 50)));

    const featureContext = await resolveSchoolFeatureContext(req.schoolId);
    if (featureContext?.features?.skillpathLeaderboard !== true) {
        return unavailable(res, 'feature_locked');
    }

    const rawSubject = String(req.query.subjectId || '').trim();
    let subjectId; // undefined = combined, null = General
    let subjectCode = 'all';
    if (rawSubject.toLowerCase() === 'general') {
        subjectId = null;
        subjectCode = 'general';
    } else if (rawSubject) {
        if (!mongoose.isValidObjectId(rawSubject)) {
            return res.status(400).json({ success: false, message: 'Choose a subject from the list.' });
        }
        const subject = await Subject.findOne({ _id: rawSubject, school: req.schoolId }).select('code').lean();
        if (!subject) return res.status(400).json({ success: false, message: 'The selected subject was not found.' });
        subjectId = rawSubject;
        subjectCode = String(subject.code || rawSubject).toLowerCase();
    }

    let classId = null;
    if (scope === 'class') {
        classId = String(req.query.classId || '').trim();
        if (!mongoose.isValidObjectId(classId)) {
            return res.status(400).json({ success: false, message: 'Choose a class.' });
        }
        const classDoc = await Class.findOne({ _id: classId, school: req.schoolId }).select('_id').lean();
        if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found.' });
    }

    const staff = isStaff(req);
    let viewerStudent = null;
    if (!staff) {
        viewerStudent = await Student.findOne({ user: req.user._id, school: req.schoolId })
            .select('_id firstName lastName currentClass enrolledClasses')
            .sort({ createdAt: -1 })
            .lean();
        if (!viewerStudent) return res.status(404).json({ success: false, message: 'Student profile not found.' });
        if (scope === 'class' && !studentClasses(viewerStudent).includes(classId)) {
            return res.status(403).json({ success: false, message: 'You are not in this class.' });
        }
    } else if (!isAdmin(req)) {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Only a teacher profile can see class boards.' });
        if (scope === 'class') {
            const teacherClassIds = (await getTeacherClassIds(teacher._id)).map(String);
            if (!teacherClassIds.includes(classId)) {
                return res.status(403).json({ success: false, message: 'You are not assigned to this class.' });
            }
        }
    }

    if (scope === 'class') {
        const setting = await GameClassSetting.findOne({ school: req.schoolId, class: classId }).lean();
        if (setting && setting.leaderboardEnabled === false) {
            return unavailable(res, 'class_disabled', { scope, window });
        }
    }

    const now = new Date();
    const timeZone = await schoolTimeZone();
    const bounds = windowBoundsFor(window, now, timeZone);
    const match = leaderboardMatch({ schoolId: req.schoolId, classId, subjectId, bounds });
    const grouped = await GameRewardEvent.aggregate(leaderboardPipeline(match));

    const studentIds = grouped.map((row) => row._id);
    const students = await Student.find({ _id: { $in: studentIds } }).select('firstName lastName').lean();
    const studentMap = new Map(students.map((student) => [String(student._id), student]));
    const profiles = await GameProfile.find({ student: { $in: studentIds } }).select('student streakWeeks').lean();
    const streakMap = new Map(profiles.map((profile) => [String(profile.student), profile.streakWeeks || 0]));

    const masked = !staff;
    const ranked = grouped
        .filter((row) => studentMap.has(String(row._id)))
        .map((row) => ({
            studentId: String(row._id),
            displayName: displayNameFor(studentMap.get(String(row._id)), masked),
            xp: row.xp,
            attempts: row.attempts,
            correct: row.correct,
            accuracy: accuracyFor(row.correct, row.attempts),
            streakWeeks: streakMap.get(String(row._id)) || 0
        }))
        .sort(compareLeaderboardRows)
        .map((row, index) => ({ rank: index + 1, ...row }));

    // A class board lists every student in the class, so each student sees
    // themselves and their classmates even before anyone has practiced.
    if (scope === 'class') {
        const roster = await Student.find({
            $or: [{ currentClass: classId }, { enrolledClasses: classId }],
            status: 'active'
        }).select('_id firstName lastName').lean();
        const known = new Set(ranked.map((row) => row.studentId));
        const rosterProfiles = await GameProfile.find({
            student: { $in: roster.map((student) => student._id) }
        }).select('student streakWeeks').lean();
        const rosterStreak = new Map(rosterProfiles.map((profile) => [String(profile.student), profile.streakWeeks || 0]));
        for (const student of roster) {
            const id = String(student._id);
            if (known.has(id)) continue;
            ranked.push({
                studentId: id,
                displayName: displayNameFor(student, masked),
                xp: 0,
                attempts: 0,
                correct: 0,
                accuracy: null,
                streakWeeks: rosterStreak.get(id) || 0
            });
        }
        ranked.sort(compareLeaderboardRows);
        ranked.forEach((row, index) => { row.rank = index + 1; });
    }

    let myRow = null;
    if (viewerStudent) {
        const mine = ranked.find((row) => row.studentId === String(viewerStudent._id));
        if (mine) myRow = mine;
    }

    await settlePreviousPodium({
        schoolId: req.schoolId,
        scope,
        classId,
        subjectId,
        subjectCode,
        window,
        now,
        timeZone
    });

    const rows = ranked.slice(0, limit).map((row) => (staff ? row : {
        rank: row.rank,
        studentId: row.studentId,
        displayName: row.displayName,
        xp: row.xp,
        attempts: row.attempts,
        accuracy: row.accuracy,
        streakWeeks: row.streakWeeks
    }));

    res.json({
        success: true,
        data: {
            available: true,
            scope,
            window,
            periodKey: bounds.periodKey,
            classId,
            subjectId: subjectId === undefined ? null : subjectId,
            rows,
            myRow: myRow ? { ...myRow, inTop: myRow.rank <= limit } : null,
            totalRanked: ranked.length
        }
    });
});

export const setClassLeaderboard = asyncHandler(async (req, res) => {
    const classId = String(req.params.classId || '');
    if (!mongoose.isValidObjectId(classId)) {
        return res.status(400).json({ success: false, message: 'Choose a class.' });
    }
    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId }).select('classTeacher').lean();
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found.' });
    if (!isAdmin(req)) {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || String(classDoc.classTeacher || '') !== String(teacher._id)) {
            return res.status(403).json({ success: false, message: 'Only the class teacher can change this setting.' });
        }
    }
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
    const setting = await GameClassSetting.findOneAndUpdate(
        { school: req.schoolId, class: classId },
        {
            $set: { leaderboardEnabled: enabled, updatedBy: req.user._id },
            $setOnInsert: { school: req.schoolId, class: classId }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({
        success: true,
        data: { setting: { classId, leaderboardEnabled: setting.leaderboardEnabled } }
    });
});