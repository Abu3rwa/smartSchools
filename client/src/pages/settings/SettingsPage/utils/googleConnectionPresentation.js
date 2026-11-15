export const CONNECTION_STATE = {
    LOADING: 'loading',
    CONNECTED: 'connected',
    NOT_CONNECTED: 'not_connected',
    EXPIRED: 'expired',
    UNAVAILABLE: 'unavailable',
    ERROR: 'error'
};

/** Shape of a status payload from the Gmail / Drive token services. */
export const fromTokenStatus = (status) => {
    if (!status?.connected) {
        return {
            state: status?.requiresReauth ? CONNECTION_STATE.EXPIRED : CONNECTION_STATE.NOT_CONNECTED,
            email: ''
        };
    }
    return { state: CONNECTION_STATE.CONNECTED, email: status.email || '' };
};

/** Shape of a status payload from the Classroom / Forms school services. */
export const fromSchoolService = (payload) => {
    const data = payload?.data || {};
    if (data.enabled === false) {
        return { state: CONNECTION_STATE.UNAVAILABLE, email: '' };
    }
    return fromTokenStatus(data);
};

/**
 * Gmail, Classroom and Forms are stored by one consent, so the group reads
 * as connected when any of them is; the email shown is the first real one.
 */
export const summarizeSuite = (rows = []) => ({
    connected: rows.some((row) => row?.state === CONNECTION_STATE.CONNECTED),
    email: rows.find((row) => row?.email)?.email || '',
    unavailable: rows.length > 0 && rows.every((row) => row?.state === CONNECTION_STATE.UNAVAILABLE)
});
