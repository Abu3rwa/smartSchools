import { connectAiWithUsage } from '../utils/aiClientWithUsage.js';

/**
 * Generate a short, friendly AI-written reminder for parents about an upcoming assignment.
 *
 * @param {Object} params
 * @param {Object} params.assignment - Assignment document (title, instructions, dueDate, assignmentTypeName)
 * @param {string} params.studentName - Student's full name
 * @param {string} [params.tone] - 'friendly' | 'formal' | 'encouraging' (default 'friendly')
 * @param {Object} params.tracking - { schoolId, userId }
 * @returns {Promise<{ subject: string, body: string }>}
 */
export async function generateAssignmentReminder({ assignment, studentName, tone = 'friendly', tracking }) {
    const typeName = assignment.assignmentTypeName || 'Assignment';
    const title = assignment.title || typeName;
    const dueDate = assignment.dueDate
        ? new Date(assignment.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;
    const instructions = (assignment.instructions || '').slice(0, 300);

    const prompt = [
        `Write a short, ${tone} reminder for a parent about their child's upcoming school ${typeName.toLowerCase()}.`,
        `Student name: ${studentName}`,
        `${typeName} title: ${title}`,
        dueDate ? `Due date: ${dueDate}` : 'No due date set.',
        instructions ? `Brief description: ${instructions}` : '',
        '',
        'Rules:',
        '- 2-3 sentences max.',
        '- Address the parent warmly but briefly.',
        '- Mention the student by first name only.',
        '- Include the due date if provided.',
        '- Do NOT include a greeting like "Dear Parent".',
        '- Do NOT include a sign-off or signature.',
        '- Output only the reminder body text, nothing else.',
    ].filter(Boolean).join('\n');

    const response = await connectAiWithUsage(prompt, {}, {
        feature: 'assignment_reminder',
        schoolId: tracking.schoolId,
        userId: tracking.userId,
        entityType: 'Assignment',
        entityId: assignment._id,
    });

    const body = (response.text || '').trim();
    const subject = `Reminder: ${title}${dueDate ? ` — Due ${dueDate}` : ''}`;

    return { subject, body };
}
