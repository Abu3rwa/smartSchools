import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import { behaviorEvidenceRows } from './behavior/eventQueryService.js';
import { scrubForPrompt } from './aiPromptSafety.js';
import { studentAge } from './supportSettingsService.js';

const DAY = 24 * 60 * 60 * 1000;
const nameOf = (person) => `${person?.firstName || ''} ${person?.lastName || ''}`.trim();

const source = ({ available, reason = '', asOf = null, windowDays = null, ...rest }) => ({
    available,
    reason,
    asOf,
    windowDays,
    ...rest,
});

const ageBand = (age) => {
    if (age === null) return '';
    if (age <= 6) return '5-6';
    if (age <= 9) return '7-9';
    if (age <= 12) return '10-12';
    if (age <= 15) return '13-15';
    return '16-18';
};

const percent = (marks, max) => {
    const top = Number(max);
    const value = Number(marks);
    if (!Number.isFinite(top) || top <= 0 || !Number.isFinite(value)) return null;
    return Math.round((value / top) * 1000) / 10;
};

export const scrubRemark = (text, roster, studentName) => (
    scrubForPrompt(String(text || '').slice(0, 600), {
        name: studentName,
        roster,
        placeholder: 'the student',
        rosterPlaceholder: 'someone else',
    }).trim()
);

const rosterFor = async ({ schoolId, caseDoc }) => {
    const classId = caseDoc.class?._id || caseDoc.class;
    const [students, staff, family] = await Promise.all([
        classId
            ? Student.find({ school: schoolId, currentClass: classId })
                .select('firstName lastName')
                .limit(80)
                .lean()
            : [],
        (async () => {
            const User = (await import('../models/User.js')).default;
            const ids = [
                caseDoc.owner, caseDoc.homeroomTeacher, caseDoc.counselor,
                ...(caseDoc.participants || []).map((row) => row.user),
            ].filter(Boolean);
            return ids.length
                ? User.find({ _id: { $in: ids } }).select('firstName lastName').lean()
                : [];
        })(),
        Promise.resolve((caseDoc.familyContacts || []).map((row) => row.name).filter(Boolean)),
    ]);
    return [
        ...students.map(nameOf),
        ...staff.map(nameOf),
        ...family,
    ].filter((row) => row && row.length >= 3);
};

