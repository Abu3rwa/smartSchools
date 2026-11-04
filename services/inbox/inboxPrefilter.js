/** Newsletter and robot mail is ignored before any AI call. */

const headerValue = (headers, name) => {
    const target = name.toLowerCase();
    if (Array.isArray(headers)) {
        const found = headers.find((header) => String(header?.name || '').toLowerCase() === target);
        return found ? String(found.value ?? '') : '';
    }
    if (headers && typeof headers === 'object') {
        const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === target);
        return key ? String(headers[key] ?? '') : '';
    }
    return '';
};

const hasHeader = (headers, name) => {
    if (Array.isArray(headers)) {
        return headers.some((header) => String(header?.name || '').toLowerCase() === name.toLowerCase());
    }
    if (headers && typeof headers === 'object') {
        return Object.keys(headers).some((candidate) => candidate.toLowerCase() === name.toLowerCase());
    }
    return false;
};

const ignore = (reason) => ({ priority: 'ignore', reason });

const AUTOMATED_ADDRESS = /^(no-?reply|do-?not-?reply|mailer-daemon|notifications?)(?:[+._-].*)?$/i;

export const classifyByRule = (headers, fromEmail = '') => {
    const precedence = headerValue(headers, 'precedence').trim().toLowerCase();
    if (['bulk', 'list', 'junk'].includes(precedence)) {
        return ignore('It is a bulk mailing.');
    }

    const autoSubmitted = headerValue(headers, 'auto-submitted').trim().toLowerCase();
    if (autoSubmitted && autoSubmitted !== 'no') {
        return ignore('It is an automatic message.');
    }

    if (hasHeader(headers, 'list-unsubscribe')) {
        return ignore('It is a newsletter you can unsubscribe from.');
    }

    const localPart = String(fromEmail).split('@')[0].trim().toLowerCase();
    if (AUTOMATED_ADDRESS.test(localPart)) {
        return ignore('It was sent by an automated address.');
    }

    return null;
};

/** A person who uses this school is never ignored by a mailing header. */
export const ruleResultForSender = ({ headers, fromEmail, senderRole = '' } = {}) =>
    senderRole ? null : classifyByRule(headers, fromEmail);
