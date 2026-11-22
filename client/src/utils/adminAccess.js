// Administration is decided by the role the account is acting as. `roles`
// holds every role assigned to the account and powers role switching, so a
// teacher account that also holds admin must not reach admin pages while it
// acts as a teacher; switching back to the admin role restores them.
export const ADMIN_ROLES = ["admin", "super_admin"];

export const isAdminOnly = (roles = []) =>
  roles.length > 0 && roles.every((role) => ADMIN_ROLES.includes(role));

export const actsAsAdmin = (user) => ADMIN_ROLES.includes(user?.role);
