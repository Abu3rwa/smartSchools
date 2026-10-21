import { URL } from 'node:url';

const getExternalLinks = (assignment) =>
    (Array.isArray(assignment?.links) ? assignment.links : [])
        .filter((link) => link?.type === 'external_url')
        .map((link) => {
            try {
                const url = new URL(String(link.url || '').trim());
                if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
                    return null;
                }
                return {
                    title: String(link.title || '').trim() || url.hostname,
                    url: url.href
                };
            } catch {
                return null;
            }
        })
        .filter(Boolean);

export const buildAssignmentReminderContent = ({ reminderText, assignment }) => {
    const links = getExternalLinks(assignment);
    if (links.length === 0) {
        return { notificationText: reminderText, links };
    }

    const textLinks = links.map(({ title, url }) => `${title}: ${url}`).join('\n');
    return {
        notificationText: `${reminderText}\n\nAssignment links:\n${textLinks}`,
        links
    };
};
