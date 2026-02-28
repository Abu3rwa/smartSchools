export const isValidAcademicYear = (value) => /^\d{4}-\d{4}$/.test(value || '');

export const isConsecutiveAcademicYear = (value) => {
  if (!isValidAcademicYear(value)) return false;
  const [start, end] = value.split('-').map(Number);
  return end === start + 1;
};

export const normalizePermissions = (permissions) => {
  if (Array.isArray(permissions)) {
    return permissions
      .map((permission) => String(permission || '').trim())
      .filter(Boolean);
  }
  if (typeof permissions === 'string') {
    return permissions
      .split(',')
      .map((permission) => permission.trim())
      .filter(Boolean);
  }
  return [];
};