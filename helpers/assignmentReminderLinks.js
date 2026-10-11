import { URL } from 'node:url';

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

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
        return { notificationText: reminderText, linksHtml: '' };
    }

    const textLinks = links.map(({ title, url }) => `${title}: ${url}`).join('\n');
    const linksHtml = [
        '<p><strong>Assignment links:</strong></p>',
        '<ul>',
        ...links.map(({ title, url }) =>
            `<li><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></li>`
        ),
        '</ul>'
    ].join('');

    return {
        notificationText: `${reminderText}\n\nAssignment links:\n${textLinks}`,
        linksHtml
    };
};
