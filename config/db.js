import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * One-time migration: drop the stale globally-unique index `token_1` from
 * the `devicetokens` collection if it exists.
 *
 * Background: the index was originally defined as `{ token: 1, unique: true }`
 * which incorrectly enforced that an FCM token can only ever belong to one user
 * globally. FCM tokens can be recycled by Android after a device reset and
 * legitimately re-assigned to a new user, so the index must be non-unique.
 * Mongoose will recreate it as a plain (lookup-only) index on next sync.
 */
const migrateDeviceTokenIndex = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    const collection = db.collection('devicetokens');
    const indexes = await collection.indexes();
    const staleIndex = indexes.find(
      (idx) => idx.name === 'token_1' && idx.unique === true
    );

    if (staleIndex) {
      await collection.dropIndex('token_1');
      logger.success('Dropped stale unique index token_1 from devicetokens');
    }
  } catch (err) {
    // Non-fatal — log and continue. The worst case is a duplicate-key error
    // on the next device registration, which is far better than crashing.
    logger.warn(`⚠️  devicetokens index migration skipped: ${err.message}`);
  }
};

const migrateSpellingSessionIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    const collection = db.collection('spellingsessions');
    const indexes = await collection.indexes();
    const invalidIndex = indexes.find(
      (idx) => idx.name === 'school_1_attempts.idempotencyKey_1'
    );

    if (invalidIndex) {
      await collection.dropIndex(invalidIndex.name);
      logger.success('Dropped invalid spelling session idempotency index');
    }
  } catch (err) {
    logger.warn(`Spelling session index migration skipped: ${err.message}`);
  }
};

const migrateSpellingEmailDeliveryIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    const collection = db.collection('spellingemaildeliveries');
    const indexes = await collection.indexes();
    const legacySessionIndexes = indexes.filter((index) => index.name === 'session_1' || index.name === 'session_1_kind_1');
    for (const legacySessionIndex of legacySessionIndexes) {
      await collection.dropIndex(legacySessionIndex.name);
      logger.success(`Dropped legacy unique spelling email index ${legacySessionIndex.name}`);
    }

    const passageIndex = indexes.find((index) => index.name === 'passage_1_kind_1');
    if (!passageIndex) {
      await collection.createIndex(
        { passage: 1, kind: 1 },
        { unique: true, partialFilterExpression: { passage: { $type: 'objectId' } }, name: 'passage_1_kind_1' }
      );
      logger.success('Created spelling email passage and kind index');
    }
  } catch (err) {
    logger.warn(`Spelling email delivery index migration skipped: ${err.message}`);
  }
};

const migrateSpellingRetestQuizIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    const sessionCollection = db.collection('spellingsessions');
    const sessionIndexes = await sessionCollection.indexes();
    if (!sessionIndexes.some((index) => index.name === 'school_student_retest_quiz_key_unique')) {
      await sessionCollection.createIndex(
        { school: 1, student: 1, retestQuizKey: 1 },
        {
          unique: true,
          partialFilterExpression: { retestQuizKey: { $type: 'string' } },
          name: 'school_student_retest_quiz_key_unique'
        }
      );
    }

    const retestCollection = db.collection('spellingretestitems');
    const retestIndexes = await retestCollection.indexes();
    if (!retestIndexes.some((index) => index.name === 'spelling_retest_due_queue')) {
      await retestCollection.createIndex(
        { status: 1, dueAt: 1 },
        { name: 'spelling_retest_due_queue' }
      );
    }

    const emailCollection = db.collection('spellingemaildeliveries');
    const emailIndexes = await emailCollection.indexes();
    if (!emailIndexes.some((index) => index.name === 'session_retest_practice_unique')) {
      await emailCollection.createIndex(
        { session: 1, kind: 1 },
        {
          unique: true,
          partialFilterExpression: { kind: 'retest-practice' },
          name: 'session_retest_practice_unique'
        }
      );
    }
  } catch (err) {
    logger.warn(`Spelling retest quiz index migration skipped: ${err.message}`);
  }
};

const migrateSpellingPassageIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    const collection = db.collection('spellingpassages');
    const indexes = await collection.indexes();
    const uniqueSessionIndex = indexes.find((index) => index.name === 'session_1' && index.unique === true);
    if (uniqueSessionIndex) {
      await collection.dropIndex(uniqueSessionIndex.name);
      logger.success('Dropped unique spelling passage session index');
    }
  } catch (err) {
    logger.warn(`Spelling passage index migration skipped: ${err.message}`);
  }
};

