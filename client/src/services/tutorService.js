import api from '../config/api.js';

export const tutorService = {
  // Student
  me: (params) => api.get('/tutor/me', { params }),
  history: (params) => api.get('/tutor/history', { params }),
  ask: (body) => api.post('/tutor/ask', body),
  createPractice: (body) => api.post('/tutor/practice', body),
  getPractice: (id) => api.get(`/tutor/practice/${id}`),
  submitPractice: (id, answers) => api.post(`/tutor/practice/${id}/submit`, { answers }),

  // Student voice tutor
  voiceHome: (params) => api.get('/tutor/voice', { params }),
  startVoiceSession: (body) => api.post('/tutor/voice/sessions', body),
  voiceSession: (id) => api.get(`/tutor/voice/sessions/${id}`),
  voiceTurn: (id, { audio, text, durationMs } = {}) => {
    const form = new FormData();
    if (audio) form.append('audio', audio, `turn-${Date.now()}.webm`);
    if (text) form.append('text', text);
    if (durationMs) form.append('durationMs', String(durationMs));
    return api.post(`/tutor/voice/sessions/${id}/turn`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000
    });
  },
  endVoiceSession: (id) => api.post(`/tutor/voice/sessions/${id}/end`),

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
  giveVoiceCredits: (body) => api.post('/tutor/admin/credits/voice', body),
  pauseStudent: (studentId, paused) => api.put(`/tutor/admin/students/${studentId}/pause`, { paused }),
  setStudentLevel: (studentId, level) => api.put(`/tutor/admin/students/${studentId}/level`, { level }),
  subjects: (params) => api.get('/tutor/admin/subjects', { params }),
  standards: (params) => api.get('/tutor/admin/standards', { params }),
  lessons: (params) => api.get('/tutor/admin/lessons', { params }),
  importLessons: (body) => api.post('/tutor/admin/lessons/import', body),
  removeLesson: (id) => api.delete(`/tutor/admin/lessons/${id}`),
};

export default tutorService;
