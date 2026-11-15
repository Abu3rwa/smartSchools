/**
 * Mail a teacher writes leaves from that teacher's own Google account. When
 * they have no usable token it must fail visibly, never leave through the
 * school's shared SMTP account. Admins who also teach keep the fallbacks,
 * because support and impersonation flows depend on them.
 */
export const isTeacherOnlySender = (user) => {
    const roles = Array.isArray(user?.roles) && user.roles.length
        ? user.roles
        : [user?.role].filter(Boolean);
    return roles.includes('teacher')
        && !roles.includes('admin')
        && !roles.includes('super_admin');
};

export const teacherSenderPolicy = (user) => (
    isTeacherOnlySender(user)
        ? { allowAdminFallback: false, allowSmtp: false }
        : {}
);
