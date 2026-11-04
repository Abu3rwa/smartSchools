import User from '../../models/User.js';

const ROLE_ORDER = [
    'super_admin',
    'admin',
    'department_principal',
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
    'nurse',
    'teacher',
    'staff',
    'parent',
    'student'
];

const pickRole = (user) => {
    const assigned = [user.role, ...(user.roles || [])].filter(Boolean);
    return ROLE_ORDER.find((role) => assigned.includes(role)) || assigned[0] || '';
};

export const lookupSenderRoles = async (schoolId, emails = []) => {
    const list = [...new Set(
        emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)
    )];
    if (!schoolId || !list.length) return {};

    const users = await User.find({ school: schoolId, email: { $in: list } })
        .select('email role roles')
        .lean();

    const roles = {};
    for (const user of users) {
        const email = String(user.email || '').toLowerCase();
        if (email) roles[email] = pickRole(user);
    }
    return roles;
};

export default { lookupSenderRoles };
