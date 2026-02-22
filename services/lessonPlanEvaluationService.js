import LessonPlan from '../models/LessonPlan.js';
import { connectAi } from '../utils/connectAi.js';
import { AITokenUsage } from '../models/AITokenUsage.js';

const MODEL_NAME = 'gemini-2.0-flash-exp';

export const evaluateLessonPlan = async (lessonPlanId, criteria) => {
  try {
    const lessonPlan = await LessonPlan.findById(lessonPlanId)
      .populate('class', 'name grade')
      .populate('subject', 'name')
      .populate('teacher', 'firstName lastName email');

    if (!lessonPlan) {
      throw new Error('Lesson plan not found');
    }

    const evaluationPrompt = buildEvaluationPrompt(lessonPlan, criteria);
    
    const aiResponse = await connectAi(evaluationPrompt, { modelName: MODEL_NAME });
    const text = aiResponse.text;

    const evaluation = parseAIResponse(text, criteria);
    
    lessonPlan.aiEvaluation = {
      overallScore: evaluation.overallScore,
      criteriaScores: evaluation.criteriaScores,
      strengths: evaluation.strengths,
      areasForImprovement: evaluation.areasForImprovement,
      recommendations: evaluation.recommendations,
      meetsMinimumRequirements: evaluation.meetsMinimumRequirements,
      evaluatedBy: 'AI',
      evaluatedAt: new Date()
    };

    if (evaluation.meetsMinimumRequirements) {
      lessonPlan.status = 'approved';
    } else {
      lessonPlan.status = 'needs_revision';
    }

    lessonPlan.evaluatedAt = new Date();
    await lessonPlan.save();

    if (lessonPlan.school && lessonPlan.teacher) {
      const tokenUsage = {
        input: aiResponse.inputtokenCount || 0,
        output: aiResponse.outputtokenCount || 0,
        total: aiResponse.totalTokenCount || 0
      };

      await AITokenUsage.create({
        model: aiResponse.modelName || MODEL_NAME,
        feature: 'lesson_plan_evaluation',
        school: lessonPlan.school,
        user: lessonPlan.teacher._id,
        inputTokens: tokenUsage.input,
        outputTokens: tokenUsage.output,
        totalTokens: tokenUsage.total,
        schoolId: lessonPlan.school.toString(),
        metadata: { 
          lessonPlanId: lessonPlanId.toString(),
          criteriaCount: criteria.length
        }
      });
    }

    return lessonPlan.aiEvaluation;
  } catch (error) {
    console.error('Error evaluating lesson plan:', error);
    throw new Error(`Failed to evaluate lesson plan: ${error.message}`);
  }
};

