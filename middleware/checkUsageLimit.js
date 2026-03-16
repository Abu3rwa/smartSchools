import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';
import { resolveSchoolFeatureContext } from './featureGate.js';

const RESOURCE_MAP = {
    students: {
        model: Student,
        query: (schoolId) => ({ school: schoolId, status: 'active' }),
        limitKey: 'maxStudents',
        code: 'STUDENT_LIMIT_REACHED',
        label: 'students'
    },
    teachers: {
        model: Teacher,
        query: (schoolId) => ({ school: schoolId, isActive: true }),
        limitKey: 'maxTeachers',
        code: 'TEACHER_LIMIT_REACHED',
        label: 'teachers'
    },
    classes: {
        model: Class,
        query: (schoolId) => ({ school: schoolId, isActive: { $ne: false } }),
        limitKey: 'maxClasses',
        code: 'CLASS_LIMIT_REACHED',
        label: 'classes'
    }
};

const isUnlimited = (limitValue) => {
    const limit = Number(limitValue);
    return !Number.isFinite(limit) || limit < 0;
};

export const requireLimit = (resourceType) => async (req, res, next) => {
    if (req.user?.role === 'super_admin') {
        return next();
    }

    if (!req.schoolId) {
        return next();
    }

    const resourceConfig = RESOURCE_MAP[resourceType];
    if (!resourceConfig) {
        return res.status(400).json({
            success: false,
            message: `Unknown resource type "${resourceType}" for usage limit enforcement`
        });
    }

    const featureContext = await resolveSchoolFeatureContext(req.schoolId);
    const rawLimit = featureContext?.limits?.[resourceConfig.limitKey];

    if (isUnlimited(rawLimit)) {
        return next();
    }

    const maxAllowed = Number(rawLimit);
    const currentUsage = await resourceConfig.model.countDocuments(resourceConfig.query(req.schoolId));

    if (currentUsage >= maxAllowed) {
        return res.status(402).json({
            success: false,
            error: 'LIMIT_EXCEEDED',
            code: resourceConfig.code,
            message: `Your plan allows up to ${maxAllowed} ${resourceConfig.label}. Upgrade your plan to add more.`,
            data: {
                resourceType,
                limit: maxAllowed,
                usage: currentUsage,
                remaining: 0
            }
        });
    }

    return next();
};

export default requireLimit;
