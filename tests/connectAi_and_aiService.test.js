import assert from 'node:assert/strict';
import test from 'node:test';

import aiService from '../services/aiservice.js';
import { connectAi } from '../utils/connectAi.js';

test('connectAi rejects empty prompt before external API call', async () => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = previousApiKey || 'test-key';

  try {
    await assert.rejects(
      () => connectAi('   '),
      (error) => {
        assert.match(error.message, /non-empty string/i);
        return true;
      }
    );
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }
  }
});

test('aiService.formatDateRange returns human-readable range', () => {
  const value = aiService.formatDateRange('2026-02-01T00:00:00.000Z', '2026-02-28T00:00:00.000Z');
  assert.ok(value.includes(' - '));
  assert.ok(value.toLowerCase().includes('2026'));
});

test('aiService.generateStudentReport returns report text for legacy callers', async () => {
  const originalGenerateAdvancedReport = aiService.generateAdvancedReport;
  aiService.generateAdvancedReport = async () => ({ text: 'legacy-report-text' });

  try {
    const result = await aiService.generateStudentReport(
      { _id: 'student-1' },
      [{ marks: 10, maxMarks: 10 }],
      'February 2026',
      { _id: 'teacher-1' }
    );
    assert.equal(result, 'legacy-report-text');
  } finally {
    aiService.generateAdvancedReport = originalGenerateAdvancedReport;
  }
});