export const migrateTeacherEmployeeIdIndex = async (db = mongoose.connection.db) => {
  if (!db) {
    throw new Error('MongoDB is not connected; cannot verify the teacher employee ID index.');
  }

  const collection = db.collection('teachers');
  const collectionExists = await db.listCollections({ name: 'teachers' }).hasNext();
  if (!collectionExists) {
    await collection.createIndex(
      { school: 1, employeeId: 1 },
      { unique: true, name: 'school_1_employeeId_1' }
    );
    logger.success('Created school-scoped unique teacher employee ID index');
    return;
  }

  const indexes = await collection.indexes();
  const legacyGlobalIndex = indexes.find((index) =>
    index.unique === true &&
    index.key?.employeeId === 1 &&
    Object.keys(index.key).length === 1
  );

  if (legacyGlobalIndex) {
    await collection.dropIndex(legacyGlobalIndex.name);
    logger.success(`Dropped legacy global teacher employee ID index ${legacyGlobalIndex.name}`);
  }

  const currentIndexes = await collection.indexes();
  const schoolScopedIndex = currentIndexes.find((index) =>
    index.unique === true &&
    index.key?.school === 1 &&
    index.key?.employeeId === 1 &&
    Object.keys(index.key).length === 2
  );

  if (!schoolScopedIndex) {
    await collection.createIndex(
      { school: 1, employeeId: 1 },
      { unique: true, name: 'school_1_employeeId_1' }
    );
    logger.success('Created school-scoped unique teacher employee ID index');
  }
};

export const migrateSubjectCodeIndex = async (db = mongoose.connection.db) => {
  if (!db) {
    throw new Error('MongoDB is not connected; cannot verify the subject code index.');
  }

  const collection = db.collection('subjects');
  const collectionExists = await db.listCollections({ name: 'subjects' }).hasNext();
  if (!collectionExists) {
    await collection.createIndex(
      { school: 1, code: 1 },
      { unique: true, name: 'school_1_code_1' }
    );
    logger.success('Created school-scoped unique subject code index');
    return;
  }

  const indexes = await collection.indexes();
  const legacyGlobalIndex = indexes.find((index) =>
    index.unique === true &&
    index.key?.code === 1 &&
    Object.keys(index.key).length === 1
  );

  if (legacyGlobalIndex) {
    await collection.dropIndex(legacyGlobalIndex.name);
    logger.success(`Dropped legacy global subject code index ${legacyGlobalIndex.name}`);
  }

  const currentIndexes = await collection.indexes();
  const schoolScopedIndex = currentIndexes.find((index) =>
    index.unique === true &&
    index.key?.school === 1 &&
    index.key?.code === 1 &&
    Object.keys(index.key).length === 2
  );

  if (!schoolScopedIndex) {
    await collection.createIndex(
      { school: 1, code: 1 },
      { unique: true, name: 'school_1_code_1' }
    );
    logger.success('Created school-scoped unique subject code index');
  }
};

// F13: a returned submission keeps its row and number, so the draft number is
// unique among live drafts only. Mongoose will not replace an index whose
// options changed, so the old plain unique index is dropped here and rebuilt.
export const migrateWritingDraftNumberIndex = async (db = mongoose.connection.db) => {
  if (!db) {
    throw new Error('MongoDB is not connected; cannot verify the writing draft number index.');
  }

  const key = { school: 1, project: 1, number: 1 };
  const name = 'school_1_project_1_number_1';
  const isLiveOnly = (index) =>
    index.unique === true &&
    index.key?.school === 1 &&
    index.key?.project === 1 &&
    index.key?.number === 1 &&
    index.partialFilterExpression?.withdrawn === false;

  const collection = db.collection('writingdrafts');
  const collectionExists = await db.listCollections({ name: 'writingdrafts' }).hasNext();
  if (!collectionExists) {
    await collection.createIndex(key, { unique: true, name, partialFilterExpression: { withdrawn: false } });
    logger.success('Created live-drafts-only unique writing draft number index');
    return;
  }

  const indexes = await collection.indexes();
  const staleIndex = indexes.find((index) =>
    index.key?.school === 1 &&
    index.key?.project === 1 &&
    index.key?.number === 1 &&
    !isLiveOnly(index)
  );

  if (staleIndex) {
    await collection.dropIndex(staleIndex.name);
    logger.success(`Dropped writing draft number index ${staleIndex.name}`);
  }

  const currentIndexes = await collection.indexes();
  if (!currentIndexes.some(isLiveOnly)) {
    await collection.createIndex(key, { unique: true, name, partialFilterExpression: { withdrawn: false } });
    logger.success('Created live-drafts-only unique writing draft number index');
  }
};

// Support respondents moved from one row per student to one row per parent
// slot plus a portal row for the student. Older databases still carry the
// original unique index on { school, student }, which blocks the second
// parent's record with a duplicate-key error the UI cannot explain. Mongoose
// will not replace an index whose options changed, so the stale one is dropped
// here; the current partial indexes stay untouched. A unique index kept the
// auto-generated name even after it was made partial by hand, so the name is
// matched too; a non-unique index blocks nothing and is left alone.
const LEGACY_RESPONDENT_INDEX_NAMES = ['school_1_student_1'];

