import mongoose, { Schema, model } from 'mongoose';

const reportTemplateSchema = new Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
        required: true
    },
    language: {
        type: String,
        trim: true,
        lowercase: true,
        required: true
    },
    customPrompt: {
        type: String,
        required: true
    },
    variables: [{
        type: String,
        required: true
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    usageCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for efficient queries
reportTemplateSchema.index({ schoolId: 1, type: 1, language: 1 });
reportTemplateSchema.index({ isActive: 1 });
reportTemplateSchema.index({ isDefault: 1 });

export const ReportTemplate = model('ReportTemplate', reportTemplateSchema);
