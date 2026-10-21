import api from '../config/api';

const BASE = '/standard-assessment';

export const fetchPool = async (params = {}) => {
  const response = await api.get(`${BASE}/pool`, { params });
  return response.data.data;
};

export const fetchPoolQuestion = async (poolId, questionId) => {
  const response = await api.get(`${BASE}/pool/${poolId}/questions/${questionId}`);
  return response.data.data;
};

export const createAssessmentFromPool = async (data) => {
  const response = await api.post(`${BASE}/from-pool`, data);
  return response.data.data;
};

export const fetchSettings = async (section) => {
  const response = await api.get(`${BASE}/settings/${section}`);
  return response.data.data;
};

export const updateSettings = async (section, data) => {
  const response = await api.put(`${BASE}/settings/${section}`, data);
  return response.data.data;
};
