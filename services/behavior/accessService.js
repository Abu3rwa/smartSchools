import Student from '../../models/Student.js';
import {
    BEHAVIOR_STAFF_ROLES,
    BEHAVIOR_APPROVER_ROLES
} from '../../constants/behavior.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../../helpers/teacherScoping.js';

export const isBehaviorStaff = (user) => Boolean(user)
    && (BEHAVIOR_STAFF_ROLES.includes(user.role)
        || (Array.isArray(user.permissions) && user.permissions.includes('manage_behavior')));

export const canLogBehaviorIncident = (user) => isBehaviorStaff(user);

export const canManageBehaviorAdmin = (user) => Boolean(user)
    && ['super_admin', 'admin', 'department_principal', 'behavior_manager'].includes(user.role);

const schoolAdminRoles = (settings) => [
    ...(settings?.approval?.approverRoles || BEHAVIOR_APPROVER_ROLES),
    ...(settings?.approval?.backupApproverRoles || [])
];

export const canApproveBehaviorIncident = (user, settings, incident = null) => {
    if (!isBehaviorStaff(user)) return false;
    if (incident && !schoolAdminRoles(settings).includes(user.role) && user.role !== 'super_admin') {
        return false;
    }
    return schoolAdminRoles(settings).includes(user.role) || user.role === 'super_admin';
};

/**
 * Who may mark a task completed. The verifier rules come from settings, with a
 * per-task-type override, and 'logging-staff' resolves to whoever logged the
 * incident.
 */
export const canVerifyBehaviorTask = (user, task, { incident = null, settings = null } = {}) => {
    if (!isBehaviorStaff(user)) return false;

    const rule = task?.verifier?.rule || settings?.verifier?.defaultRule || 'logging-staff';
    if (rule === 'admin-only') return ['super_admin', 'admin'].includes(user.role);
    if (rule === 'admin-or-counselor') {
        return ['super_admin', 'admin', 'staff', 'behavior_manager'].includes(user.role);
    }
    if (rule === 'specific-role') return Boolean(task?.verifier?.role) && user.role === task.verifier.role;

    const loggingStaffId = incident?.reportedBy || task?.verifier?.user;
    return Boolean(loggingStaffId) && String(loggingStaffId) === String(user._id);
};

const parentStudentFilter = (email) => ({
    $or: [
        { 'parentInfo.fatherEmail': email },
        { 'parentInfo.motherEmail': email },
        { 'parentInfo.guardianEmail': email }
    ]
});

/**
 * Student ids the requester may read in the portal. Staff get null, meaning
 * "scope by role elsewhere"; a parent only ever gets their own linked children.
 */
export const resolvePortalStudentIds = async (req) => {
    const { role, _id: userId, email, school } = req.user;

    if (role === 'student') {
        const student = await Student.findOne({ user: userId, school }).select('_id').lean();
        return { studentIds: student ? [student._id] : [], scope: 'student' };
    }

    if (role === 'parent') {
        if (!email) return { studentIds: [], scope: 'parent' };
        const normalized = String(email).trim().toLowerCase();
        const studentIds = await Student.find({
            school,
            status: { $ne: 'inactive' },
            ...parentStudentFilter(normalized)
        }).distinct('_id');
        return { studentIds, scope: 'parent' };
    }

    return { studentIds: null, scope: 'staff' };
};

/**
 * Teachers and support staff may only log for students in a class they are
 * assigned to, mirroring the legacy tracker's access rules.
 */
export const assertStaffCanAccessStudent = async (req, studentId) => {
    const student = await Student.findOne({ _id: studentId, school: req.schoolId })
        .select('_id firstName lastName studentId currentClass enrolledClasses status')
        .lean();
    if (!student) return { error: { status: 404, message: 'Student not found in your school.' } };

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return { error: { status: 403, message: 'Teacher profile not found.' } };
        const classIds = (await getTeacherClassIds(teacher._id)).map((id) => String(id));
        const linked = [student.currentClass, ...(student.enrolledClasses || [])]
            .filter(Boolean)
            .map((id) => String(id));
        if (!linked.some((id) => classIds.includes(id))) {
            return { error: { status: 403, message: 'Not authorized for this student.' } };
        }
    }

    return { student };
};
