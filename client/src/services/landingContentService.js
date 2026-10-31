import api from '../config/api';

export const getLandingContent = async (lang = 'en') => {
  const response = await api.get('/landing/content', {
    params: { lang },
    headers: {
      'Accept-Language': lang,
    },
  });
  return response.data?.data || {};
};

export const getLandingDynamicBlocks = async (lang = 'en') => {
  const response = await api.get('/landing/dynamic-blocks', {
    params: { lang },
    headers: {
      'Accept-Language': lang,
    },
  });
  return response.data?.data || {};
};

export const getAdminLandingContent = async () => {
  const response = await api.get('/landing/content/admin');
  return response.data?.data || {};
};

export const updateLandingContent = async (content) => {
  const response = await api.put('/landing/content', { content });
  return response.data?.data || {};
};

export const resetLandingContent = async () => {
  const response = await api.post('/landing/content/reset');
  return response.data?.data || {};
};

export const getLandingPlans = async () => {
  const response = await api.get('/landing/plans');
  return response.data?.data?.plans || [];
};

export const submitDemoRequest = async (payload) => {
  const response = await api.post('/landing/demo-requests', payload);
  return response.data?.data || {};
};

export const getDemoRequests = async ({ status, search, page, limit } = {}) => {
  const response = await api.get('/landing/demo-requests', {
    params: { status, search, page, limit },
  });
  return response.data?.data || {};
};

export const getDemoRequestSummary = async () => {
  const response = await api.get('/landing/demo-requests/summary');
  return response.data?.data || {};
};

export const updateDemoRequest = async (id, updates) => {
  const response = await api.patch(`/landing/demo-requests/${id}`, updates);
  return response.data?.data?.demoRequest || {};
};
