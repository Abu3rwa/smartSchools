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
    const legacySessionIndex = indexes.find((index) => index.name === 'session_1');
    if (legacySessionIndex) {
      await collection.dropIndex(legacySessionIndex.name);
      logger.success('Dropped legacy unique spelling email session index');
    }

    const compoundIndex = indexes.find((index) => index.name === 'session_1_kind_1');
    if (!compoundIndex) {
      await collection.createIndex({ session: 1, kind: 1 }, { unique: true, name: 'session_1_kind_1' });
      logger.success('Created spelling email session and kind index');
    }
  } catch (err) {
    logger.warn(`Spelling email delivery index migration skipped: ${err.message}`);
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.success('MongoDB Connected');
    // Run migrations after connection is established.
    await migrateDeviceTokenIndex();
    await migrateSpellingSessionIndexes();
    await migrateSpellingEmailDeliveryIndexes();
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

