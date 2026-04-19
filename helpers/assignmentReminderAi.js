/**
 * Generate a clean, predictable reminder for parents about an upcoming assignment.
 *
 * @param {Object} params
 * @param {Object} params.assignment - Assignment document (title, dueDate, assignmentTypeName)
 * @param {string} params.studentName - Student's full name
 * @returns {{ subject: string, body: string }}
 */
export function generateAssignmentReminder({ assignment, studentName }) {
    const typeName = assignment.assignmentTypeName || 'Assignment';
    const title = assignment.title || typeName;
    const dueDate = assignment.dueDate
        ? new Date(assignment.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;
    const firstName = (studentName || 'your child').split(' ')[0];

    const subject = `Reminder: ${title}${dueDate ? ` — Due ${dueDate}` : ''}`;

    const body = dueDate
        ? `Just a friendly heads-up that ${firstName}'s ${typeName.toLowerCase()} is due on ${dueDate}. Hope they're having fun with it!`
        : `Just a friendly heads-up that ${firstName} has a ${typeName.toLowerCase()} "${title}" that needs to be completed. Please check the app for details.`;

    return { subject, body };
}
