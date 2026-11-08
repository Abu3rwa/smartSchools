import { buildAssignmentResourceLinks } from './assignmentResourceLinks.js';

export const buildAssignmentReminderContent = ({ reminderText, assignment, classroomUrl = '' }) => {
    const links = buildAssignmentResourceLinks(assignment, { classroomUrl });
    if (links.length === 0) {
        return { notificationText: reminderText, links };
    }

    const textLinks = links.map(({ title, url }) => `${title}: ${url}`).join('\n');
    return {
        notificationText: `${reminderText}\n\nAssignment links:\n${textLinks}`,
        links
    };
};
