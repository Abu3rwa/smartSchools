/**
 * Removes everything Inbox Assistant stored for one teacher. Used when the
 * teacher empties the data and when Google access is revoked.
 */
import User from '../../models/User.js';
import InboxAssistantSettings from '../../models/InboxAssistantSettings.js';
import InboxEmail from '../../models/InboxEmail.js';
import InboxDeadline from '../../models/InboxDeadline.js';
import InboxReplyDraft from '../../models/InboxReplyDraft.js';
import InboxScanRun from '../../models/InboxScanRun.js';

export const deleteAllInboxDataForUser = async (userId, { schoolId } = {}) => {
    let school = schoolId;
    if (!school) {
        const user = await User.findById(userId).select('school').lean();
        school = user?.school;
    }
    if (!school) return { removed: 0 };

    const filter = { school, user: userId };
    const results = await Promise.all([
        InboxEmail.deleteMany(filter),
        InboxDeadline.deleteMany(filter),
        InboxReplyDraft.deleteMany(filter),
        InboxScanRun.deleteMany(filter),
        InboxAssistantSettings.deleteMany(filter)
    ]);

    return {
        removed: results.reduce((total, result) => total + (result?.deletedCount || 0), 0)
    };
};

export default { deleteAllInboxDataForUser };
