/**
 * Teacher-facing reading-aloud reports. Everything here reads the per-part
 * progress rows and the scored attempts; no audio exists to replay.
 */
import ReadingAssignment from '../../models/ReadingAssignment.js';
import ReadingFluencyAttempt from '../../models/ReadingFluencyAttempt.js';
import ReadingFluencyProgress from '../../models/ReadingFluencyProgress.js';
import Student from '../../models/Student.js';
import {
    buildLevelsForTextDocument,
    looksLikeListPart,
    readingBlocksFor,
    readingTextHash
} from '../../utils/readingBlocks.js';
import { mergeFluencySettings } from './settings.js';

const STATUS_RANK = {
    needs_support: 0,
    not_started: 1,
    on_track: 2,
    goal_met: 3
};

const fail = (message, statusCode = 404, code = 'FLUENCY_REPORT_NOT_FOUND') => Object.assign(
    new Error(message),
    { statusCode, code }
);

const round1 = (value) => Math.round(Number(value) * 10) / 10;
const roundInt = (value) => Math.round(Number(value));

const average = (values) => {
    const numbers = values.filter((value) => Number.isFinite(value));
    if (!numbers.length) return null;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
};

const roundedAverage = (values, round = roundInt) => {
    const value = average(values);
    return value === null ? null : round(value);
};

const fullName = (student) => [student?.firstName, student?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

const loadReportAssignment = async ({ schoolId, assignmentId }) => {
    const assignment = await ReadingAssignment.findOne({ _id: assignmentId, school: schoolId })
        .populate(
            'text',
            'title language originalText originalComplexity sections simplifiedVersions'
        )
        .populate('class', 'name')
        .populate('assignedBy', 'firstName lastName')
        .lean();
    if (!assignment) throw fail('Reading assignment not found.');
    if (!assignment.text) {
        throw fail('The reading for this assignment is no longer available.', 409, 'FLUENCY_TEXT_NOT_FOUND');
    }
    const settings = mergeFluencySettings(assignment.fluency);
    return {
        assignment,
        settings,
        levels: buildLevelsForTextDocument(assignment.text)
    };
};

const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

/** One row per enabled part. Titles come from the block at any level. */
const reportParts = ({ levels, settings }) => settings.parts.map((part) => {
    const matches = [];
    for (const level of levels) {
        const block = readingBlocksFor(level).find((item) => item.key === part.key);
        if (block) matches.push({ level: level.targetLevel ?? null, block });
    }
    const preferred = part.level === null || part.level === undefined
        ? matches[0]
        : matches.find((item) => item.level === part.level);
    const block = preferred?.block || matches[0]?.block || null;
    const wordCounts = matches.map((item) => countWords(item.block.text));
    return {
        key: part.key,
        title: block?.title || '',
        level: part.level ?? null,
        available: Boolean(block),
        isList: matches.some((item) => looksLikeListPart(item.block)),
        wordCount: wordCounts.length ? Math.max(...wordCounts) : 0
    };
});

const progressByKey = (rows) => new Map(rows.map((row) => [row.blockKey, row]));

const shapePartProgress = (progress) => ({
    readings: Number(progress?.readings) || 0,
    attempts: Number(progress?.attempts) || 0,
    firstAccuracy: progress?.first?.accuracy ?? null,
    latestAccuracy: progress?.latest?.accuracy ?? null,
    bestAccuracy: progress?.best?.accuracy ?? null,
    firstWpm: progress?.first?.wpm ?? null,
    latestWpm: progress?.latest?.wpm ?? null,
    goalMet: Boolean(progress?.goalMet),
    lastPractised: progress?.latest?.at || null
});

const sortStudents = (students) => students.sort((left, right) => {
    const rank = STATUS_RANK[left.status] - STATUS_RANK[right.status];
    if (rank) return rank;
    return fullName(left).localeCompare(fullName(right), undefined, { sensitivity: 'base' });
});

const statusFor = ({ readings, counted, goalMetAll, latestAccuracy, lastThree }) => {
    if (!readings) return 'not_started';
    if (goalMetAll) return 'goal_met';
    if (counted >= 2) {
        const noImprovement = counted >= 3
            && lastThree.length >= 3
            && Number.isFinite(lastThree[lastThree.length - 1]?.accuracy)
            && Number.isFinite(lastThree[0]?.accuracy)
            && lastThree[lastThree.length - 1].accuracy <= lastThree[0].accuracy;
        if ((Number.isFinite(latestAccuracy) && latestAccuracy < 90) || noImprovement) {
            return 'needs_support';
        }
    }
    return 'on_track';
};

const countedAttemptsOf = (attempts) => attempts
    .filter((attempt) => attempt.status === 'scored' && attempt.counted)
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));

