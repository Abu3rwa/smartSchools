import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const lessonPlanSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    homework: {
      type: String,
      default: "",
    },
    // Detailed section
    previousKnowledge: {
      type: String,
      default: "",
    },
    teachingObjectives: {
      type: String,
      default: "",
    },
    vocabulary: {
      type: String,
      default: "",
    },
    characterTraitLinks: {
      type: String,
      default: "",
    },
    techIntegration: {
      type: String,
      default: "",
    },
    // Stages: procedure, materials/resources, timing
    stages: [
      {
        name: { type: String, default: "" },
        procedure: { type: String, default: "" },
        materials: { type: String, default: "" },
        timing: { type: String, default: "" },
      },
    ],
    // Linked curriculum standards (AI-detected or manually selected)
    standardIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Standard",
      },
    ],
  },
  { timestamps: true },
);

lessonPlanSchema.index({ school: 1, date: -1 });
lessonPlanSchema.index({ school: 1, class: 1, subject: 1 });
lessonPlanSchema.plugin(tenantIsolationPlugin);

const LessonPlan = mongoose.model("LessonPlan", lessonPlanSchema);
export default LessonPlan;
