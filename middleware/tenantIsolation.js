import { AsyncLocalStorage } from "async_hooks";
/**
 * Request-scoped tenant context. Set by auth so the plugin can scope all queries
 * to the current user's school without controllers passing schoolId every time.
 */
export const tenantStore = new AsyncLocalStorage();

/**
 * Run the rest of the request in a tenant context so Mongoose queries are auto-scoped.
 * Call this from protect() for non–super_admin users so an admin of one school
 * cannot see another school's data.
 */
export function runInTenantContext(schoolId, next) {
  if (!schoolId) return next();
  tenantStore.run({ schoolId }, next);
}

/**
 * Mongoose plugin: automatically adds { school: schoolId } to every query.
 *
 * HOW IT WORKS:
 *   1. Auth middleware sets req.schoolId from the logged-in user's school.
 *   2. Auth calls runInTenantContext(req.schoolId, next) so this request runs inside tenantStore.
 *   3. Every find/findOne/countDocuments/etc. runs this plugin, which reads schoolId from
 *      tenantStore.getStore() and adds { school: schoolId } to the query.
 *   So admins/teachers only ever see their own school's data.
 *
 * TO SKIP (e.g. super_admin cross-school query):
 *   Model.find().setOptions({ skipTenantFilter: true })
 */
export const tenantIsolationPlugin = (schema) => {
  // All read operations
  schema.pre(["find", "findOne", "countDocuments"], function () {
    addSchoolFilter(this);
  });

  // All write operations
  schema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function () {
    addSchoolFilter(this);
  });

  // All delete operations
  schema.pre(["findOneAndDelete", "deleteOne", "deleteMany"], function () {
    addSchoolFilter(this);
  });
};

/**
 * Adds { school: id } to a Mongoose query if:
 *   - skipTenantFilter is NOT set
 *   - a schoolId is available (from request context or query options, or already in the query)
 */
function addSchoolFilter(query) {
  if (query.getOptions().skipTenantFilter) return;

  // Already filtered by school in the query itself? Nothing to do.
  if (query.getQuery().school) return;

  // Prefer request-scoped school (set by runInTenantContext) so controllers cannot forget to scope
  const store = tenantStore.getStore();
  const schoolId = store?.schoolId ?? query.getOptions().schoolId;
  if (schoolId) {
    query.where({ school: schoolId });
  }
}

/**
 * Express middleware to attach school context to requests
 */
export const attachSchoolContext = (req, res, next) => {
  if (req.user && req.user.school) {
    req.schoolId = req.user.school._id || req.user.school;
    req.school = req.user.school;
  }
  next();
};

/**
 * Middleware to enforce school context on protected routes
 */
export const requireSchoolContext = (req, res, next) => {
  if (!req.schoolId) {
    return res.status(400).json({
      success: false,
      message: "School context required for this operation",
    });
  }
  next();
};

/**
 * Middleware to restrict access to super_admin only
 */
export const superAdminOnly = (req, res, next) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Super admin access required",
    });
  }
  next();
};
