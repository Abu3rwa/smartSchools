/**
 * AI service for class analytics: generates short narrative insights from analytics payload.
 * Uses connectAi (Gemini) and logs token usage via AITokenUsage (caller responsibility).
 */

import { connectAi } from '../utils/connectAi.js';
import { getLanguageLabel, resolveRequestedLanguages } from '../utils/aiLanguageUtils.js';

/**
 * Build a plain-text summary of the analytics payload for the prompt.
 */
function buildSummaryForPrompt(payload) {
    const lines = [];
    const className = payload.class && payload.class.name ? payload.class.name : 'Unknown';
    const academicYear = payload.academicYear || 'N/A';
    lines.push(`Class: ${className} (${academicYear})`);
    lines.push(`Students: ${payload.studentCount ?? 0}`);
    if (payload.gradeStatsBySubject?.length) {
        lines.push('Subject averages:');
        payload.gradeStatsBySubject.forEach((s) => {
            lines.push(`  - ${s.subjectName}: ${s.classAverage}% (${s.totalGrades} grades)`);
        });
    } else {
        lines.push('Subject averages: No grade data.');
    }
    const att = payload.attendanceSummary || {};
    lines.push(`Attendance (period): ${att.averageRate ?? 0}% (${att.totalPresent ?? 0}/${att.totalExpected ?? 0} present across ${att.totalSessions ?? 0} sessions)`);
    if (payload.studentsToSupport?.length) {
        lines.push(`Students to support (${payload.atRiskCount ?? payload.studentsToSupport.length}):`);
        payload.studentsToSupport.forEach((s) => {
            const parts = [`${s.firstName} ${s.lastName}`];
            if (s.averagePercentage != null) parts.push(`grade avg ${s.averagePercentage}%`);
            if (s.attendanceRate != null) parts.push(`attendance ${s.attendanceRate}%`);
            lines.push(`  - ${parts.join(', ')}`);
        });
    } else {
        lines.push('Students to support: None identified.');
    }
    return lines.join('\n');
}

/**
 * Generate 3–5 short, actionable bullet-point insights from class analytics.
 * @param {Object} analyticsPayload - Result from classAnalyticsService.getAnalytics
 * @param {Object} options - { classId } (for logging context)
 * @returns {Promise<{ text: string, tokenUsage: { input, output, total } }>}
 */
export async function generateInsights(analyticsPayload, options = {}) {
    const normalizedRequestedLanguages = resolveRequestedLanguages({
        requestedLanguages: options?.requestedLanguages,
        primaryLanguage: options?.primaryLanguage,
        secondaryLanguage: options?.secondaryLanguage,
        language: options?.language,
        max: 2
    });
    const primaryLanguage = normalizedRequestedLanguages[0] || 'en';
    const primaryLabel = getLanguageLabel(primaryLanguage);
    const languageRule = normalizedRequestedLanguages.length > 1
        ? (() => {
            const secondaryLanguage = normalizedRequestedLanguages[1];
            const secondaryLabel = getLanguageLabel(secondaryLanguage);
            return `Provide bilingual bullet points in two clear blocks: first ${primaryLabel} (${primaryLanguage}), then ${secondaryLabel} (${secondaryLanguage}).`;
        })()
        : `Write all bullet points in ${primaryLabel} (${primaryLanguage}) only.`;

    const summary = buildSummaryForPrompt(analyticsPayload);
    const prompt = `You are an experienced K-12 teacher and instructional coach. Based on the following class analytics summary, write 3 to 5 short, actionable bullet-point insights for the class teacher. Focus on: strengths, areas to improve, and concrete suggestions (e.g. which students to support, which subjects need attention). Be concise and professional.

CLASS ANALYTICS SUMMARY:
${summary}

RULES:
- Output only plain text bullet points (one per line). No markdown, no asterisks, no numbering.
- Each bullet should be one short sentence.
- Do not mention "AI" or "artificial intelligence".
- LANGUAGE REQUIREMENT: ${languageRule}`;

    const response = await connectAi(prompt);
    const text = (response.text || '').trim();
    const tokenUsage = {
        input: response.inputtokenCount || 0,
        output: response.outputtokenCount || 0,
        total: response.totalTokenCount || 0
    };
    return { text, tokenUsage, requestedLanguages: normalizedRequestedLanguages };
}
