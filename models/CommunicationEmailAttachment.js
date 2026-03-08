import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const communicationEmailAttachmentSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        originalName: {
            type: String,
            required: true,
            trim: true
        },
        mimeType: {
            type: String,
            required: true,
            trim: true
        },
        size: {
            type: Number,
            required: true,
            min: 0
        },
        fileUrl: {
            type: String,
            required: true
        },
        storagePath: {
            type: String,
            required: true
        },
        isUsed: {
            type: Boolean,
            default: false,
            index: true
        },
        usedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

communicationEmailAttachmentSchema.index({ school: 1, uploadedBy: 1, createdAt: -1 });

communicationEmailAttachmentSchema.plugin(tenantIsolationPlugin);

const CommunicationEmailAttachment = mongoose.model(
    'CommunicationEmailAttachment',
    communicationEmailAttachmentSchema
);

export default CommunicationEmailAttachment;

