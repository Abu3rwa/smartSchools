import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const studentBehaviorSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student is required'],
        index: true
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: [true, 'School is required']
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class'
    },
    academicYear: {
        type: String,
        trim: true,
        match: [/^\d{4}-\d{4}$/, 'Academic year must be in YYYY-YYYY format']
    },
    
    // Incident Details
    incidentType: {
        type: String,
        required: [true, 'Incident type is required'],
        enum: [
            'positive',           // Positive behavior
            'minor_infraction',   // Minor rule violation
            'major_infraction',   // Serious rule violation
            'academic_concern',   // Academic behavior issue
            'attendance_issue',   // Tardiness, absence
            'social_concern',     // Social/emotional concern
            'safety_concern'      // Safety violation
        ]
    },
    
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: [
            // Positive behaviors
            'achievement',
            'leadership',
            'kindness',
            'participation',
            'improvement',
            
            // Negative behaviors
            'disruptive',
            'disrespectful',
            'academic_dishonesty',
            'bullying',
            'fighting',
            'vandalism',
            'technology_misuse',
            'dress_code',
            'tardiness',
            'truancy',
            'substance_abuse',
            'weapon',
            'theft',
            'other'
        ]
    },
    
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low'
    },
    
    title: {
        type: String,
        required: [true, 'Title is required'],
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    
    description: {
        type: String,
        required: [true, 'Description is required'],
        maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    
    // When and Where
    incidentDate: {
        type: Date,
        required: [true, 'Incident date is required'],
        index: true
    },
    
    location: {
        type: String,
        enum: [
            'classroom',
            'hallway',
            'cafeteria',
            'playground',
            'gym',
            'library',
            'bathroom',
            'bus',
            'parking_lot',
            'office',
            'auditorium',
            'other'
        ]
    },
    
    locationDetails: {
        type: String,
        maxlength: [200, 'Location details cannot exceed 200 characters']
    },
    
    // People Involved
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Reporter is required']
    },
    
    witnesses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    otherStudentsInvolved: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
    }],
    
    // Actions Taken
    actionTaken: {
        type: String,
        enum: [
            'none',
            'verbal_warning',
            'written_warning',
            'parent_contact',
            'detention',
            'suspension',
            'expulsion',
            'counseling_referral',
            'behavior_contract',
            'restorative_practice',
            'community_service',
            'loss_of_privileges',
            'positive_reinforcement',
            'reward',
            'other'
        ]
    },
    
    actionDetails: {
        type: String,
        maxlength: [1000, 'Action details cannot exceed 1000 characters']
    },
    
    // Follow-up
    followUpRequired: {
        type: Boolean,
        default: false
    },
    
    followUpDate: {
        type: Date
    },
    
    followUpNotes: {
        type: String,
        maxlength: [1000, 'Follow-up notes cannot exceed 1000 characters']
    },
    
    followUpCompletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    followUpCompletedAt: {
        type: Date
    },
    
    // Parent Communication
    parentNotified: {
        type: Boolean,
        default: false
    },
    
    parentNotificationDate: {
        type: Date
    },
    
    parentNotificationMethod: {
        type: String,
        enum: ['phone', 'email', 'in_person', 'letter', 'other']
    },
    
    parentResponse: {
        type: String,
        maxlength: [1000, 'Parent response cannot exceed 1000 characters']
    },
    
    // Status
    status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open',
        index: true
    },
    
    resolvedDate: {
        type: Date
    },
    
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Attachments and Evidence
    attachments: [{
        filename: String,
        url: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Notes and Updates
    notes: [{
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        content: {
            type: String,
            required: true,
            maxlength: [1000, 'Note cannot exceed 1000 characters']
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Metadata
    isConfidential: {
        type: Boolean,
        default: false
    },
    
    tags: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true
});

// Apply tenant isolation
studentBehaviorSchema.plugin(tenantIsolationPlugin);

// Indexes
studentBehaviorSchema.index({ student: 1, incidentDate: -1 });
studentBehaviorSchema.index({ school: 1, incidentDate: -1 });
studentBehaviorSchema.index({ school: 1, academicYear: 1, incidentDate: -1 });
studentBehaviorSchema.index({ student: 1, academicYear: 1, incidentDate: -1 });
studentBehaviorSchema.index({ class: 1, incidentDate: -1 });
studentBehaviorSchema.index({ incidentType: 1, status: 1 });
studentBehaviorSchema.index({ category: 1, severity: 1 });
studentBehaviorSchema.index({ reportedBy: 1, createdAt: -1 });
studentBehaviorSchema.index({ status: 1, followUpRequired: 1 });

// Virtual for student name (populated)
studentBehaviorSchema.virtual('studentName').get(function() {
    if (this.student && this.student.firstName) {
        return `${this.student.firstName} ${this.student.lastName}`;
    }
    return 'Unknown Student';
});

// Static methods
studentBehaviorSchema.statics.getStudentBehaviorSummary = async function(studentId, startDate, endDate) {
    const match = { student: studentId };
    if (startDate || endDate) {
        match.incidentDate = {};
        if (startDate) match.incidentDate.$gte = startDate;
        if (endDate) match.incidentDate.$lte = endDate;
    }
    
    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$incidentType',
                count: { $sum: 1 },
                categories: { $addToSet: '$category' },
                latestIncident: { $max: '$incidentDate' }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

studentBehaviorSchema.statics.getClassBehaviorStats = async function(classId, startDate, endDate) {
    const match = { class: classId };
    if (startDate || endDate) {
        match.incidentDate = {};
        if (startDate) match.incidentDate.$gte = startDate;
        if (endDate) match.incidentDate.$lte = endDate;
    }
    
    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    student: '$student',
                    incidentType: '$incidentType'
                },
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.student',
                incidents: {
                    $push: {
                        type: '$_id.incidentType',
                        count: '$count'
                    }
                },
                totalIncidents: { $sum: '$count' }
            }
        },
        {
            $lookup: {
                from: 'students',
                localField: '_id',
                foreignField: '_id',
                as: 'studentInfo'
            }
        },
        { $unwind: '$studentInfo' },
        { $sort: { totalIncidents: -1 } }
    ]);
};

studentBehaviorSchema.statics.getPendingFollowUps = async function(schoolId, academicYear = null) {
    const query = {
        school: schoolId,
        followUpRequired: true,
        followUpCompletedAt: null,
        followUpDate: { $lte: new Date() }
    };
    if (academicYear) query.academicYear = academicYear;

    return this.find(query)
    .populate('student', 'firstName lastName studentId')
    .populate('reportedBy', 'firstName lastName')
    .sort({ followUpDate: 1 });
};

// Instance methods
studentBehaviorSchema.methods.addNote = function(authorId, content) {
    this.notes.push({
        author: authorId,
        content: content,
        createdAt: new Date()
    });
    return this.save();
};

studentBehaviorSchema.methods.markResolved = function(userId) {
    this.status = 'resolved';
    this.resolvedDate = new Date();
    this.resolvedBy = userId;
    return this.save();
};

studentBehaviorSchema.methods.notifyParent = function(method) {
    this.parentNotified = true;
    this.parentNotificationDate = new Date();
    this.parentNotificationMethod = method;
    return this.save();
};

const StudentBehavior = mongoose.model('StudentBehavior', studentBehaviorSchema);

export default StudentBehavior;
