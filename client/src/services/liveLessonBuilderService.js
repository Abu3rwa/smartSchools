import api from "../config/api.js";

const unwrap = (response) => response?.data?.data ?? response?.data;
const aiTimeout = 180000;
const uploadTimeout = 120000;
const multipart = {
  headers: { "Content-Type": "multipart/form-data" },
  timeout: uploadTimeout,
};

/**
 * Draft endpoints for the AI lesson builder. The browser sends the uploads as
 * multipart and everything else as JSON; the server owns every limit, price and
 * step rule, so this file stays a thin transport layer.
 */
export const liveLessonBuilderService = {
  listDrafts: () => api.get("/live/lesson-drafts").then(unwrap),
  createDraft: (formData) =>
    api.post("/live/lesson-drafts", formData, multipart).then(unwrap),
  getDraft: (draftId) => api.get(`/live/lesson-drafts/${draftId}`).then(unwrap),
  getSource: (draftId) =>
    api.get(`/live/lesson-drafts/${draftId}/source`).then(unwrap),
  suggestTitle: (draftId) =>
    api
      .get(`/live/lesson-drafts/${draftId}/title-suggestion`)
      .then(unwrap),
  appendSource: (draftId, formData) =>
    api
      .post(`/live/lesson-drafts/${draftId}/source`, formData, multipart)
      .then(unwrap),
  restoreSource: (draftId, body) =>
    api
      .post(`/live/lesson-drafts/${draftId}/source/restore`, body)
      .then(unwrap),
  removeSourceFile: (draftId, fileId) =>
    api
      .delete(`/live/lesson-drafts/${draftId}/source/files/${fileId}`)
      .then(unwrap),
  updateSetup: (draftId, body) =>
    api.patch(`/live/lesson-drafts/${draftId}/setup`, body).then(unwrap),
  quote: (draftId, body) =>
    api.post(`/live/lesson-drafts/${draftId}/quote`, body || {}).then(unwrap),
  generatePlan: (draftId, body) =>
    api
      .post(`/live/lesson-drafts/${draftId}/plan`, body, { timeout: aiTimeout })
      .then(unwrap),
  generateContent: (draftId, body) =>
    api
      .post(`/live/lesson-drafts/${draftId}/generate`, body, {
        timeout: aiTimeout,
      })
      .then(unwrap),
  regenerateItem: (draftId, itemId, body) =>
    api
      .post(`/live/lesson-drafts/${draftId}/items/${itemId}/regenerate`, body, {
        timeout: aiTimeout,
      })
      .then(unwrap),
  undoItem: (draftId, itemId) =>
    api
      .post(`/live/lesson-drafts/${draftId}/items/${itemId}/undo`)
      .then(unwrap),
  updateItem: (draftId, itemId, body) =>
    api
      .patch(`/live/lesson-drafts/${draftId}/items/${itemId}`, body)
      .then(unwrap),
  updateItemTexts: (draftId, itemId, body) =>
    api
      .patch(`/live/lesson-drafts/${draftId}/items/${itemId}/texts`, body)
      .then(unwrap),
  updateItems: (draftId, body) =>
    api.patch(`/live/lesson-drafts/${draftId}/items`, body).then(unwrap),
  cancelOperation: (draftId, opKey) =>
    api
      .post(`/live/lesson-drafts/${draftId}/ops/${opKey}/cancel`)
      .then(unwrap),
  discardDraft: (draftId) =>
    api.delete(`/live/lesson-drafts/${draftId}`).then(unwrap),
  approveDraft: (draftId, body) =>
    api.post(`/live/lesson-drafts/${draftId}/approve`, body).then(unwrap),
};

export default liveLessonBuilderService;