const gradeEvidence = async ({ schoolId, caseDoc, since }) => {
    const subjectIds = (caseDoc.subjects || []).map((row) => row.subject).filter(Boolean);
    if (subjectIds.length === 0) {
        return source({ available: false, reason: 'no_subject_scope' });
    }
    const rows = await Grade.find({
        school: schoolId,
        student: caseDoc.student?._id || caseDoc.student,
        subject: { $in: subjectIds },
        academicYear: caseDoc.academicYear,
        date: { $gte: since },
    })
        .select('subject category marks maxMarks date title remarks')
        .sort({ date: -1 })
        .limit(200)
        .lean();

    const names = new Map((caseDoc.subjects || []).map((row) => [String(row.subject), row.name]));
    const bySubject = new Map();
    for (const row of rows) {
        const key = String(row.subject);
        const entry = bySubject.get(key) || {
            subjectId: key,
            name: names.get(key) || '',
            count: 0,
            total: 0,
            latestAt: null,
            categories: {},
            values: [],
        };
        const ratio = percent(row.marks, row.maxMarks);
        entry.count += 1;
        if (ratio !== null) {
            entry.total += ratio;
            entry.values.push({ at: row.date, percent: ratio, category: row.category || row.gradeType });
        }
        entry.categories[row.category || row.gradeType || 'other'] = (
            entry.categories[row.category || row.gradeType || 'other'] || 0
        ) + 1;
        if (!entry.latestAt || row.date > entry.latestAt) entry.latestAt = row.date;
        bySubject.set(key, entry);
    }

    const subjects = [...bySubject.values()].map((entry) => {
        const values = entry.values;
        const latest = values[0]?.percent ?? null;
        const previous = values[1]?.percent ?? null;
        return {
            subjectId: entry.subjectId,
            name: entry.name,
            records: entry.count,
            averagePercent: values.length ? Math.round((entry.total / values.length) * 10) / 10 : null,
            latestPercent: latest,
            direction: latest !== null && previous !== null
                ? (latest > previous + 2 ? 'up' : latest < previous - 2 ? 'down' : 'steady')
                : 'unknown',
            categories: entry.categories,
            latestAt: entry.latestAt,
        };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (rows.length === 0) {
        return source({ available: true, reason: 'no_record', windowDays: Math.round((Date.now() - since) / DAY), subjects: [] });
    }
    return source({
        available: true,
        windowDays: Math.round((Date.now() - since) / DAY),
        asOf: rows[0].date,
        subjects,
        note: 'Percentages use each record\'s own maximum; raw marks with different maxima are never compared.',
    });
};

const attendanceEvidence = async ({ schoolId, caseDoc, since }) => {
    const studentId = caseDoc.student?._id || caseDoc.student;
    const rows = await Attendance.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(String(schoolId)),
                date: { $gte: since },
                'studentAttendance.student': new mongoose.Types.ObjectId(String(studentId)),
            },
        },
        { $unwind: '$studentAttendance' },
        {
            $match: {
                'studentAttendance.student': new mongoose.Types.ObjectId(String(studentId)),
            },
        },
        { $project: { date: 1, status: '$studentAttendance.status' } },
        { $sort: { date: -1 } },
        { $limit: 120 },
    ]);

    if (rows.length === 0) {
        return source({ available: true, reason: 'no_record', windowDays: Math.round((Date.now() - since) / DAY) });
    }
    const counts = {};
    for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
    const present = counts.present || 0;
    const recorded = rows.length;
    return source({
        available: true,
        windowDays: Math.round((Date.now() - since) / DAY),
        asOf: rows[0].date,
        counts,
        recordedDays: recorded,
        presentShare: recorded ? Math.round((present / recorded) * 1000) / 10 : null,
        note: 'Present share counts recorded attendance entries, not school calendar days.',
    });
};

const behaviorEvidence = async ({ schoolId, caseDoc, since }) => {
    const events = await behaviorEvidenceRows({ schoolId, studentId: caseDoc.student?._id || caseDoc.student, startDate: since });
    const grouped = new Map();
    for (const event of events) {
        const type = event.incidentType || 'formal_case';
        const row = grouped.get(type) || { _id: type, count: 0, latestAt: event.incidentDate };
        row.count += 1;
        grouped.set(type, row);
    }
    const rows = [...grouped.values()].sort((a, b) => b.count - a.count);
    if (rows.length === 0) {
        return source({ available: true, reason: 'no_record', windowDays: Math.round((Date.now() - since) / DAY) });
    }
    return source({
        available: true,
        windowDays: Math.round((Date.now() - since) / DAY),
        asOf: rows.reduce((latest, row) => (!latest || row.latestAt > latest ? row.latestAt : latest), null),
        types: rows.map((row) => ({ type: row._id, count: row.count, latestAt: row.latestAt })),
        note: 'Counts are recorded factual observations, not diagnoses or character labels.',
    });
};

const remarkEvidence = async ({ schoolId, caseDoc, since, roster, studentName }) => {
    const subjectIds = (caseDoc.subjects || []).map((row) => row.subject).filter(Boolean);
    if (subjectIds.length === 0) return source({ available: false, reason: 'no_subject_scope' });
    const rows = await Grade.find({
        school: schoolId,
        student: caseDoc.student?._id || caseDoc.student,
        subject: { $in: subjectIds },
        academicYear: caseDoc.academicYear,
        date: { $gte: since },
        remarks: { $nin: ['', null] },
    })
        .select('remarks date category')
        .sort({ date: -1 })
        .limit(40)
        .lean();
    if (rows.length === 0) return source({ available: true, reason: 'no_record' });
    return source({
        available: true,
        asOf: rows[0].date,
        remarks: rows.slice(0, 10).map((row) => ({
            at: row.date,
            category: row.category || '',
            text: scrubRemark(row.remarks, roster, studentName),
        })),
    });
};

