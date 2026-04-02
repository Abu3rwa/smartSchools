import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const presentationExtractionSchema = new Schema(
  {
    school: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // File info
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    storagePath: { type: String, default: "" },

    // Extracted content
    extractedText: { type: String, maxlength: 100000 },
    chunks: [
      {
        text: { type: String, maxlength: 4000 },
        page: { type: Number },
        index: { type: Number },
      },
    ],
    imageDescriptions: [
      {
        page: { type: Number },
        description: { type: String, maxlength: 500 },
        storagePath: { type: String },
      },
    ],

    // Metadata
    pageCount: { type: Number },
    wordCount: { type: Number },
    extractionStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    extractionError: { type: String },

    // TTL - auto-expire unused extractions after 30 days
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

presentationExtractionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
presentationExtractionSchema.index({ school: 1, uploadedBy: 1 });
presentationExtractionSchema.plugin(tenantIsolationPlugin);

const PresentationExtraction = mongoose.model(
  "PresentationExtraction",
  presentationExtractionSchema
);
export default PresentationExtraction;
