import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingLibraryState from '../models/SpellingLibraryState.js';
import SpellingWordProgress from '../models/SpellingWordProgress.js';
import { domainError } from '../utils/spellingLibraryErrors.js';
import { SPELLING_CURRICULUM_GRADES } from '../utils/spellingProgress.js';
import { projectCompletion } from './spellingTraversal.js';

export {
    activeWords,
    sortForTraversal,
    nextEligibleWord,
    projectCompletion
} from './spellingTraversal.js';

const gradeOrder = (grade) => {
    const index = SPELLING_CURRICULUM_GRADES.indexOf(grade);
    return index === -1 ? SPELLING_CURRICULUM_GRADES.length : index;
};

export const sortedGrades = (grades) => [...new Set((grades || []).filter(Boolean))]
    .sort((first, second) => gradeOrder(first) - gradeOrder(second));

export const getOrCreateLibraryState = async ({ schoolId, grade, actorId = null, dbSession }) => {
    const options = { upsert: true, new: true, setDefaultsOnInsert: true };
    if (dbSession) options.session = dbSession;
    return SpellingLibraryState.findOneAndUpdate(
        { school: schoolId, grade },
        {
            $setOnInsert: {
                school: schoolId,
                grade,
                version: 1,
                coordinationRevision: 0,
                progressSchemaVersion: 0,
                migrationStatus: 'ready'
            },
            ...(actorId ? { $set: { updatedBy: actorId } } : {})
        },
        options
    );
};

/** Acquires grade coordination rows in KG→G5 order and touches them. */
export const touchLibraryStates = async ({ schoolId, grades, actorId = null, dbSession, touchVersion = false }) => {
    const states = [];
    for (const grade of sortedGrades(grades)) {
        const state = await getOrCreateLibraryState({ schoolId, grade, actorId, dbSession });
        state.coordinationRevision += 1;
        if (touchVersion) state.version += 1;
        if (actorId) state.updatedBy = actorId;
        await state.save({ session: dbSession });
        states.push(state);
    }
    return states;
};

export const assertMigrationReady = (state) => {
    if (!state || state.migrationStatus !== 'ready') throw domainError('MIGRATION_REQUIRED');
};

/** Version of the consumed-ID progress schema written by the migration. */
export const PROGRESS_SCHEMA_VERSION = 1;

/**
 * True when structural library edits must wait for the progress migration:
 * the grade has students with saved spelling progress and has not been
 * migrated to the consumed-ID ledger yet.
 */
export const gradeNeedsProgressMigration = async ({ schoolId, grade, dbSession }) => {
    const state = await getOrCreateLibraryState({ schoolId, grade, dbSession });
    if (state.migrationStatus !== 'ready') return true;
    if ((Number(state.progressSchemaVersion) || 0) >= PROGRESS_SCHEMA_VERSION) return false;
    const query = Student.countDocuments({
        school: schoolId,
        $or: [
            { 'spelling.progressByGrade.grade': grade },
            { 'spelling.currentGrade': grade }
        ]
    });
    if (dbSession) query.session(dbSession);
    return (await query) > 0;
};

export const getPlacementFloor = ({ student, grade }) => {
    const entry = student?.spelling?.progressByGrade?.find((item) => item.grade === grade);
    const floor = Number(entry?.placementStartWeek);
    return Number.isInteger(floor) && floor >= 1 ? floor : 1;
};

/**
 * True when this student's saved progress for the grade exists only as the
 * legacy week/order pointer and the grade has not been migrated yet. Such a
 * student must not be traversed with the ledger reader: the ledger would look
 * empty and restart them at the placement floor.
 */
export const studentNeedsProgressMigration = async ({
    schoolId,
    grade,
    student = null,
    studentId = null,
    dbSession
}) => {
    let doc = student;
    if (!doc) {
        let query = Student.findOne({ _id: studentId, school: schoolId }).select('spelling');
        if (dbSession) query = query.session(dbSession);
        doc = await query.lean();
    }
    if (!doc) return false;

    const entry = (doc.spelling?.progressByGrade || []).find((item) => item.grade === grade);
    const isCurrent = doc.spelling?.currentGrade === grade;
    const week = Number(entry?.week ?? (isCurrent ? doc.spelling?.currentWeek : null)) || 0;
    const index = Number(entry?.lastWordIndex ?? (isCurrent ? doc.spelling?.lastWordIndex : 0)) || 0;
    if (week <= 1 && index === 0) return false;

    const state = await getOrCreateLibraryState({ schoolId, grade, dbSession });
    if (state.migrationStatus !== 'ready') return true;
    if ((Number(state.progressSchemaVersion) || 0) >= PROGRESS_SCHEMA_VERSION) return false;
    const consumed = await loadConsumedWordIds({
        schoolId,
        studentId: doc._id,
        grade,
        dbSession
    });
    return consumed.size === 0;
};

