import api from '../config/api.js';

export const readingService = {
  // Teacher: upload text
  uploadText: (body) => api.post('/reading/upload-text', body),
  importCsv: (body) => api.post('/reading/import-csv', body),

  // Teacher: list texts
  getTexts: (params) => api.get('/reading/texts', { params }),

  // Teacher: get single text
  getTextById: (textId) => api.get(`/reading/texts/${textId}`),
  updateText: (textId, body) => api.patch(`/reading/texts/${textId}`, body),
  deleteText: (textId) => api.delete(`/reading/texts/${textId}`),
  updateTextSharing: (textId, isShared) => api.patch(`/reading/texts/${textId}/sharing`, { isShared }),

  // Teacher: create assignment
  createAssignment: (body) => api.post('/reading/assign', body),

  // Teacher: list assignments
  getTeacherAssignments: (params) => api.get('/reading/assignments/teacher', { params }),

  // Teacher: per-student results for one assignment
  getAssignmentResults: (assignmentId) =>
    api.get(`/reading/assignments/${assignmentId}/results`),

  // Student: my assignments
  getMyAssignments: () => api.get('/reading/assignments'),

  // Student: get simplified text
  getSimplified: (textId, assignmentId) => api.get(`/reading/simplify/${textId}`, {
    params: { assignmentId },
  }),

  // Teacher: get simplified for a student
  getSimplifiedForStudent: (textId, studentId) =>
    api.get(`/reading/simplify/${textId}/${studentId}`),

  // Student: assess level
  assessLevel: (body) => api.post('/reading/assess-level', body),

  // Get student level (own or teacher view)
  getStudentLevel: (studentId) => api.get(`/reading/student-level/${studentId}`),

  // Student: update progress after quiz
  updateProgress: (body) => api.patch('/reading/update-progress', body),

  // Student: get AI feedback on critical thinking answer
  evaluateAnswer: (body) => api.post('/reading/evaluate-answer', body),
};

export default readingService;
