import SupportNotificationDelivery from '../models/SupportNotificationDelivery.js';

/**
 * Durable per-event, per-recipient send record. `claimDelivery` is the gate:
 * a key already marked 'sent' short-circuits the send; anything else is
 * re-claimed with a bumped attempt so retries share one history row.
 */
export const claimDelivery = async ({ schoolId, kind, dedupeKey, recipientEmail, surveyId = null, respondentId = null }) => {
    const existing = await SupportNotificationDelivery.findOne({ school: schoolId, dedupeKey })
        .setOptions({ skipTenantFilter: true })
        .sort({ attempt: -1 });
    if (existing?.status === 'sent') return { skip: true, record: existing };

    if (existing) {
        existing.attempt += 1;
        existing.status = 'sending';
        existing.error = '';
        existing.recipientEmail = recipientEmail;
        existing.survey = surveyId;
        existing.respondent = respondentId;
        existing.startedAt = new Date();
        existing.deliveredAt = null;
        await existing.save();
        return { skip: false, record: existing };
    }

    try {
        const record = await SupportNotificationDelivery.create({
            school: schoolId,
            kind,
            dedupeKey,
            recipientEmail,
            survey: surveyId,
            respondent: respondentId,
            status: 'sending',
        });
        return { skip: false, record };
    } catch (error) {
        // Lost a concurrent claim for the same key: the winner sends, we stand down.
        if (error?.code === 11000) return { skip: true, record: null };
        throw error;
    }
};

export const markDeliverySent = async (record, messageId = '') => {
    if (!record) return;
    record.status = 'sent';
    record.messageId = String(messageId || '');
    record.deliveredAt = new Date();
    record.error = '';
    await record.save();
};

export const markDeliveryFailed = async (record, error) => {
    if (!record) return;
    record.status = 'failed';
    record.error = String(error?.message || error || 'send-failed').slice(0, 500);
    await record.save();
};
