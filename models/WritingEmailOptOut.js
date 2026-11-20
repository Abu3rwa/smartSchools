import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/**
 * L7: an address that asked to stop writing-feedback emails. School-scoped and
 * keyed by the address itself, so a parent with two children in the school is
 * unsubscribed once, and every later publish or resend honours it.
 */
const writingEmailOptOutSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    // "email-link" today; the field leaves room for an admin-entered opt-out.
    source: { type: String, trim: true, default: "email-link" },
    optedOutAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

writingEmailOptOutSchema.index({ school: 1, email: 1 }, { unique: true });

writingEmailOptOutSchema.plugin(tenantIsolationPlugin);

const WritingEmailOptOut = mongoose.model(
  "WritingEmailOptOut",
  writingEmailOptOutSchema,
);
export default WritingEmailOptOut;
