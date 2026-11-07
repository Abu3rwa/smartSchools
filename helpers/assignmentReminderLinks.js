import { URL } from 'node:url';

const toSafeLink = (rawUrl, rawTitle) => {
    try {
        const url = new URL(String(rawUrl || '').trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            return null;
        }
        return {
            title: String(rawTitle || '').trim() || url.hostname,
            url: url.href
        };
    } catch {
        return null;
    }
};

const getExternalLinks = (assignment) =>
    (Array.isArray(assignment?.links) ? assignment.links : [])
        .filter((link) => link?.type === 'external_url')
        .map((link) => toSafeLink(link.url, link.title))
        .filter(Boolean);

const getDriveAttachmentLinks = (assignment) =>
    (Array.isArray(assignment?.driveAttachments) ? assignment.driveAttachments : [])
        .map((att) => toSafeLink(att?.webViewLink, att?.fileName))
        .filter(Boolean);

export const buildAssignmentReminderContent = ({ reminderText, assignment }) => {
    const links = [...getExternalLinks(assignment), ...getDriveAttachmentLinks(assignment)];
    if (links.length === 0) {
        return { notificationText: reminderText, links };
    }

    const textLinks = links.map(({ title, url }) => `${title}: ${url}`).join('\n');
    return {
        notificationText: `${reminderText}\n\nAssignment links:\n${textLinks}`,
        links
    };
};
