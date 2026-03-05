import { connectAi } from "../utils/connectAi.js";
import { AITokenUsage } from "../models/AITokenUsage.js";

class AIService {
    constructor() {

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
     * @param {String} options.language - 'english', 'arabic', or 'bilingual'
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
            reportType = 'monthly',
            dateRange,
            customPrompt,
            userId = teacher?._id || teacher?.id,
            schoolId = teacher?.school || studentData?.school
        } = options;

        const prompt = customPrompt || this.constructAdvancedPrompt({
            studentData,
            grades,
            period,
            teacher,
            language,
            reportType,
            dateRange
        });

        try {
            let response = await connectAi(prompt);
            let inputTokens = response.inputtokenCount || 0;
            let outputTokens = response.outputtokenCount || 0;
            let totalTokens = response.totalTokenCount || 0;

            if (language === 'arabic' && this.containsEnglishText(response.text)) {
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
                language,
                dateRange,
                inputTokens,
                outputTokens,
                totalTokens
            });

            return {
                text: response.text,
                tokenUsage,
                language,
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

        // Format grades with dates
        const gradeList = sortedGrades.map(g => {
            const dateStr = new Date(g.date).toLocaleDateString();
            const notesAndRemarks = [g.notes, g.remarks]
                .filter(n => n && n.trim().length > 0)
                .join(' | ');
            const noteContent = notesAndRemarks ? `[NOTES: ${notesAndRemarks}]` : '';
            return `- ${dateStr} | ${g.subject?.name || 'Subject'}: ${g.marks}/${g.maxMarks} (${g.gradeType}) ${noteContent}`;
        }).join('\n');

        // Language-specific prompts
        if (language === 'arabic') {
            return `
أنت معلم محترف وودود. اكتب رسالة تقرير تقدم للوالدين باللغة العربية.

مهم جداً (قواعد الإخراج):
- اكتب HTML فقط.
- ممنوع Markdown نهائياً (ممنوع ** أو code fences).
- ممنوع رموز مزخرفة أو غريبة مثل @#$%^&*.
- ممنوع أي جمل أو كلمات إنجليزية داخل محتوى التقرير.
- لا تكتب أي شرح أو مقدمة خارج HTML.
- لا تكتب <html> أو <head> أو <body>.
- لا تستخدم جداول نهائياً.
- لا تستخدم ألوان inline أو style attributes.
- استخدم فقط: <div>, <p>, <ul>, <li>, <strong>, <span>.

- ضع dir="rtl" على <div> الخارجي.

بيانات الطالب:
- الاسم: ${studentData.firstName} ${studentData.lastName}
- الفترة: ${period}
- المعدل العام: ${average}%
- المواد: ${subjects}
- اسم المعلم: ${teacherName}

الدرجات (ترتيب زمني):
${gradeList}

الهيكل المطلوب داخل HTML:
1) <p>افتتاحية قصيرة</p>
2) <p><strong>نقاط القوة:</strong> ...</p>
3) <p><strong>مجالات للتحسين:</strong> ...</p>
4) <p><strong>ملخص الأداء:</strong> اعرض الدرجات كسرد نصي واضح داخل فقرات.</p>
5) <ul>كيف يمكنكم المساعدة في المنزل</ul>
6) <p>خاتمة وتوقيع باسم المعلم</p>

اكتب الناتج النهائي ككتلة HTML واحدة فقط.
            `.trim();
        }

        if (language === 'bilingual') {
            return `
Write a parent progress report in TWO SECTIONS: English then Arabic.

Very important output rules:
- Output ONLY HTML.
- No Markdown (no **, no code fences).
- No weird symbols like @#$%^&*.
- Do not include <html>, <head>, or <body>.
- No tables at all.
- No inline color styles or style attributes.
- Use only: <div>, <p>, <ul>, <li>, <strong>, <span>.

Student:
- Name: ${studentData.firstName} ${studentData.lastName}
- Period: ${period}
- Overall average: ${average}%
- Subjects: ${subjects}
- Teacher: ${teacherName}

Grades (chronological) - refer to these lines narratively:
${gradeList}

Output HTML structure:
- One outer <div>.
- Inside it:
  - <div dir="ltr">English section</div>
  - <div dir="rtl">Arabic section</div>

Each section must contain:
1) Greeting paragraph
2) Strengths paragraph
3) Areas for growth paragraph
4) Grades summary in narrative paragraph(s) (Date/Subject/Grade/Notes)
5) Bullet list: how to help at home
6) Closing + signature
            `.trim();
        }

        return `
You are an experienced, empathetic teacher. Write a detailed narrative progress report for parents in English.

CRITICAL OUTPUT RULES:
- Output ONLY HTML.
- NO Markdown (no **, no code fences).
- NO tables whatsoever - use narrative paragraphs only.
- NO inline color styles or style attributes.
- NO weird symbols like @#$%^&*.
- Do not include <html>, <head>, or <body>.
- Use only: <div>, <p>, <span>, <ul>, <li>, <strong>.
- Wrap everything in a single outer <div dir="ltr">.

Student Information:
- Name: ${studentData.firstName} ${studentData.lastName}
- Period: ${period}
- Overall average: ${average}%
- Subjects: ${subjects}
- Teacher: ${teacherName}

Grades (chronological):
${gradeList}

REQUIRED STRUCTURE (Positive-Negative-Positive):

1) **Opening Greeting** (1 paragraph)
   - Warm, personalized greeting to parents

2) **POSITIVE SECTION - Strengths & Achievements** (2-3 detailed paragraphs)
   - Highlight specific accomplishments and strong performances
   - Be specific with examples from the grades
   - Mention subjects where student excels

3) **NEGATIVE SECTION - Areas for Growth** (2 paragraphs)
   - Discuss challenges and areas needing improvement
   - Be constructive and supportive, not harsh
   - Provide specific examples

4) **POSITIVE SECTION - Progress & Encouragement** (2 paragraphs)
   - Highlight recent improvements or positive trends
   - Express confidence in student's ability to grow

5) **Recommendations** (1 paragraph with bullet list)
   - Practical suggestions for parents to support at home
   - Use <ul> and <li> tags

6) **Closing** (1 paragraph)
   - Encouraging final message
   - End with: "Teacher ${teacherName}"

IMPORTANT:
- Write in a warm, professional, narrative style
- NO tables - integrate grade information naturally into the narrative
- Be detailed and specific - aim for 400-500 words total
- Follow the positive-negative-positive sandwich structure strictly

Output the final report as ONE HTML block only.
        `.trim();
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
    async generateStudentReport(studentData, grades, period, teacher) {
        const result = await this.generateAdvancedReport({
            studentData,
            grades,
            period,
            teacher,
            language: 'english',
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
    async generateDateRangeReport(studentData, grades, startDate, endDate, teacher) {
        const result = await this.generateAdvancedReport({
            studentData,
            grades,
            period: this.formatDateRange(startDate, endDate),
            teacher,
            language: 'english',
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
