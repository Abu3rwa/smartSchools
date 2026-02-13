import { connectAi } from './connectAi.js';

/**
 * Call LLM (existing behavior). Use for fast, inline calls.
 * @param {string} prompt - The prompt to send to the AI
 * @param {object} options - Optional configuration
 * @returns {Promise<object>} AI response with text and token counts
 */
export async function callAi(prompt, options = {}) {
  return connectAi(prompt, options);
}
