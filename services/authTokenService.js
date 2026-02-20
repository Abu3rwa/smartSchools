import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { generateToken } from '../middleware/auth.js';

const REFRESH_TYPE = 'refresh';

const resolveRefreshSecret = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

export const generateAccessToken = (user) => {
    const schoolId = user?.school?._id || user?.school || null;
    return generateToken(user._id, schoolId);
};

export const generateRefreshToken = (userId) => jwt.sign(
    { id: userId, type: REFRESH_TYPE },
    resolveRefreshSecret(),
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
);

export const hashRefreshToken = (refreshToken) => crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

export const decodeRefreshToken = (refreshToken) => jwt.verify(refreshToken, resolveRefreshSecret());

export const storeRefreshToken = async (userId, refreshToken) => {
    const decoded = decodeRefreshToken(refreshToken);
    if (!decoded?.id || decoded.type !== REFRESH_TYPE) {
        throw new Error('Invalid refresh token payload');
    }

    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : null;
    await User.updateOne(
        { _id: userId },
        {
            $set: {
                refreshTokenHash: hashRefreshToken(refreshToken),
                refreshTokenExpiresAt: expiresAt
            }
        }
    ).setOptions({ skipTenantFilter: true });
};

export const clearRefreshToken = async (userId) => {
    await User.updateOne(
        { _id: userId },
        {
            $set: {
                refreshTokenHash: null,
                refreshTokenExpiresAt: null
            }
        }
    ).setOptions({ skipTenantFilter: true });
};

export const isRefreshTokenValidForUser = ({ user, refreshToken }) => {
    if (!user?.refreshTokenHash || !refreshToken) return false;
    const incomingHash = hashRefreshToken(refreshToken);
    if (incomingHash !== user.refreshTokenHash) return false;
    if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt < new Date()) return false;
    return true;
};

