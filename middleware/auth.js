import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { attachSchoolContext } from './tenantIsolation.js';

// Protect routes - verify JWT token
export const protect = async (req, res, next) => {
    try {
        let token;

        // Check for token in Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from token with school populated (skip tenant filter - establishing context)
        const user = await User.findById(decoded.id).populate('school').setOptions({ skipTenantFilter: true });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'User account is deactivated'
            });
        }

        // Attach user and school context to request
        req.user = user;
        if (user.school) {
            req.schoolId = user.school._id;
            req.school = user.school;
        }

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route'
        });
    }
};

// Authorize specific roles
export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Role '${req.user.role}' is not authorized to access this route`
            });
        }
        next();
    };
};

// Check if user owns the resource or is admin
export const ownerOrAdmin = (resourceUserIdField = 'userId') => {
    return (req, res, next) => {
        const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];

        if (req.user.role === 'admin' || req.user._id.toString() === resourceUserId) {
            next();
        } else {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this resource'
            });
        }
    };
};

// Generate JWT Token
export const generateToken = (userId, schoolId = null) => {
    const payload = { id: userId };
    if (schoolId) {
        payload.schoolId = schoolId;
    }
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};
