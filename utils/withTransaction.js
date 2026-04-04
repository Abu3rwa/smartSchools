import mongoose from 'mongoose';

/**
 * BE-017: Transaction helper for multi-document operations.
 * Wraps a callback in a Mongoose session with transaction semantics.
 * Automatically commits on success, aborts on failure.
 *
 * Usage:
 *   const result = await withTransaction(async (session) => {
 *       await Model.create([{...}], { session });
 *       await OtherModel.updateOne({...}, {...}, { session });
 *       return { ok: true };
 *   });
 *
 * @param {Function} fn - async callback receiving the session
 * @returns {Promise<*>} - whatever the callback returns
 */
export async function withTransaction(fn) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
}
