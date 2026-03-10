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
