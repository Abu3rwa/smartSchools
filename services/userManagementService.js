import mongoose from 'mongoose';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Class from '../models/Class.js';
import { PERMISSIONS } from '../config/permissions.js';
import { withTransaction } from '../utils/withTransaction.js';

const validPermissionKeys = new Set(Object.values(PERMISSIONS));

export const ALLOWED_SCHOOL_ROLES = [
    'admin',
    'staff',
    'department_principal',
    'teacher',
    'parent',
    'student',
    'attendance_manager',
    'lesson_plan_reviewer',
    'report_viewer',
    'event_coordinator',
    'behavior_manager',
    'transportation_coordinator',
    'cafeteria_manager',
    'library_manager',
    'it_support',
    'counselor',
    'nurse'
];

const AUTHORIZATION_FIELDS = ['role', 'roles', 'permissions', 'department', 'permissionScopes'];

const USER_LIST_SELECT = 'firstName lastName email role roles title titles isActive department permissions permissionScopes createdAt updatedAt';

const fail = (status, code, message) => ({ status, body: { success: false, code, message } });

export const isAuthorizationActor = (actor) =>
    actor?.role === 'admin' ||
    actor?.role === 'super_admin' ||
    (Array.isArray(actor?.roles) && actor.roles.includes('admin'));

const hasAdmin = (user) => user.role === 'admin' || (Array.isArray(user.roles) && user.roles.includes('admin'));

const normalizePermissions = (value) => Array.from(new Set(
    (Array.isArray(value) ? value : String(value).split(','))
        .map((permission) => String(permission || '').trim())
        .filter(Boolean)
));

export async function listSchoolUsers(schoolId) {
    const users = await User.find({ school: schoolId })
        .select(USER_LIST_SELECT)
        .populate('department', 'name type')
        .sort({ role: 1, firstName: 1 });
    return { status: 200, body: { success: true, data: { users } } };
}

async function validateScopes(scopes, schoolId, session) {
    if (scopes === null || typeof scopes !== 'object' || Array.isArray(scopes)) {
        return fail(400, 'INVALID_SCOPES', 'Permission scopes must be an object keyed by permission');
    }
    const map = new Map();
    for (const [key, value] of Object.entries(scopes)) {
        if (!validPermissionKeys.has(key)) {
            return fail(400, 'INVALID_SCOPE_KEY', `Unknown permission in scopes: ${key}`);
        }
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            return fail(400, 'INVALID_SCOPES', `Scope for ${key} must be an object`);
        }
        const entry = {};
        for (const [field, Model] of [['departmentIds', Department], ['classIds', Class]]) {
            if (value[field] === undefined || value[field] === null) continue;
            if (!Array.isArray(value[field]) || value[field].some((id) => !mongoose.isValidObjectId(id))) {
                return fail(400, 'INVALID_SCOPES', `${field} for ${key} must be an array of ids`);
            }
            const ids = Array.from(new Set(value[field].map(String)));
            if (ids.length) {
                const found = await Model.countDocuments({ _id: { $in: ids }, school: schoolId }).session(session);
                if (found !== ids.length) {
                    return fail(400, 'SCOPE_NOT_IN_SCHOOL', `${field} for ${key} must belong to your school`);
                }
            }
            entry[field] = ids;
        }
        if (value.expiresAt !== undefined && value.expiresAt !== null) {
            const date = new Date(value.expiresAt);
            if (Number.isNaN(date.getTime())) {
                return fail(400, 'INVALID_SCOPES', `expiresAt for ${key} must be a valid date`);
            }
            entry.expiresAt = date;
        }
        map.set(key, entry);
    }
    return map;
}

