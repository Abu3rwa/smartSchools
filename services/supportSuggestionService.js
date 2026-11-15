import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import Class from '../models/Class.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import StudentBehavior from '../models/StudentBehavior.js';
import SupportCase from '../models/SupportCase.js';
import SupportSuggestionDismissal from '../models/SupportSuggestionDismissal.js';
import { supportError } from './supportAccessService.js';
import { teacherClassIds } from './supportCycleService.js';
import { isSupportAdmin, loadSettings } from './supportSettingsService.js';
import { createCase } from './supportCaseService.js';

const DAY = 24 * 60 * 60 * 1000;
const MAX_STUDENTS = 2000;
const MAX_ITEMS = 60;

const nameOf = (person) => `${person?.firstName || ''} ${person?.lastName || ''}`.trim();

const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const numeric = { $convert: { input: '$maxMarks', to: 'double', onError: 0, onNull: 0 } };
const marksNumeric = { $convert: { input: '$marks', to: 'double', onError: null, onNull: null } };

const scopedClasses = async ({ schoolId, user, academicYear }) => {
    if (isSupportAdmin(user)) {
        return Class.find({ school: schoolId, academicYear, isActive: true })
            .select('_id name grade section')
            .lean();
    }
    const rows = await teacherClassIds(schoolId, user._id);
    const ids = rows.map((row) => row._id);
    if (!ids.length) return [];
    return Class.find({ school: schoolId, _id: { $in: ids } })
        .select('_id name grade section academicYear')
        .lean();
};

