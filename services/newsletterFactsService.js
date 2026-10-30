/**
 * Allowlisted week facts for newsletters.
 *
 * Every collector here returns compact, anonymous facts: counts, short labels and
 * dates. A student's name, email or id never enters the returned object, so the
 * same structure is safe to send to an AI provider and safe to store as a snapshot.
 */

import Grade from "../models/Grade.js";
import LessonPlan from "../models/LessonPlan.js";
import LiveSession from "../models/LiveSession.js";
import ReadingCompletion from "../models/ReadingCompletion.js";
import SpellingSession from "../models/SpellingSession.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingProject from "../models/WritingProject.js";
import { scrubPersonalText } from "./newsletterPrivacy.js";

export const CLASS_SOURCES = ["lessonPlans", "liveLessons"];
export const STUDENT_SOURCES = ["classwork", "reading", "writing", "spelling", "upcomingTest"];
export const DEFAULT_STUDENT_SOURCES = ["classwork", "spelling", "upcomingTest"];

const MAX_LESSONS = 8;
const MAX_LIVE_LESSONS = 6;
const MAX_REMARKS = 3;
const MAX_REMARK_CHARS = 220;
const UPCOMING_HORIZON_DAYS = 21;

const STAGE_WORDS = {
    not_started: "not started",
    drafting: "writing the first draft",
    submitted: "draft submitted",
    feedback_ready: "teacher feedback ready",
    feedback_published: "teacher feedback published",
    revising: "revising",
    compared: "comparing drafts",
    ready_for_notebook: "ready for the notebook",
    awaiting_notebook_check: "notebook awaiting check",
    completed: "finished",
};

const clip = (value, max) => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
};

export function normalizeSources(input, allowed) {
    const requested = Array.isArray(input) ? input : [];
    const picked = requested.filter((source) => allowed.includes(source));
    return Array.from(new Set(picked));
}

function dateRange(periodStart, periodEnd) {
    return { $gte: new Date(periodStart), $lte: new Date(periodEnd) };
}

/* ------------------------------------------------------------------ */
/* Class level: what every family may read                             */
/* ------------------------------------------------------------------ */

/**
 * Lesson plans and live lessons for the selected period, grouped by subject.
 * Only titles, topic labels and short objectives — no student activity at all.
 */
export async function collectClassWeekFacts({ classId, subjectIds = [], periodStart, periodEnd }) {
    const range = dateRange(periodStart, periodEnd);
    const subjectFilter = subjectIds.length ? { subject: { $in: subjectIds } } : {};

    const [plans, sessions] = await Promise.all([
        LessonPlan.find({ class: classId, ...subjectFilter, date: range })
            .select("subject title summary description teachingObjectives vocabulary date")
            .sort({ date: 1 })
            .limit(120)
            .lean(),
        LiveSession.find({
            classId,
            status: "ended",
            $or: [{ startedAt: range }, { scheduledAt: range }],
        })
            .select("lessonId lessonSnapshot startedAt scheduledAt")
            .sort({ startedAt: 1 })
            .limit(60)
            .lean(),
    ]);

    const subjectIdOfLiveSession = (session) => String(session.lessonSnapshot?.subjectId || "");

    const bySubject = new Map();
    const bucket = (subjectId) => {
        const key = String(subjectId || "");
        if (!bySubject.has(key)) bySubject.set(key, { lessons: [], liveLessons: [] });
        return bySubject.get(key);
    };

    for (const plan of plans) {
        const entry = bucket(plan.subject);
        if (entry.lessons.length >= MAX_LESSONS) continue;
        entry.lessons.push({
            title: clip(plan.title, 120),
            topics: clip(plan.teachingObjectives || plan.summary || plan.description, 200),
            homework: clip(plan.homework, 160),
        });
    }

    for (const session of sessions) {
        const subjectId = subjectIdOfLiveSession(session);
        if (subjectIds.length && !subjectIds.map(String).includes(subjectId)) continue;
        const entry = bucket(subjectId);
        if (entry.liveLessons.length >= MAX_LIVE_LESSONS) continue;
        const snapshot = session.lessonSnapshot || {};
        entry.liveLessons.push({
            title: clip(snapshot.title || "Live lesson", 120),
            slides: Array.isArray(snapshot.slides) ? Math.min(snapshot.slides.length, 200) : 0,
        });
    }

    return Array.from(bySubject.entries())
        .filter(([, entry]) => entry.lessons.length || entry.liveLessons.length)
        .map(([subjectId, entry]) => ({
            subjectId,
            lessons: entry.lessons,
            liveLessons: entry.liveLessons,
        }));
}

