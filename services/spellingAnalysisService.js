import mongoose from 'mongoose';
import Class from '../models/Class.js';
import SpellingAnalysis from '../models/SpellingAnalysis.js';
import SpellingParentDraft from '../models/SpellingParentDraft.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingWord from '../models/SpellingWord.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import * as ai from './spellingAnalysisAIService.js';
import {
    buildInputHash,
    buildStudentMetrics,
    collectMisspellings,
    compareClasses,
    compareGrades,
    rankAnalyses
} from './spellingAnalysisMetrics.js';
import { isCreditError } from './aiCreditService.js';
import { escapeHtml, paragraph, sanitizeSpellingEmailHtml, wrapSpellingEmail } from '../helpers/spellingEmailLayout.js';
import { ANALYSIS_PROMPT_VERSION, SPELLING_GRADES } from '../utils/spellingAnalysisConfig.js';

const httpError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

export const normalizePeriod = (input = {}) => {
    const raw = typeof input === 'string' ? { key: input } : input;
    if (raw?.kind === 'all' || raw?.key === 'all' || raw?.window === 'all') {
        return { kind: 'all', key: 'all' };
    }
    const key = String(raw?.key || raw?.window || '');
    if (/^\d{4}-\d{2}$/.test(key)) return { kind: 'month', key };
    return { kind: 'month', key: new Date().toISOString().slice(0, 7) };
};

const periodFilter = (period) => ({ 'period.kind': period.kind, 'period.key': period.key });

const gradeFromClass = (schoolClass) => {
    const number = Number(schoolClass?.grade);
    if (!Number.isFinite(number) || number < 1) return null;
    const label = `G${number}`;
    return SPELLING_GRADES.includes(label) ? label : null;
};

const fullName = (student) => [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim();

const sessionsFor = (schoolId, studentId, window) => {
    const query = { school: schoolId, student: studentId };
    const range = window?.kind === 'month' ? window : null;
    if (range) {
        const start = new Date(`${range.key}-01T00:00:00.000Z`);
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
        // History is needed for the monthly trend, so only trim to the window's end.
        query.startedAt = { $lt: end };
    }
    return SpellingSession.find(query)
        .select('status startedAt completedAt attempts correctCount mistakeCount assessmentType curriculumGrade curriculumWeek gradebookClass gradebookAcademicYear')
        .lean();
};

const latestPlacement = async ({ schoolId, student, sessions, window }) => {
    const recent = [...sessions]
        .filter((session) => session.gradebookClass)
        .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt))[0];
    const classId = recent?.gradebookClass || student?.currentClass || null;
    const schoolClass = classId
        ? await Class.findOne({ _id: classId, school: schoolId }).select('name grade academicYear').lean()
        : null;
    const scoped = window?.kind === 'month'
        ? sessions.filter((session) => (
            session.startedAt && new Date(session.startedAt).toISOString().startsWith(window.key)
        ))
        : sessions;
    const gradeCounts = new Map();
    for (const session of scoped) {
        const grade = session.curriculumGrade;
        if (!grade) continue;
        gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);
    }
    const sessionGrade = [...gradeCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
    return {
        classId,
        className: schoolClass?.name || '',
        grade: gradeFromClass(schoolClass) || sessionGrade || null,
        academicYear: recent?.gradebookAcademicYear || schoolClass?.academicYear || null
    };
};

const parentEmailsFor = (student) => {
    const entries = typeof student?.getAllContactEmailEntries === 'function'
        ? student.getAllContactEmailEntries()
        : [];
    return [...new Set(entries
        .filter((entry) => ['father', 'mother', 'guardian'].includes(entry.type))
        .map((entry) => String(entry.email || '').trim().toLowerCase())
        .filter(Boolean))];
};

