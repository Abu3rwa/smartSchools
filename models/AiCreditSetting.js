import mongoose from 'mongoose';

/**
 * Platform-wide AI credit pricing. Not tenant-scoped: one markup percentage is
 * set by the super admin and applied to every school's AI requests.
 */
const aiCreditSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    markupPercent: { type: Number, default: 0, min: 0 },
    // Voice tutor pricing and meters. One message has a fixed credit price; every
    // model named here must be priced in aiPricing before a session may start.
    voice: {
        model: { type: String, trim: true, default: 'gpt-5.4-mini' },
        sttModel: { type: String, trim: true, default: 'gpt-4o-mini-transcribe' },
        ttsModel: { type: String, trim: true, default: 'gpt-4o-mini-tts' },
        ttsVoice: { type: String, trim: true, default: 'alloy' },
        messageCredits: { type: Number, default: 3, min: 1, max: 10000 },
        maxContextTokens: { type: Number, default: 4000, min: 500, max: 32000 },
        maxReplyTokens: { type: Number, default: 180, min: 30, max: 1000 },
        maxTranscriptSeconds: { type: Number, default: 30, min: 5, max: 300 },
        maxSpeechSeconds: { type: Number, default: 60, min: 5, max: 300 }
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

const AiCreditSetting = mongoose.model('AiCreditSetting', aiCreditSettingSchema);
export default AiCreditSetting;
