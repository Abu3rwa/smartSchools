import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const studentReadingProfileSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    currentReadingLevel: { type: Number }, // grade equivalent e.g. 6
    lexileScore: { type: Number },
    vocabularySize: { type: Number },
    readingSpeedWpm: { type: Number },
    comprehensionAccuracy: { type: Number },
    preferredTextComplexity: { type: Number },
    progressHistory: [
      {
        assessedAt: { type: Date, default: Date.now },
        level: { type: Number },
        accuracy: { type: Number },
      },
    ],
  },
  { timestamps: true }
);

studentReadingProfileSchema.index({ school: 1, student: 1 }, { unique: true });
studentReadingProfileSchema.plugin(tenantIsolationPlugin);

const StudentReadingProfile = mongoose.model('StudentReadingProfile', studentReadingProfileSchema);
export default StudentReadingProfile;
