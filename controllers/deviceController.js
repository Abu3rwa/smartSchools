import { asyncHandler } from '../middleware/errorHandler.js';
import DeviceToken from '../models/DeviceToken.js';
import logger from '../utils/logger.js';

const VALID_PLATFORMS = new Set(['android', 'ios', 'web']);
const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

const toId = (value) => (value == null ? '' : String(value));

const maskToken = (token) => {
    const raw = String(token || '').trim();
    if (!raw) return '';
    if (raw.length <= 12) return `${raw.slice(0, 4)}…${raw.slice(-2)}`;
    return `${raw.slice(0, 8)}…${raw.slice(-6)}`;
};

const parseBoolean = (raw, fallback = false) => {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') return BOOLEAN_TRUE_VALUES.has(raw.trim().toLowerCase());
    return fallback;
};

/**
 * @desc    Register push device token
 * @route   POST /api/devices/register
 * @access  Private
 */
export const registerDeviceToken = asyncHandler(async (req, res) => {
    const token = String(req.body?.deviceToken || '').trim();
    const requestedPlatform = String(req.body?.platform || '').toLowerCase();
    const platform = VALID_PLATFORMS.has(requestedPlatform) ? requestedPlatform : 'android';

    if (!token) {
        return res.status(400).json({
            success: false,
            message: 'deviceToken is required'
        });
    }

    // If this token currently belongs to a different user (e.g. after a device hand-off
    // or OS re-install that recycled the FCM token), deactivate the stale record first
    // so we don't lose the current user's registration.
    const existingOtherUser = await DeviceToken.findOne({
        token,
        user: { $ne: req.user._id },
    }).setOptions({ skipTenantFilter: true }).select('_id').lean();

    if (existingOtherUser) {
        await DeviceToken.updateOne(
            { token, user: { $ne: req.user._id } },
            { $set: { active: false, lastSeen: new Date() } }
        ).setOptions({ skipTenantFilter: true });

        logger.info('device_token_ownership_changed', {
            token: token.slice(0, 12) + '…',
            newUserId: String(req.user?._id || ''),
            schoolId: String(req.schoolId || ''),
        });
    }

    // Upsert scoped to this user + token so we never overwrite another user's active record.
    const doc = await DeviceToken.findOneAndUpdate(
        { token, user: req.user._id },
        {
            $set: {
                school: req.schoolId,
                user: req.user._id,
                token,
                platform,
                active: true,
                lastSeen: new Date()
            }
        },
        {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true
        }
    );

    res.status(200).json({
        success: true,
        message: 'Device token registered',
        data: {
            id: doc._id,
            platform: doc.platform,
            active: doc.active,
            lastSeen: doc.lastSeen
        }
    });

    logger.info('device_token_registered', {
        userId: String(req.user?._id || ''),
        schoolId: String(req.schoolId || ''),
        platform: doc.platform
    });
});

/**
 * @desc    Inspect authenticated user's device tokens
 * @route   GET /api/devices/me
 * @access  Private
 */
export const getMyDeviceTokens = asyncHandler(async (req, res) => {
    const includeInactive = parseBoolean(req.query?.includeInactive, true);
    const query = {
        school: req.schoolId,
        user: req.user._id
    };
    if (!includeInactive) {
        query.active = true;
    }

    const docs = await DeviceToken.find(query)
        .sort({ updatedAt: -1, createdAt: -1 })
        .select('_id token platform active lastSeen createdAt updatedAt')
        .lean();

    const platformCounts = { android: 0, ios: 0, web: 0, other: 0 };
    let activeCount = 0;
    for (const row of docs) {
        if (row.active) activeCount += 1;
        const platform = String(row.platform || '').toLowerCase();
        if (platform === 'android' || platform === 'ios' || platform === 'web') {
            platformCounts[platform] += 1;
        } else {
            platformCounts.other += 1;
        }
    }

    res.status(200).json({
        success: true,
        data: {
            userId: toId(req.user?._id),
            schoolId: toId(req.schoolId),
            summary: {
                total: docs.length,
                active: activeCount,
                inactive: Math.max(docs.length - activeCount, 0),
                hasActiveToken: activeCount > 0,
                byPlatform: platformCounts
            },
            tokens: docs.map((row) => ({
                id: row._id,
                tokenPreview: maskToken(row.token),
                platform: row.platform || 'unknown',
                active: Boolean(row.active),
                lastSeen: row.lastSeen || null,
                createdAt: row.createdAt || null,
                updatedAt: row.updatedAt || null
            }))
        }
    });
});

/**
 * @desc    Unregister push device token
 * @route   POST /api/devices/unregister
 * @access  Private
 */
export const unregisterDeviceToken = asyncHandler(async (req, res) => {
    const token = String(req.body?.deviceToken || '').trim();
    if (!token) {
        return res.status(400).json({
            success: false,
            message: 'deviceToken is required'
        });
    }

    await DeviceToken.updateOne(
        {
            school: req.schoolId,
            user: req.user._id,
            token
        },
        {
            $set: {
                active: false,
                lastSeen: new Date()
            }
        }
    );

    res.status(200).json({
        success: true,
        message: 'Device token unregistered'
    });

    logger.info('device_token_unregistered', {
        userId: String(req.user?._id || ''),
        schoolId: String(req.schoolId || '')
    });
});
