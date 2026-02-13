import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const studentLearningProfileSchema = new mongoose.Schema({
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
    gradeLevel: { 
        type: Number 
    },
    subjects: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Subject' 
    }],
    learningPace: { 
        type: String, 
        enum: ['slow', 'medium', 'fast'], 
        default: 'medium' 
    },
    preferredStudyTime: { 
        type: String, 
        trim: true 
    },
    avgSessionLengthMinutes: { 
        type: Number, 
        default: 30 
    },
    strengths: [{ 
        standard: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Standard' 
        }, 
        masteryLevel: Number 
    }],
    weaknesses: [{ 
        standard: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Standard' 
        }, 
        masteryLevel: Number, 
        severity: Number 
    }],
    lastComputedAt: { 
        type: Date 
    }
}, { timestamps: true });

studentLearningProfileSchema.index({ school: 1, student: 1 }, { unique: true });
studentLearningProfileSchema.plugin(tenantIsolationPlugin);

const StudentLearningProfile = mongoose.model('StudentLearningProfile', studentLearningProfileSchema);
export default StudentLearningProfile;
