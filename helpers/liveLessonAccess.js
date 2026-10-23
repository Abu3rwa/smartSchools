import Class from "../models/Class.js";
import Teacher from "../models/Teacher.js";

/**
 * Department principals follow the mode documented in middleware/auth.js
 * resolveDepartmentScope: a principal who owns a department is limited to that
 * department, and a principal with no department is the school-wide principal.
 *
 * `denyWithoutDepartment` is the strict reading for callers that must not widen.
 * The whole-school branch is explicit here instead of an accidentally dropped
 * filter, so widening is a decision a reader can see.
 */
export const applyDepartmentScope = (
  query,
  user,
  { denyWithoutDepartment = false, departmentId } = {},
) => {
  // REST callers resolve the scope on the request, so they pass it in; the realtime
  // gateway only has the user document.
  const resolvedDepartmentId = departmentId === undefined
    ? (user.department?._id || user.department)
    : departmentId;
  if (resolvedDepartmentId) {
    query.department = resolvedDepartmentId;
    return { scoped: true, wholeSchool: false };
  }
  if (denyWithoutDepartment) return { scoped: false, wholeSchool: false, denied: true };
  return { scoped: false, wholeSchool: true };
};

/**
 * Resolve the class a staff member may reach inside a live lesson, or null when
 * they may not. Teacher records are checked differently by the REST and realtime
 * paths today (`isActive: true` only in the gateway), so `requireActiveTeacher`
 * keeps each caller's existing semantics instead of silently tightening one.
 */
export const staffClassQuery = async (
  user,
  schoolId,
  classId,
  { denyWithoutDepartment = false, requireActiveTeacher = false } = {},
) => {
  const query = { _id: classId, school: schoolId, isActive: { $ne: false } };
  if (user.role === "admin") return { query };
  if (user.role === "department_principal") {
    const scope = applyDepartmentScope(query, user, { denyWithoutDepartment });
    if (scope.denied) return null;
    return { query, scope };
  }
  if (user.role === "teacher") {
    const teacher = await Teacher.findOne({
      user: user._id,
      school: schoolId,
      ...(requireActiveTeacher ? { isActive: true } : {}),
    })
      .select("_id")
      .lean();
    if (!teacher) return null;
    query.$or = [{ classTeacher: teacher._id }, { "subjects.teacher": teacher._id }];
    return { query };
  }
  return null;
};

/**
 * The list form of staffClassQuery: every class this user may reach in a school,
 * used when the UI has to offer choices rather than check one. Same role rules,
 * same refusal for anyone who is not teacher / department_principal / admin.
 */
export const staffClassesListQuery = async (
  user,
  schoolId,
  { denyWithoutDepartment = false, departmentId, requireActiveTeacher = false } = {},
) => {
  const query = { school: schoolId, isActive: { $ne: false } };
  if (user.role === "admin") return query;
  if (user.role === "department_principal") {
    const scope = applyDepartmentScope(query, user, { denyWithoutDepartment, departmentId });
    return scope.denied ? null : query;
  }
  if (user.role === "teacher") {
    const teacher = await Teacher.findOne({
      user: user._id,
      school: schoolId,
      ...(requireActiveTeacher ? { isActive: true } : {}),
    })
      .select("_id")
      .lean();
    if (!teacher) return null;
    query.$or = [{ classTeacher: teacher._id }, { "subjects.teacher": teacher._id }];
    return query;
  }
  return null;
};

export const canAccessStaffClass = async (user, schoolId, classId, options = {}) => {
  const access = await staffClassQuery(user, schoolId, classId, options);
  if (!access) return null;
  return Class.findOne(access.query);
};

export const isStaffClassAuthorized = async (user, schoolId, classId, options = {}) =>
  Boolean(await canAccessStaffClass(user, schoolId, classId, options));
