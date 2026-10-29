import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { runInTenantContext } from './tenantIsolation.js';
import { runInAiUsageContext, featureFromPath } from '../utils/aiUsageContext.js';
import logger from '../utils/logger.js';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '../config/permissions.js';
import { isValidAcademicYear, resolveSchoolAcademicYear } from '../utils/academicYear.js';
import SchoolAdminPreviewAudit from '../models/SchoolAdminPreviewAudit.js';

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

        let user;
        let previewAudit = null;
        let previewAdmin = null;

        if (decoded.previewMode === 'school_admin_readonly') {
            const requestPath = String(req.originalUrl || req.path || '').split('?')[0];
            const canEndPreview = req.method === 'POST' && requestPath === '/api/auth/preview/end';
            if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !canEndPreview) {
                return res.status(403).json({
                    success: false,
                    message: 'Support preview is read-only. Exit preview to make changes.',
                    code: 'PREVIEW_READ_ONLY'
                });
            }

            previewAdmin = await User.findById(decoded.id).populate('school').setOptions({ skipTenantFilter: true });
            user = await User.findById(decoded.previewUserId).populate('school').setOptions({ skipTenantFilter: true });
            if (!previewAdmin || previewAdmin.role !== 'admin' || !previewAdmin.isActive || !user || !user.isActive) {
                return res.status(401).json({ success: false, message: 'Support preview is no longer valid' });
            }

            const adminSchoolId = previewAdmin.school?._id || previewAdmin.school;
            const targetSchoolId = user.school?._id || user.school;
            if (!adminSchoolId || String(adminSchoolId) !== String(targetSchoolId)
                || String(adminSchoolId) !== String(decoded.schoolId)
                || !['teacher', 'student'].includes(user.role)) {
                return res.status(403).json({ success: false, message: 'Support preview scope is invalid' });
            }

            previewAudit = await SchoolAdminPreviewAudit.findOne({
                _id: decoded.previewAuditId,
                school: adminSchoolId,
                admin: previewAdmin._id,
                targetUser: user._id,
                endedAt: null,
                expiresAt: { $gt: new Date() }
            }).setOptions({ skipTenantFilter: true });
            if (!previewAudit) {
                return res.status(401).json({ success: false, message: 'Support preview has expired or ended' });
            }
        } else {
            // Get user from token with school populated (skip tenant filter - establishing context)
            user = await User.findById(decoded.id).populate('school').setOptions({ skipTenantFilter: true });
        }

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
        if (previewAudit) {
            req.previewSession = { auditId: previewAudit._id, adminId: previewAdmin._id };
            req.previewAdmin = previewAdmin;
        }
        if (user.school) {
            req.schoolId = user.school._id;
            req.school = user.school;
            const schoolAcademicYear = resolveSchoolAcademicYear(user.school);
            const headerAcademicYear = typeof req.headers['x-academic-year'] === 'string'
                ? req.headers['x-academic-year'].trim()
                : '';

            // Resolve which academic year this request runs against
            const headerIsValid = isValidAcademicYear(headerAcademicYear);
            const isCurrentYear = headerAcademicYear === schoolAcademicYear;
            const allowHistorical = user.school?.settings?.academicYearAccess?.allowHistoricalAccess === true;
            const isAdmin = user.role === 'admin' || user.role === 'super_admin';

            if (headerIsValid && (isCurrentYear || isAdmin || allowHistorical)) {
                req.academicYear = headerAcademicYear;
            } else {
                req.academicYear = schoolAcademicYear;
            }

            // Flag: is this the current (writable) academic year?
            req.isCurrentAcademicYear = (req.academicYear === schoolAcademicYear);

            // Parse semester header
            const headerSemester = parseInt(req.headers['x-academic-semester'], 10);
            req.academicSemester = (headerSemester === 1 || headerSemester === 2) ? headerSemester : null;

            if (req.school?.settings) {
                req.school.settings.currentAcademicYear = req.academicYear;
            }

        }

        // Run the rest of the request in tenant context so ALL Mongoose queries are
        // automatically scoped to this user's school. Prevents an admin of one school
        // from seeing another school's data (Student, Class, Grade, etc.).
        // The AI usage context rides along so every AI call made while handling this
        // request is billed to the same user under the feature that triggered it.
        if (req.user.role !== 'super_admin' && req.schoolId) {
            const aiUsage = {
                schoolId: req.schoolId,
                userId: req.user._id,
                role: req.user.role,
                roles: req.user.roles || [],
                feature: featureFromPath(req.originalUrl)
            };
            return runInTenantContext(req.schoolId, () => runInAiUsageContext(aiUsage, next));
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
                message: process.env.NODE_ENV === 'production' 
                    ? 'Not authorized to access this route'
                    : `Role '${req.user.role}' is not authorized to access this route`
            });
        }
        next();
    };
};

/**
 * Authorize by permission - checks if user has the required permission
 * @param {string} permission - Required permission
 * @returns {Function} Middleware function
 */
export const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!hasPermission(req.user, permission)) {
            return res.status(403).json({
                success: false,
                message: `Permission '${permission}' is required to access this route`
            });
        }
        next();
    };
};

/**
 * Authorize by role OR permission - checks if user has required role or permission
 * @param {string[]} roles - Allowed roles
 * @param {string[]} permissions - Allowed permissions
 * @returns {Function} Middleware function
 */
export const authorizeWithPermission = (roles = [], permissions = []) => {
    return (req, res, next) => {
        // Check if user has one of the allowed roles
        if (roles.includes(req.user.role)) {
            return next();
        }
        
        // Check if user has any of the allowed permissions
        if (permissions.length > 0 && hasAnyPermission(req.user, permissions)) {
            return next();
        }
        
        return res.status(403).json({
            success: false,
            message: 'Not authorized to access this route'
        });
    };
};

/**
 * Require multiple permissions (user must have ALL)
 * @param {string[]} permissions - Required permissions
 * @returns {Function} Middleware function
 */
export const requireAllPermissions = (permissions) => {
    return (req, res, next) => {
        if (!hasAllPermissions(req.user, permissions)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to access this route'
            });
        }
        next();
    };
};

/**
 * Require at least one permission from the list
 * @param {string[]} permissions - List of permissions (user needs at least one)
 * @returns {Function} Middleware function
 */
export const requireAnyPermission = (permissions) => {
    return (req, res, next) => {
        if (!hasAnyPermission(req.user, permissions)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to access this route'
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