export const listAnalysisStudents = async ({ schoolId, grade = '', window }) => {
    const period = normalizePeriod(window);
    const match = { school: new mongoose.Types.ObjectId(String(schoolId)), status: 'completed' };
    if (period.kind === 'month') {
        const start = new Date(`${period.key}-01T00:00:00.000Z`);
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
        match.startedAt = { $gte: start, $lt: end };
    }
    const groups = await SpellingSession.aggregate([
        { $match: match },
        { $sort: { startedAt: 1 } },
        {
            $group: {
                _id: '$student',
                attempts: { $sum: { $size: { $ifNull: ['$attempts', []] } } },
                grade: { $last: '$curriculumGrade' },
                gradebookClass: { $last: '$gradebookClass' },
                gradebookAcademicYear: { $last: '$gradebookAcademicYear' },
                lastSessionAt: { $last: '$startedAt' }
            }
        }
    ]);
    if (!groups.length) return { period, students: [], grades: [] };

    const studentIds = groups.map((group) => group._id);
    const [students, analyses] = await Promise.all([
        Student.find({ school: schoolId, _id: { $in: studentIds } }).select('firstName lastName currentClass isActive').lean(),
        SpellingAnalysis.find({ school: schoolId, student: { $in: studentIds }, ...periodFilter(period) }).lean()
    ]);
    const classIds = [...new Set([
        ...students.map((student) => student.currentClass).filter(Boolean).map(String),
        ...groups.map((group) => group.gradebookClass).filter(Boolean).map(String)
    ])];
    const classes = classIds.length
        ? await Class.find({ school: schoolId, _id: { $in: classIds } }).select('name grade academicYear').lean()
        : [];
    const classById = new Map(classes.map((row) => [String(row._id), row]));
    const analysisByStudent = new Map(analyses.map((row) => [String(row.student), row]));
    const studentById = new Map(students.map((row) => [String(row._id), row]));

    const rows = groups.map((group) => {
        const student = studentById.get(String(group._id));
        if (!student) return null;
        const schoolClass = classById.get(String(student.currentClass || group.gradebookClass || ''));
        const analysis = analysisByStudent.get(String(group._id));
        const attempts = group.attempts || 0;
        const stale = Boolean(analysis) && (
            (analysis.metrics?.attempts || 0) !== attempts
            || (analysis.updatedAt && group.lastSessionAt && new Date(group.lastSessionAt) > new Date(analysis.updatedAt))
        );
        return {
            studentId: String(group._id),
            studentName: fullName(student),
            grade: gradeFromClass(schoolClass) || group.grade || '',
            classId: schoolClass ? String(schoolClass._id) : '',
            className: schoolClass?.name || '',
            academicYear: group.gradebookAcademicYear || schoolClass?.academicYear || '',
            attempts,
            lastSessionAt: group.lastSessionAt || null,
            analysis: analysis ? {
                status: analysis.status,
                accuracy: analysis.metrics?.accuracy || 0,
                recoveryRate: analysis.metrics?.recoveryRate || 0,
                generatedAt: analysis.updatedAt || null,
                stale
            } : null
        };
    }).filter(Boolean);

    const filtered = grade ? rows.filter((row) => row.grade === grade) : rows;
    filtered.sort((left, right) => left.studentName.localeCompare(right.studentName));
    const grades = [...new Set(rows.map((row) => row.grade).filter(Boolean))]
        .sort((left, right) => SPELLING_GRADES.indexOf(left) - SPELLING_GRADES.indexOf(right));
    return { period, students: filtered, grades };
};

