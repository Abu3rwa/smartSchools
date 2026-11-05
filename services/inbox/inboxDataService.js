/**
 * Removes everything Inbox Assistant stored for one teacher. Used when the
 * teacher empties the data and when Google access is revoked.
 */
import User from '../../models/User.js';
import InboxAssistantSettings from '../../models/InboxAssistantSettings.js';
import InboxEmail from '../../models/InboxEmail.js';
import InboxDeadline from '../../models/InboxDeadline.js';
import InboxEvent from '../../models/InboxEvent.js';
import InboxReplyDraft from '../../models/InboxReplyDraft.js';
import InboxScanRun from '../../models/InboxScanRun.js';

export const INBOX_CALENDAR_MODELS = Object.freeze([
    [InboxDeadline, 'deadline'],
    [InboxEvent, 'event'],
]);

export const deleteAllInboxDataForUser = async (userId, {
    schoolId,
    removeCalendarEvents = false,
} = {}) => {
    let school = schoolId;
    if (!school) {
        const user = await User.findById(userId).select('school').lean();
        school = user?.school;
    }
    if (!school) return { removed: 0, calendarRemoved: 0 };

    const filter = { school, user: userId };
    let calendarRemoved = 0;

    if (removeCalendarEvents) {
        // Loaded here, not at the top: the calendar service reaches the Gmail
        // token service, which already imports this module.
        const { default: inboxCalendarService } = await import('./inboxCalendarService.js');
        const outcome = await inboxCalendarService.removeAllForUser(userId, INBOX_CALENDAR_MODELS, {
            schoolId: school,
        });
        calendarRemoved = outcome.removed;
    }

    const results = await Promise.all([
        InboxEmail.deleteMany(filter),
        InboxDeadline.deleteMany(filter),
        InboxEvent.deleteMany(filter),
        InboxReplyDraft.deleteMany(filter),
        InboxScanRun.deleteMany(filter),
        InboxAssistantSettings.deleteMany(filter)
    ]);

    return {
        removed: results.reduce((total, result) => total + (result?.deletedCount || 0), 0),
        calendarRemoved
    };
};

export default { deleteAllInboxDataForUser };
