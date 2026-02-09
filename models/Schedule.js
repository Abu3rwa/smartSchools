import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    
    // Basic schedule information
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    
    // Schedule type
    type: {
        type: String,
        enum: ['class', 'meeting', 'event', 'exam', 'break'],
        default: 'class',
        required: true
    },
    
    // Related entities
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        index: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        index: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
        index: true
    },
    
    // Time scheduling
    startTime: {
        type: Date,
        required: true,
        index: true
    },
    endTime: {
        type: Date,
        required: true,
        index: true
    },
    
    // Recurrence patterns
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurrencePattern: {
        type: {
            type: String,
            enum: ['daily', 'weekly', 'monthly'],
            default: 'weekly'
        },
        interval: {
            type: Number,
            min: 1,
            default: 1
        },
        daysOfWeek: [{
            type: Number,
            min: 0,
            max: 6 // 0 = Sunday, 6 = Saturday
        }],
        endDate: {
            type: Date
        },
        occurrences: {
            type: Number,
            min: 1
        }
    },
    
    // Semester/Term management
    semester: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Semester',
        index: true
    },
    term: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Term',
        index: true
    },
    
    // Template management
    isTemplate: {
        type: Boolean,
        default: false
    },
    templateName: {
        type: String,
        trim: true,
        maxlength: 100
    },
    templateCategory: {
        type: String,
        enum: ['regular', 'exam', 'meeting', 'event'],
        default: 'regular'
    },
    
    // Substitute teacher management
    substituteTeacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    substituteReason: {
        type: String,
        trim: true,
        maxlength: 500
    },
    substituteAssignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    substituteAssignedAt: {
        type: Date
    },
    
    // Attendance requirements
    requiresAttendance: {
        type: Boolean,
        default: true
    },
    attendanceDeadline: {
        type: Date,
        default: function() {
            // Default to 2 hours after class end
            return new Date(this.endTime.getTime() + 2 * 60 * 60 * 1000);
        }
    },
    
    // Status and visibility
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'cancelled', 'completed'],
        default: 'scheduled'
    },
    visibility: {
        type: String,
        enum: ['public', 'private', 'teachers_only'],
        default: 'public'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    
    // Color coding
    color: {
        type: String,
        default: '#3B82F6',
        match: /^#[0-9A-F]{6}$/i
    },
    
    // Materials and resources
    materials: [{
        name: {
            type: String,
            required: true,
            trim: true
        },
        type: {
            type: String,
            enum: ['document', 'video', 'link', 'other'],
            default: 'document'
        },
        url: {
            type: String,
            trim: true
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500
        }
    }],
    
    // Participants (for meetings/events)
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['required', 'optional', 'observer'],
            default: 'required'
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined', 'tentative'],
            default: 'pending'
        }
    }],
    
    // Notifications
    notifications: [{
        type: {
            type: String,
            enum: ['reminder', 'cancellation', 'update', 'substitute'],
            required: true
        },
        timing: {
            type: Number, // Minutes before event
            default: 15
        },
        sent: {
            type: Boolean,
            default: false
        },
        sentAt: {
            type: Date
        },
        recipients: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            type: {
                type: String,
                enum: ['teacher', 'student', 'parent', 'admin'],
                required: true
            }
        }]
    }],
    
    // Conflict detection status
    conflicts: [{
        type: {
            type: String,
            enum: ['teacher_conflict', 'room_conflict', 'class_conflict'],
            required: true
        },
        conflictingSchedule: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Schedule'
        },
        description: {
            type: String,
            required: true
        },
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
        },
        resolved: {
            type: Boolean,
            default: false
        },
        resolvedAt: {
            type: Date
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Audit trail
    auditTrail: [{
        action: {
            type: String,
            enum: ['created', 'updated', 'cancelled', 'substitute_assigned', 'conflict_resolved'],
            required: true
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        performedAt: {
            type: Date,
            default: Date.now
        },
        details: {
            type: mongoose.Schema.Types.Mixed
        },
        previousValues: {
            type: mongoose.Schema.Types.Mixed
        },
        newValues: {
            type: mongoose.Schema.Types.Mixed
        }
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
scheduleSchema.index({ school: 1, startTime: 1 });
scheduleSchema.index({ school: 1, teacher: 1, startTime: 1 });
scheduleSchema.index({ school: 1, room: 1, startTime: 1 });
scheduleSchema.index({ school: 1, class: 1, startTime: 1 });
scheduleSchema.index({ semester: 1, startTime: 1 });
scheduleSchema.index({ term: 1, startTime: 1 });
scheduleSchema.index({ isTemplate: 1, templateCategory: 1 });

// Virtuals
scheduleSchema.virtual('duration').get(function() {
    return this.endTime - this.startTime;
});

scheduleSchema.virtual('isPast').get(function() {
    return this.endTime < new Date();
});

scheduleSchema.virtual('isOngoing').get(function() {
    const now = new Date();
    return this.startTime <= now && this.endTime >= now;
});

scheduleSchema.virtual('isUpcoming').get(function() {
    return this.startTime > new Date();
});

// Pre-save middleware for conflict detection
scheduleSchema.pre('save', async function(next) {
    if (this.isNew || this.isModified('startTime') || this.isModified('endTime') || 
        this.isModified('teacher') || this.isModified('room') || this.isModified('class')) {
        
        // Clear existing conflicts
        this.conflicts = [];
        
        // Check for conflicts
        const conflicts = await this.detectConflicts();
        this.conflicts = conflicts;
    }
    
    // Update audit trail
    if (this.isModified() && !this.isNew) {
        this.auditTrail.push({
            action: 'updated',
            performedBy: this.lastModifiedBy,
            details: 'Schedule updated',
            previousValues: this._previousValues || {},
            newValues: this.toObject()
        });
    }
    
    next();
});

// Instance methods
scheduleSchema.methods.detectConflicts = async function() {
    const conflicts = [];
    
    // Check teacher conflicts
    const teacherConflict = await this.constructor.findOne({
        _id: { $ne: this._id },
        school: this.school,
        teacher: this.teacher,
        status: { $ne: 'cancelled' },
        $or: [
            {
                startTime: { $lt: this.endTime },
                endTime: { $gt: this.startTime }
            }
        ]
    }).populate('teacher class subject room');
    
    if (teacherConflict) {
        conflicts.push({
            type: 'teacher_conflict',
            conflictingSchedule: teacherConflict._id,
            description: `Teacher ${teacherConflict.teacher.firstName} ${teacherConflict.teacher.lastName} is already scheduled for ${teacherConflict.title} at the same time`,
            severity: 'high'
        });
    }
    
    // Check room conflicts
    const roomConflict = await this.constructor.findOne({
        _id: { $ne: this._id },
        school: this.school,
        room: this.room,
        status: { $ne: 'cancelled' },
        $or: [
            {
                startTime: { $lt: this.endTime },
                endTime: { $gt: this.startTime }
            }
        ]
    }).populate('teacher class subject room');
    
    if (roomConflict) {
        conflicts.push({
            type: 'room_conflict',
            conflictingSchedule: roomConflict._id,
            description: `Room ${roomConflict.room.name} is already booked for ${roomConflict.title} at the same time`,
            severity: 'high'
        });
    }
    
    // Check class conflicts (if this is a class schedule)
    if (this.type === 'class' && this.class) {
        const classConflict = await this.constructor.findOne({
            _id: { $ne: this._id },
            school: this.school,
            class: this.class,
            type: 'class',
            status: { $ne: 'cancelled' },
            $or: [
                {
                    startTime: { $lt: this.endTime },
                    endTime: { $gt: this.startTime }
                }
            ]
        }).populate('teacher class subject room');
        
        if (classConflict) {
            conflicts.push({
                type: 'class_conflict',
                conflictingSchedule: classConflict._id,
                description: `Class ${classConflict.class.name} is already scheduled for ${classConflict.title} at the same time`,
                severity: 'medium'
            });
        }
    }
    
    return conflicts;
};

// Static methods
scheduleSchema.statics.findConflicts = function(schoolId, startTime, endTime, teacherId, roomId, classId, excludeId = null) {
    const query = {
        school: new mongoose.Types.ObjectId(schoolId),
        status: { $ne: 'cancelled' },
        $or: [
            {
                startTime: { $lt: new Date(endTime) },
                endTime: { $gt: new Date(startTime) }
            }
        ]
    };
    
    if (excludeId) {
        query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }
    
    const orConditions = [];
    
    if (teacherId) {
        orConditions.push({ teacher: new mongoose.Types.ObjectId(teacherId) });
    }
    
    if (roomId) {
        orConditions.push({ room: new mongoose.Types.ObjectId(roomId) });
    }
    
    if (classId) {
        orConditions.push({ class: new mongoose.Types.ObjectId(classId) });
    }
    
    if (orConditions.length > 0) {
        query.$and = [{ $or: orConditions }];
    }
    
    return this.find(query)
        .populate('teacher class subject room')
        .sort({ startTime: 1 });
};

scheduleSchema.statics.createFromTemplate = function(templateId, newDate, overrides = {}) {
    return this.findById(templateId).then(template => {
        if (!template || !template.isTemplate) {
            throw new Error('Template not found or not a template');
        }
        
        const newSchedule = new this({
            ...template.toObject(),
            ...overrides,
            startTime: new Date(newDate),
            endTime: new Date(newDate.getTime() + (template.endTime - template.startTime)),
            isTemplate: false,
            templateName: undefined,
            conflicts: [],
            auditTrail: [{
                action: 'created',
                performedBy: overrides.createdBy,
                details: 'Created from template',
                newValues: overrides
            }]
        });
        
        return newSchedule.save();
    });
};

scheduleSchema.statics.getTeacherSchedule = function(teacherId, startDate, endDate) {
    return this.find({
        teacher: new mongoose.Types.ObjectId(teacherId),
        startTime: { $gte: new Date(startDate) },
        endTime: { $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    })
    .populate('class subject room')
    .sort({ startTime: 1 });
};

scheduleSchema.statics.getRoomSchedule = function(roomId, startDate, endDate) {
    return this.find({
        room: new mongoose.Types.ObjectId(roomId),
        startTime: { $gte: new Date(startDate) },
        endTime: { $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    })
    .populate('teacher class subject room')
    .sort({ startTime: 1 });
};

scheduleSchema.statics.getClassSchedule = function(classId, startDate, endDate) {
    return this.find({
        class: new mongoose.Types.ObjectId(classId),
        type: 'class',
        startTime: { $gte: new Date(startDate) },
        endTime: { $lte: new Date(endDate) },
        status: { $ne: 'cancelled' }
    })
    .populate('teacher subject room')
    .sort({ startTime: 1 });
};

scheduleSchema.statics.findByDateRange = function(schoolId, startDate, endDate, filters = {}) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const query = {
        school: new mongoose.Types.ObjectId(schoolId),
        startTime: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' },
        ...filters
    };

    return this.find(query)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('room', 'name')
        .sort({ startTime: 1 });
};

const Schedule = mongoose.model('Schedule', scheduleSchema);

export default Schedule;