const attendanceStats = async ({ schoolId, classIds, studentIds, since }) => {
    if (!classIds.length || !studentIds.length) return new Map();
    const rows = await Attendance.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(String(schoolId)),
                class: { $in: classIds },
                date: { $gte: since },
            },
        },
        { $unwind: '$studentAttendance' },
        { $match: { 'studentAttendance.student': { $in: studentIds } } },
        {
            $group: {
                _id: '$studentAttendance.student',
                total: { $sum: 1 },
                absent: {
                    $sum: {
                        $cond: [
                            { $in: ['$studentAttendance.status', ['absent', 'absent_excused']] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ]);
    return new Map(rows.map((row) => [String(row._id), row]));
};

const gradeStats = async ({ schoolId, studentIds, academicYear, since }) => {
    if (!studentIds.length) return new Map();
    const rows = await Grade.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(String(schoolId)),
                student: { $in: studentIds },
                academicYear,
                date: { $gte: since },
            },
        },
        {
            $project: {
                student: 1,
                ratio: {
                    $cond: [
                        { $gt: [numeric, 0] },
                        { $divide: [marksNumeric, numeric] },
                        null,
                    ],
                },
            },
        },
        {
            $group: {
                _id: '$student',
                count: { $sum: { $cond: [{ $ne: ['$ratio', null] }, 1, 0] } },
                average: { $avg: '$ratio' },
                failing: {
                    $sum: {
                        $cond: [
                            { $and: [{ $ne: ['$ratio', null] }, { $lt: ['$ratio', 0.5] }] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ]);
    return new Map(rows.map((row) => [String(row._id), row]));
};

const behaviorStats = async ({ schoolId, studentIds, since }) => {
    if (!studentIds.length) return new Map();
    const rows = await StudentBehavior.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(String(schoolId)),
                student: { $in: studentIds },
                incidentDate: { $gte: since },
                incidentType: { $ne: 'positive' },
            },
        },
        { $group: { _id: '$student', incidents: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row]));
};

const classLabel = (cls) => (
    [cls?.name || [cls?.grade, cls?.section].filter(Boolean).join('-'), cls?.section && cls?.name ? cls.section : '']
        .filter(Boolean)
        .join(' · ')
);

const buildItems = ({ students, classById, attendance, grades, behavior, settings, signatures }) => {
    const items = [];
    for (const student of students) {
        const id = String(student._id);
        const cls = classById.get(String(student.currentClass));
        const base = {
            student: {
                id,
                name: nameOf(student),
                class: classLabel(cls),
                classId: cls ? String(cls._id) : '',
            },
        };

        const att = attendance.get(id);
        if (att && att.total >= 5) {
            const rate = Math.round(((att.total - att.absent) / att.total) * 1000) / 10;
            if (rate < settings.suggestionAttendanceRate) {
                items.push({
                    ...base,
                    signature: `attendance:${signatures.month}`,
                    kind: 'attendance',
                    severity: rate < settings.suggestionAttendanceRate - 15 ? 'high' : 'medium',
                    metric: { value: rate, unit: 'percent', threshold: settings.suggestionAttendanceRate, label: 'Attendance rate' },
                    detail: `${att.absent} absent day(s) in ${att.total} recorded sessions.`,
                    sources: [{ source: 'attendance', windowDays: settings.suggestionWindowDays }],
                    score: (settings.suggestionAttendanceRate - rate) * 2,
                });
            }
        }

        const grade = grades.get(id);
        if (grade && grade.failing >= settings.suggestionFailingGrades) {
            items.push({
                ...base,
                signature: `grades:${signatures.month}`,
                kind: 'grades',
                severity: grade.failing >= settings.suggestionFailingGrades * 2 ? 'high' : 'medium',
                metric: { value: grade.failing, unit: 'count', threshold: settings.suggestionFailingGrades, label: 'Grades below 50%' },
                detail: `${grade.failing} of ${grade.count} recorded grades are below 50%.`,
                sources: [{ source: 'grades', windowDays: settings.suggestionWindowDays }],
                score: grade.failing * 10,
            });
        }

        const beh = behavior.get(id);
        if (beh && beh.incidents >= settings.suggestionBehaviorIncidents) {
            items.push({
                ...base,
                signature: `behavior:${signatures.month}`,
                kind: 'behavior',
                severity: beh.incidents >= settings.suggestionBehaviorIncidents * 2 ? 'high' : 'medium',
                metric: { value: beh.incidents, unit: 'count', threshold: settings.suggestionBehaviorIncidents, label: 'Recorded incidents' },
                detail: `${beh.incidents} non-positive behavior record(s) were logged.`,
                sources: [{ source: 'behavior', windowDays: settings.suggestionWindowDays }],
                score: beh.incidents * 10,
            });
        }
    }
    return items;
};

/**
 * Evidence-based nomination hints. They never create a case by themselves,
 * never read remarks, and only fire on the school's configured thresholds.
 */
export const listSuggestions = async ({ schoolId, user, academicYear }) => {
    const settings = await loadSettings(schoolId);
    if (!settings.enabled) {
        return { enabled: false, available: false, reason: 'SUPPORT_DISABLED', items: [] };
    }
    if (!settings.autoSuggestions) {
        return { enabled: true, available: false, reason: 'SUGGESTIONS_OFF', items: [] };
    }

    const classes = await scopedClasses({ schoolId, user, academicYear });
    if (!classes.length) {
        return { enabled: true, available: true, windowDays: settings.suggestionWindowDays, thresholds: thresholdsOf(settings), items: [] };
    }
    const classById = new Map(classes.map((row) => [String(row._id), row]));
    const classIds = classes.map((row) => row._id);

    const students = await Student.find({
        school: schoolId,
        academicYear,
        currentClass: { $in: classIds },
    })
        .select('firstName lastName currentClass')
        .limit(MAX_STUDENTS)
        .lean();
    const studentIds = students.map((row) => row._id);
    if (!studentIds.length) {
        return { enabled: true, available: true, windowDays: settings.suggestionWindowDays, thresholds: thresholdsOf(settings), items: [] };
    }

    const since = new Date(Date.now() - Math.min(Math.max(Number(settings.suggestionWindowDays) || 45, 7), 180) * DAY);
    const [activeCases, attendance, grades, behavior] = await Promise.all([
        SupportCase.find({ school: schoolId, student: { $in: studentIds }, status: 'active' })
            .select('student')
            .lean(),
        attendanceStats({ schoolId, classIds, studentIds, since }),
        gradeStats({ schoolId, studentIds, academicYear, since }),
        behaviorStats({ schoolId, studentIds, since }),
    ]);
    const caseload = new Set(activeCases.map((row) => String(row.student)));
    const candidates = students.filter((row) => !caseload.has(String(row._id)));

    const signatures = { month: monthKey() };
    const items = buildItems({ students: candidates, classById, attendance, grades, behavior, settings, signatures });
    if (!items.length) {
        return { enabled: true, available: true, windowDays: settings.suggestionWindowDays, thresholds: thresholdsOf(settings), items: [] };
    }

    const dismissed = await SupportSuggestionDismissal.find({
        school: schoolId,
        student: { $in: candidates.map((row) => row._id) },
        signature: { $in: [...new Set(items.map((row) => row.signature))] },
    }).select('student signature').lean();
    const dismissedKeys = new Set(dismissed.map((row) => `${row.student}:${row.signature}`));

    const visible = items
        .filter((row) => !dismissedKeys.has(`${row.student.id}:${row.signature}`))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ITEMS)
        .map((row) => {
            const clean = { ...row };
            delete clean.score;
            clean.windowStart = since;
            return clean;
        });

    return {
        enabled: true,
        available: true,
        windowDays: settings.suggestionWindowDays,
        thresholds: thresholdsOf(settings),
        items: visible,
    };
};

const thresholdsOf = (settings) => ({
    attendanceRate: settings.suggestionAttendanceRate,
    failingGrades: settings.suggestionFailingGrades,
    behaviorIncidents: settings.suggestionBehaviorIncidents,
});

const assertStudentInScope = async ({ schoolId, user, studentId }) => {
    if (!mongoose.isValidObjectId(studentId)) {
        throw supportError(400, 'STUDENT_INVALID', 'Choose a student.');
    }
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('firstName lastName currentClass academicYear')
        .lean();
    if (!student) throw supportError(404, 'STUDENT_NOT_FOUND', 'That student was not found.');
    if (isSupportAdmin(user)) return student;
    const classes = await scopedClasses({ schoolId, user, academicYear: student.academicYear });
    if (!classes.some((row) => String(row._id) === String(student.currentClass))) {
        throw supportError(403, 'STUDENT_FORBIDDEN', 'This student is not in your classes.');
    }
    return student;
};

export const dismissSuggestion = async ({ schoolId, user, studentId, signature, reason = '' }) => {
    await assertStudentInScope({ schoolId, user, studentId });
    const clean = String(signature || '').trim().slice(0, 80);
    if (!/^(attendance|grades|behavior):\d{4}-\d{2}$/.test(clean)) {
        throw supportError(400, 'SUGGESTION_INVALID', 'Choose a suggestion to dismiss.');
    }
    await SupportSuggestionDismissal.updateOne(
        { school: schoolId, student: studentId, signature: clean },
        {
            $set: {
                reason: String(reason || '').trim().slice(0, 300),
                dismissedBy: user?._id || null,
                dismissedAt: new Date(),
            },
        },
        { upsert: true },
    );
    return { dismissed: true };
};

/** Confirming is an explicit create with chosen subjects, never an automatic case. */
export const confirmSuggestion = async ({
    schoolId,
    user,
    academicYear,
    studentId,
    subjectIds,
    severity = 'watch',
    concernNote = '',
}) => {
    await assertStudentInScope({ schoolId, user, studentId });
    const result = await createCase({
        schoolId,
        user,
        academicYear,
        studentId,
        subjectIds,
        severity,
        concernNote,
        source: 'suggestion',
        actorId: user?._id || null,
    });
    return result;
};
