import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const participantSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            default: ''
        },
        displayName: {
            type: String,
            trim: true,
            default: ''
        },
        unreadCount: {
            type: Number,
            default: 0,
            min: 0
        },
        lastReadAt: {
            type: Date,
            default: null
        }
    },
    { _id: false }
);

const messageSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        senderRole: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    { _id: true }
);

const parentMessageThreadSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        subject: {
            type: String,
            trim: true,
            default: 'Conversation'
        },
        participants: {
            type: [participantSchema],
            default: []
        },
        messages: {
            type: [messageSchema],
            default: []
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        isClosed: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

parentMessageThreadSchema.index({ school: 1, 'participants.user': 1, lastMessageAt: -1 });

parentMessageThreadSchema.plugin(tenantIsolationPlugin);

const ParentMessageThread = mongoose.model('ParentMessageThread', parentMessageThreadSchema);

export default ParentMessageThread;

