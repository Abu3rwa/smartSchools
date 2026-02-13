import api from '../config/api.js';

export const readingService = {
  // Teacher: upload text
  uploadText: (body) => api.post('/reading/upload-text', body),

  // Teacher: list texts
  getTexts: (params) => api.get('/reading/texts', { params }),

  // Teacher: get single text
  getTextById: (textId) => api.get(`/reading/texts/${textId}`),

  // Teacher: create assignment
  createAssignment: (body) => api.post('/reading/assign', body),

  // Teacher: list assignments
  getTeacherAssignments: (params) => api.get('/reading/assignments/teacher', { params }),

  // Student: my assignments
  getMyAssignments: () => api.get('/reading/assignments'),

  // Student: get simplified text
  getSimplified: (textId) => api.get(`/reading/simplify/${textId}`),

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