/* ------------------------------------------------------------------ */
/* Per child: facts only, never identity                               */
/* ------------------------------------------------------------------ */

/**
 * @param {object} input
 * @param {string} input.gender          - "male" | "female" | "other"; the only personal detail allowed
 * @param {object} input.identifiers     - names/emails used only to SCRUB teacher remarks, never returned
 */
export async function collectStudentFacts({
    studentId,
    classId,
    gender,
    periodStart,
    periodEnd,
    sources = DEFAULT_STUDENT_SOURCES,
    identifiers = {},
}) {
    const selected = normalizeSources(sources, STUDENT_SOURCES);
    const range = dateRange(periodStart, periodEnd);
    const facts = { gender: ["male", "female"].includes(gender) ? gender : "unspecified" };

    const tasks = [];

    if (selected.includes("classwork")) {
        tasks.push(
            Grade.find({ student: studentId, class: classId, date: range, category: { $in: ["classwork", "homework", "assignment"] } })
                .select("category title remarks date")
                .sort({ date: -1 })
                .limit(40)
                .lean()
                .then((rows) => {
                    const remarks = rows
                        .filter((row) => String(row.remarks || "").trim())
                        .slice(0, MAX_REMARKS)
                        .map((row) => ({
                            area: row.category || "classwork",
                            text: scrubPersonalText(clip(row.remarks, MAX_REMARK_CHARS), identifiers),
                        }))
                        .filter((row) => row.text);
                    facts.classwork = { recorded: rows.length, remarks };
                })
        );
    }

    if (selected.includes("reading")) {
        tasks.push(
            ReadingCompletion.countDocuments({ student: studentId, completedAt: range }).then((count) => {
                facts.reading = { completed: count };
            })
        );
    }

    if (selected.includes("writing")) {
        tasks.push(
            WritingDraft.find({ student: studentId, submittedAt: range })
                .select("number totalWords project")
                .sort({ submittedAt: -1 })
                .limit(10)
                .lean()
                .then(async (drafts) => {
                    if (!drafts.length) {
                        facts.writing = { draftsSubmitted: 0 };
                        return;
                    }
                    const projectIds = Array.from(new Set(drafts.map((draft) => String(draft.project))));
                    const projects = await WritingProject.find({ _id: { $in: projectIds } })
                        .select("stage draftCount")
                        .lean();
                    facts.writing = {
                        draftsSubmitted: drafts.length,
                        latestDraft: Math.max(...drafts.map((draft) => Number(draft.number) || 0)),
                        stage: STAGE_WORDS[projects[0]?.stage] || "in progress",
                    };
                })
        );
    }

    if (selected.includes("spelling")) {
        tasks.push(
            SpellingSession.find({ student: studentId, status: "completed", completedAt: range })
                .select("mistakeCount correctCount curriculumWeek assessmentType")
                .sort({ completedAt: -1 })
                .limit(20)
                .lean()
                .then((rows) => {
                    facts.spelling = {
                        listsCompleted: rows.length,
                        mistakes: rows.reduce((sum, row) => sum + (Number(row.mistakeCount) || 0), 0),
                        correct: rows.reduce((sum, row) => sum + (Number(row.correctCount) || 0), 0),
                    };
                })
        );
    }

    if (selected.includes("upcomingTest")) {
        const horizon = new Date(periodEnd);
        horizon.setDate(horizon.getDate() + UPCOMING_HORIZON_DAYS);
        tasks.push(
            SpellingSession.find({
                student: studentId,
                status: "scheduled",
                assessmentType: "formal-spelling-test",
                scheduledAt: { $gte: new Date(periodEnd), $lte: horizon },
            })
                .select("scheduledAt")
                .sort({ scheduledAt: 1 })
                .limit(3)
                .lean()
                .then((rows) => {
                    // Date only: the planned word list never leaves the school.
                    facts.upcoming = rows.map((row) => ({
                        kind: "formal spelling test",
                        date: new Date(row.scheduledAt).toISOString().slice(0, 10),
                    }));
                })
        );
    }

    await Promise.all(tasks);
    return facts;
}

/** True when there is nothing worth writing a letter about. */
export function hasEnoughMaterial(facts = {}) {
    const classwork = (facts.classwork?.recorded || 0) + (facts.classwork?.remarks?.length || 0);
    const reading = facts.reading?.completed || 0;
    const writing = facts.writing?.draftsSubmitted || 0;
    const spelling = facts.spelling?.listsCompleted || 0;
    const upcoming = facts.upcoming?.length || 0;
    return classwork + reading + writing + spelling + upcoming > 0;
}