export const runStudentAnalysis = async ({
    schoolId,
    studentId,
    window,
    userId,
    language = 'en',
    force = false
}) => {
    const period = normalizePeriod(window);
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('firstName lastName currentClass')
        .lean();
    if (!student) throw httpError('Student not found', 404, 'SPELLING_ANALYSIS_STUDENT_NOT_FOUND');

    const sessions = await sessionsFor(schoolId, studentId, period);
    const retests = await SpellingRetestItem.find({ school: schoolId, student: studentId })
        .select('wordSnapshot flaggedAt dueAt status resolvedAt correctRetestStreak incorrectRetestCount')
        .lean();
    const metrics = buildStudentMetrics({ sessions, retests, window: period });
    if (!metrics.attempts && !metrics.flagged) {
        throw httpError('No spelling data for this student in the selected period', 422, 'SPELLING_ANALYSIS_NO_DATA');
    }

    const wordIds = [...new Set(sessions.flatMap((session) => (
        (session.attempts || []).map((attempt) => String(attempt.wordId || ''))
    )).filter(Boolean))];
    const words = wordIds.length
        ? await SpellingWord.find({ _id: { $in: wordIds } }).select('normalizedWord word').lean()
        : [];
    const wordsById = new Map(words.map((word) => [String(word._id), word]));
    const misspellings = collectMisspellings({ sessions, wordsById, window: period });
    const inputHash = buildInputHash({ metrics, misspellings });
    const placement = await latestPlacement({ schoolId, student, sessions, window: period });
    const studentName = fullName(student);

    const existing = await SpellingAnalysis.findOne({
        school: schoolId,
        student: studentId,
        ...periodFilter(period)
    }).lean();
    if (!force && existing?.status === 'ready' && existing.ai?.inputHash === inputHash) {
        return { cached: true, analysis: existing };
    }

    let aiFields = { errorTypes: [], strengths: [], gaps: [], recommendation: '', narrative: '' };
    let aiMeta = { modelName: '', promptVersion: ANALYSIS_PROMPT_VERSION, entryId: '', chargedCents: 0, error: '' };
    let status = 'ready';
    if (metrics.incorrect > 0) {
        try {
            const result = await ai.analyzeStudent({
                metrics,
                misspellings,
                language,
                billing: { schoolId, userId },
                context: {
                    studentId,
                    studentName,
                    grade: placement.grade,
                    periodKey: period.key
                }
            });
            if (!result.ok) throw new Error(result.error || 'The AI reply was unusable.');
            aiFields = result.fields;
            aiMeta = { ...aiMeta, ...result.meta };
        } catch (error) {
            if (isCreditError(error)) throw error;
            status = 'failed';
            aiMeta.error = String(error?.message || 'Analysis failed').slice(0, 500);
        }
    }

    const saved = await SpellingAnalysis.findOneAndUpdate(
        { school: schoolId, student: studentId, ...periodFilter(period) },
        {
            $set: {
                studentName,
                class: placement.classId || null,
                className: placement.className,
                academicYear: placement.academicYear,
                grade: placement.grade,
                metrics: { ...metrics, errorTypes: aiFields.errorTypes },
                strengths: aiFields.strengths,
                gaps: aiFields.gaps,
                recommendation: aiFields.recommendation,
                narrative: aiFields.narrative,
                ai: { ...aiMeta, inputHash },
                status,
                generatedBy: userId || null
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return { cached: false, analysis: saved };
};

export const getStudentAnalysis = async ({ schoolId, studentId, window }) => {
    const period = normalizePeriod(window);
    const [studentDoc, analysis, draft] = await Promise.all([
        Student.findOne({ _id: studentId, school: schoolId })
            .select('firstName lastName currentClass parentInfo'),
        SpellingAnalysis.findOne({ school: schoolId, student: studentId, ...periodFilter(period) }).lean(),
        SpellingParentDraft.findOne({ school: schoolId, student: studentId, ...periodFilter(period) }).lean()
    ]);
    if (!studentDoc) throw httpError('Student not found', 404, 'SPELLING_ANALYSIS_STUDENT_NOT_FOUND');
    const parentEmails = parentEmailsFor(studentDoc);
    return {
        period,
        student: {
            studentId: String(studentDoc._id),
            studentName: fullName(studentDoc),
            currentClass: studentDoc.currentClass ? String(studentDoc.currentClass) : ''
        },
        parentEmailCount: parentEmails.length,
        analysis: analysis || null,
        draft: draft || null
    };
};

export const buildCohort = async ({ schoolId, grade = '', window }) => {
    const period = normalizePeriod(window);
    const base = { school: schoolId, ...periodFilter(period), status: 'ready' };
    const [gradeAnalyses, schoolAnalyses] = await Promise.all([
        grade ? SpellingAnalysis.find({ ...base, grade }).lean() : SpellingAnalysis.find(base).lean(),
        grade ? SpellingAnalysis.find(base).select('grade status metrics').lean() : null
    ]);
    return {
        period,
        grade,
        analyzed: gradeAnalyses.length,
        ranking: rankAnalyses(gradeAnalyses),
        classes: compareClasses(gradeAnalyses),
        grades: compareGrades(schoolAnalyses || gradeAnalyses)
    };
};

export const explainCohort = async ({ schoolId, grade = '', window, userId, language = 'en' }) => {
    const cohort = await buildCohort({ schoolId, grade, window });
    if (!cohort.ranking.ranked.length) {
        throw httpError('Run the analysis for at least one student first', 409, 'SPELLING_ANALYSIS_EMPTY');
    }
    const period = cohort.period;
    const result = await ai.cohortNarrative({
        grade: grade || '',
        rows: cohort.ranking.ranked,
        classes: cohort.classes,
        language,
        billing: { schoolId, userId },
        context: { periodKey: period.key }
    });
    if (!result.ok) throw httpError(result.error || 'The AI reply was unusable', 502, 'SPELLING_ANALYSIS_AI_FAILED');
    return { text: result.text, meta: result.meta };
};

export const createParentDraft = async ({ schoolId, studentId, window, language = 'en', userId }) => {
    const period = normalizePeriod(window);
    const analysis = await SpellingAnalysis.findOne({
        school: schoolId,
        student: studentId,
        ...periodFilter(period),
        status: 'ready'
    }).lean();
    if (!analysis) throw httpError('Run the spelling analysis for this student first', 409, 'SPELLING_ANALYSIS_REQUIRED');

    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('firstName lastName parentInfo studentEmail email');
    if (!student) throw httpError('Student not found', 404, 'SPELLING_ANALYSIS_STUDENT_NOT_FOUND');
    const parentEmails = parentEmailsFor(student);
    if (!parentEmails.length) {
        throw httpError('No parent email addresses are on file for this student', 422, 'SPELLING_ANALYSIS_NO_PARENTS');
    }

    const author = userId
        ? await User.findById(userId).select('firstName lastName').lean()
        : null;
    const teacherName = [author?.firstName, author?.lastName].filter(Boolean).join(' ').trim();

    const result = await ai.draftParentEmail({
        studentFirstName: student.firstName || '',
        grade: analysis.grade || '',
        metrics: analysis.metrics || {},
        analysis,
        language,
        teacherName,
        billing: { schoolId, userId },
        context: { studentId, studentName: analysis.studentName, periodKey: period.key }
    });
    if (!result.ok) throw httpError(result.error || 'The AI reply was unusable', 502, 'SPELLING_ANALYSIS_AI_FAILED');

    const draft = await SpellingParentDraft.findOneAndUpdate(
        { school: schoolId, student: studentId, ...periodFilter(period) },
        {
            $set: {
                studentName: analysis.studentName,
                analysis: analysis._id,
                grade: analysis.grade || null,
                language,
                subject: result.fields.subject,
                body: result.fields.body,
                status: 'draft',
                recipients: parentEmails,
                generatedBy: userId || null,
                ai: {
                    modelName: result.meta.modelName,
                    entryId: result.meta.entryId,
                    chargedCents: result.meta.chargedCents
                },
                sentAt: null,
                sentBy: null
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return draft;
};

export const updateParentDraft = async ({ schoolId, draftId, subject, body }) => {
    const draft = await SpellingParentDraft.findOne({ _id: draftId, school: schoolId });
    if (!draft) throw httpError('Draft not found', 404, 'SPELLING_ANALYSIS_DRAFT_NOT_FOUND');
    if (draft.status === 'sent') throw httpError('This email was already sent', 409, 'SPELLING_ANALYSIS_DRAFT_SENT');
    if (typeof subject === 'string' && subject.trim()) draft.subject = subject.trim().slice(0, 200);
    if (typeof body === 'string' && body.trim()) draft.body = body.trim().slice(0, 6000);
    await draft.save();
    return draft.toObject();
};

export const sendParentDraft = async ({ schoolId, draftId, userId }) => {
    const draft = await SpellingParentDraft.findOne({ _id: draftId, school: schoolId });
    if (!draft) throw httpError('Draft not found', 404, 'SPELLING_ANALYSIS_DRAFT_NOT_FOUND');
    if (draft.status === 'sent') throw httpError('This email was already sent', 409, 'SPELLING_ANALYSIS_DRAFT_SENT');

    const student = await Student.findOne({ _id: draft.student, school: schoolId })
        .select('firstName lastName parentInfo studentEmail email');
    const recipients = student ? parentEmailsFor(student) : [];
    if (!recipients.length) {
        throw httpError('No parent email addresses are on file for this student', 422, 'SPELLING_ANALYSIS_NO_PARENTS');
    }

    const bodyHtml = String(draft.body || '')
        .split(/\n{2,}/)
        .map((text) => paragraph(escapeHtml(text.trim()).replace(/\n/g, '<br>')))
        .join('');
    const html = sanitizeSpellingEmailHtml(wrapSpellingEmail({
        eyebrow: student?.firstName ? `${student.firstName} — spelling support` : 'Spelling support',
        title: draft.subject,
        bodyHtml,
        footer: 'Sent by your school. Reply to this email to reach the teacher.'
    }));

    try {
        await sendTransactionalEmail({
            to: recipients,
            subject: draft.subject,
            text: draft.body,
            html,
            schoolId,
            preferredUserId: userId || null
        });
    } catch (error) {
        throw httpError(`Email could not be sent: ${error?.message || 'unknown error'}`, 502, 'SPELLING_ANALYSIS_SEND_FAILED');
    }

    draft.status = 'sent';
    draft.sentAt = new Date();
    draft.sentBy = userId || null;
    draft.recipients = recipients;
    await draft.save();
    return draft.toObject();
};
