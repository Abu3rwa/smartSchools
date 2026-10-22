import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const behaviorEmailTemplateSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    key: { type: String, required: true, trim: true, maxlength: 120 },
    language: { type: String, enum: ['en', 'ar'], required: true, default: 'en' },
    label: { type: String, trim: true, maxlength: 200, default: '' },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 20000 },
    variables: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    seedKey: { type: String, trim: true, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

behaviorEmailTemplateSchema.plugin(tenantIsolationPlugin);
behaviorEmailTemplateSchema.set('collection', 'behavior_email_templates');

behaviorEmailTemplateSchema.index({ school: 1, key: 1, language: 1 }, { unique: true, background: true });

export default mongoose.model('BehaviorEmailTemplate', behaviorEmailTemplateSchema);
