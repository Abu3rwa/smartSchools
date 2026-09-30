import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPracticeSkillSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    subject: { type: String, default: '', trim: true, maxlength: 80 },
    strand: { type: String, default: '', trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    createdFromBatch: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeImportBatch', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

mapPracticeSkillSchema.index({ school: 1, code: 1 }, { unique: true });
mapPracticeSkillSchema.index({ school: 1, name: 1 });
mapPracticeSkillSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticeSkill', mapPracticeSkillSchema);
