/**
 * Tenant Isolation – How it works in this app
 *
 * Run: node scripts/tenantIsolationPlayground.js
 *
 * No API keys required. Uses MONGODB_URI from .env for the DB example (optional).
 */

import dotenv from "dotenv";
dotenv.config();

import { runInTenantContext, tenantStore } from "../middleware/tenantIsolation.js";

// =============================================================================
// PART 1: What is tenant isolation?
// =============================================================================
// This app is multi-tenant: many schools share the same DB. We must ensure
// that when an admin or teacher is logged in, they only see/edit data for
// THEIR school. Tenant isolation does that automatically.
//
// Flow:
//   1. User logs in → auth middleware sets req.schoolId (from user.school).
//   2. protect() calls runInTenantContext(req.schoolId, next).
//   3. runInTenantContext runs your route handler inside tenantStore.run({ schoolId }).
//   4. Every Mongoose query (find, findOne, update, delete) on models that use
//      tenantIsolationPlugin gets a pre hook that adds { school: schoolId } to the query.
//   5. So Student.find() becomes Student.find({ school: schoolId }) automatically.
//
// Super admins: not run in tenant context (req.schoolId can be missing), so they
// can query across schools. When they need to, they use .setOptions({ skipTenantFilter: true }).

console.log("=== Tenant Isolation Demo ===\n");

// =============================================================================
// PART 2: How runInTenantContext + tenantStore work (no DB needed)
// =============================================================================
// AsyncLocalStorage lets you pass a value (schoolId) through the async call chain
// without adding it to every function. Anything that runs inside runInTenantContext
// can read tenantStore.getStore() and get { schoolId }.

const fakeSchoolId = "507f1f77bcf86cd799439011";

runInTenantContext(fakeSchoolId, () => {
  const store = tenantStore.getStore();
  console.log("1. Inside runInTenantContext(fakeSchoolId, callback):");
  console.log("   tenantStore.getStore() →", store);
  console.log("   store.schoolId         →", store?.schoolId);
  console.log("");

  // Nested async is still in the same tenant context
  setTimeout(() => {
    const again = tenantStore.getStore();
    console.log("2. Inside setTimeout (same async context):");
    console.log("   tenantStore.getStore() →", again);
    console.log("");
  }, 0);
});

// Outside runInTenantContext there is no store
setTimeout(() => {
  const outside = tenantStore.getStore();
  console.log("3. Outside runInTenantContext (after callback):");
  console.log("   tenantStore.getStore() →", outside);
  console.log("");

  // =============================================================================
  // PART 3: Optional – run a real Mongoose query scoped by school
  // =============================================================================
  // Uncomment the block below to see Student.find() automatically filtered by school.
  // Requires MONGODB_URI and at least one Student document in the DB.
  //
  // runWithScopedQuery().catch((err) => console.error("DB demo error:", err.message));
}, 50);

async function runWithScopedQuery() {
  const connectDB = (await import("../config/db.js")).default;
  const Student = (await import("../models/Student.js")).default;

  await connectDB();

  await runInTenantContext(fakeSchoolId, async () => {
    // This find() will get { school: fakeSchoolId } added by the plugin.
    const students = await Student.find().limit(2).lean();
    console.log("4. Inside runInTenantContext, Student.find() was auto-scoped to school:");
    console.log("   Result count:", students.length);
    console.log("   (Each doc has school:", students[0]?.school, ")");
  });

  process.exit(0);
}