const buildEvaluationPrompt = (lessonPlan, criteria) => {
  const lessonContent = `
LESSON PLAN DETAILS:
- Topic: ${lessonPlan.topic || lessonPlan.title || 'Not specified'}
- Subject: ${lessonPlan.subject?.name || 'Not specified'}
- Grade/Class: ${lessonPlan.class?.name || 'Not specified'} (Grade ${lessonPlan.class?.grade || 'N/A'})
- Date: ${lessonPlan.date ? new Date(lessonPlan.date).toLocaleDateString() : 'Not specified'}

LEARNING OBJECTIVES:
${lessonPlan.learningObjectives || lessonPlan.teachingObjectives || 'Not specified'}

INSTRUCTIONAL ACTIVITIES:
${lessonPlan.activities || formatStages(lessonPlan.stages) || lessonPlan.description || 'Not specified'}

ASSESSMENT METHODS:
${lessonPlan.assessmentMethods || 'Not specified'}

RESOURCES AND MATERIALS:
${lessonPlan.resources || formatStageMaterials(lessonPlan.stages) || 'Not specified'}

DIFFERENTIATION STRATEGIES:
${lessonPlan.differentiation || 'Not specified'}

ADDITIONAL INFORMATION:
- Summary: ${lessonPlan.summary || 'Not specified'}
- Previous Knowledge: ${lessonPlan.previousKnowledge || 'Not specified'}
- Vocabulary: ${lessonPlan.vocabulary || 'Not specified'}
- Technology Integration: ${lessonPlan.techIntegration || 'Not specified'}
- Homework: ${lessonPlan.homework || 'Not specified'}
`.trim();

  const criteriaText = criteria.map((c, index) => `
${index + 1}. ${c.name} (Weight: ${c.weight}/5, Minimum Score: ${c.minScore}/100)
   Description: ${c.description || 'No description provided'}
   Evaluation Guidance: ${c.evaluationPrompt || 'Evaluate based on best practices'}
   Required: ${c.isRequired ? 'Yes' : 'No'}
`).join('\n');

  return `You are an expert educational evaluator. Evaluate the following lesson plan against specific criteria defined by the school.

${lessonContent}

EVALUATION CRITERIA:
${criteriaText}

INSTRUCTIONS:
1. Carefully evaluate the lesson plan against each criterion listed above
2. Provide a score from 0-100 for each criterion based on the evaluation guidance
3. Provide specific, constructive feedback for each criterion (2-3 sentences)
4. Determine if each criterion meets its minimum score requirement
5. Identify 2-4 key strengths of the lesson plan
6. Identify 2-4 areas that need improvement
7. Provide 2-4 actionable, specific recommendations for improvement
8. Calculate the overall weighted score
9. Determine if the lesson plan meets minimum requirements (all required criteria must meet their minimum scores)

OUTPUT FORMAT - You MUST respond with ONLY valid JSON in this exact structure:
{
  "criteriaScores": [
    {
      "criteriaName": "exact name from criteria list",
      "score": number between 0-100,
      "feedback": "specific constructive feedback",
      "metMinimum": true or false
    }
  ],
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "areasForImprovement": ["area 1", "area 2", "area 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "overallScore": number between 0-100,
  "meetsMinimumRequirements": true or false
}

IMPORTANT: 
- Respond ONLY with the JSON object, no additional text
- Be specific and constructive in feedback
- Base scores on evidence in the lesson plan
- Ensure all required criteria meet minimum scores for meetsMinimumRequirements to be true`;
};

const formatStages = (stages) => {
  if (!stages || stages.length === 0) return '';
  return stages.map((stage, index) => 
    `Stage ${index + 1}: ${stage.name || 'Unnamed'}\n${stage.procedure || 'No procedure specified'}\nTiming: ${stage.timing || 'Not specified'}`
  ).join('\n\n');
};

const formatStageMaterials = (stages) => {
  if (!stages || stages.length === 0) return '';
  return stages.map(stage => stage.materials).filter(Boolean).join(', ');
};

const parseAIResponse = (text, criteria) => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.criteriaScores || !Array.isArray(parsed.criteriaScores)) {
      throw new Error('Invalid criteriaScores in AI response');
    }

    const criteriaScores = parsed.criteriaScores.map((score, index) => {
      const criterion = criteria.find(c => c.name === score.criteriaName) || criteria[index];
      return {
        criteriaId: criterion._id,
        criteriaName: score.criteriaName || criterion.name,
        score: Math.min(100, Math.max(0, score.score || 0)),
        feedback: score.feedback || 'No feedback provided',
        metMinimum: score.metMinimum !== undefined ? score.metMinimum : (score.score >= criterion.minScore)
      };
    });

    const totalWeight = criteria.reduce((sum, c) => sum + (c.weight || 1), 0);
    const weightedScore = criteriaScores.reduce((sum, score, index) => {
      const weight = criteria[index]?.weight || 1;
      return sum + (score.score * weight);
    }, 0);
    const overallScore = Math.round(weightedScore / totalWeight);

    const meetsMinimumRequirements = criteriaScores.every((score, index) => {
      const criterion = criteria[index];
      if (!criterion.isRequired) return true;
      return score.metMinimum;
    });

    return {
      criteriaScores,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
      areasForImprovement: Array.isArray(parsed.areasForImprovement) ? parsed.areasForImprovement.slice(0, 5) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5) : [],
      overallScore,
      meetsMinimumRequirements
    };
  } catch (error) {
    console.error('Error parsing AI response:', error);
    console.error('AI Response:', text);
    throw new Error(`Failed to parse AI evaluation response: ${error.message}`);
  }
};
