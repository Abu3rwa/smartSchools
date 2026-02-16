import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { runInTenantContext } from './tenantIsolation.js';
import logger from '../utils/logger.js';

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

        // Run the rest of the request in tenant context so ALL Mongoose queries are
        // automatically scoped to this user's school. Prevents an admin of one school
        // from seeing another school's data (Student, Class, Grade, etc.).
        if (req.user.role !== 'super_admin' && req.schoolId) {
            return runInTenantContext(req.schoolId, next);
        }
        next();
    } catch (error) {
        logger.error('Auth middleware error:', error);
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

/**
 * Resolve department scope for the request. Use after protect (and requireSchoolContext where used).
 * Sets req.departmentId and req.departmentScope so controllers can apply department filtering consistently.
 * - admin / super_admin: no department filter (school-wide or cross-school).
 * - department_principal with department: filter to that department only.
 * - department_principal without department: no filter (whole-school principal mode).
 * - other roles: no department filter.
 */
export const resolveDepartmentScope = (req, res, next) => {
    req.departmentId = null;
    req.departmentScope = { role: req.user?.role, scoped: false, source: 'resolveDepartmentScope' };

    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
        req.authScope = { schoolId: req.schoolId ?? null, departmentId: null, mode: 'unscoped', role: req.user?.role };
        req.queryFilter = {};
        return next();
    }
    if (req.user.role === 'department_principal') {
        const deptId = req.user.department?._id || req.user.department;
        if (deptId) {
            req.departmentId = deptId;
            req.departmentScope.scoped = true;
        }
    }
    req.authScope = {
        schoolId: req.schoolId ?? null,
        departmentId: req.departmentId ?? null,
        mode: req.departmentId ? 'scoped' : 'unscoped',
        role: req.user?.role
    };
    req.queryFilter = {};
    next();
};

/**
 * Legacy alias: same behavior as resolveDepartmentScope. Department principal without department
 * is allowed (whole-school principal); req.departmentId remains null.
 */
export const scopeDepartmentPrincipal = resolveDepartmentScope;

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