export const assertStudentProgressReady = async ({ schoolId, grade, student = null, studentId = null, dbSession }) => {
    if (await studentNeedsProgressMigration({ schoolId, grade, student, studentId, dbSession })) {
        throw domainError('MIGRATION_REQUIRED', { details: [{ grade }] });
    }
};

export const loadConsumedWordIds = async ({ schoolId, studentId, grade, dbSession }) => {
    let query = SpellingWordProgress.find({ school: schoolId, student: studentId, grade }).select('wordId');
    if (dbSession) query = query.session(dbSession);
    const rows = await query.lean();
    return new Set(rows.map((row) => String(row.wordId)));
};

export const recordConsumedWord = async ({
    schoolId,
    studentId,
    wordId,
    grade,
    source,
    sourceSession = null,
    sourceAttempt = null,
    migrationRunId = null,
    dbSession
}) => {
    const result = await SpellingWordProgress.updateOne(
        { school: schoolId, student: studentId, wordId },
        {
            $setOnInsert: {
                school: schoolId,
                student: studentId,
                wordId,
                grade,
                consumedAt: new Date(),
                source,
                sourceSession,
                sourceAttempt,
                migrationRunId
            }
        },
        { upsert: true, session: dbSession }
    );
    return Boolean(result.upsertedCount);
};

/**
 * Recomputes the derived Student projection from the consumed-ID ledger. The
 * ledger is authoritative; the projection only exists for older readers.
 */
export const recalculateStudentProjection = async ({
    schoolId,
    studentId,
    grade,
    words,
    dbSession
}) => {
    let studentQuery = Student.findOne({ _id: studentId, school: schoolId }).select('spelling');
    if (dbSession) studentQuery = studentQuery.session(dbSession);
    const student = await studentQuery.lean();
    if (!student) return null;

    const floorWeek = getPlacementFloor({ student, grade });
    const consumedIds = await loadConsumedWordIds({ schoolId, studentId, grade, dbSession });
    const projection = projectCompletion({ words, consumedIds, floorWeek });
    const increment = { 'spelling.traversalRevision': 1 };

    const entryFilter = { _id: studentId, school: schoolId, 'spelling.progressByGrade.grade': grade };
    const entryUpdate = {
        $set: {
            'spelling.progressByGrade.$.week': projection.week || 1,
            'spelling.progressByGrade.$.lastWordIndex': projection.lastWordIndex || 0,
            'spelling.traversalRevision': (student.spelling?.traversalRevision || 0) + 1
        }
    };
    const updated = await Student.updateOne(entryFilter, entryUpdate, { session: dbSession });
    if (updated.matchedCount === 0) {
        await Student.updateOne(
            { _id: studentId, school: schoolId },
            {
                $push: {
                    'spelling.progressByGrade': {
                        grade,
                        week: projection.week || 1,
                        lastWordIndex: projection.lastWordIndex || 0,
                        placementStartWeek: floorWeek
                    }
                },
                $inc: increment
            },
            { session: dbSession }
        );
    }

    if (student.spelling?.currentGrade === grade) {
        await Student.updateOne(
            { _id: studentId, school: schoolId, 'spelling.currentGrade': grade },
            {
                $set: {
                    'spelling.currentWeek': projection.week || 1,
                    'spelling.lastWordIndex': projection.lastWordIndex || 0
                }
            },
            { session: dbSession }
        );
    }

    return projection;
};

/** Students placed in a grade, bounded by the caller's impact cap. */
export const loadGradeStudents = async ({ schoolId, grade, limit = 2001, dbSession }) => {
    let query = Student.find({
        school: schoolId,
        $or: [
            { 'spelling.progressByGrade.grade': grade },
            { 'spelling.currentGrade': grade }
        ]
    }).select('_id spelling').limit(limit);
    if (dbSession) query = query.session(dbSession);
    return query.lean();
};

export const buildStudentImpactInputs = async ({ schoolId, grade, students, dbSession }) => {
    const inputs = [];
    for (const student of students) {
        const consumedIds = await loadConsumedWordIds({
            schoolId,
            studentId: student._id,
            grade,
            dbSession
        });
        inputs.push({
            id: String(student._id),
            floorWeek: getPlacementFloor({ student, grade }),
            consumedIds: [...consumedIds]
        });
    }
    return inputs;
};

export const ensureValidObjectId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw domainError('INVALID_ID');
    return new mongoose.Types.ObjectId(id);
};
