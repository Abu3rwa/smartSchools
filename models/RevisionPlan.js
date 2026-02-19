import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const revisionPlanSchema = new mongoose.Schema({
    school: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'School', 
        required: true 
    },
    student: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Student', 
        required: true 
    },
    subject: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Subject', 
        required: true 
    },
    academicYear: {
        type: String,
        trim: true
    },
    examDate: { 
        type: Date, 
        required: true 
    },
    examLabel: { 
        type: String, 
        trim: true 
    },
    generatedDate: { 
        type: Date, 
        default: Date.now 
    },
    daysUntilExam: { 
        type: Number 
    },
    topics: [{
        standard: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Standard' 
        },
        priority: { 
            type: Number 
        },
        masteryLevel: { 
            type: Number 
        },
        allocatedMinutes: { 
            type: Number 
        },
        completed: { 
            type: Boolean, 
            default: false 
        },
        completedAt: { 
            type: Date 
        }
    }],
    dailySchedule: [{
        date: { 
            type: Date 
        },
        slots: [{ 
            standard: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'Standard' 
            }, 
            minutes: Number, 
            completed: Boolean 
        }]
    }],
    milestones: [{ 
        date: { 
            type: Date 
        }, 
        label: { 
            type: String 
        }, 
        achieved: { 
            type: Boolean, 
            default: false 
        } 
    }],
    status: { 
        type: String, 
        enum: ['active', 'completed', 'abandoned'], 
        default: 'active' 
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

revisionPlanSchema.index({ school: 1, student: 1, status: 1 });
revisionPlanSchema.index({ school: 1, student: 1, examDate: 1 });
revisionPlanSchema.index({ school: 1, subject: 1 });
revisionPlanSchema.index({ school: 1, academicYear: 1, student: 1, status: 1 });
revisionPlanSchema.plugin(tenantIsolationPlugin);

const RevisionPlan = mongoose.model('RevisionPlan', revisionPlanSchema);
export default RevisionPlan;
