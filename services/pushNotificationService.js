import DeviceToken from '../models/DeviceToken.js';
import ParentSetting from '../models/ParentSetting.js';
import { google } from 'googleapis';
import logger from '../utils/logger.js';

const FCM_LEGACY_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';
const FCM_V1_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_V1_ENDPOINT_BASE = 'https://fcm.googleapis.com/v1/projects';
const DEFAULT_ANDROID_CHANNEL_ID = 'parent_updates';
const INVALID_FCM_TOKEN_ERRORS = new Set([
  'InvalidRegistration',
  'NotRegistered',
  'MismatchSenderId',
  'InvalidApnsCredential',
]);
const INVALID_FCM_V1_TOKEN_ERRORS = new Set([
  'UNREGISTERED',
  'INVALID_ARGUMENT',
  'SENDER_ID_MISMATCH',
]);

let cachedV1AccessToken = '';
let cachedV1AccessTokenExpiry = 0;
let cachedJwtClientFingerprint = '';
let cachedJwtClient = null;

const toId = (value) => (value == null ? '' : String(value));

const resolveFcmServerKey = () => {
  const candidates = [
    process.env.FCM_SERVER_KEY,
    process.env.FIREBASE_SERVER_KEY,
    process.env.FIREBASE_LEGACY_SERVER_KEY,
  ];
  for (const key of candidates) {
    const normalized = String(key || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const resolveFcmApiVersion = () => {
  const normalized = String(process.env.FCM_API_VERSION || '').trim().toLowerCase();
  if (normalized === 'v1' || normalized === 'legacy') return normalized;
  return resolveFcmV1Config().configured ? 'v1' : 'legacy';
};

const resolveFirebaseProjectId = () => {
  const candidates = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.GCLOUD_PROJECT,
  ];
  for (const value of candidates) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const resolveFirebaseServiceAccount = () => {
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = String(process.env.FIREBASE_PRIVATE_KEY || '').trim();
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, '\n') : '';
  return { clientEmail, privateKey };
};

const resolveFcmV1Config = () => {
  const projectId = resolveFirebaseProjectId();
  const { clientEmail, privateKey } = resolveFirebaseServiceAccount();
  return {
    projectId,
    clientEmail,
    privateKey,
    configured: Boolean(projectId && clientEmail && privateKey),
  };
};

const getFcmV1JwtClient = ({ clientEmail, privateKey }) => {
  const fingerprint = `${clientEmail}|${privateKey.length}`;
  if (!cachedJwtClient || cachedJwtClientFingerprint !== fingerprint) {
    cachedJwtClient = new google.auth.JWT(
      clientEmail,
      undefined,
      privateKey,
      [FCM_V1_SCOPE]
    );
    cachedJwtClientFingerprint = fingerprint;
    cachedV1AccessToken = '';
    cachedV1AccessTokenExpiry = 0;
  }
  return cachedJwtClient;
};

const resolveFcmV1AccessToken = async ({ clientEmail, privateKey }) => {
  const now = Date.now();
  if (cachedV1AccessToken && cachedV1AccessTokenExpiry > now + 60_000) {
    return cachedV1AccessToken;
  }

  const jwtClient = getFcmV1JwtClient({ clientEmail, privateKey });
  const tokenResponse = await jwtClient.authorize();
  const accessToken = String(tokenResponse?.access_token || '').trim();
  if (!accessToken) {
    throw new Error('Failed to obtain FCM v1 access token');
  }

  cachedV1AccessToken = accessToken;
  cachedV1AccessTokenExpiry = Number(tokenResponse?.expiry_date || 0);
  if (!cachedV1AccessTokenExpiry) {
    cachedV1AccessTokenExpiry = now + 50 * 60 * 1000;
  }
  return cachedV1AccessToken;
};

const isInvalidFcmV1TokenError = (responseJson, httpStatus) => {
  if (httpStatus === 404) return true;
  const error = responseJson?.error && typeof responseJson.error === 'object'
    ? responseJson.error
    : {};
  const details = Array.isArray(error.details) ? error.details : [];
  for (const detail of details) {
    const code = String(detail?.errorCode || '').trim();
    if (INVALID_FCM_V1_TOKEN_ERRORS.has(code)) return true;
  }

  const status = String(error.status || '').trim();
  if (INVALID_FCM_V1_TOKEN_ERRORS.has(status)) return true;

  const message = String(error.message || '').toUpperCase();
  if (message.includes('UNREGISTERED') || message.includes('SENDER_ID_MISMATCH')) {
    return true;
  }
  return false;
};

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

const sendViaLegacyApi = async ({
  normalizedUserIds,
  uniqueTokens,
  title,
  body,
  dataPayload,
  collapseKey,
}) => {
  const serverKey = resolveFcmServerKey();
  if (!serverKey) {
    logger.warn('push_delivery_skipped_missing_fcm_server_key');
    return {
      targetedUsers: normalizedUserIds.length,
      matchedTokens: uniqueTokens.length,
      sent: 0,
      failed: 0,
      skipped: true,
      reason: 'FCM server key is not configured (FCM_SERVER_KEY/FIREBASE_SERVER_KEY)',
    };
  }

  const batches = chunk(uniqueTokens, 500);
  let sent = 0;
  let failed = 0;
  const invalidTokens = new Set();

  for (const registrationIds of batches) {
    const payload = {
      registration_ids: registrationIds,
      priority: 'high',
      content_available: true,
      collapse_key: collapseKey,
      notification: {
        title: String(title || 'New message'),
        body: String(body || '').slice(0, 180),
        android_channel_id: DEFAULT_ANDROID_CHANNEL_ID,
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

  return {
    targetedUsers: normalizedUserIds.length,
    matchedTokens: uniqueTokens.length,
    sent,
    failed,
    skipped: false,
    invalidTokensPruned: invalidTokens.size,
    invalidTokens,
  };
};

const sendViaV1Api = async ({
  normalizedUserIds,
  uniqueTokens,
  title,
  body,
  dataPayload,
  collapseKey,
}) => {
  const v1Config = resolveFcmV1Config();
  if (!v1Config.configured) {
    logger.warn('push_delivery_skipped_missing_fcm_v1_credentials');
    return {
      targetedUsers: normalizedUserIds.length,
      matchedTokens: uniqueTokens.length,
      sent: 0,
      failed: 0,
      skipped: true,
      reason: 'FCM v1 is enabled but FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY is missing',
    };
  }

  const endpoint = `${FCM_V1_ENDPOINT_BASE}/${v1Config.projectId}/messages:send`;
  let sent = 0;
  let failed = 0;
  const invalidTokens = new Set();
  let accessToken;

  try {
    accessToken = await resolveFcmV1AccessToken(v1Config);
  } catch (error) {
    logger.error('push_delivery_v1_auth_failed', {
      error: error?.message || String(error),
    });
    return {
      targetedUsers: normalizedUserIds.length,
      matchedTokens: uniqueTokens.length,
      sent: 0,
      failed: uniqueTokens.length,
      skipped: true,
      reason: 'Unable to authenticate Firebase service account for FCM v1',
    };
  }

  for (const token of uniqueTokens) {
    const payload = {
      message: {
        token,
        notification: {
          title: String(title || 'New message'),
          body: String(body || '').slice(0, 180),
        },
        data: dataPayload,
        android: {
          priority: 'HIGH',
          collapseKey,
          notification: {
            channelId: DEFAULT_ANDROID_CHANNEL_ID,
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-collapse-id': collapseKey,
          },
          payload: {
            aps: {
              'content-available': 1,
            },
          },
        },
      },
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        sent += 1;
        continue;
      }

      const responseJson = await response.json().catch(() => ({}));
      failed += 1;
      if (isInvalidFcmV1TokenError(responseJson, response.status)) {
        invalidTokens.add(token);
      }
    } catch (error) {
      failed += 1;
      logger.error('push_delivery_v1_send_failed', {
        error: error?.message || String(error),
      });
    }
  }

  return {
    targetedUsers: normalizedUserIds.length,
    matchedTokens: uniqueTokens.length,
    sent,
    failed,
    skipped: false,
    invalidTokensPruned: invalidTokens.size,
    invalidTokens,
  };
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

  const baseTokenQuery = {
    user: { $in: pushEnabledUserIds },
    active: true,
    token: { $exists: true, $ne: '' },
  };

  let deviceTokens = await DeviceToken.find({
    ...baseTokenQuery,
    ...(schoolId ? { school: schoolId } : {}),
  })
    .select('_id user token platform')
    .lean();

  if (deviceTokens.length === 0 && schoolId) {
    const crossSchoolMatches = await DeviceToken.find(baseTokenQuery)
      .setOptions({ skipTenantFilter: true })
      .select('_id user token platform school')
      .lean();

    if (crossSchoolMatches.length > 0) {
      logger.warn('push_delivery_school_scope_fallback', {
        schoolId: toId(schoolId),
        targetedUsers: normalizedUserIds.length,
        matchedTokens: crossSchoolMatches.length,
      });
      deviceTokens = crossSchoolMatches;
    }
  }

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

  const apiVersion = resolveFcmApiVersion();
  if (apiVersion !== 'v1') {
    const serverKey = resolveFcmServerKey();
    if (!serverKey) {
      logger.warn('push_delivery_skipped_missing_fcm_server_key');
      return {
        targetedUsers: normalizedUserIds.length,
        matchedTokens: deviceTokens.length,
        sent: 0,
        failed: 0,
        skipped: true,
        reason: 'FCM server key is not configured (FCM_SERVER_KEY/FIREBASE_SERVER_KEY)',
      };
    }
  }

  const byToken = new Map();
  for (const row of deviceTokens) {
    if (!row.token) continue;
    byToken.set(row.token, row);
  }
  const uniqueTokens = [...byToken.keys()];
  const dataPayload = toStringMap(data);
  const deliveryResult = apiVersion === 'v1'
    ? await sendViaV1Api({
      normalizedUserIds,
      uniqueTokens,
      title,
      body,
      dataPayload,
      collapseKey,
    })
    : await sendViaLegacyApi({
      normalizedUserIds,
      uniqueTokens,
      title,
      body,
      dataPayload,
      collapseKey,
    });

  const invalidTokens = deliveryResult.invalidTokens instanceof Set
    ? deliveryResult.invalidTokens
    : new Set();

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
    ...deliveryResult,
    invalidTokensPruned: invalidTokens.size,
  };
};
