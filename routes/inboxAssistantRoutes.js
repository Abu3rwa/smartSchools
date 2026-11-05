import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { requireFeature } from '../middleware/featureGate.js';
import { aiFeatureRateLimiter, emailSendRateLimiter } from '../middleware/rateLimiters.js';
import {
    deleteData,
    estimateScan,
    getEmail,
    getStatus,
    listEmails,
    startScan,
    updateEmail,
    updateSettings
} from '../controllers/inboxAssistantController.js';
import {
    addReplyType,
    clearSent,
    createDraft,
    deleteReplyType,
    deleteSent,
    discardDraft,
    estimateDraft,
    listReplyTypes,
    listSent,
    patchDraft,
    saveGmailDraft,
    sendDraft
} from '../controllers/inboxReplyController.js';
import {
    addDeadlineToCalendar,
    createDeadline,
    decideDeadlineChange,
    deleteDeadline,
    getSummary,
    listDeadlines,
    removeDeadlineFromCalendar,
    updateDeadline
} from '../controllers/inboxDeadlineController.js';
import {
    addEventToCalendar,
    createEvent,
    decideEventChange,
    deleteEvent,
    listEvents,
    removeEventFromCalendar,
    updateEvent
} from '../controllers/inboxEventController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('inboxAssistant'));

const staff = authorize('teacher', 'admin', 'super_admin');

router.get('/status', staff, getStatus);
router.put('/settings', staff, updateSettings);

router.post('/scan/estimate', staff, estimateScan);
router.post('/scan', staff, aiFeatureRateLimiter, startScan);

router.get('/emails', staff, listEmails);
router.get('/emails/:id', staff, getEmail);
router.patch('/emails/:id', staff, updateEmail);

router.get('/deadlines', staff, listDeadlines);
router.post('/deadlines', staff, createDeadline);
router.patch('/deadlines/:id', staff, updateDeadline);
router.delete('/deadlines/:id', staff, deleteDeadline);
router.post('/deadlines/:id/calendar', staff, addDeadlineToCalendar);
router.delete('/deadlines/:id/calendar', staff, removeDeadlineFromCalendar);
router.post('/deadlines/:id/change', staff, decideDeadlineChange);

router.get('/events', staff, listEvents);
router.post('/events', staff, createEvent);
router.patch('/events/:id', staff, updateEvent);
router.delete('/events/:id', staff, deleteEvent);
router.post('/events/:id/calendar', staff, addEventToCalendar);
router.delete('/events/:id/calendar', staff, removeEventFromCalendar);
router.post('/events/:id/change', staff, decideEventChange);

router.get('/summary', staff, getSummary);

router.post('/emails/:id/draft/estimate', staff, estimateDraft);
router.post('/emails/:id/draft', staff, aiFeatureRateLimiter, createDraft);

router.get('/reply-types', staff, listReplyTypes);
router.patch('/drafts/:id', staff, patchDraft);
router.post('/drafts/:id/gmail-draft', staff, saveGmailDraft);
router.post('/drafts/:id/send', staff, emailSendRateLimiter, sendDraft);
router.post('/drafts/:id/discard', staff, discardDraft);

router.get('/sent', staff, listSent);
router.delete('/sent/:id', staff, deleteSent);
router.delete('/sent', staff, clearSent);

router.post('/settings/reply-types', staff, addReplyType);
router.delete('/settings/reply-types/:id', staff, deleteReplyType);

router.delete('/data', staff, deleteData);

export default router;
