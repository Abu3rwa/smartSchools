import { CELL_STATUS, MIN_CONFIDENT_CELL } from './scheduleImportConstants.js';

const normalizeLabel = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeCode = (value) => String(value || '').replace(/[^a-z0-9]+/gi, '').toUpperCase();

const stripGradeSuffix = (value) => String(value || '')
    .replace(/\s*[-–]?\s*(?:grade\s*)?\d{1,2}\s*[A-Za-z]*\s*$/i, '')
    .trim();

const buildSubjectLookups = (subjects) => {
    const byCode = new Map();
    const byName = new Map();
    for (const subject of subjects) {
        const code = normalizeCode(subject.code);
        if (code && !byCode.has(code)) byCode.set(code, subject);
        const name = normalizeLabel(subject.name);
        if (name && !byName.has(name)) byName.set(name, subject);
    }
    return { byCode, byName };
};

const matchSubject = (cell, lookups) => {
    const code = normalizeCode(cell.code);
    if (code && lookups.byCode.has(code)) return lookups.byCode.get(code);

    const title = normalizeLabel(cell.title);
    if (title && lookups.byName.has(title)) return lookups.byName.get(title);

    const titleWithoutGrade = normalizeLabel(stripGradeSuffix(cell.title));
    if (titleWithoutGrade && lookups.byName.has(titleWithoutGrade)) return lookups.byName.get(titleWithoutGrade);

    const codeBase = normalizeCode(stripGradeSuffix(cell.code));
    if (codeBase.length >= 3 && lookups.byCode.has(codeBase)) return lookups.byCode.get(codeBase);

    return null;
};

const buildProposal = (cell) => {
    const name = stripGradeSuffix(cell.title) || cell.title;
    if (!name) return null;
    const codeBase = stripGradeSuffix(cell.code) || cell.code;
    const code = String(codeBase || name)
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .toUpperCase()
        .slice(0, 20)
        .trim();
    return { name: name.slice(0, 120), code };
};

const statusFor = ({ kind, period, classDoc, subject, proposal, confidence }) => {
    if (kind === 'empty') return CELL_STATUS.EMPTY;
    if (kind === 'meeting' || kind === 'duty') return CELL_STATUS.SKIPPED;
    if (!period) return CELL_STATUS.NEEDS_PERIOD;
    if (!classDoc) return CELL_STATUS.NEEDS_CLASS;
    if (subject && subject.isActive === false) return CELL_STATUS.NEEDS_DECISION;
    if (confidence < MIN_CONFIDENT_CELL) return CELL_STATUS.NEEDS_DECISION;
    if (!subject) return proposal ? CELL_STATUS.WILL_CREATE_SUBJECT : CELL_STATUS.NEEDS_DECISION;
    return CELL_STATUS.READY;
};

export const matchScheduleDraft = ({ draft, periods, classes, subjects }) => {
    const subjectLookups = buildSubjectLookups(subjects);
    const periodByTime = new Map(periods.map((period) => [`${period.startTime}-${period.endTime}`, period]));
    const classByKey = new Map(classes.map((classDoc) => [
        `${classDoc.grade}|${String(classDoc.section || '').toUpperCase()}`,
        classDoc
    ]));

    const proposals = new Map();

    const cells = draft.cells.map((cell) => {
        const documentPeriod = cell.periodIndex ? draft.periods[cell.periodIndex - 1] : null;
        const period = documentPeriod
            ? periodByTime.get(`${documentPeriod.startTime}-${documentPeriod.endTime}`) || null
            : null;
        const classDoc = cell.grade && cell.section
            ? classByKey.get(`${cell.grade}|${cell.section}`) || null
            : null;
        const subject = cell.kind === 'class' ? matchSubject(cell, subjectLookups) : null;
        const proposal = cell.kind === 'class' && !subject ? buildProposal(cell) : null;
        const status = statusFor({ kind: cell.kind, period, classDoc, subject, proposal, confidence: cell.confidence });

        if (proposal) {
            const key = proposal.code;
            if (!proposals.has(key)) {
                proposals.set(key, { ...proposal, cells: 0 });
            }
            proposals.get(key).cells += 1;
        }

        return {
            ...cell,
            documentPeriod,
            period: period
                ? { id: String(period._id), name: period.name, startTime: period.startTime, endTime: period.endTime }
                : null,
            class: classDoc
                ? { id: String(classDoc._id), name: classDoc.name, grade: classDoc.grade, section: classDoc.section }
                : null,
            subject: subject
                ? { id: String(subject._id), name: subject.name, code: subject.code, isActive: subject.isActive !== false }
                : null,
            proposedSubject: proposal,
            status
        };
    });

    const summary = {
        totalCells: cells.length,
        ready: 0,
        willCreateSubject: 0,
        needsDecision: 0,
        skipped: 0,
        empty: 0
    };
    for (const cell of cells) {
        if (cell.status === CELL_STATUS.READY) summary.ready += 1;
        else if (cell.status === CELL_STATUS.WILL_CREATE_SUBJECT) summary.willCreateSubject += 1;
        else if (cell.status === CELL_STATUS.SKIPPED) summary.skipped += 1;
        else if (cell.status === CELL_STATUS.EMPTY) summary.empty += 1;
        else summary.needsDecision += 1;
    }
    summary.canCommit = summary.needsDecision === 0;

    return {
        cells,
        summary,
        subjectProposals: [...proposals.values()]
    };
};
