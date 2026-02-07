/**
 * Mongoose plugin: automatically adds { school: schoolId } to every query.
 * 
 * HOW IT WORKS:
 *   1. Controller sets  req.schoolId  (done by auth middleware)
 *   2. Controller passes it to Mongoose:  Model.find().setOptions({ schoolId: req.schoolId })
 *      OR simply includes  { school: req.schoolId }  in the query itself.
 *   3. This plugin reads that schoolId and injects it into the query filter.
 * 
 * TO SKIP (e.g. super_admin cross-school query):
 *   Model.find().setOptions({ skipTenantFilter: true })
 */
export const tenantIsolationPlugin = (schema) => {

    // All read operations
    schema.pre(['find', 'findOne', 'countDocuments'], function () {
        addSchoolFilter(this);
    });

    // All write operations
    schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
        addSchoolFilter(this);
    });

    // All delete operations
    schema.pre(['findOneAndDelete', 'deleteOne', 'deleteMany'], function () {
        addSchoolFilter(this);
    });
};

/**
 * Adds { school: id } to a Mongoose query if:
 *   - skipTenantFilter is NOT set
 *   - a schoolId is available (from options or already in the query)
 */
function addSchoolFilter(query) {
    if (query.getOptions().skipTenantFilter) return;

    // Already filtered by school in the query itself? Nothing to do.
    if (query.getQuery().school) return;

    // Get schoolId from options (set by controller)
    const schoolId = query.getOptions().schoolId;
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
            message: 'School context required for this operation'
        });
    }
    next();
};

/**
 * Middleware to restrict access to super_admin only
 */
export const superAdminOnly = (req, res, next) => {
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({
            success: false,
            message: 'Super admin access required'
        });
    }
    next();
};
