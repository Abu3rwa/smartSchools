import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const notificationSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    // Recipient
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    recipientEmail: {
        type: String,
        required: true
    },
    recipientPhone: String,

    // Related entities
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
    },

    // Notification type
    type: {
        type: String,
        enum: ['grade_update', 'daily_report', 'daily_classwork_update', 'monthly_report', 'semester_report', 'attendance', 'announcement', 'custom', 'ai_report'],
        required: true
    },

    // Content
    subject: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    htmlContent: String,

    // Delivery channels
    channels: [{
        type: String,
        enum: ['email', 'sms', 'push'],
        default: 'email'
    }],

    // Status tracking
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
        default: 'pending'
    },

    // Delivery attempts
    attempts: [{
        channel: String,
        attemptedAt: Date,
        success: Boolean,
        error: String
    }],

    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,

    // Priority
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    },

    // Metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },

    // Scheduling (for future use)
    scheduledFor: Date,

    // Created by
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, status: 1 });
notificationSchema.index({ student: 1 });
notificationSchema.index({ type: 1, status: 1 });
notificationSchema.index({ createdAt: -1 });

// Method to mark as sent
notificationSchema.methods.markAsSent = function (channel) {
    this.status = 'sent';
    this.sentAt = new Date();
    this.attempts.push({
        channel,
        attemptedAt: new Date(),
        success: true
    });
    return this.save();
};

// Method to mark as failed
notificationSchema.methods.markAsFailed = function (channel, error) {
    this.status = 'failed';
    this.attempts.push({
        channel,
        attemptedAt: new Date(),
        success: false,
        error: error.message || error
    });
    return this.save();
};

// Apply tenant isolation plugin
notificationSchema.plugin(tenantIsolationPlugin);

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
