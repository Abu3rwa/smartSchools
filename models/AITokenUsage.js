import mongoose, { Schema, model } from 'mongoose';

const aiTokenUsageSchema = new Schema({
  model: {type: String, required: true},
  school: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'School',
          required: true,
          index: true
      },
     
      user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
          index: true
      },
  // Enhanced fields for advanced reporting
  student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: false,
      index: true
  },
  reportType: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
      required: false
  },
  language: {
      type: String,
      enum: ['english', 'arabic', 'bilingual'],
      required: false
  },
  emailRecipients: [{
      type: String,
      required: false
  }],
  dateRange: {
      startDate: { type: Date, required: false },
      endDate: { type: Date, required: false }
  },
  // Original fields
  inputTokens: {type: Number, required: true},
  outputTokens: {type: Number, required: true},
  totalTokens: {type: Number, required: true},
  estimatedCost: {type: Number, required: false},
  timestamp: { type: Date, default: Date.now },
  schoolId: {type: String, required: true},
  // Email tracking
  emailStatus: {
      student: { sent: { type: Boolean, default: false }, sentAt: Date, messageId: String },
      mother: { sent: { type: Boolean, default: false }, sentAt: Date, messageId: String },
      father: { sent: { type: Boolean, default: false }, sentAt: Date, messageId: String },
      guardian: { sent: { type: Boolean, default: false }, sentAt: Date, messageId: String },
      teacher: { sent: { type: Boolean, default: false }, sentAt: Date, messageId: String }
  }
});

export const AITokenUsage = model('AITokenUsage', aiTokenUsageSchema);