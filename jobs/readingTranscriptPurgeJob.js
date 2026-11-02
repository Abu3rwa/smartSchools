import process from 'node:process';
import logger from '../utils/logger.js';
import ReadingFluencyAttempt from '../models/ReadingFluencyAttempt.js';

export const TRANSCRIPT_RETENTION_ENV = 'READING_TRANSCRIPT_RETENTION_DAYS';
export const DEFAULT_RETENTION_DAYS = 90;

/** 0 means the school or platform has opted out of the purge. */
export const retentionDays = (env = process.env) => {
  const raw = String(env[TRANSCRIPT_RETENTION_ENV] ?? '').trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const days = Number(raw);
  return Number.isFinite(days) && days >= 0 ? Math.floor(days) : DEFAULT_RETENTION_DAYS;
};

/**
 * Drops what a student actually said from old attempts. Scores, counts and the
 * status map stay, so reports and progress keep working.
 */
export async function runReadingTranscriptPurgeJob({ env = process.env, now = new Date() } = {}) {
  const days = retentionDays(env);
  if (days === 0) {
    logger.info('reading_transcript_purge_skipped', { reason: 'disabled' });
    return { purged: 0, disabled: true };
  }

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  try {
    const result = await ReadingFluencyAttempt.updateMany(
      { createdAt: { $lt: cutoff }, transcriptPurgedAt: null },
      {
        $unset: { transcript: '', issues: '' },
        $set: { transcriptPurgedAt: now }
      }
    );
    const purged = Number(result?.modifiedCount) || 0;
    logger.info('reading_transcript_purge_completed', { days, cutoff, purged });
    return { purged, disabled: false };
  } catch (error) {
    logger.error('reading_transcript_purge_failed', {
      error: error?.message || String(error)
    });
    throw error;
  }
}
