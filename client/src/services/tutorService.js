import api from '../config/api.js';

export const tutorService = {
  // Student
  me: (params) => api.get('/tutor/me', { params }),
  history: (params) => api.get('/tutor/history', { params }),
  ask: (body) => api.post('/tutor/ask', body),
  createPractice: (body) => api.post('/tutor/practice', body),
  getPractice: (id) => api.get(`/tutor/practice/${id}`),
  submitPractice: (id, answers) => api.post(`/tutor/practice/${id}/submit`, { answers }),

  // Teacher
  conversations: (params) => api.get('/tutor/conversations', { params }),
  conversation: (id) => api.get(`/tutor/conversations/${id}`),

  // Admin
  overview: () => api.get('/tutor/admin/overview'),
  saveSettings: (body) => api.patch('/tutor/admin/settings', body),
  setClassAccess: (classId, body) => api.put(`/tutor/admin/classes/${classId}`, body),
  adminStudents: (params) => api.get('/tutor/admin/students', { params }),
  distributeCredits: (body) => api.post('/tutor/admin/credits/distribute', body),
  giveCredits: (body) => api.post('/tutor/admin/credits/give', body),
  pauseStudent: (studentId, paused) => api.put(`/tutor/admin/students/${studentId}/pause`, { paused }),
  subjects: (params) => api.get('/tutor/admin/subjects', { params }),
  standards: (params) => api.get('/tutor/admin/standards', { params }),
  lessons: (params) => api.get('/tutor/admin/lessons', { params }),
  importLessons: (body) => api.post('/tutor/admin/lessons/import', body),
  removeLesson: (id) => api.delete(`/tutor/admin/lessons/${id}`),
};

export default tutorService;
