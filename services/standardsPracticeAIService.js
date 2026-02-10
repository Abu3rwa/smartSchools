import { connectAi } from '../utils/connectAi.js';

/**
 * AI Service for Standards Practice
 * Generates questions and evaluates student answers using Gemini AI
 */
class StandardsPracticeAIService {

    /**
     * Generate a practice question for a given standard
     * @param {Object} options
     * @param {Object} options.standard - The standard object (code, name, description, gradeLevel)
     * @param {String} options.subjectName - Name of the subject
     * @param {String} options.difficulty - easy, medium, hard
     * @param {String} options.questionType - multiple_choice, short_answer, true_false
     * @param {Array}  options.previousQuestions - array of previous questionText strings to avoid repeats
     * @returns {Promise<Object>} Structured question object
     */
    async generateQuestion(options) {
        const {
            standard,
            subjectName,
            difficulty = 'medium',
            questionType = 'multiple_choice',
            previousQuestions = []
        } = options;

        const avoidList = previousQuestions.length > 0
            ? `\n\nIMPORTANT: Do NOT repeat any of these previously asked questions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
            : '';

        const prompt = this._buildGeneratePrompt({
            standard,
            subjectName,
            difficulty,
            questionType,
            avoidList
        });

        try {
            const response = await connectAi(prompt);
            const parsed = this._parseJSON(response.text);

            if (!parsed || !parsed.questionText) {
                throw new Error('AI returned invalid question format');
            }

            return {
                questionText: parsed.questionText,
                questionType: parsed.questionType || questionType,
                options: parsed.options || [],
                correctAnswer: parsed.correctAnswer,
                explanation: parsed.explanation || '',
                difficulty: parsed.difficulty || difficulty,
                tokenUsage: {
                    input: response.inputtokenCount || 0,
                    output: response.outputtokenCount || 0,
                    total: response.totalTokenCount || 0
                }
            };
        } catch (error) {
            console.error('AI Question Generation Error:', error);
            throw new Error('Failed to generate practice question');
        }
    }

    /**
     * Evaluate a student's answer using AI
     * @param {Object} options
     * @param {String} options.questionText - The question
     * @param {String} options.correctAnswer - The correct answer
     * @param {String} options.studentAnswer - Student's answer
     * @param {String} options.questionType - Type of question
     * @param {Object} options.standard - The standard object
     * @returns {Promise<Object>} Evaluation result
     */
    async evaluateAnswer(options) {
        const {
            questionText,
            correctAnswer,
            studentAnswer,
            questionType,
            standard
        } = options;

        // For multiple choice and true/false, do exact match (no AI needed)
        if (questionType === 'multiple_choice' || questionType === 'true_false') {
            const isCorrect = studentAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase();
            return {
                isCorrect,
                feedback: isCorrect
                    ? 'Correct! Great job!'
                    : `Incorrect. The correct answer is ${correctAnswer}.`,
                tokenUsage: { input: 0, output: 0, total: 0 }
            };
        }

        // For short answer, use AI to evaluate
        const prompt = this._buildEvaluatePrompt({
            questionText,
            correctAnswer,
            studentAnswer,
            standard
        });

        try {
            const response = await connectAi(prompt);
            const parsed = this._parseJSON(response.text);

            if (!parsed) {
                // Fallback to simple comparison
                const isCorrect = studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
                return {
                    isCorrect,
                    feedback: isCorrect ? 'Correct!' : `The expected answer was: ${correctAnswer}`,
                    tokenUsage: {
                        input: response.inputtokenCount || 0,
                        output: response.outputtokenCount || 0,
                        total: response.totalTokenCount || 0
                    }
                };
            }

            return {
                isCorrect: parsed.isCorrect === true,
                feedback: parsed.feedback || '',
                tokenUsage: {
                    input: response.inputtokenCount || 0,
                    output: response.outputtokenCount || 0,
                    total: response.totalTokenCount || 0
                }
            };
        } catch (error) {
            console.error('AI Evaluation Error:', error);
            // Fallback
            const isCorrect = studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
            return {
                isCorrect,
                feedback: isCorrect ? 'Correct!' : `The expected answer was: ${correctAnswer}`
            };
        }
    }

    /**
     * Build the prompt for generating a question
     */
    _buildGeneratePrompt({ standard, subjectName, difficulty, questionType, avoidList }) {
        const typeInstructions = {
            multiple_choice: `Generate a multiple-choice question with exactly 4 options (A, B, C, D).
Include an "options" array with objects like: [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, {"label": "C", "text": "..."}, {"label": "D", "text": "..."}]
The "correctAnswer" should be the label letter (e.g., "A", "B", "C", or "D").`,
            short_answer: `Generate a short-answer question.
The "correctAnswer" should be a concise answer (1-3 sentences max).
Set "options" to an empty array [].`,
            true_false: `Generate a true/false question.
Include "options" as: [{"label": "True", "text": "True"}, {"label": "False", "text": "False"}]
The "correctAnswer" should be exactly "True" or "False".`
        };

        return `You are an expert ${subjectName} teacher creating a practice question for a Grade ${standard.gradeLevel} student.

STANDARD:
- Code: ${standard.code}
- Name: ${standard.name}
- Description: ${standard.description}
${standard.category ? `- Category: ${standard.category}` : ''}

DIFFICULTY: ${difficulty}
QUESTION TYPE: ${questionType}

${typeInstructions[questionType] || typeInstructions.multiple_choice}

RULES:
- The question MUST directly assess the standard described above.
- Use age-appropriate language for Grade ${standard.gradeLevel}.
- Difficulty "${difficulty}" means: easy = recall/basic, medium = application, hard = analysis/synthesis.
- Include a clear, educational explanation of WHY the correct answer is correct.
- Output ONLY valid JSON. No markdown, no code fences, no extra text.
${avoidList}

OUTPUT FORMAT (strict JSON):
{
  "questionText": "...",
  "questionType": "${questionType}",
  "options": [...],
  "correctAnswer": "...",
  "explanation": "...",
  "difficulty": "${difficulty}"
}`;
    }

    /**
     * Build the prompt for evaluating a short answer
     */
    _buildEvaluatePrompt({ questionText, correctAnswer, studentAnswer, standard }) {
        return `You are evaluating a student's answer to a practice question.

STANDARD: ${standard.code} - ${standard.name}
QUESTION: ${questionText}
EXPECTED ANSWER: ${correctAnswer}
STUDENT'S ANSWER: ${studentAnswer}

Evaluate whether the student's answer is correct. Be fair - accept answers that demonstrate understanding even if the wording differs from the expected answer. Minor spelling errors are acceptable if the concept is correct.

Output ONLY valid JSON:
{
  "isCorrect": true or false,
  "feedback": "Encouraging feedback explaining why the answer is correct or what the student should review"
}`;
    }

    /**
     * Parse JSON from AI response, handling common formatting issues
     */
    _parseJSON(text) {
        try {
            // Try direct parse first
            return JSON.parse(text);
        } catch (e) {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[1].trim());
                } catch (e2) {
                    // continue to next attempt
                }
            }

            // Try to find JSON object in the text
            const objectMatch = text.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                try {
                    return JSON.parse(objectMatch[0]);
                } catch (e3) {
                    // continue
                }
            }

            console.error('Failed to parse AI JSON response:', text.substring(0, 200));
            return null;
        }
    }
}

export default new StandardsPracticeAIService();
