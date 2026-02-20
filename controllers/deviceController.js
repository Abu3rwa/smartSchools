import { asyncHandler } from '../middleware/errorHandler.js';
import DeviceToken from '../models/DeviceToken.js';

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

    const doc = await DeviceToken.findOneAndUpdate(
        { token },
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
});

