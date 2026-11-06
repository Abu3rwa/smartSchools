import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sectionConfigSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        trim: true
    },
    enabled: {
        type: Boolean,
        default: true
    },
    maxWords: {
        type: Number,
        default: 200,
        min: 50,
        max: 500
    }
}, { _id: false });

const reportProfileSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    scope: {
        type: String,
        enum: ['school', 'teacher', 'class'],
        required: true,
        default: 'teacher'
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        default: null
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    sources: {
        type: [String],
        enum: ['grades', 'spelling', 'liveLessons', 'standards', 'attendance', 'homework', 'behavior'],
        default: ['grades', 'spelling', 'attendance', 'homework']
    },
    sections: {
        type: [sectionConfigSchema],
        default: () => [
            { key: 'overview', enabled: true, maxWords: 150 },
            { key: 'academic', enabled: true, maxWords: 200 },
            { key: 'spelling', enabled: true, maxWords: 150 },
            { key: 'participation', enabled: true, maxWords: 150 },
            { key: 'behavior', enabled: true, maxWords: 150 },
            { key: 'nextSteps', enabled: true, maxWords: 200 }
        ]
    },
    templatePrompt: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ''
    },
    defaultLanguage: {
        type: String,
        enum: ['en', 'ar'],
        default: 'en'
    },
    secondaryLanguage: {
        type: String,
        enum: ['en', 'ar', null],
        default: null
    },
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
    }
}, {
    timestamps: true
});

reportProfileSchema.plugin(tenantIsolationPlugin);

reportProfileSchema.index({ school: 1, scope: 1, teacher: 1 });
reportProfileSchema.index({ school: 1, isActive: 1, isDefault: -1 });
reportProfileSchema.index({ school: 1, classId: 1, isActive: 1 });

/**
 * Resolve the effective profile for a teacher + class combination.
 * Precedence: class scope > teacher scope > school scope > built-in defaults.
 */
reportProfileSchema.statics.resolveEffective = async function resolveEffective({
    schoolId,
    teacherId,
    classId
}) {
    const candidates = [];

    if (classId) {
        candidates.push(
            this.findOne({
                school: schoolId,
                scope: 'class',
                classId,
                isActive: true
            }).sort({ isDefault: -1, createdAt: -1 })
        );
    }

    candidates.push(
        this.findOne({
            school: schoolId,
            scope: 'teacher',
            teacher: teacherId,
            isActive: true
        }).sort({ isDefault: -1, createdAt: -1 })
    );

    candidates.push(
        this.findOne({
            school: schoolId,
            scope: 'school',
            isActive: true,
            isDefault: true
        }).sort({ createdAt: -1 })
    );

    const results = await Promise.all(candidates);

    for (const profile of results) {
        if (profile) return profile;
    }

    return null;
};

export const ReportProfile = mongoose.model('ReportProfile', reportProfileSchema);
