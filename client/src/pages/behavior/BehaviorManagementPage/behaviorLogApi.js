import api from '../../../config/api';

const base = '/teacher/behavior';
const data = (response) => response.data.data;
export const behaviorLogApi = {
    roster: () => api.get(`${base}/roster`).then(data),
    catalog: () => api.get(`${base}/catalog`).then(data),
    list: (params, signal) =>
        api.get(`${base}/entries`, { params, signal }).then(data),
    create: (payload) => api.post(`${base}/entries`, payload).then(data),
    detail: (id) => api.get(`${base}/entries/${id}`).then(data),
    action: (id, action, payload = {}) =>
        api.post(`${base}/entries/${id}/${action}`, payload).then(data),
    refine: (payload, signal) =>
        api.post(`${base}/refine`, payload, { signal }).then(data)
};
export const behaviorError = (error, t) => {
    const code = error?.response?.data?.code;
    return t(`behaviorLog.errors.${code}`, {
        defaultValue: t('behaviorLog.failed')
    });
};
