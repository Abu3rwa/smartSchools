import api from "../config/api.js";

export const readingService = {
  // Teacher: upload text
  uploadText: (body) => api.post("/reading/upload-text", body),
  importCsv: (body) => api.post("/reading/import-csv", body),

  // Teacher: list texts
  getTexts: (params) => api.get("/reading/texts", { params }),

  // Teacher: get single text
  getTextById: (textId) => api.get(`/reading/texts/${textId}`),
  updateText: (textId, body) => api.patch(`/reading/texts/${textId}`, body),
  deleteText: (textId) => api.delete(`/reading/texts/${textId}`),
  updateTextSharing: (textId, isShared) =>
    api.patch(`/reading/texts/${textId}/sharing`, { isShared }),

  // Teacher: create assignment
  createAssignment: (body) => api.post("/reading/assign", body),

  // Teacher: list assignments
  getTeacherAssignments: (params) =>
    api.get("/reading/assignments/teacher", { params }),

  // Teacher: per-student results for one assignment
  getAssignmentResults: (assignmentId) =>
    api.get(`/reading/assignments/${assignmentId}/results`),

  // Teacher: remove an assignment for its students (submitted work is kept)
  removeAssignment: (assignmentId) =>
    api.delete(`/reading/assignments/${assignmentId}`),

  // Student: my assignments
  getMyAssignments: () => api.get("/reading/assignments"),

  // Student: the whole reading book, chapters in order (locked chapters are stubs)
  getBook: () => api.get("/reading/book"),

  // Teacher: publish or unpublish an assignment for students
  updateAssignmentPublish: (assignmentId, body) =>
    api.patch(`/reading/assignments/${assignmentId}/publish`, body),

  // Student: get simplified text
  getSimplified: (textId, assignmentId) =>
    api.get(`/reading/simplify/${textId}`, {
      params: { assignmentId },
    }),

  // Teacher: get simplified for a student
  getSimplifiedForStudent: (textId, studentId) =>
    api.get(`/reading/simplify/${textId}/${studentId}`),

  // Student: assess level
  assessLevel: (body) => api.post("/reading/assess-level", body),

  // Get student level (own or teacher view)
  getStudentLevel: (studentId) =>
    api.get(`/reading/student-level/${studentId}`),

  // Student: reading gate timer
  startReading: (body) => api.post("/reading/read-start", body),
  recordReadingHeartbeat: (body) => api.post("/reading/read-heartbeat", body),
  finishReading: (body) => api.post("/reading/read-finish", body),

  // Student: update progress after quiz
  updateProgress: (body) => api.patch("/reading/update-progress", body),

  // Student: save answers in progress before submitting
  saveAnswersDraft: (body) => api.put("/reading/answers-draft", body),

  // Student: get AI feedback on critical thinking answer
  evaluateAnswer: (body) => api.post("/reading/evaluate-answer", body),

  // Student: reading-aloud practice
  getFluencyAssignment: (assignmentId) =>
    api.get(`/reading/fluency/assignments/${assignmentId}`),
  recordFluencyListen: (body) => api.post("/reading/fluency/listens", body),
  recordFluencyConsent: () => api.post("/reading/fluency/consent"),
  scoreFluencyAttempt: ({
    assignmentId,
    blockKey,
    level,
    recordedSec,
    idempotencyKey,
    audio,
  }) => {
    const form = new FormData();
    form.append("assignmentId", assignmentId);
    form.append("blockKey", blockKey);
    if (level !== null && level !== undefined)
      form.append("level", String(level));
    form.append("recordedSec", String(recordedSec));
    form.append("idempotencyKey", idempotencyKey);
    const type = String(audio?.type || "");
    const extension = type.includes("mp4")
      ? "mp4"
      : type.includes("ogg")
        ? "ogg"
        : "webm";
    form.append("audio", audio, `reading-${Date.now()}.${extension}`);
    return api.post("/reading/fluency/attempts", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 180000,
    });
  },
  getFluencyAttempts: (assignmentId, blockKey) =>
    api.get(
      `/reading/fluency/assignments/${assignmentId}/parts/${blockKey}/attempts`,
    ),
  getFluencyModelAudio: (textId, blockKey, level, hash = "") =>
    api.get(`/reading/fluency/model-audio/${textId}/${blockKey}`, {
      // v=2 skips browser-cached empty responses from the old server.
      params: { level, hash: hash || undefined, v: 2 },
      responseType: "blob",
    }),

  // Teacher: model voice coverage and generation
  getModelAudioCoverage: (textId) =>
    api.get(`/reading/fluency/texts/${textId}/model-audio`),
  generateModelAudio: (textId, blocks, { regenerate = false } = {}) =>
    api.post(
      `/reading/fluency/texts/${textId}/model-audio`,
      { blocks, ...(regenerate ? { regenerate: true } : {}) },
      { timeout: 180000 },
    ),

  // Teacher: reading-aloud reports
  getFluencyClassReport: (assignmentId) =>
    api.get(`/reading/fluency/assignments/${assignmentId}/results`),
  getFluencyStudentReport: (assignmentId, studentId) =>
    api.get(
      `/reading/fluency/assignments/${assignmentId}/students/${studentId}`,
    ),
  getFluencyHardWords: (assignmentId) =>
    api.get(`/reading/fluency/assignments/${assignmentId}/hard-words`),
  exportFluencyCsv: (assignmentId) =>
    api.get(`/reading/fluency/assignments/${assignmentId}/export.csv`, {
      responseType: "blob",
    }),
};

export default readingService;