const latestAtByPart = (attempts) => {
    const map = new Map();
    for (const attempt of attempts) {
        const current = map.get(attempt.blockKey);
        if (!current || new Date(attempt.createdAt) > new Date(current)) {
            map.set(attempt.blockKey, attempt.createdAt);
        }
    }
    return map;
};

const buildStudentRow = ({ student, assigned, parts, progressRows, attempts }) => {
    const byKey = progressByKey(progressRows);
    const counted = countedAttemptsOf(attempts);
    const first = counted[0] || null;
    const latest = counted[counted.length - 1] || null;
    const lastThree = counted.slice(-3);
    const lastPractised = attempts.reduce((latestAt, attempt) => {
        const at = attempt.createdAt ? new Date(attempt.createdAt) : null;
        return at && (!latestAt || at > latestAt) ? at : latestAt;
    }, null);
    const latestAt = latestAtByPart(attempts);

    const partRows = parts.map((part) => {
        const progress = byKey.get(part.key);
        return {
            key: part.key,
            ...shapePartProgress(progress),
            lastPractised: latestAt.get(part.key) || progress?.latest?.at || null
        };
    });

    const readings = progressRows.reduce((sum, row) => sum + (Number(row.readings) || 0), 0);
    const partsStarted = partRows.filter((part) => part.readings > 0).length;
    const goalMetAll = parts.length > 0
        && parts.every((part) => Boolean(byKey.get(part.key)?.goalMet));
    const firstAccuracy = first?.accuracy ?? null;
    const latestAccuracy = latest?.accuracy ?? null;
    const accuracyChange = Number.isFinite(firstAccuracy) && Number.isFinite(latestAccuracy)
        ? roundInt(latestAccuracy - firstAccuracy)
        : null;
    const firstWpm = first?.wpm ?? null;
    const latestWpm = latest?.wpm ?? null;
    const wpmChange = Number.isFinite(firstWpm) && Number.isFinite(latestWpm)
        ? roundInt(latestWpm - firstWpm)
        : null;

    return {
        _id: student._id,
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        name: fullName(student),
        assigned,
        status: statusFor({
            readings,
            counted: counted.length,
            goalMetAll,
            latestAccuracy,
            lastThree
        }),
        readings,
        attempts: progressRows.reduce((sum, row) => sum + (Number(row.attempts) || 0), 0),
        partsStarted,
        partsTotal: parts.length,
        goalMetParts: partRows.filter((part) => part.goalMet).length,
        firstAccuracy,
        latestAccuracy,
        accuracyChange,
        firstWpm,
        latestWpm,
        wpmChange,
        lastPractised,
        parts: partRows
    };
};

