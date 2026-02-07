
import { GoogleGenAI } from "@google/genai";

class AIService {
    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY;
        console.log("Using API Key starting with:", apiKey);
        if (!apiKey) {
            console.warn('GOOGLE_API_KEY is not set in .env');
        } else {
            // Initialize with explicit key, or let it fallback to GOOGLE_API_KEY./GOOGLE_API_KEY env vars if supported by SDK defaults
            this.ai = new GoogleGenAI({ apiKey });
            // console.log(this.ai)
        }
    }

    /**
     * Generate a comprehensive student progress report
     * @param {Object} studentData - Student details
     * @param {Array} grades - List of recent grades
     * @param {String} period - Time period (e.g., "October 2023", "Term 1")
     * @param {Object} teacher - Teacher details
     * @returns {Promise<String>} Generated report text
     */
    async generateStudentReport(studentData, grades, period, teacher) {
        if (!this.ai) {
            throw new Error("AI Service is not configured (missing API Key)");
        }

        const prompt = this.constructReportPrompt(studentData, grades, period, teacher);

        try {
            // DEBUG: Check which key is being used
            console.log("Using API Key starting with:", this.ai.apiKey?.substring(0, 10) + "...");

            // Using the simpler "generateContent" method structure
            const response = await this.ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            });
            console.log(response.text);
            return response.text;
        } catch (error) {
            console.error("AI Generation Error:", error);
            throw new Error("Failed to generate AI report");
        }
    }

    /**
     * Construct the prompt for the AI model
     */
    constructReportPrompt(student, grades, period, teacher) {
        // Sort grades by date (Oldest -> Newest) to help AI see trends
        const sortedGrades = [...grades].sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate basic stats for context
        const totalMarks = sortedGrades.reduce((sum, g) => sum + g.marks, 0);
        const totalMax = sortedGrades.reduce((sum, g) => sum + g.maxMarks, 0);
        const average = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100) : 0;

        const subjects = [...new Set(sortedGrades.map(g => g.subject?.name || 'Unknown'))].join(', ');

        const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'The Teacher';

        // Format grades with dates to show progression
        const gradeList = sortedGrades.map(g => {
            const dateStr = new Date(g.date).toLocaleDateString();

            // Combine notes and remarks if they exist
            const notesAndRemarks = [g.notes, g.remarks]
                .filter(n => n && n.trim().length > 0)
                .join(' | ');

            const noteContent = notesAndRemarks ? `[NOTES: ${notesAndRemarks}]` : '';
            return `- ${dateStr} | ${g.subject?.name || 'Subject'}: ${g.marks}/${g.maxMarks} (${g.gradeType}) ${noteContent}`;
        }).join('\n');

        return `
        Role: You are an experienced, empathetic, and professional teacher at a school. 
        Task: Write a concise progress report email for a parent regarding their child's recent performance. You are their teacher, speak directly about them using their gender ${student.gender} .

        Student Name: ${student.firstName} 
        Period: ${period}
        Overall Average: ${average}%
        Subjects Covered: ${subjects}
        Sender Name: ${teacherName}
        

        Recent Grades Breakdown (Chronological Order):
        ${gradeList}

        Guidelines:
        1. **Structure (The Sandwich Method)**: You MUST structure the email body in three distinct parts:
            *   **Positive Opening**: Start with genuine praise, highlighting specific strengths, good grades, or positive behavioral notes.
            *   **Areas for Growth**: Constructively address the valid concerns, grade declines, or behavioral issues. Be direct but kind.
            *   **Positive Closing**: End with encouraging words, expressing confidence in the student's future success and next steps.
        2. **Analyze Trends**: Look at the chronological order of grades to identify if the student is improving or declining.
        3. **Focus on Behavior**: Pay special attention to the 'NOTES'. Behavior/effort comments are as important as grades.
        4. **Tone**: Professional, empathetic, and constructive.
        5. **Format**: Use HTML for readability (use <p>, <ul>, <li>, <strong>). Keep paragraphs short. nice colors for important words.
        6. **Length**: Keep it concise (approx 200-350 words).
        7. **Signature**: Sign off the email clearly with "Best regards," followed by the Sender Name provided above (${teacherName}) and nothing else. every phrase in a separate line.
        8. **Language**: Use English and Arabic translation(same content). 
        9. don't include any other text except the report.
        10. don't include the subject line. start with solution line
        11. the Arabic html should be from right to left. and English from left to write
        `;
    }

    /**
     * Generate AI report for a specific date range
     * @param {Object} studentData - Student details
     * @param {Array} grades - Filtered grades for the date range
     * @param {Date} startDate - Start date of the period
     * @param {Date} endDate - End date of the period
     * @param {Object} teacher - Teacher details
     * @returns {Promise<String>} Generated report text
     */
    async generateDateRangeReport(studentData, grades, startDate, endDate, teacher) {
        if (!this.ai) {
            throw new Error("AI Service is not configured (missing API Key)");
        }

        const period = this.formatDateRange(startDate, endDate);
        const prompt = this.constructReportPrompt(studentData, grades, period, teacher);

        try {
            console.log("Using API Key starting with:", this.ai.apiKey?.substring(0, 10) + "...");
            
            const response = await this.ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
            });
            console.log(response.text);
            return response.text;
        } catch (error) {
            console.error("AI Generation Error:", error);
            throw new Error("Failed to generate AI report");
        }
    }

    /**
     * Format date range for display
     */
    formatDateRange(startDate, endDate) {
        const startStr = startDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        const endStr = endDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        // If same day, just show one date
        if (startDate.toDateString() === endDate.toDateString()) {
            return startStr;
        }

        // If same month/year, shorten
        if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
            return `${startDate.toLocaleDateString('en-US', { month: 'long' })} ${startDate.getDate()}-${endDate.getDate()}, ${startDate.getFullYear()}`;
        }

        return `${startStr} to ${endStr}`;
    }
}

export default new AIService();