import api from '../config/api';

const behaviorTrackingService = {
    trackEvent(payload) {
        return api.post('/behavior/events', payload);
    },

    startSession(metadata = {}) {
        return api.post('/behavior/sessions/start', { metadata });
    },

    heartbeatSession(sessionId) {
        return api.patch(`/behavior/sessions/${sessionId}/heartbeat`);
    },

    endSession(sessionId) {
        return api.post(`/behavior/sessions/${sessionId}/end`);
    },

    getDashboard(params = {}) {
        return api.get('/behavior/dashboard', { params });
    },

    getLiveSnapshot(params = {}) {
        return api.get('/behavior/live', { params });
    },

    getEvents(params = {}) {
        return api.get('/behavior/events', { params });
    },

    getActiveSessions(params = {}) {
        return api.get('/behavior/sessions/active', { params });
    }
};

export default behaviorTrackingService;