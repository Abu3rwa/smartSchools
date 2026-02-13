import api from '../config/api.js';

export const revisionService = {
  // Student: my plans
  getMyPlans: (status) =>
    api.get('/revision/plans', status ? { params: { status } } : {}),

  // Teacher: all plans for students in my classes
  getTeacherPlans: (params) =>
    api.get('/revision/teacher/plans', { params }),

  // Get single plan
  getPlan: (planId) =>
    api.get(`/revision/plan/${planId}`),

  // Generate plan (student: no studentId; teacher: pass studentId)
  generatePlan: (body) =>
    api.post('/revision/generate-plan', body),

  // Update progress (student only)
  updateProgress: (planId, body) =>
    api.patch(`/revision/plan/${planId}/progress`, body),

  // Recommendations
  getRecommendations: (studentId, conceptId) =>
    api.get(`/revision/recommendations/${studentId}/${conceptId}`),

  // Compute profile (teacher/admin)
  computeProfile: (studentId) =>
    api.post(`/revision/compute-profile/${studentId}`),
};

export default revisionService;
