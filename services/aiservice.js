import { connectAi } from "../utils/connectAi.js";
import { AITokenUsage } from "../models/AITokenUsage.js";
import {
    getLanguageLabel,
    isRtlLanguageCode,
    normalizeRequestedLanguages,
    toLegacyLanguageValue
} from "../utils/aiLanguageUtils.js";

class AIService {
    constructor() {

    }

    getStudentAge(studentData) {
        if (typeof studentData?.age === 'number' && Number.isFinite(studentData.age)) {
            return studentData.age;
        }

        if (!studentData?.dateOfBirth) return null;

        const birthDate = new Date(studentData.dateOfBirth);
        if (Number.isNaN(birthDate.getTime())) return null;

        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age -= 1;
        }

        return age >= 0 ? age : null;
    }

    getStudentGenderContext(studentData) {
        const gender = String(studentData?.gender || 'other').trim().toLowerCase();

        if (gender === 'male') {
            return {
                label: 'Male',
                subjectPronoun: 'he',
                objectPronoun: 'him',
                possessivePronoun: 'his'
            };
        }

        if (gender === 'female') {
            return {
                label: 'Female',
                subjectPronoun: 'she',
                objectPronoun: 'her',
                possessivePronoun: 'her'
            };
        }

        return {
            label: 'Other/Unspecified',
            subjectPronoun: 'they',
            objectPronoun: 'them',
            possessivePronoun: 'their'
        };
    }

    getStudentAudienceContext(studentData) {
        const audiences = [];
        const parentInfo = studentData?.parentInfo || {};

        if (parentInfo.motherEmail) audiences.push('mother');
        if (parentInfo.fatherEmail) audiences.push('father');
        if (parentInfo.guardianEmail) audiences.push('guardian');
        if (studentData?.studentEmail || studentData?.email || studentData?.user?.email) {
            audiences.push('student');
        }

        return audiences.length > 0 ? audiences.join(', ') : 'family contacts';
    }

    containsEnglishText(text) {
        return /[A-Za-z]{3,}/.test(String(text || ''));
    }

    /**
     * Parse JSON object from plain text or markdown-wrapped output
     * @param {string} text
     * @returns {object|null}
     */
    parseJsonObject(text) {
        if (!text || typeof text !== 'string') return null;
        const trimmed = text.trim();

        try {
            return JSON.parse(trimmed);
        } catch (_) {
            // fall through
        }

        const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch?.[1]) {
            try {
                return JSON.parse(codeBlockMatch[1].trim());
            } catch (_) {
                // fall through
            }
        }

        const objectMatch = trimmed.match(/\{[\s\S]*\}/);
        if (objectMatch?.[0]) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch (_) {
                // fall through
            }
        }

        return null;
    }

    /**
     * Generate structured JSON from AI with a bounded retry count.
     * This keeps feature services DRY and avoids each service re-implementing parsing logic.
     * @param {Object} options
     * @param {string} options.prompt
     * @param {string} [options.modelName]
     * @param {number} [options.maxRetries]
     * @returns {Promise<{parsed: object, text: string, tokenUsage: {input:number, output:number, total:number}, modelName: string}>}
     */
    async generateStructuredJson({ prompt, modelName, maxRetries = 1 }) {
        let currentPrompt = prompt;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            const response = await connectAi(currentPrompt, modelName ? { modelName } : {});
            const parsed = this.parseJsonObject(response.text || '');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return {
                    parsed,
                    text: response.text || '',
                    tokenUsage: {
                        input: response.inputtokenCount || 0,
                        output: response.outputtokenCount || 0,
                        total: response.totalTokenCount || 0
                    },
                    modelName: response.modelName || modelName || 'unknown'
                };
            }

            lastError = new Error('AI response did not contain a valid JSON object');
            if (attempt < maxRetries) {
                currentPrompt = `${prompt}

IMPORTANT: Your previous response was invalid. Return ONLY one valid JSON object matching the requested schema.`;
            }
        }

        throw lastError || new Error('Failed to generate structured JSON');
    }

    /**
     * Generate advanced AI report with multi-language support
     * @param {Object} options - Report generation options
     * @param {Object} options.studentData - Student details
     * @param {Array} options.grades - List of grades
     * @param {String} options.period - Time period description
     * @param {Object} options.teacher - Teacher details
     * @param {String} options.language - Legacy language value for backward compatibility
     * @param {String[]} options.requestedLanguages - Up to 2 language codes
     * @param {String} options.reportType - 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'
     * @param {Object} options.dateRange - { startDate, endDate }
     * @param {String} options.customPrompt - Optional custom prompt
     * @param {String} options.userId - Teacher ID for tracking
     * @param {String} options.schoolId - School ID for tracking
     * @returns {Promise<Object>} Generated report and token usage data
     */
    async generateAdvancedReport(options) {
        const {
            studentData,
            grades,
            period,
            teacher,
            language = 'english',
            requestedLanguages,
            reportType = 'monthly',
            dateRange,
            customPrompt,
            userId = teacher?._id || teacher?.id,
            schoolId = teacher?.school || studentData?.school
        } = options;

        const normalizedRequestedLanguages = normalizeRequestedLanguages(
            requestedLanguages || language,
            { max: 2, fallback: ['en'] }
        );
        const normalizedLanguage = toLegacyLanguageValue(normalizedRequestedLanguages);
        const primaryLanguage = normalizedRequestedLanguages[0] || 'en';
        const languageSuffix = this.buildCustomPromptLanguageSuffix(normalizedRequestedLanguages);

        const prompt = customPrompt
            ? `${String(customPrompt || '').trim()}\n\n${languageSuffix}`
            : this.constructAdvancedPrompt({
                studentData,
                grades,
                period,
                teacher,
                language: normalizedLanguage,
                requestedLanguages: normalizedRequestedLanguages,
                reportType,
                dateRange
            });

        try {
            let response = await connectAi(prompt);
            let inputTokens = response.inputtokenCount || 0;
            let outputTokens = response.outputtokenCount || 0;
            let totalTokens = response.totalTokenCount || 0;

            if (primaryLanguage === 'ar' && normalizedRequestedLanguages.length === 1 && this.containsEnglishText(response.text)) {
                const correctivePrompt = `${prompt}

تعليمات تصحيحية ملزمة:
- أعد كتابة التقرير بالكامل باللغة العربية فقط.
- ممنوع أي كلمات أو عناوين باللغة الإنجليزية.
- حافظ على نفس المعلومات والهيكل، وبصيغة HTML فقط.`;

                response = await connectAi(correctivePrompt);
                inputTokens += response.inputtokenCount || 0;
                outputTokens += response.outputtokenCount || 0;
                totalTokens += response.totalTokenCount || 0;
            }

            // Track token usage
            const tokenUsage = await this.trackTokenUsage({
                userId,
                schoolId,
                studentId: studentData._id,
                reportType,
                language: normalizedLanguage,
                requestedLanguages: normalizedRequestedLanguages,
                dateRange,
                inputTokens,
                outputTokens,
                totalTokens
            });

            return {
                text: response.text,
                tokenUsage,
                language: normalizedLanguage,
                requestedLanguages: normalizedRequestedLanguages,
                reportType
            };
        } catch (error) {
            console.error("AI Generation Error:", error);

            // Provide specific error messages
            if (error.status === 403 || error.message?.includes('API key')) {
                throw new Error("AI Service API key is invalid or has been revoked. Please contact your administrator to update the API key.");
            }

            if (error.status === 429) {
                throw new Error("AI Service rate limit exceeded. Please try again later.");
            }

            throw new Error(error.message || "Failed to generate AI report");
        }
    }

    /**
     * Construct advanced prompt for multi-language reporting
     */
    constructAdvancedPrompt(options) {
        const {
            studentData,
            grades,
            period,
            teacher,
            language,
            requestedLanguages = ['en'],
            reportType,
            dateRange
        } = options;

        // Sort grades by date (Oldest -> Newest)
        const sortedGrades = [...grades].sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate basic stats
        const totalMarks = sortedGrades.reduce((sum, g) => sum + g.marks, 0);
        const totalMax = sortedGrades.reduce((sum, g) => sum + g.maxMarks, 0);
        const average = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100) : 0;

        const subjects = [...new Set(sortedGrades.map(g => g.subject?.name || 'Unknown'))].join(', ');
        const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'The Teacher';
        const classLabel = studentData?.currentClass?.name
            || [studentData?.currentClass?.grade, studentData?.currentClass?.section].filter(Boolean).join(' ')
            || 'Not specified';
        const age = this.getStudentAge(studentData);
        const ageLabel = age === null ? 'Not specified' : `${age} years old`;
        const genderContext = this.getStudentGenderContext(studentData);
        const audienceContext = this.getStudentAudienceContext(studentData);
        const academicYear = studentData?.academicYear || 'Not specified';
        const preferredFamilyLanguage = studentData?.reportPreferences?.language || 'english';

        // Format grades with dates
        const gradeList = sortedGrades.map(g => {
            const dateStr = new Date(g.date).toLocaleDateString();
            const notesAndRemarks = [g.notes, g.remarks]
                .filter(n => n && n.trim().length > 0)
                .join(' | ');
            const noteContent = notesAndRemarks ? `[NOTES: ${notesAndRemarks}]` : '';
            return `- ${dateStr} | ${g.subject?.name || 'Subject'}: ${g.marks}/${g.maxMarks} (${g.gradeType}) ${noteContent}`;
        }).join('\n');

        const normalizedRequestedLanguages = normalizeRequestedLanguages(
            requestedLanguages || language,
            { max: 2, fallback: ['en'] }
        );
        const primaryLanguage = normalizedRequestedLanguages[0] || 'en';
        const secondaryLanguage = normalizedRequestedLanguages[1] || null;
        const primaryDirection = isRtlLanguageCode(primaryLanguage) ? 'rtl' : 'ltr';
        const secondaryDirection = secondaryLanguage && isRtlLanguageCode(secondaryLanguage) ? 'rtl' : 'ltr';
        const primaryLabel = getLanguageLabel(primaryLanguage);
        const secondaryLabel = secondaryLanguage ? getLanguageLabel(secondaryLanguage) : null;

        const languageSectionInstruction = secondaryLanguage
            ? `Write TWO language sections in this exact order:
1) ${primaryLabel} section only in ${primaryLabel}
2) ${secondaryLabel} section only in ${secondaryLabel}
Do not mix languages between sections.

Output HTML structure:
- One outer <div>.
- <div dir="${primaryDirection}" data-language="${primaryLanguage}"> ... ${primaryLabel} section ... </div>
- <div dir="${secondaryDirection}" data-language="${secondaryLanguage}"> ... ${secondaryLabel} section ... </div>`
            : `Write the full report in ${primaryLabel} only.
Do not mix in any other language.
Wrap everything in a single outer <div dir="${primaryDirection}" data-language="${primaryLanguage}">.`;

        const strictArabicRule =
            primaryLanguage === 'ar' && !secondaryLanguage
                ? '\nADDITIONAL RULE: Use Arabic only. Do not include English words.'
                : '';

        return `
You are an experienced, thoughtful teacher writing a progress report email for the student's family and the student.

CRITICAL OUTPUT RULES:
- Output ONLY HTML.
- No markdown (no **, no code fences).
- No tables whatsoever; use narrative paragraphs only.
- No inline color styles or style attributes.
- No weird symbols like @#$%^&*.
- Do not include <html>, <head>, or <body>.
- Use only: <div>, <p>, <span>, <ul>, <li>, <strong>.
${languageSectionInstruction}${strictArabicRule}

TONE AND WRITING RULES:
- Use easy, professional school language.
- Keep the writing warm, respectful, and specific.
- Avoid jargon, slang, exaggerated praise, and harsh criticism.
- Write clearly enough for families to understand without educational terminology.
- Make the report sound like it was written by a real teacher who knows the student.
- When discussing improvement needs, be constructive and practical.

Student Information:
- Name: ${studentData.firstName} ${studentData.lastName}
- Gender: ${genderContext.label}
- Use these English pronouns when appropriate: ${genderContext.subjectPronoun}/${genderContext.objectPronoun}/${genderContext.possessivePronoun}
- If writing in Arabic, naturally adapt the wording to the student's gender. If the gender is unclear or "other", prefer the student's name instead of forcing gendered wording.
- Age: ${ageLabel}
- Class: ${classLabel}
- Academic year: ${academicYear}
- Period: ${period}
- Overall average: ${average}%
- Subjects: ${subjects}
- Teacher: ${teacherName}
- Likely email audience: ${audienceContext}
- Family preferred report language in the student profile: ${preferredFamilyLanguage}

Grades (chronological):
${gradeList}

Required structure for each language section:
1) Opening greeting (1 paragraph)
2) Strengths and achievements (2-3 paragraphs)
3) Areas for growth (2 paragraphs)
4) Progress and encouragement (2 paragraphs)
5) Recommendations (1 paragraph + bullet list)
6) Closing (1 paragraph, signed as teacher)

IMPORTANT:
- Write in an easy, professional, narrative style.
- Integrate grade information naturally in the narrative.
- Refer to the student in a way that matches the gender information above.
- Write for a mixed audience of family members and the student, so the wording should be respectful and family-friendly.
- Aim for 300-450 words per section.

Output the final result as one HTML block only.
        `.trim();
    }

    buildCustomPromptLanguageSuffix(requestedLanguages = ['en']) {
        const normalized = normalizeRequestedLanguages(requestedLanguages, { max: 2, fallback: ['en'] });
        const primary = normalized[0] || 'en';
        const secondary = normalized[1] || null;
        const primaryLabel = getLanguageLabel(primary);
        if (!secondary) {
            return `LANGUAGE REQUIREMENT: Output only in ${primaryLabel} (${primary}). Return only HTML.`;
        }
        const secondaryLabel = getLanguageLabel(secondary);
        return `LANGUAGE REQUIREMENT: Output bilingual HTML sections in this order: ${primaryLabel} (${primary}), then ${secondaryLabel} (${secondary}). Do not mix languages between sections.`;
    }

    /**
     * Track token usage for analytics and cost calculation
     */
    async trackTokenUsage(usageData) {
        const {
            userId,
            schoolId,
            studentId,
            reportType,
            language,
            requestedLanguages = [],
            dateRange,
            inputTokens,
            outputTokens,
            totalTokens
        } = usageData;

        // Calculate estimated cost (using Gemini 2.5 Flash pricing)
        const pricing = {
            input: 0.000125,  // per 1K tokens
            output: 0.000375  // per 1K tokens
        };

        const estimatedCost = (inputTokens * pricing.input / 1000) +
            (outputTokens * pricing.output / 1000);

        // Convert schoolId to string safely
        const schoolIdString = schoolId ? (typeof schoolId === 'string' ? schoolId : schoolId.toString()) : '';

        const tokenUsage = new AITokenUsage({
            model: 'gemini-2.5-flash',
            user: userId,
            school: schoolId,
            schoolId: schoolIdString,
            student: studentId,
            reportType,
            language,
            requestedLanguages,
            dateRange,
            inputTokens: inputTokens || 0,
            outputTokens: outputTokens || 0,
            totalTokens: totalTokens || 0,
            estimatedCost
        });

        return await tokenUsage.save();
    }

    /**
     * Legacy method for backward compatibility
     */
    async generateStudentReport(studentData, grades, period, teacher, options = {}) {
        const requestedLanguages = Array.isArray(options.requestedLanguages) && options.requestedLanguages.length > 0
            ? options.requestedLanguages
            : [options.primaryLanguage, options.secondaryLanguage].filter(Boolean);
        const result = await this.generateAdvancedReport({
            studentData,
            grades,
            period,
            teacher,
            language: options.language,
            requestedLanguages: requestedLanguages.length > 0 ? requestedLanguages : ['en'],
            reportType: 'monthly'
        });

        return result.text;
    }

    /**
     * Format a date range for report display/prompting
     */
    formatDateRange(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        const dateOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };

        return `${start.toLocaleDateString('en-US', dateOptions)} - ${end.toLocaleDateString('en-US', dateOptions)}`;
    }

    /**
     * Generate AI report for a custom date range
     */
    async generateDateRangeReport(studentData, grades, startDate, endDate, teacher, options = {}) {
        const requestedLanguages = Array.isArray(options.requestedLanguages) && options.requestedLanguages.length > 0
            ? options.requestedLanguages
            : [options.primaryLanguage, options.secondaryLanguage].filter(Boolean);
        const result = await this.generateAdvancedReport({
            studentData,
            grades,
            period: this.formatDateRange(startDate, endDate),
            teacher,
            language: options.language,
            requestedLanguages: requestedLanguages.length > 0 ? requestedLanguages : ['en'],
            reportType: 'custom',
            dateRange: {
                startDate,
                endDate
            }
        });

        return result.text;
    }
}

export default new AIService();