const assignmentMeta = (assignment, settings) => ({
    _id: assignment._id,
    textId: assignment.text?._id ? String(assignment.text._id) : '',
    title: assignment.text?.title || '',
    className: assignment.class?.name || '',
    dueDate: assignment.dueDate || null,
    isActive: assignment.isActive !== false,
    assignedBy: [assignment.assignedBy?.firstName, assignment.assignedBy?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim(),
    settings: {
        minReadings: settings.minReadings,
        maxReadingsPerPart: settings.maxReadingsPerPart,
        targetAccuracy: settings.targetAccuracy,
        targetWpm: settings.targetWpm,
        showPace: settings.showPace,
        requireListenFirst: settings.requireListenFirst
    }
});

/** Class table: roster + any student who practised before moving class. */
export async function getFluencyClassReport({ schoolId, assignmentId }) {
    const { assignment, settings, levels } = await loadReportAssignment({ schoolId, assignmentId });
    const parts = reportParts({ levels, settings });
    const meta = assignmentMeta(assignment, settings);
    if (!settings.enabled) {
        return {
            enabled: false,
            assignment: meta,
            parts,
            students: [],
            totals: {
                assigned: 0,
                started: 0,
                goalMet: 0,
                averageReadingsPerPart: 0,
                averageAccuracy: null,
                averageAccuracyChange: null
            }
        };
    }

    const rosterIds = (assignment.students || []).map(String);
    const [progressRows, attemptRows] = await Promise.all([
        ReadingFluencyProgress.find({ school: schoolId, assignment: assignment._id })
            .select('student blockKey readings attempts first best latest goalMet')
            .lean(),
        ReadingFluencyAttempt.find({ school: schoolId, assignment: assignment._id })
            .select('student blockKey status counted accuracy wpm createdAt')
            .lean()
    ]);

    const activityIds = new Set([
        ...progressRows.map((row) => String(row.student)),
        ...attemptRows.map((row) => String(row.student))
    ]);
    const lookupIds = [...new Set([...rosterIds, ...activityIds])];
    const roster = await Student.find({ school: schoolId, _id: { $in: lookupIds } })
        .select('_id firstName lastName')
        .lean();
    const studentById = new Map(roster.map((student) => [String(student._id), student]));

    const progressByStudent = new Map();
    for (const row of progressRows) {
        const key = String(row.student);
        const list = progressByStudent.get(key) || [];
        list.push(row);
        progressByStudent.set(key, list);
    }
    const attemptsByStudent = new Map();
    for (const row of attemptRows) {
        const key = String(row.student);
        const list = attemptsByStudent.get(key) || [];
        list.push(row);
        attemptsByStudent.set(key, list);
    }

    const enabledKeys = new Set(settings.parts.map((part) => part.key));
    const students = lookupIds
        .filter((id) => studentById.has(id))
        .map((id) => buildStudentRow({
            student: studentById.get(id),
            assigned: rosterIds.includes(id),
            parts,
            progressRows: (progressByStudent.get(id) || [])
                .filter((row) => enabledKeys.has(row.blockKey)),
            attempts: (attemptsByStudent.get(id) || [])
                .filter((row) => enabledKeys.has(row.blockKey))
        }));

    sortStudents(students);

    const assignedStudents = students.filter((student) => student.assigned);
    const started = assignedStudents.filter((student) => student.attempts > 0);
    const readings = assignedStudents.reduce((sum, student) => sum + student.readings, 0);
    const practisedParts = assignedStudents.reduce(
        (sum, student) => sum + student.partsStarted,
        0
    );

    return {
        enabled: true,
        assignment: meta,
        parts,
        students,
        totals: {
            assigned: assignedStudents.length,
            started: started.length,
            goalMet: assignedStudents.filter((student) => student.status === 'goal_met').length,
            averageReadingsPerPart: practisedParts ? round1(readings / practisedParts) : 0,
            averageAccuracy: roundedAverage(started.map((student) => student.latestAccuracy)),
            averageAccuracyChange: roundedAverage(started.map((student) => student.accuracyChange))
        }
    };
}

/** Class-wide words students missed most, from each part's focus words. */
export async function getFluencyHardWords({ schoolId, assignmentId }) {
    const { assignment, settings } = await loadReportAssignment({ schoolId, assignmentId });
    if (!settings.enabled) return { words: [] };
    const enabledKeys = new Set(settings.parts.map((part) => part.key));
    const rows = await ReadingFluencyProgress.find({
        school: schoolId,
        assignment: assignment._id,
        blockKey: { $in: [...enabledKeys] }
    })
        .select('student blockKey focusWords')
        .lean();

    const byWord = new Map();
    for (const row of rows) {
        for (const item of row.focusWords || []) {
            const word = String(item.word || '').trim();
            if (!word) continue;
            const entry = byWord.get(word.toLocaleLowerCase()) || {
                word,
                misses: 0,
                students: new Set()
            };
            entry.misses += Number(item.misses) || 1;
            entry.students.add(String(row.student));
            byWord.set(word.toLocaleLowerCase(), entry);
        }
    }

    return {
        words: [...byWord.values()]
            .map((entry) => ({
                word: entry.word,
                misses: entry.misses,
                students: entry.students.size
            }))
            .sort((left, right) => right.misses - left.misses
                || left.word.localeCompare(right.word, undefined, { sensitivity: 'base' }))
            .slice(0, 20)
    };
}

const resolvePartBlock = ({ levels, part, attemptLevel }) => {
    const preferredLevel = part.level ?? attemptLevel;
    const level = (preferredLevel !== null && preferredLevel !== undefined
        ? levels.find((item) => item.targetLevel === preferredLevel)
        : null) || levels[0];
    if (!level) return null;
    const block = readingBlocksFor(level).find((item) => item.key === part.key);
    if (!block) return null;
    return {
        level: level.targetLevel ?? null,
        block,
        textHash: readingTextHash({
            targetLevel: level.targetLevel,
            blockKey: part.key,
            text: block.text
        })
    };
};

const teacherAttempt = (attempt, currentHash) => ({
    id: String(attempt._id || ''),
    attemptNumber: Number(attempt.attemptNumber) || 1,
    status: attempt.status,
    notHeardReason: attempt.notHeardReason || null,
    counted: Boolean(attempt.counted),
    accuracy: Number(attempt.accuracy) || 0,
    completion: Number(attempt.completion) || 0,
    wpm: attempt.wpm ?? null,
    wordsAttempted: Number(attempt.wordsAttempted) || 0,
    wordsCorrect: Number(attempt.wordsCorrect) || 0,
    errors: Number(attempt.errors) || 0,
    selfCorrections: Number(attempt.selfCorrections) || 0,
    longPauses: Number(attempt.longPauses) || 0,
    longestPauseSec: Number(attempt.longestPauseSec) || 0,
    statusMap: String(attempt.statusMap || ''),
    issues: (attempt.issues || []).map((issue) => ({
        i: Number(issue.i),
        heard: String(issue.heard || '')
    })),
    pauses: (attempt.pauses || []).map((pause) => ({
        after: pause.after ?? null,
        sec: Number(pause.sec) || 0
    })),
    recordedSec: Number(attempt.recordedSec) || 0,
    createdAt: attempt.createdAt || null,
    textChanged: Boolean(attempt.textHash && currentHash && attempt.textHash !== currentHash)
});

/** One student's attempts per part, with the block text for marked reading. */
export async function getFluencyStudentReport({ schoolId, assignmentId, studentId }) {
    const { assignment, settings, levels } = await loadReportAssignment({ schoolId, assignmentId });
    const student = await Student.findOne({ school: schoolId, _id: studentId })
        .select('_id firstName lastName')
        .lean();
    if (!student) throw fail('Student not found.');

    const [progressRows, attempts] = await Promise.all([
        ReadingFluencyProgress.find({
            school: schoolId,
            assignment: assignment._id,
            student: student._id
        }).lean(),
        ReadingFluencyAttempt.find({
            school: schoolId,
            assignment: assignment._id,
            student: student._id
        }).sort({ createdAt: 1 }).lean()
    ]);

    const rosterIds = (assignment.students || []).map(String);
    const isEnrolled = rosterIds.includes(String(student._id));
    if (!isEnrolled && progressRows.length === 0 && attempts.length === 0) {
        throw fail('This student is not part of this assignment.');
    }

    const settingsByKey = new Map(settings.parts.map((part) => [part.key, part]));
    const enabledKeys = new Set(settingsByKey.keys());
    const activityKeys = new Set([
        ...progressRows.map((row) => row.blockKey),
        ...attempts.map((row) => row.blockKey)
    ]);
    const keys = [...new Set([...settingsByKey.keys(), ...activityKeys])];
    const attemptLevelByKey = new Map();
    for (const attempt of attempts) {
        if (attempt.level !== null && attempt.level !== undefined) {
            attemptLevelByKey.set(attempt.blockKey, attempt.level);
        }
    }

    const parts = keys.map((key) => {
        const definition = settingsByKey.get(key) || { key, level: null };
        const resolved = resolvePartBlock({
            levels,
            part: definition,
            attemptLevel: attemptLevelByKey.get(key)
        });
        const progress = progressRows.find((row) => row.blockKey === key);
        const partAttempts = attempts
            .filter((attempt) => attempt.blockKey === key)
            .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
        return {
            key,
            enabled: settingsByKey.has(key),
            title: resolved?.block.title || '',
            level: resolved?.level ?? null,
            text: resolved?.block.text || '',
            wordCount: resolved ? countWords(resolved.block.text) : 0,
            textHash: resolved?.textHash || '',
            progress: shapePartProgress(progress),
            attempts: partAttempts.map((attempt) => teacherAttempt(attempt, resolved?.textHash))
        };
    });

    const progressByPart = new Map(progressRows.map((row) => [row.blockKey, row]));
    const enabledProgress = progressRows.filter((row) => enabledKeys.has(row.blockKey));
    const enabledAttempts = attempts.filter((attempt) => enabledKeys.has(attempt.blockKey));
    const counted = countedAttemptsOf(enabledAttempts);
    const latest = counted[counted.length - 1] || null;
    const first = counted[0] || null;
    const readings = enabledProgress.reduce((sum, row) => sum + (Number(row.readings) || 0), 0);
    const enabledParts = parts.filter((part) => part.enabled);
    const goalMetAll = enabledParts.length > 0
        && enabledParts.every((part) => progressByPart.get(part.key)?.goalMet);
    const status = statusFor({
        readings,
        counted: counted.length,
        goalMetAll,
        latestAccuracy: latest?.accuracy ?? null,
        lastThree: counted.slice(-3)
    });

    const focusWords = new Map();
    for (const row of enabledProgress) {
        for (const item of row.focusWords || []) {
            const word = String(item.word || '').trim();
            if (!word) continue;
            const entry = focusWords.get(word.toLocaleLowerCase()) || {
                word,
                misses: 0
            };
            entry.misses += Number(item.misses) || 1;
            focusWords.set(word.toLocaleLowerCase(), entry);
        }
    }

    return {
        assignment: assignmentMeta(assignment, settings),
        student: {
            _id: student._id,
            firstName: student.firstName || '',
            lastName: student.lastName || '',
            name: fullName(student),
            assigned: isEnrolled,
            status
        },
        parts,
        focusWords: [...focusWords.values()]
            .sort((left, right) => right.misses - left.misses
                || left.word.localeCompare(right.word, undefined, { sensitivity: 'base' }))
            .slice(0, 12),
        totals: {
            readings,
            firstAccuracy: first?.accuracy ?? null,
            latestAccuracy: latest?.accuracy ?? null,
            firstWpm: first?.wpm ?? null,
            latestWpm: latest?.wpm ?? null,
            lastPractised: enabledAttempts.reduce((latestAt, attempt) => {
                const at = attempt.createdAt ? new Date(attempt.createdAt) : null;
                return at && (!latestAt || at > latestAt) ? at : latestAt;
            }, null)
        }
    };
}

const csvCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
};

