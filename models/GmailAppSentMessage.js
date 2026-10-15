import mongoose from 'mongoose';

const gmailAppSentMessageSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        accountEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true
        },
        messageId: {
            type: String,
            required: true,
            trim: true
        },
        threadId: {
            type: String,
            default: ''
        },
        sentAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    { timestamps: true }
);

gmailAppSentMessageSchema.index({ user: 1, messageId: 1 }, { unique: true });
gmailAppSentMessageSchema.index({ user: 1, accountEmail: 1 });
gmailAppSentMessageSchema.index({ user: 1, sentAt: -1 });

const GmailAppSentMessage = mongoose.model('GmailAppSentMessage', gmailAppSentMessageSchema);
export default GmailAppSentMessage;