export async function updateSchoolUser({ actor, schoolId, userId, payload = {}, expectedUpdatedAt = null }) {
    if (!mongoose.isValidObjectId(userId)) {
        return fail(404, 'USER_NOT_FOUND', 'User not found');
    }

    const touchesAuthorization = AUTHORIZATION_FIELDS.some((field) => payload[field] !== undefined);
    if (touchesAuthorization && !isAuthorizationActor(actor)) {
        return fail(403, 'AUTH_FIELDS_ADMIN_ONLY', 'Only school administrators can change roles, permissions or department. You can edit titles.');
    }

    return withTransaction(async (session) => {
        const user = await User.findById(userId).session(session);
        if (!user) return fail(404, 'USER_NOT_FOUND', 'User not found');
        if (user.school?.toString() !== schoolId.toString()) {
            return fail(403, 'USER_NOT_IN_SCHOOL', 'User does not belong to your school');
        }
        if (user.role === 'super_admin' || (Array.isArray(user.roles) && user.roles.includes('super_admin'))) {
            return fail(403, 'SUPER_ADMIN_PROTECTED', 'Cannot change a super admin account');
        }
        if (expectedUpdatedAt && user.updatedAt && new Date(expectedUpdatedAt).getTime() !== user.updatedAt.getTime()) {
            return fail(409, 'STALE_USER', 'This user was changed by someone else. Load the latest version and try again.');
        }

        const currentRoles = Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role];
        let nextRoles = currentRoles;
        if (payload.roles !== undefined) {
            if (!Array.isArray(payload.roles)) {
                return fail(400, 'INVALID_ROLES', 'Roles must be an array');
            }
            nextRoles = Array.from(new Set(payload.roles));
            if (nextRoles.length === 0) {
                return fail(400, 'ROLES_REQUIRED', 'Keep at least one assigned role');
            }
            const invalidRoles = nextRoles.filter((role) => !ALLOWED_SCHOOL_ROLES.includes(role));
            if (invalidRoles.length) {
                return fail(400, 'INVALID_ROLES', `Invalid roles: ${invalidRoles.join(', ')}`);
            }
        }
        const nextRole = payload.role !== undefined ? payload.role : user.role;
        if (!ALLOWED_SCHOOL_ROLES.includes(nextRole)) {
            return fail(400, 'INVALID_ROLE', `Role must be one of: ${ALLOWED_SCHOOL_ROLES.join(', ')}`);
        }
        if (!nextRoles.includes(nextRole)) {
            return fail(400, 'ROLE_NOT_ASSIGNED', 'The active role must be one of the assigned roles');
        }

        const losesAdmin = hasAdmin(user) && !nextRoles.includes('admin');
        if (losesAdmin && String(actor?._id) === String(user._id)) {
            return fail(403, 'SELF_DEMOTION', 'You cannot remove your own administrator role');
        }
        if (losesAdmin) {
            const otherAdmins = await User.countDocuments({
                school: schoolId,
                _id: { $ne: user._id },
                isActive: { $ne: false },
                $or: [{ role: 'admin' }, { roles: 'admin' }]
            }).session(session);
            if (otherAdmins === 0) {
                return fail(409, 'LAST_ADMIN', 'This is the last active administrator in the school. Assign another administrator first.');
            }
        }

        if (payload.titles !== undefined) {
            if (!Array.isArray(payload.titles)) {
                return fail(400, 'INVALID_TITLES', 'Titles must be an array');
            }
            const titles = Array.from(new Set(payload.titles.map((title) => String(title).trim()).filter(Boolean)));
            if (titles.some((title) => title.length > 100)) {
                return fail(400, 'TITLE_TOO_LONG', 'Each title must be 100 characters or fewer');
            }
            user.titles = titles;
        }
        if (payload.title !== undefined) {
            user.title = payload.title;
        }

        if (payload.department !== undefined) {
            if (payload.department === null || payload.department === '') {
                user.department = null;
            } else {
                if (!mongoose.isValidObjectId(payload.department)) {
                    return fail(400, 'INVALID_DEPARTMENT', 'Department must be a valid id');
                }
                const department = await Department.findOne({ _id: payload.department, school: schoolId }).session(session);
                if (!department) {
                    return fail(400, 'DEPARTMENT_NOT_IN_SCHOOL', 'Department does not belong to your school');
                }
                user.department = department._id;
            }
        }

        if (payload.permissions !== undefined) {
            if (!Array.isArray(payload.permissions) && typeof payload.permissions !== 'string') {
                return fail(400, 'INVALID_PERMISSIONS', 'Permissions must be an array or comma-separated string');
            }
            const permissions = normalizePermissions(payload.permissions);
            const invalidPermissions = permissions.filter((permission) => !validPermissionKeys.has(permission));
            if (invalidPermissions.length) {
                return fail(400, 'INVALID_PERMISSIONS', `Invalid permissions: ${invalidPermissions.join(', ')}`);
            }
            user.permissions = permissions;
        }

        if (payload.permissionScopes !== undefined) {
            const scopes = await validateScopes(payload.permissionScopes, schoolId, session);
            if (scopes && scopes.status) return scopes;
            user.permissionScopes = scopes;
        }

        user.role = nextRole;
        user.roles = nextRoles;
        await user.save({ session });

        const updated = await User.findById(user._id)
            .select(USER_LIST_SELECT)
            .populate('department', 'name type')
            .session(session);
        return { status: 200, body: { success: true, message: 'User updated successfully', data: { user: updated } } };
    });
}