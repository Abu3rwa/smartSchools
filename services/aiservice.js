import { connectAi } from "../utils/connectAi.js";
import { AITokenUsage } from "../models/AITokenUsage.js";

class AIService {
    constructor() {
        
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
            userId,
            schoolId
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
            const response = await connectAi(prompt);
            
            // Track token usage
            const tokenUsage = await this.trackTokenUsage({
                userId,
                schoolId,
                studentId: studentData._id,
                reportType,
                language,
                dateRange,
                inputTokens: response.inputtokenCount || 0,
                outputTokens: response.outputtokenCount || 0,
                totalTokens: response.totalTokenCount || 0
            });

            return {
                text: response.text,
                tokenUsage,
                language,
                reportType
            };
        } catch (error) {
            console.error("AI Generation Error:", error);
            throw new Error("Failed to generate AI report");
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
- لا تكتب أي شرح أو مقدمة خارج HTML.
- لا تكتب <html> أو <head> أو <body>.
- استخدم فقط: <div>, <p>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <ul>, <li>, <strong>.

- ضع dir="rtl" على <div> الخارجي.

بيانات الطالب:
- الاسم: ${studentData.firstName} ${studentData.lastName}
- الفترة: ${period}
- المعدل العام: ${average}%
- المواد: ${subjects}
- اسم المعلم: ${teacherName}

الدرجات (ترتيب زمني) - استخدم هذه البيانات لإنشاء صفوف جدول:
${gradeList}

الهيكل المطلوب داخل HTML:
1) <p>افتتاحية قصيرة</p>
2) <p><strong>نقاط القوة:</strong> ...</p>
3) <p><strong>مجالات للتحسين:</strong> ...</p>
4) <table> جدول درجات منظم (التاريخ/المادة/الدرجة/ملاحظات) </table>
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
- Use only: <div>, <p>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <ul>, <li>, <strong>.

Student:
- Name: ${studentData.firstName} ${studentData.lastName}
- Period: ${period}
- Overall average: ${average}%
- Subjects: ${subjects}
- Teacher: ${teacherName}

Grades (chronological) - use these lines to build the grades table rows:
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
4) Grades table (Date/Subject/Grade/Notes)
5) Bullet list: how to help at home
6) Closing + signature
            `.trim();
        }

        return `
You are an experienced, empathetic teacher. Write a parent progress report in English.

Very important output rules:
- Output ONLY HTML.
- No Markdown (no **, no code fences).
- No weird symbols like @#$%^&*.
- Do not include <html>, <head>, or <body>.
- Use only: <div>, <p>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <ul>, <li>, <strong>.
- Wrap everything in a single outer <div dir="ltr">.

Student:
- Name: ${studentData.firstName} ${studentData.lastName}
- Period: ${period}
- Overall average: ${average}%
- Subjects: ${subjects}
- Teacher: ${teacherName}

Grades (chronological) - use these lines to build the grades table rows:
${gradeList}

HTML structure:
1) Greeting paragraph
2) Strengths paragraph
3) Areas for growth paragraph
4) Grades table (Date/Subject/Grade/Notes)
5) Bullet list: how to help at home
6) Closing + signature

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

        const tokenUsage = new AITokenUsage({
            model: 'gemini-2.5-flash',
            user: userId,
            school: schoolId,
            schoolId: schoolId.toString(),
            student: studentId,
            reportType,
            language,
            dateRange,
            inputTokens,
            outputTokens,
            totalTokens,
            estimatedCost
        });

        return await tokenUsage.save();
    }

    /**
     * Legacy method for backward compatibility
     */
    async generateStudentReport(studentData, grades, period, teacher) {
        return await this.generateAdvancedReport({
            studentData,
            grades,
            period,
            teacher,
            language: 'english',
            reportType: 'monthly'
        });
    }
}

export default new AIService();