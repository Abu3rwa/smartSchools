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
