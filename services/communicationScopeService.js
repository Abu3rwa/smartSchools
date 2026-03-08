import { hasPermission, PERMISSIONS } from '../config/permissions.js';

const toIdString = (value) => (value == null ? '' : String(value).trim());

const normalizeIdArray = (values) => {
    if (!Array.isArray(values)) return [];
    const unique = new Set();
    for (const value of values) {
        const id = toIdString(value);
        if (id) unique.add(id);
    }
    return [...unique];
};

const addToSet = (target, values = []) => {
    for (const value of values) {
        const normalized = toIdString(value);
        if (normalized) target.add(normalized);
    }
};

const readScopeValue = (scope, key) => {
    if (!scope) return undefined;
    if (typeof scope.get === 'function') return scope.get(key);
    return scope[key];
};

export const readPermissionScope = (user, permissionKey) => {
    if (!user?.permissionScopes) return null;
    const scope = readScopeValue(user.permissionScopes, permissionKey);
    if (!scope) return null;

    if (scope.expiresAt && new Date() > new Date(scope.expiresAt)) {
        return null;
    }

    return {
        classIds: normalizeIdArray(scope.classIds),
        departmentIds: normalizeIdArray(scope.departmentIds),
        expiresAt: scope.expiresAt ? new Date(scope.expiresAt) : null
    };
};

const fallbackDepartmentIds = ({
    requestDepartmentId = null,
    teacherDepartmentId = null,
    userDepartmentId = null
}) => {
    const values = [
        toIdString(requestDepartmentId),
        toIdString(teacherDepartmentId),
        toIdString(userDepartmentId)
    ].filter(Boolean);
    return [...new Set(values)];
};

const intersectIds = (leftValues = [], rightValues = []) => {
    if (leftValues.length === 0 || rightValues.length === 0) return [];
    const right = new Set(rightValues.map(toIdString));
    return leftValues.map(toIdString).filter((value) => right.has(value));
};

