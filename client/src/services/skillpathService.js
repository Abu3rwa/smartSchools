import api from "../config/api";

const BASE = "/language-games";

const skillpathService = {
  getSkills: async (params = {}) => {
    const response = await api.get(`${BASE}/skills`, { params });
    return response.data.data;
  },
  createSkill: async (payload) => {
    const response = await api.post(`${BASE}/skills`, payload);
    return response.data.data;
  },
  updateSkill: async (id, payload) => {
    const response = await api.patch(`${BASE}/skills/${id}`, payload);
    return response.data.data;
  },
  deleteSkill: async (id) => {
    const response = await api.delete(`${BASE}/skills/${id}`);
    return response.data.data;
  },

  getPacks: async (params = {}) => {
    const response = await api.get(`${BASE}/packs`, { params });
    return response.data.data;
  },
  getPack: async (id) => {
    const response = await api.get(`${BASE}/packs/${id}`);
    return response.data.data;
  },
  createPack: async (payload) => {
    const response = await api.post(`${BASE}/packs`, payload);
    return response.data.data;
  },
  updatePack: async (id, payload) => {
    const response = await api.patch(`${BASE}/packs/${id}`, payload);
    return response.data.data;
  },
  publishPack: async (id) => {
    const response = await api.post(`${BASE}/packs/${id}/publish`);
    return response.data.data;
  },
  archivePack: async (id) => {
    const response = await api.post(`${BASE}/packs/${id}/archive`);
    return response.data.data;
  },
  deletePack: async (id) => {
    const response = await api.delete(`${BASE}/packs/${id}`);
    return response.data.data;
  },
  getPackReport: async (id) => {
    const response = await api.get(`${BASE}/packs/${id}/report`);
    return response.data.data;
  },

  downloadTemplate: async (type, { target = "single", skillId } = {}) => {
    const response = await api.get(`${BASE}/import/templates/${type}`, {
      params: { target, ...(skillId ? { skillId } : {}) },
      responseType: "blob"
    });
    return response.data;
  },
  getImportPrompt: async (type, { target = "single", skillId } = {}) => {
    const response = await api.get(`${BASE}/import/prompt/${type}`, {
      params: { target, ...(skillId ? { skillId } : {}) }
    });
    return response.data.data;
  },
  previewImport: async (payload) => {
    const response = await api.post(`${BASE}/import/preview`, payload);
    return response.data.data;
  },
  commitImport: async (payload) => {
    const response = await api.post(`${BASE}/import/commit`, payload);
    return response.data.data;
  },
  listQuestionPools: async (params = {}) => {
    const response = await api.get(`${BASE}/question-pools`, { params });
    return response.data.data;
  },
  previewPoolImport: async (payload) => {
    const response = await api.post(`${BASE}/import/pool-preview`, payload);
    return response.data.data;
  },

  getAssignments: async () => {
    const response = await api.get(`${BASE}/assignments`);
    return response.data.data;
  },
  createAssignment: async (payload) => {
    const response = await api.post(`${BASE}/assignments`, payload);
    return response.data.data;
  },
  closeAssignment: async (id) => {
    const response = await api.post(`${BASE}/assignments/${id}/close`);
    return response.data.data;
  },

  getStudentHome: async () => {
    const response = await api.get(`${BASE}/student/home`);
    return response.data.data;
  },
  getMyClasses: async () => {
    const response = await api.get(`${BASE}/student/classes`);
    return response.data.data;
  },
  startSession: async (payload) => {
    const response = await api.post(`${BASE}/student/sessions`, payload);
    return response.data.data;
  },
  getSession: async (id) => {
    const response = await api.get(`${BASE}/student/sessions/${id}`);
    return response.data.data;
  },
  answerSession: async (id, payload) => {
    const response = await api.post(`${BASE}/student/sessions/${id}/answer`, payload);
    return response.data.data;
  },
  completeSession: async (id) => {
    const response = await api.post(`${BASE}/student/sessions/${id}/complete`);
    return response.data.data;
  },
  getStudentProgress: async () => {
    const response = await api.get(`${BASE}/student/progress`);
    return response.data.data;
  },

  getLeaderboard: async (params = {}) => {
    const response = await api.get(`${BASE}/leaderboard`, { params });
    return response.data.data;
  },
  setClassLeaderboard: async (classId, enabled) => {
    const response = await api.put(`${BASE}/classes/${classId}/leaderboard-setting`, { enabled });
    return response.data.data;
  },
  giveReward: async (classId, payload) => {
    const response = await api.post(`${BASE}/classes/${classId}/rewards`, payload);
    return response.data.data;
  },
  getClassRewards: async (classId) => {
    const response = await api.get(`${BASE}/classes/${classId}/rewards`);
    return response.data.data;
  },
  getMyRewards: async () => {
    const response = await api.get(`${BASE}/rewards/mine`);
    return response.data.data;
  }
};

export default skillpathService;
