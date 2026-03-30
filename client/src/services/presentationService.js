import api from "../config/api";

const presentationService = {
  uploadMaterials: async (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const response = await api.post("/presentations/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  generate: async (data) => {
    const response = await api.post("/presentations/generate", data);
    return response.data;
  },

  list: async (params = {}) => {
    const response = await api.get("/presentations", { params });
    return response.data;
  },

  get: async (id) => {
    const response = await api.get(`/presentations/${id}`);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/presentations/${id}`, data);
    return response.data;
  },

  updateSlide: async (id, slideIndex, data) => {
    const response = await api.put(
      `/presentations/${id}/slides/${slideIndex}`,
      data
    );
    return response.data;
  },

  patchSlide: async (id, slideIndex, data) => {
    const response = await api.patch(
      `/presentations/${id}/slides/${slideIndex}/patch`,
      data
    );
    return response.data;
  },

  applyLayoutToSlide: async (id, slideIndex, data) => {
    const response = await api.post(
      `/presentations/${id}/slides/${slideIndex}/apply-layout`,
      data
    );
    return response.data;
  },

  regenerateSlide: async (id, slideIndex, data) => {
    const response = await api.post(
      `/presentations/${id}/slides/${slideIndex}/regenerate`,
      data
    );
    return response.data;
  },

  textAssist: async (id, slideIndex, data) => {
    const response = await api.post(
      `/presentations/${id}/slides/${slideIndex}/text-assist`,
      data
    );
    return response.data;
  },

  reorder: async (id, slideOrder) => {
    const response = await api.put(`/presentations/${id}/reorder`, {
      slideOrder,
    });
    return response.data;
  },

  exportPdf: async (id) => {
    const response = await api.get(`/presentations/${id}/export/pdf`, {
      responseType: "blob",
    });
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/presentations/${id}`);
    return response.data;
  },

  listComments: async (id, params = {}) => {
    const response = await api.get(`/presentations/${id}/comments`, { params });
    return response.data;
  },

  addComment: async (id, data) => {
    const response = await api.post(`/presentations/${id}/comments`, data);
    return response.data;
  },

  resolveComment: async (id, commentId, data) => {
    const response = await api.patch(`/presentations/${id}/comments/${commentId}`, data);
    return response.data;
  },

  deleteComment: async (id, commentId) => {
    const response = await api.delete(`/presentations/${id}/comments/${commentId}`);
    return response.data;
  },

  listTemplates: async () => {
    const response = await api.get("/presentations/templates");
    return response.data;
  },

  createTemplate: async (data) => {
    const response = await api.post("/presentations/templates", data);
    return response.data;
  },

  updateTemplate: async (id, data) => {
    const response = await api.put(`/presentations/templates/${id}`, data);
    return response.data;
  },

  deleteTemplate: async (id) => {
    const response = await api.delete(`/presentations/templates/${id}`);
    return response.data;
  },
};

export default presentationService;
