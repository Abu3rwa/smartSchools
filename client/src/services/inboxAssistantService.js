import api from "../config/api.js";

const unwrap = (response) => response?.data?.data ?? response?.data;

/**
 * Inbox Assistant client API. Every call is scoped server-side to the signed-in
 * teacher's school and account; scanning is the only call that can spend credit.
 */
export const inboxAssistantService = {
  getStatus: () => api.get("/inbox-assistant/status").then(unwrap),

  updateSettings: (body) =>
    api.put("/inbox-assistant/settings", body).then(unwrap),

  estimateScan: (body) =>
    api.post("/inbox-assistant/scan/estimate", body || {}).then(unwrap),

  startScan: (body) =>
    api.post("/inbox-assistant/scan", body).then(unwrap),

  listEmails: (params) =>
    api.get("/inbox-assistant/emails", { params }).then(unwrap),

  getEmail: (emailId) =>
    api.get(`/inbox-assistant/emails/${emailId}`).then(unwrap),

  updateEmail: (emailId, body) =>
    api.patch(`/inbox-assistant/emails/${emailId}`, body).then(unwrap),

  listDeadlines: (params) =>
    api.get("/inbox-assistant/deadlines", { params }).then(unwrap),

  createDeadline: (body) =>
    api.post("/inbox-assistant/deadlines", body).then(unwrap),

  updateDeadline: (deadlineId, body) =>
    api.patch(`/inbox-assistant/deadlines/${deadlineId}`, body).then(unwrap),

  deleteDeadline: (deadlineId) =>
    api.delete(`/inbox-assistant/deadlines/${deadlineId}`).then(unwrap),

  getSummary: () => api.get("/inbox-assistant/summary").then(unwrap),

  getReplyTypes: (lang = "en") =>
    api.get("/inbox-assistant/reply-types", { params: { lang } }).then(unwrap),

  estimateDraft: (emailId) =>
    api.post(`/inbox-assistant/emails/${emailId}/draft/estimate`).then(unwrap),

  createDraft: (emailId, body) =>
    api.post(`/inbox-assistant/emails/${emailId}/draft`, body || {}).then(unwrap),

  updateDraft: (draftId, body) =>
    api.patch(`/inbox-assistant/drafts/${draftId}`, body).then(unwrap),

  saveDraftToGmail: (draftId) =>
    api.post(`/inbox-assistant/drafts/${draftId}/gmail-draft`).then(unwrap),

  sendDraft: (draftId, body) =>
    api.post(`/inbox-assistant/drafts/${draftId}/send`, body || {}).then(unwrap),

  discardDraft: (draftId) =>
    api.post(`/inbox-assistant/drafts/${draftId}/discard`).then(unwrap),

  listSent: (params) =>
    api.get("/inbox-assistant/sent", { params }).then(unwrap),

  deleteSent: (sentId) =>
    api.delete(`/inbox-assistant/sent/${sentId}`).then(unwrap),

  clearSent: () =>
    api.delete("/inbox-assistant/sent", { data: { confirm: true } }).then(unwrap),

  addReplyType: (body) =>
    api.post("/inbox-assistant/settings/reply-types", body).then(unwrap),

  deleteReplyType: (id) =>
    api.delete(`/inbox-assistant/settings/reply-types/${id}`).then(unwrap),

  deleteData: (confirm) =>
    api
      .delete("/inbox-assistant/data", { data: { confirm: confirm === true } })
      .then(unwrap),

  // Reuses the existing Google reconnect flow; no new OAuth handling here.
  googleAuthUrl: (returnTo = "inbox") =>
    api
      .get("/auth/gmail/url", { params: { returnTo } })
      .then((response) => response?.data?.authUrl),
};

export default inboxAssistantService;
