import { connectAi as originalConnectAi } from './connectAi.js';
import { logAIUsage } from './aiUsageTracker.js';
import logger from './logger.js';

/**
 * Centralized AI client wrapper that always logs token usage.
 * @param {String} prompt - Prompt to send to AI
 * @param {Object} options - Optional configuration
 * @param {Object} opts - Usage tracking options
 * @param {String} opts.feature - Feature tag (required)
 * @param {ObjectId} opts.schoolId - School ID (required)
 * @param {ObjectId} opts.userId - User ID (required)
 * @param {ObjectId} opts.studentId - Optional student ID
 * @param {String} opts.entityType - Optional entity type
 * @param {ObjectId} opts.entityId - Optional entity ID
 * @param {Object} opts.metadata - Optional metadata
 * @param {Object} opts.dateRange - Optional date range
 * @returns {Promise<Object>} AI response with usageId
 */
export async function connectAiWithUsage(prompt, options = {}, opts = {}) {
  if (!opts.feature || !opts.schoolId || !opts.userId) {
    logger.error('connectAiWithUsage: missing required tracking fields', opts);
    throw new Error('connectAiWithUsage: missing required tracking fields');
  }

  let response;
  let error = false;
  let usageId;
  try {
    response = await originalConnectAi(prompt, options);
  } catch (err) {
    error = true;
    response = {};
    logger.error('connectAiWithUsage: AI call failed', err);
    // Log usage before re-throwing so the record is always created
    usageId = await logAIUsage({
      model: response?.modelName || 'gemini-2.5-flash-lite',
      feature: opts.feature,
      schoolId: opts.schoolId,
      userId: opts.userId,
      studentId: opts.studentId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      metadata: opts.metadata,
      dateRange: opts.dateRange,
      response,
      error
    });
    err.usageId = usageId;
    throw err;
  }

  // Log usage on success
  usageId = await logAIUsage({
    model: response?.modelName || 'gemini-2.5-flash-lite',
    feature: opts.feature,
    schoolId: opts.schoolId,
    userId: opts.userId,
    studentId: opts.studentId,
    entityType: opts.entityType,
    entityId: opts.entityId,
    metadata: opts.metadata,
    dateRange: opts.dateRange,
    response,
    error
  });

  return { ...response, usageId };
}