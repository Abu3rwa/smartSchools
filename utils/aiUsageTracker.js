import { AITokenUsage } from '../models/AITokenUsage.js';
import logger from './logger.js';

/**
 * Pricing per 1K tokens for each model.
 * Input / Output in USD.
 */
const PRICING_REGISTRY = {
  'gemini-2.5-flash-lite': { input: 0.000075, output: 0.0003 },
  'gemini-2.5-flash': { input: 0.000125, output: 0.000375 },
  'gemini-2.0-flash-exp': { input: 0.000125, output: 0.000375 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
};

/**
 * Compute estimated cost for a model given token counts.
 */
function computeEstimatedCost(model, inputTokens, outputTokens) {
  const pricing = PRICING_REGISTRY[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.input / 1000) + (outputTokens * pricing.output / 1000);
}

/**
 * Safely extract token counts from AI response.
 */
function extractTokenCounts(response) {
  const input = response?.inputtokenCount ?? 0;
  const output = response?.outputtokenCount ?? 0;
  const total = response?.totalTokenCount ?? 0;
  return { input, output, total };
}

/**
 * Centralized wrapper to log AI usage.
 * Ensures consistent token tracking, cost calculation, and error logging.
 * @param {Object} opts
 * @param {String} opts.model - Model name (e.g., gemini-2.5-flash-lite)
 * @param {String} opts.feature - Feature tag (e.g., 'practice_question')
 * @param {ObjectId} opts.schoolId - School ID (required)
 * @param {ObjectId} opts.userId - User ID (required)
 * @param {ObjectId} opts.studentId - Optional student ID
 * @param {String} opts.entityType - Optional entity type for linkage
 * @param {ObjectId} opts.entityId - Optional entity ID for linkage
 * @param {Object} opts.metadata - Optional metadata object
 * @param {Object} opts.dateRange - Optional date range object { startDate, endDate }
 * @param {Object} opts.response - AI response object with token counts
 * @param {Boolean} opts.error - Whether this is an error case
 * @returns {Promise<ObjectId|null>} Created AITokenUsage document ID or null
 */
export async function logAIUsage(opts) {
  try {
    const { model, feature, schoolId, userId, studentId, entityType, entityId, metadata, dateRange, response, error } = opts;

    if (!schoolId || !userId) {
      logger.error('logAIUsage: missing required schoolId or userId');
      return null;
    }

    const { input, output, total } = extractTokenCounts(response);
    const estimatedCost = computeEstimatedCost(model, input, output);

    const doc = await AITokenUsage.create({
      model,
      feature,
      school: schoolId,
      user: userId,
      student: studentId,
      entityType,
      entityId,
      metadata,
      dateRange,
      inputTokens: input,
      outputTokens: output,
      totalTokens: total,
      estimatedCost,
      schoolId: schoolId.toString(),
      error: error ? true : undefined,
      timestamp: new Date()
    });

    return doc._id;
  } catch (err) {
    logger.error('logAIUsage: failed to create usage record', err);
    return null;
  }
}

/**
 * Wrap any AI call with usage logging.
 * @param {Function} fn - Async function that returns AI response
 * @param {Object} opts - Same as logAIUsage except response
 * @returns {Promise<Object>} Original AI response plus usageId
 */
export async function withAIUsage(fn, opts) {
  let response;
  let error = false;
  try {
    response = await fn();
  } catch (err) {
    error = true;
    response = err.response || {};
    logger.error('withAIUsage: AI call failed', err);
  }

  const usageId = await logAIUsage({ ...opts, response, error });

  return { response, usageId };
}

/**
 * Get pricing registry for external use (read-only)
 */
export function getPricingRegistry() {
  return { ...PRICING_REGISTRY };
}

export { computeEstimatedCost, extractTokenCounts };