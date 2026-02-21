import api from '../config/api';

const BASE = '/messages';

/**
 * Fetch message threads for staff.
 * @param {{ page?: number, limit?: number, unreadOnly?: boolean }} params
 * @returns {Promise<{ items: Array, pagination: Object, unreadCount: number }>}
 */
export async function fetchMessageThreads(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.unreadOnly === true) query.set('unreadOnly', 'true');

    const suffix = query.toString();
    const { data } = await api.get(`${BASE}/threads${suffix ? `?${suffix}` : ''}`);
    if (!data.success) throw new Error(data.message || 'Failed to fetch message threads');
    return data.data;
}

/**
 * Fetch a single thread by id.
 * @param {string} threadId
 * @returns {Promise<{ thread: Object, messages: Array }>}
 */
export async function fetchMessageThreadById(threadId) {
    const { data } = await api.get(`${BASE}/threads/${threadId}`);
    if (!data.success) throw new Error(data.message || 'Failed to fetch message thread');
    return data.data;
}

/**
 * Create one-to-one threads to recipients and/or class audiences.
 * @param {{
 *  subject: string,
 *  body: string,
 *  recipientUserIds?: string[],
 *  classIds?: string[],
 *  includeParents?: boolean,
 *  includeStudents?: boolean
 * }} payload
 * @returns {Promise<{ threadId: string, messageId: string, recipientCount: number, threads?: Array }>}
 */
export async function createMessageThread(payload) {
    const { data } = await api.post(`${BASE}/threads`, payload);
    if (!data.success) throw new Error(data.message || 'Failed to create message thread');
    return data.data;
}

/**
 * Get class options with parent/student recipient counts for compose flow.
 * @param {{ search?: string, limit?: number }} params
 * @returns {Promise<{ classes: Array }>}
 */
export async function fetchMessageClasses(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.limit) query.set('limit', params.limit);

    const suffix = query.toString();
    const { data } = await api.get(`${BASE}/classes${suffix ? `?${suffix}` : ''}`);
    if (!data.success) throw new Error(data.message || 'Failed to fetch classes');
    return data.data;
}

/**
 * Reply to a thread.
 * @param {{ threadId: string, body: string }} payload
 * @returns {Promise<{ threadId: string, message: Object }>}
 */
export async function replyToMessageThread({ threadId, body }) {
    const { data } = await api.post(`${BASE}/threads/${threadId}/replies`, { body });
    if (!data.success) throw new Error(data.message || 'Failed to send reply');
    return data.data;
}

/**
 * Mark a thread as read.
 * @param {string} threadId
 * @returns {Promise<{ threadId: string, unreadCount: number }>}
 */
export async function markMessageThreadRead(threadId) {
    const { data } = await api.patch(`${BASE}/threads/${threadId}/read`);
    if (!data.success) throw new Error(data.message || 'Failed to mark thread read');
    return data.data;
}

/**
 * Search parents for composing a new thread.
 * @param {{ search?: string, page?: number, limit?: number }} params
 * @returns {Promise<{ parents: Array, pagination: Object }>}
 */
export async function fetchMessageParents(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);

    const suffix = query.toString();
    const { data } = await api.get(`${BASE}/parents${suffix ? `?${suffix}` : ''}`);
    if (!data.success) throw new Error(data.message || 'Failed to fetch parents');
    return data.data;
}
