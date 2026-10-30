import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const tutorMessageSchema = new mongoose.Schema(
    {
        role: { type: String, enum: ['student', 'tutor'], required: true },
        text: { type: String, required: true },
        stage: { type: String, enum: ['prompt', 'hint', 'answer'], default: null },
        lessonIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TutorLesson' }],
        credits: { type: Number, default: 0 },
        tokens: { type: Number, default: 0 },
        model: { type: String, default: '' },
        at: { type: Date, default: Date.now }
    },
    { _id: true }
);

/**
 * One subject at a time. A student picks the subject first, so every conversation
 * belongs to exactly one subject and one class, and the tutor can never answer
 * from another subject's lessons.
 */
const tutorConversationSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
        class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
        subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
        academicYear: { type: String, trim: true, default: '' },
        messages: { type: [tutorMessageSchema], default: [] },
        messageCount: { type: Number, default: 0 },
        status: { type: String, enum: ['open', 'full'], default: 'open' },
        lastMessageAt: { type: Date, default: Date.now, index: true }
    },
    { timestamps: true }
);

tutorConversationSchema.index({ school: 1, class: 1, lastMessageAt: -1 });
tutorConversationSchema.index({ school: 1, student: 1, subject: 1, lastMessageAt: -1 });

tutorConversationSchema.plugin(tenantIsolationPlugin);

const TutorConversation = mongoose.model('TutorConversation', tutorConversationSchema);
export default TutorConversation;
