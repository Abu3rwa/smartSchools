import { asyncHandler } from '../middleware/errorHandler.js';
import DeviceToken from '../models/DeviceToken.js';
import logger from '../utils/logger.js';

const VALID_PLATFORMS = new Set(['android', 'ios', 'web']);

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