export const collectEvidence = async ({ schoolId, caseDoc, windowDays = 120 }) => {
    const since = new Date(Date.now() - Math.min(Math.max(windowDays, 7), 400) * DAY);
    const studentDoc = caseDoc.student && caseDoc.student.firstName
        ? caseDoc.student
        : await Student.findById(caseDoc.student).select('firstName lastName gender dateOfBirth academicYear').lean();
    const studentName = nameOf(studentDoc);
    const roster = await rosterFor({ schoolId, caseDoc });

    const safely = async (fn) => {
        try {
            return await fn();
        } catch {
            return source({ available: false, reason: 'fetch_failed' });
        }
    };

    const [grades, attendance, behavior, remarks] = await Promise.all([
        safely(() => gradeEvidence({ schoolId, caseDoc, since })),
        safely(() => attendanceEvidence({ schoolId, caseDoc, since })),
        safely(() => behaviorEvidence({ schoolId, caseDoc, since })),
        safely(() => remarkEvidence({ schoolId, caseDoc, since, roster, studentName })),
    ]);

    return {
        windowDays: Math.round((Date.now() - since) / DAY),
        sources: {
            grades,
            attendance,
            behavior,
            remarks,
            // Honest availability: these modules are not wired into support yet.
            map: source({ available: false, reason: 'not_integrated' }),
            reading: source({ available: false, reason: 'not_integrated' }),
        },
        context: {
            gender: ['male', 'female'].includes(String(studentDoc?.gender || '').toLowerCase())
                ? String(studentDoc.gender).toLowerCase()
                : '',
            age: studentAge(studentDoc),
            grade: studentDoc?.currentClass?.grade ?? null,
            academicYear: caseDoc.academicYear,
        },
        roster,
    };
};

/**
 * Strict allowlist for the plan-drafting model. No names, emails, ids, exact
 * birth dates, raw student disclosures or unscrubbed free text ever enter here.
 */
export const buildAiFacts = ({ caseDoc, evidence, reviewPeriod, goalTitles = [], taskOutcomes = [] }) => {
    const context = evidence.context || {};
    const facts = {
        gender: context.gender || '',
        ageBand: ageBand(context.age),
        grade: context.grade,
        academicYear: context.academicYear,
        period: reviewPeriod ? `${reviewPeriod.academicYear} month ${reviewPeriod.month}` : '',
        subjects: (caseDoc.subjects || []).map((row) => row.name || row.subjectName || '').filter(Boolean),
        grades: evidence.sources.grades?.available && evidence.sources.grades.subjects?.length
            ? evidence.sources.grades.subjects.map((row) => ({
                subject: row.name || '',
                averagePercent: row.averagePercent,
                records: row.records,
                direction: row.direction,
                categories: row.categories,
            }))
            : [],
        attendance: evidence.sources.attendance?.available && evidence.sources.attendance.presentShare != null
            ? {
                presentShare: evidence.sources.attendance.presentShare,
                counts: evidence.sources.attendance.counts,
                recordedDays: evidence.sources.attendance.recordedDays,
            }
            : null,
        behavior: evidence.sources.behavior?.available && evidence.sources.behavior.types?.length
            ? evidence.sources.behavior.types.map((row) => ({ type: row.type, count: row.count }))
            : [],
        remarks: (evidence.sources.remarks?.remarks || [])
            .map((row) => String(row.text || '').trim())
            .filter(Boolean)
            .slice(0, 3),
        goals: goalTitles.map((row) => String(row || '').trim()).filter(Boolean).slice(0, 4),
        tasks: taskOutcomes.slice(0, 6).map((row) => ({
            status: ['done', 'need_help', 'did_not_fit'].includes(row.status) ? row.status : 'unknown',
            scope: row.scope === 'home' ? 'home' : 'class',
        })),
        unavailableSources: Object.entries(evidence.sources)
            .filter(([, value]) => !value?.available)
            .map(([key]) => key),
    };
    return facts;
};
