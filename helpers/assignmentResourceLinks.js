import { URL } from 'node:url';

export const toSafeLink = (rawUrl, rawTitle) => {
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

/**
 * Every place an assignment can send a student/parent: external links, Drive
 * files, and the Google Classroom coursework it was posted to. The detail page
 * and all notification emails read from here so the two can never disagree.
 */
export const buildAssignmentResourceLinks = (assignment, { classroomUrl = '' } = {}) => {
    const links = [];
    const seen = new Set();

    const push = (link) => {
        if (!link || seen.has(link.url)) return;
        seen.add(link.url);
        links.push(link);
    };

    for (const link of Array.isArray(assignment?.links) ? assignment.links : []) {
        if (link?.type !== 'external_url') continue;
        push(toSafeLink(link.url, link.title));
    }

    for (const att of Array.isArray(assignment?.driveAttachments) ? assignment.driveAttachments : []) {
        push(toSafeLink(att?.webViewLink, att?.fileName));
    }

    push(toSafeLink(classroomUrl, 'Google Classroom'));

    return links;
};