const csvLine = (cells) => cells.map(csvCell).join(',');

const FALLBACK_FILENAME = 'reading-fluency.csv';

/** Header values are Latin-1, so an Arabic title cannot be the plain filename. */
const asciiFilename = (title) => {
    const base = String(title || '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return base ? `${base}.csv` : FALLBACK_FILENAME;
};

const utf8Filename = (title) => {
    const base = String(title || '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f"'*/\\]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
    return base ? `${base}.csv` : FALLBACK_FILENAME;
};

/** RFC 5987 leaves `'`, `(`, `)` and `*` unescaped, and ext-value forbids them. */
const rfc5987 = (value) => encodeURIComponent(value)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

export const csvContentDisposition = (filename, filenameUtf8) => {
    const ascii = String(filename || '').replace(/[^a-z0-9.\-_]/gi, '') || FALLBACK_FILENAME;
    return `attachment; filename="${ascii}"; filename*=UTF-8''${rfc5987(filenameUtf8 || ascii)}`;
};

/** One row per student and part; the column set mirrors the plan. */
export async function exportFluencyCsv({ schoolId, assignmentId }) {
    const report = await getFluencyClassReport({ schoolId, assignmentId });
    if (!report.enabled) {
        throw fail('Reading aloud is not turned on for this assignment.', 409, 'FLUENCY_DISABLED');
    }
    const students = await Student.find({
        school: schoolId,
        _id: { $in: report.students.map((student) => student._id) }
    }).select('_id firstName lastName').lean();
    const nameById = new Map(students.map((student) => [String(student._id), fullName(student)]));

    const header = [
        'Student',
        'Class',
        'Part',
        'Readings',
        'First accuracy',
        'Latest accuracy',
        'Best accuracy',
        'First pace (wpm)',
        'Latest pace (wpm)',
        'Long pauses (latest)',
        'Goal met',
        'Last practised'
    ];

    const attempts = await ReadingFluencyAttempt.find({
        school: schoolId,
        assignment: assignmentId,
        student: { $in: report.students.map((student) => student._id) },
        status: 'scored',
        counted: true
    })
        .select('student blockKey longPauses createdAt')
        .sort({ createdAt: 1 })
        .lean();
    const latestPauses = new Map();
    for (const attempt of attempts) {
        latestPauses.set(`${attempt.student}|${attempt.blockKey}`, Number(attempt.longPauses) || 0);
    }

    const lines = [csvLine(header)];
    for (const student of report.students) {
        for (const part of student.parts) {
            const definition = report.parts.find((item) => item.key === part.key);
            lines.push(csvLine([
                nameById.get(String(student._id)) || student.name,
                report.assignment.className,
                definition?.title || part.key,
                part.readings,
                part.firstAccuracy ?? '',
                part.latestAccuracy ?? '',
                part.bestAccuracy ?? '',
                part.firstWpm ?? '',
                part.latestWpm ?? '',
                latestPauses.get(`${student._id}|${part.key}`) ?? '',
                part.goalMet ? 'Yes' : 'No',
                part.lastPractised ? new Date(part.lastPractised).toISOString() : ''
            ]));
        }
    }

    return {
        filename: asciiFilename(report.assignment.title),
        filenameUtf8: utf8Filename(report.assignment.title),
        csv: `\uFEFF${lines.join('\r\n')}\r\n`
    };
}
