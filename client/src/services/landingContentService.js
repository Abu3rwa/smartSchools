import api from '../config/api';
import {
    parseDemoRequestPayload,
    parseLandingPlansPayload,
    parseLandingSchoolsPayload,
    toLandingServiceError,
} from './landingContentContracts.js';

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

let pendingPlansRequest = null;

export const getLandingPlans = () => {
  if (pendingPlansRequest) return pendingPlansRequest;

  const request = api
    .get('/landing/plans', { skipErrorToast: true })
    .then((response) => parseLandingPlansPayload(response?.data))
    .catch((error) => {
      throw toLandingServiceError(error);
    });

  pendingPlansRequest = request;

  const clearPending = () => {
    if (pendingPlansRequest === request) pendingPlansRequest = null;
  };
  request.then(clearPending, clearPending);

  return request;
};

export const searchLandingSchools = async (query, { signal } = {}) => {
  try {
    const response = await api.get('/landing/schools', {
      params: { q: query },
      signal,
      skipErrorToast: true,
    });
    return parseLandingSchoolsPayload(response?.data);
  } catch (error) {
    throw toLandingServiceError(error);
  }
};

export const submitDemoRequest = async (payload) => {
  try {
    const response = await api.post('/landing/demo-requests', payload, { skipErrorToast: true });
    return parseDemoRequestPayload(response?.data);
  } catch (error) {
    throw toLandingServiceError(error);
  }
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