const isLegacyRespondentStudentIndex = (index) => (
  index.unique === true
  && index.key?.school === 1
  && index.key?.student === 1
  && Object.keys(index.key).length === 2
  && (LEGACY_RESPONDENT_INDEX_NAMES.includes(index.name) || !index.partialFilterExpression)
);

export const migrateSupportRespondentIndexes = async (db = mongoose.connection.db) => {
  if (!db) {
    throw new Error('MongoDB is not connected; cannot verify the support respondent indexes.');
  }

  const collectionExists = await db.listCollections({ name: 'supportrespondents' }).hasNext();
  if (!collectionExists) return;

  const collection = db.collection('supportrespondents');
  const indexes = await collection.indexes();
  const legacyIndexes = indexes.filter(isLegacyRespondentStudentIndex);
  for (const legacyIndex of legacyIndexes) {
    await collection.dropIndex(legacyIndex.name);
    logger.success(`Dropped legacy support respondent index ${legacyIndex.name}`);
  }
};

// Same story for support plans: plans are now unique per case, and the old
// unique { school, cycle } index made every case plan after the first collide
// on a null cycle. The index is rebuilt to match the current schema.
const isSupportPlanCycleIndex = (index) => (
  index.key?.school === 1
  && index.key?.cycle === 1
  && Object.keys(index.key).length === 2
);

const isCaseScopedPlanCycleIndex = (index) => (
  isSupportPlanCycleIndex(index)
  && index.unique === true
  && index.partialFilterExpression?.cycle?.$type === 'objectId'
);

export const migrateSupportPlanIndexes = async (db = mongoose.connection.db) => {
  if (!db) {
    throw new Error('MongoDB is not connected; cannot verify the support plan indexes.');
  }

  const collectionExists = await db.listCollections({ name: 'supportplans' }).hasNext();
  if (!collectionExists) return;

  const collection = db.collection('supportplans');
  const indexes = await collection.indexes();
  const staleIndex = indexes.find((index) => isSupportPlanCycleIndex(index) && !isCaseScopedPlanCycleIndex(index));
  if (staleIndex) {
    await collection.dropIndex(staleIndex.name);
    logger.success(`Dropped stale support plan cycle index ${staleIndex.name}`);
  }

  const currentIndexes = await collection.indexes();
  if (!currentIndexes.some(isCaseScopedPlanCycleIndex)) {
    await collection.createIndex(
      { school: 1, cycle: 1 },
      {
        unique: true,
        name: 'school_1_cycle_1',
        partialFilterExpression: { cycle: { $type: 'objectId' } }
      }
    );
    logger.success('Created support plan cycle index');
  }
};

const migrateClassUniqueIndex = async () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB is not connected; cannot verify the class unique index.');
  }

  const collection = db.collection('classes');
  const collectionExists = await db.listCollections({ name: 'classes' }).hasNext();
  if (!collectionExists) {
    await collection.createIndex(
      { school: 1, grade: 1, section: 1, academicYear: 1 },
      { unique: true, name: 'school_1_grade_1_section_1_academicYear_1' }
    );
    logger.success('Created school-scoped unique class index');
    return;
  }

  const indexes = await collection.indexes();
  const legacyGlobalIndex = indexes.find((index) =>
    index.unique === true &&
    index.key?.grade === 1 &&
    index.key?.section === 1 &&
    index.key?.academicYear === 1 &&
    Object.keys(index.key).length === 3
  );

  if (legacyGlobalIndex) {
    await collection.dropIndex(legacyGlobalIndex.name);
    logger.success(`Dropped legacy global class index ${legacyGlobalIndex.name}`);
  }

  const currentIndexes = await collection.indexes();
  const schoolScopedIndex = currentIndexes.find((index) =>
    index.unique === true &&
    index.key?.school === 1 &&
    index.key?.grade === 1 &&
    index.key?.section === 1 &&
    index.key?.academicYear === 1 &&
    Object.keys(index.key).length === 4
  );

  if (!schoolScopedIndex) {
    await collection.createIndex(
      { school: 1, grade: 1, section: 1, academicYear: 1 },
      { unique: true, name: 'school_1_grade_1_section_1_academicYear_1' }
    );
    logger.success('Created school-scoped unique class index');
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.success('MongoDB Connected');
    // Run migrations after connection is established.
    await migrateDeviceTokenIndex();
    await migrateSpellingSessionIndexes();
    await migrateSpellingPassageIndexes();
    await migrateSpellingEmailDeliveryIndexes();
    await migrateSpellingRetestQuizIndexes();
    await migrateTeacherEmployeeIdIndex();
    await migrateSubjectCodeIndex();
    await migrateWritingDraftNumberIndex();
    await migrateClassUniqueIndex();
    await migrateSupportRespondentIndexes();
    await migrateSupportPlanIndexes();
  } catch (error) {
    logger.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error(`❌ MongoDB error: ${err}`);
});

export default connectDB;
