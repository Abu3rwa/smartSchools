import mongoose from 'mongoose';

/**
 * Platform-wide AI credit pricing. Not tenant-scoped: one markup percentage is
 * set by the super admin and applied to every school's AI requests.
 */
const aiCreditSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    markupPercent: { type: Number, default: 0, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const AiCreditSetting = mongoose.model('AiCreditSetting', aiCreditSettingSchema);
export default AiCreditSetting;
