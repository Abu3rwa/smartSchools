import api from '../config/api';

const newsletterTemplateService = {
  listTemplates: async () => {
    const response = await api.get('/newsletter-templates');
    return response.data;
  },

  getTemplate: async (id) => {
    const response = await api.get(`/newsletter-templates/${id}`);
    return response.data;
  },

  getActiveDefault: async () => {
    const response = await api.get('/newsletter-templates/active-default');
    return response.data;
  },

  createTemplate: async (data) => {
    const response = await api.post('/newsletter-templates', data);
    return response.data;
  },

  updateTemplate: async (id, data) => {
    const response = await api.put(`/newsletter-templates/${id}`, data);
    return response.data;
  },

  deleteTemplate: async (id) => {
    const response = await api.delete(`/newsletter-templates/${id}`);
    return response.data;
  },

  duplicateTemplate: async (id) => {
    const response = await api.post(`/newsletter-templates/${id}/duplicate`);
    return response.data;
  },

  setDefault: async (id) => {
    const response = await api.patch(`/newsletter-templates/${id}/set-default`);
    return response.data;
  },
};

export default newsletterTemplateService;