export const buildCommunicationAccess = ({
    user,
    teacherClassIds = [],
    teacherDepartmentId = null,
    requestDepartmentId = null,
    allDepartmentIds = []
}) => {
    const teacherClassIdList = normalizeIdArray(teacherClassIds);
    const userDepartmentId = toIdString(user?.department?._id || user?.department);
    const fallbackDepartments = fallbackDepartmentIds({
        requestDepartmentId,
        teacherDepartmentId,
        userDepartmentId
    });
    const allDepartments = normalizeIdArray(allDepartmentIds);

    const isAdminRole = user?.role === 'admin' || user?.role === 'super_admin';

    const access = {
        canCompose: false,
        studentClassIds: new Set(),
        parentClassIds: new Set(),
        studentDepartmentIds: new Set(),
        parentDepartmentIds: new Set(),
        teacherDepartmentIds: new Set(),
        everyoneDepartmentIds: new Set(),
        schoolStudents: false,
        schoolParents: false,
        schoolTeachers: false,
        schoolEveryone: false,
        source: {
            role: user?.role || '',
            teacherClassIds: teacherClassIdList,
            fallbackDepartments
        }
    };

    if (isAdminRole) {
        access.canCompose = true;
        access.schoolStudents = true;
        access.schoolParents = true;
        access.schoolTeachers = true;
        access.schoolEveryone = true;
        return access;
    }

    const can = (permissionKey) => hasPermission(user, permissionKey);
    const hasBaseComposer = can(PERMISSIONS.SEND_COMMUNICATION_EMAILS) || can(PERMISSIONS.SEND_NOTIFICATIONS);
    if (!hasBaseComposer) return access;
    access.canCompose = true;

    const applyDepartmentPermission = (permissionKey, targetSet) => {
        if (!can(permissionKey)) return;
        const scope = readPermissionScope(user, permissionKey);
        const scopedDepartments = scope?.departmentIds?.length
            ? scope.departmentIds
            : fallbackDepartments;
        addToSet(targetSet, scopedDepartments);
    };

    const applyClassPermission = (permissionKey, targetSet, { intersectWithTeacherAssignments = false } = {}) => {
        if (!can(permissionKey)) return;
        const scope = readPermissionScope(user, permissionKey);
        if (!scope?.classIds?.length) {
            if (intersectWithTeacherAssignments) {
                addToSet(targetSet, teacherClassIdList);
            }
            return;
        }

        const scopedClassIds = intersectWithTeacherAssignments
            ? intersectIds(scope.classIds, teacherClassIdList)
            : scope.classIds;
        addToSet(targetSet, scopedClassIds);
    };

    applyClassPermission(PERMISSIONS.MESSAGE_OWN_STUDENTS, access.studentClassIds, {
        intersectWithTeacherAssignments: true
    });
    applyClassPermission(PERMISSIONS.MESSAGE_OWN_STUDENT_PARENTS, access.parentClassIds, {
        intersectWithTeacherAssignments: true
    });

    applyDepartmentPermission(PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS, access.studentDepartmentIds);
    applyDepartmentPermission(PERMISSIONS.MESSAGE_DEPARTMENT_PARENTS, access.parentDepartmentIds);
    applyDepartmentPermission(PERMISSIONS.MESSAGE_DEPARTMENT_TEACHERS, access.teacherDepartmentIds);
    applyDepartmentPermission(PERMISSIONS.MESSAGE_DEPARTMENT_EVERYONE, access.everyoneDepartmentIds);
    applyDepartmentPermission(PERMISSIONS.MESSAGE_ASSIGNED_SUBORDINATES, access.teacherDepartmentIds);

    applyClassPermission(PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS, access.studentClassIds);
    applyClassPermission(PERMISSIONS.MESSAGE_DEPARTMENT_PARENTS, access.parentClassIds);

    access.schoolStudents = can(PERMISSIONS.MESSAGE_SCHOOL_STUDENTS);
    access.schoolParents = can(PERMISSIONS.MESSAGE_SCHOOL_PARENTS);
    access.schoolTeachers = can(PERMISSIONS.MESSAGE_SCHOOL_TEACHERS);
    access.schoolEveryone = can(PERMISSIONS.MESSAGE_SCHOOL_EVERYONE);

    // Delegated scope can widen class/department access without changing role.
    if (can(PERMISSIONS.DELEGATED_COMMUNICATION_SCOPE)) {
        const delegated = readPermissionScope(user, PERMISSIONS.DELEGATED_COMMUNICATION_SCOPE);
        addToSet(access.studentClassIds, delegated?.classIds || []);
        addToSet(access.parentClassIds, delegated?.classIds || []);
        addToSet(access.studentDepartmentIds, delegated?.departmentIds || []);
        addToSet(access.parentDepartmentIds, delegated?.departmentIds || []);
        addToSet(access.teacherDepartmentIds, delegated?.departmentIds || []);
    }

    if (access.everyoneDepartmentIds.size > 0) {
        addToSet(access.studentDepartmentIds, [...access.everyoneDepartmentIds]);
        addToSet(access.parentDepartmentIds, [...access.everyoneDepartmentIds]);
        addToSet(access.teacherDepartmentIds, [...access.everyoneDepartmentIds]);
    }

    if (access.schoolEveryone) {
        access.schoolStudents = true;
        access.schoolParents = true;
        access.schoolTeachers = true;
    }

    if (allDepartments.length > 0 && access.schoolEveryone) {
        addToSet(access.everyoneDepartmentIds, allDepartments);
    }

    return access;
};

export const serializeCommunicationAccess = (access) => ({
    canCompose: access?.canCompose === true,
    schoolStudents: access?.schoolStudents === true,
    schoolParents: access?.schoolParents === true,
    schoolTeachers: access?.schoolTeachers === true,
    schoolEveryone: access?.schoolEveryone === true,
    studentClassIds: [...(access?.studentClassIds || [])],
    parentClassIds: [...(access?.parentClassIds || [])],
    studentDepartmentIds: [...(access?.studentDepartmentIds || [])],
    parentDepartmentIds: [...(access?.parentDepartmentIds || [])],
    teacherDepartmentIds: [...(access?.teacherDepartmentIds || [])],
    everyoneDepartmentIds: [...(access?.everyoneDepartmentIds || [])],
    source: access?.source || {}
});

export const hasAnyCommunicationAudience = (access) => {
    if (!access?.canCompose) return false;
    return (
        access.schoolStudents
        || access.schoolParents
        || access.schoolTeachers
        || access.schoolEveryone
        || access.studentClassIds?.size > 0
        || access.parentClassIds?.size > 0
        || access.studentDepartmentIds?.size > 0
        || access.parentDepartmentIds?.size > 0
        || access.teacherDepartmentIds?.size > 0
        || access.everyoneDepartmentIds?.size > 0
    );
};

