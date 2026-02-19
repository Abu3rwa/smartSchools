import api from '../config/api';

export const getLandingContent = async () => {
  const response = await api.get('/landing/content');
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

