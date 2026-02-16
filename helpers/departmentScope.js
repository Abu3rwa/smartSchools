/**
 * Department scoping helpers. Use consistently so department filters are not
 * applied by hand in every controller (reduces "forgot to filter" regressions).
 *
 * - applyDepartmentScope: add department filter to a query when request is scoped.
 * - enforceDepartmentOnWrite: set/override department from scope on create/update; reject cross-department.
 */

/**
 * Add department filter to a query when the request has an active department scope.
 * When req.departmentId is set, adds query[departmentField] = req.departmentId.
 * When req.departmentId is null (admin, whole-school principal), does nothing.
 *
 * @param {Object} query - Mongoose query object (mutated in place)
 * @param {import('mongoose').Types.ObjectId | null} departmentId - req.departmentId
 * @param {string} [departmentField='department'] - field name on the model (e.g. 'department')
 * @returns {void}
 */
export function applyDepartmentScope(query, departmentId, departmentField = 'department') {
    if (departmentId) {
        query[departmentField] = departmentId;
    }
}

/**
 * Enforce department on create/update payload when the request is department-scoped.
 * - When departmentId is set: set payload.department from scope; if payload already has
 *   a different department, return { allowed: false, message }.
 * - When departmentId is null: do not override payload.department.
 *
 * @param {Object} payload - Request body or update object (mutated in place when allowed)
 * @param {import('mongoose').Types.ObjectId | null} departmentId - req.departmentId
 * @param {string} [departmentField='department'] - field name (e.g. 'department')
 * @returns {{ allowed: true } | { allowed: false, message: string }}
 */
export function enforceDepartmentOnWrite(payload, departmentId, departmentField = 'department') {
    if (!departmentId) return { allowed: true };
    const existing = payload[departmentField];
    const scopeStr = departmentId.toString();
    if (existing != null && existing.toString() !== scopeStr) {
        return { allowed: false, message: 'Cannot set department to a different department than your scope' };
    }
    payload[departmentField] = departmentId;
    return { allowed: true };
}
