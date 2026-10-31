import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * One row per school. `enabled` is the school-wide switch the admin owns; a class
 * can still be paused or locked on top of it, but nothing turns the tutor on for a
 * class while this row is off.
 */
const tutorSettingsSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
        enabled: { type: Boolean, default: false },
        practiceEnabled: { type: Boolean, default: true },
        // The wallet is the only limit: a student works at their own pace until
        // their questions run out, with no daily reset.
        defaultCredits: { type: Number, default: 30, min: 0, max: 1000 },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

tutorSettingsSchema.plugin(tenantIsolationPlugin);

const TutorSettings = mongoose.model('TutorSettings', tutorSettingsSchema);
export default TutorSettings;
