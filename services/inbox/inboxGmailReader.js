import gmailOAuthService from '../gmailOAuthService.js';
import { extractPlainText } from './inboxBodyText.js';

const INBOX_QUERY = 'in:inbox -category:promotions -category:social -category:updates -category:forums';
const INCLUDED_QUERY = 'in:inbox';
const FETCH_PARALLEL = 5;
const HEADER_NAMES = [
    'From',
    'Reply-To',
    'To',
    'Cc',
    'Subject',
    'Date',
    'Message-ID',
    'References',
    'List-Unsubscribe',
    'Precedence',
    'Auto-Submitted'
];

const createError = (message, statusCode = 400, code) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (code) error.code = code;
    return error;
};

const isRateLimit = (error) => {
    if (error?.code === 429 || error?.response?.status === 429) return true;
    const reasons = [
        ...(error?.errors || []),
        ...(error?.response?.data?.error?.errors || [])
    ].map((item) => item?.reason);
    return reasons.includes('rateLimitExceeded') || reasons.includes('userRateLimitExceeded');
};

const mapGmailError = (error) => {
    if (error?.code === 'GMAIL_MODIFY_SCOPE_REQUIRED') {
        return createError(
            'Reconnect Google and allow access to your mailbox.',
            403,
            'GMAIL_MODIFY_SCOPE_REQUIRED'
        );
    }
    if (error?.code === 'GMAIL_REAUTH_REQUIRED') {
        if (!error.statusCode) error.statusCode = 401;
        return error;
    }
    if (isRateLimit(error)) {
        return createError('Gmail is busy. Try again in a minute.', 429, 'GMAIL_RATE_LIMITED');
    }
    return error;
};

const withGmailErrors = async (fn) => {
    try {
        return await fn();
    } catch (error) {
        throw mapGmailError(error);
    }
};

const readHeaders = (payload) => {
    const headers = {};
    for (const header of payload?.headers || []) {
        const name = String(header.name || '').toLowerCase();
        if (HEADER_NAMES.some((known) => known.toLowerCase() === name)) {
            headers[name] = header.value || '';
        }
    }
    return headers;
};

export const parseAddress = (raw = '') => {
    const text = String(raw || '').trim();
    const match = text.match(/<([^<>]+)>/);
    const email = (match ? match[1] : text).trim().toLowerCase();
    const name = match ? text.slice(0, match.index).trim().replace(/^"(.*)"$/, '$1') : '';
    return { name, email };
};

const parseAddressList = (raw = '') => String(raw || '')
    .split(',')
    .map((entry) => parseAddress(entry).email)
    .filter(Boolean);

const toMessage = (message, accountEmail) => {
    const headers = readHeaders(message.payload);
    const from = parseAddress(headers.from);
    if (!from.email || from.email === String(accountEmail || '').toLowerCase()) return null;

    return {
        id: message.id,
        threadId: message.threadId,
        internalDate: Number(message.internalDate) || 0,
        receivedAt: new Date(Number(message.internalDate) || Date.now()),
        labelIds: message.labelIds || [],
        headers,
        fromName: from.name,
        fromEmail: from.email,
        replyToEmail: parseAddress(headers['reply-to']).email,
        toEmails: parseAddressList(headers.to),
        ccEmails: parseAddressList(headers.cc),
        subject: headers.subject || '',
        messageIdHeader: headers['message-id'] || '',
        referencesHeader: headers.references || '',
        bodyText: extractPlainText(message.payload)
    };
};

const mapWithLimit = async (items, limit, fn) => {
    const results = [];
    for (let index = 0; index < items.length; index += limit) {
        const batch = await Promise.all(items.slice(index, index + limit).map(fn));
        results.push(...batch);
    }
    return results;
};

const inboxGmailReader = {
    async listInboxIds(userId, { limit = 25, includeCategories = false } = {}) {
        const { gmail } = await gmailOAuthService.getAuthorizedGmailClient(userId, { requireModify: true });
        const response = await withGmailErrors(() => gmail.users.messages.list({
            userId: 'me',
            q: includeCategories ? INCLUDED_QUERY : INBOX_QUERY,
            maxResults: Math.max(1, Math.floor(Number(limit) || 25))
        }));

        const seen = new Set();
        return (response.data.messages || [])
            .filter((message) => {
                if (!message.id || seen.has(message.id)) return false;
                seen.add(message.id);
                return true;
            })
            .map((message) => ({ id: message.id, threadId: message.threadId || '' }));
    },

    async fetchMessages(userId, ids = []) {
        const unique = [...new Set(ids.filter(Boolean))];
        if (!unique.length) return [];

        const { gmail, accountEmail } = await gmailOAuthService.getAuthorizedGmailClient(userId, { requireModify: true });
        const messages = await mapWithLimit(unique, FETCH_PARALLEL, async (id) => {
            const response = await withGmailErrors(() => gmail.users.messages.get({
                userId: 'me',
                id,
                format: 'full'
            }));
            return toMessage(response.data, accountEmail);
        });

        return messages.filter(Boolean);
    },

    async getThread(userId, threadId) {
        const { gmail } = await gmailOAuthService.getAuthorizedGmailClient(userId, { requireModify: true });
        const response = await withGmailErrors(() => gmail.users.threads.get({
            userId: 'me',
            id: threadId,
            format: 'metadata'
        }));
        return (response.data.messages || []).map((message) => ({
            id: message.id,
            labelIds: message.labelIds || [],
            internalDate: Number(message.internalDate) || 0
        }));
    }
};

export default inboxGmailReader;
