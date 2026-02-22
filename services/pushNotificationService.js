import DeviceToken from '../models/DeviceToken.js';
import ParentSetting from '../models/ParentSetting.js';
import logger from '../utils/logger.js';

const FCM_LEGACY_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';
const INVALID_FCM_TOKEN_ERRORS = new Set([
  'InvalidRegistration',
  'NotRegistered',
  'MismatchSenderId',
  'InvalidApnsCredential',
]);

const toId = (value) => (value == null ? '' : String(value));

const chunk = (items, size) => {
  const normalizedSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let index = 0; index < items.length; index += normalizedSize) {
    chunks.push(items.slice(index, index + normalizedSize));
  }
  return chunks;
};

const toStringMap = (value = {}) => {
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key) continue;
    if (raw == null) continue;
    result[key] = typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
  return result;
};

const resolvePushEnabledUsers = async ({ schoolId, userIds }) => {
  if (!schoolId || userIds.length === 0) return userIds;

  const disabledParentSettings = await ParentSetting.find({
    school: schoolId,
    user: { $in: userIds },
    'notifications.push': false,
  })
    .select('user')
    .lean();

  if (disabledParentSettings.length === 0) return userIds;
  const disabledSet = new Set(disabledParentSettings.map((row) => toId(row.user)));
  return userIds.filter((id) => !disabledSet.has(id));
};

export const sendPushToUsers = async ({
  schoolId,
  userIds = [],
  title,
  body,
  data = {},
  collapseKey = 'messages',
}) => {
  const normalizedUserIds = [...new Set((userIds || []).map((id) => toId(id)).filter(Boolean))];
  if (normalizedUserIds.length === 0) {
    return { targetedUsers: 0, matchedTokens: 0, sent: 0, failed: 0, skipped: true };
  }

  const pushEnabledUserIds = await resolvePushEnabledUsers({
    schoolId,
    userIds: normalizedUserIds,
  });

  if (pushEnabledUserIds.length === 0) {
    return {
      targetedUsers: normalizedUserIds.length,
      matchedTokens: 0,
      sent: 0,
      failed: 0,
      skipped: true,
      reason: 'All targeted users have push disabled',
    };
  }

  const deviceTokens = await DeviceToken.find({
    school: schoolId,
    user: { $in: pushEnabledUserIds },
    active: true,
    token: { $exists: true, $ne: '' },
  })
    .select('_id user token platform')
    .lean();

  if (deviceTokens.length === 0) {
    return {
      targetedUsers: normalizedUserIds.length,
      matchedTokens: 0,
      sent: 0,
      failed: 0,
      skipped: true,
      reason: 'No active device tokens',
    };
  }

  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    logger.warn('push_delivery_skipped_missing_fcm_server_key');
    return {
      targetedUsers: normalizedUserIds.length,
      matchedTokens: deviceTokens.length,
      sent: 0,
      failed: 0,
      skipped: true,
      reason: 'FCM_SERVER_KEY is not configured',
    };
  }

  const byToken = new Map();
  for (const row of deviceTokens) {
    if (!row.token) continue;
    byToken.set(row.token, row);
  }
  const uniqueTokens = [...byToken.keys()];
  const batches = chunk(uniqueTokens, 500);

  let sent = 0;
  let failed = 0;
  const invalidTokens = new Set();
  const dataPayload = toStringMap(data);

  for (const registrationIds of batches) {
    const payload = {
      registration_ids: registrationIds,
      priority: 'high',
      content_available: true,
      collapse_key: collapseKey,
      notification: {
        title: String(title || 'New message'),
        body: String(body || '').slice(0, 180),
      },
      data: dataPayload,
    };

    try {
      const response = await fetch(FCM_LEGACY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${serverKey}`,
        },
        body: JSON.stringify(payload),
      });

      const responseJson = await response.json().catch(() => ({}));
      const results = Array.isArray(responseJson?.results) ? responseJson.results : [];

      for (let index = 0; index < registrationIds.length; index += 1) {
        const token = registrationIds[index];
        const result = results[index] || {};
        if (result.message_id) {
          sent += 1;
          continue;
        }

        failed += 1;
        const errorCode = String(result.error || '').trim();
        if (INVALID_FCM_TOKEN_ERRORS.has(errorCode)) {
          invalidTokens.add(token);
        }
      }
    } catch (error) {
      failed += registrationIds.length;
      logger.error('push_delivery_batch_failed', {
        error: error?.message || String(error),
        batchSize: registrationIds.length,
      });
    }
  }

  if (invalidTokens.size > 0) {
    await DeviceToken.updateMany(
      { token: { $in: [...invalidTokens] } },
      {
        $set: {
          active: false,
          lastSeen: new Date(),
        },
      }
    );
  }

  return {
    targetedUsers: normalizedUserIds.length,
    matchedTokens: uniqueTokens.length,
    sent,
    failed,
    skipped: false,
    invalidTokensPruned: invalidTokens.size,
  };
};

