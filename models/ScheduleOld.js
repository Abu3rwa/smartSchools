import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema({
    // Basic Information
    title: {
        type: String,
        required: true,
        maxlength: 200,
        trim: true
    },
    description: {
        type: String,
        maxlength: 1000,
        trim: true
    },
    
    // Schedule Type
    type: {
        type: String,
        required: true,
        enum: [
            'class',           // Regular class schedule
            'exam',            // Exam schedule
            'meeting',         // Meeting schedule
            'event',           // General event
            'holiday',         // Holiday/break
            'maintenance',     // System maintenance
            'appointment',     // Parent-teacher appointment
            'extracurricular'  // Extracurricular activity
        ]
    },
    
    // Associated School
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    
    // Class Information (for class schedules)
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        index: true
    },
    
    // Subject Information (for class schedules)
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject'
    },
    
    // Teacher Information
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    
    // Room/Location Information
    room: {
        type: String,
        maxlength: 100,
        trim: true
    },
    location: {
        type: String,
        maxlength: 200,
        trim: true
    },
    
    // Time Information
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
    
    // Recurrence Information
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurrencePattern: {
        type: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'yearly'],
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
        dayOfMonth: {
            type: Number,
            min: 1,
            max: 31
        },
        weekOfMonth: {
            type: Number,
            min: 1,
            max: 5
        },
        monthOfYear: {
            type: Number,
            min: 1,
            max: 12
        }
    },
    
    // Recurrence Limits
    recurrenceEnd: {
        type: Date
    },
    maxOccurrences: {
        type: Number,
        min: 1
    },
    
    // Attendance Information
    requiresAttendance: {
        type: Boolean,
        default: false
    },
    attendanceRecorded: {
        type: Boolean,
        default: false
    },
    attendance: [{
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student',
            required: true
        },
        status: {
            type: String,
            enum: ['present', 'absent', 'late', 'excused'],
            default: 'absent'
        },
        checkInTime: {
            type: Date
        },
        notes: {
            type: String,
            maxlength: 500
        },
        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        recordedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Status Information
    status: {
        type: String,
        enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'postponed'],
        default: 'scheduled'
    },
    
    // Priority Level
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    
    // Visibility Settings
    isPublic: {
        type: Boolean,
        default: true
    },
    visibleToStudents: {
        type: Boolean,
        default: true
    },
    visibleToParents: {
        type: Boolean,
        default: true
    },
    
    // Notification Settings
    sendReminder: {
        type: Boolean,
        default: false
    },
    reminderTime: {
        type: Number, // Minutes before event
        default: 15
    },
    notificationsSent: [{
        type: {
            type: String,
            enum: ['email', 'sms', 'push', 'in_app']
        },
        sentAt: {
            type: Date,
            default: Date.now
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // Resources and Materials
    materials: [{
        name: {
            type: String,
            required: true,
            maxlength: 200
        },
        type: {
            type: String,
            enum: ['document', 'video', 'audio', 'image', 'link', 'other'],
            default: 'document'
        },
        url: {
            type: String,
            maxlength: 500
        },
        description: {
            type: String,
            maxlength: 500
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Participants
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['organizer', 'teacher', 'student', 'observer', 'participant'],
            default: 'participant'
        },
        status: {
            type: String,
            enum: ['invited', 'accepted', 'declined', 'tentative', 'attending'],
            default: 'invited'
        },
        responseTime: {
            type: Date
        }
    }],
    
    // Additional Metadata
    tags: [{
        type: String,
        maxlength: 50,
        trim: true
    }],
    color: {
        type: String,
        match: /^#[0-9A-F]{6}$/i, // Hex color code
        default: '#3B82F6'
    },
    
    // Created/Updated Information
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Cancellation Information
    cancelledAt: {
        type: Date
    },
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cancellationReason: {
        type: String,
        maxlength: 500
    },
    
    // Rescheduling Information
    rescheduledFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Schedule'
    },
    rescheduledTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Schedule'
    }
}, {
    timestamps: true
});

// Indexes for performance
scheduleSchema.index({ school: 1, startTime: 1 });
scheduleSchema.index({ teacher: 1, startTime: 1 });
scheduleSchema.index({ class: 1, startTime: 1 });
scheduleSchema.index({ type: 1, startTime: 1 });
scheduleSchema.index({ status: 1, startTime: 1 });
scheduleSchema.index({ isRecurring: 1, startTime: 1 });
scheduleSchema.index({ startTime: 1, endTime: 1 });
scheduleSchema.index({ tags: 1 });

// Validation for time range
scheduleSchema.pre('save', function(next) {
    if (this.startTime >= this.endTime) {
        next(new Error('End time must be after start time'));
    } else {
        next();
    }
});

// Virtual for duration
scheduleSchema.virtual('duration').get(function() {
    return this.endTime - this.startTime;
});

// Virtual for isPast
scheduleSchema.virtual('isPast').get(function() {
    return this.endTime < new Date();
});

// Virtual for isCurrent
scheduleSchema.virtual('isCurrent').get(function() {
    const now = new Date();
    return this.startTime <= now && this.endTime >= now;
});

// Virtual for isUpcoming
scheduleSchema.virtual('isUpcoming').get(function() {
    return this.startTime > new Date();
});

// Static method to find conflicts
scheduleSchema.statics.findConflicts = async function(schoolId, startTime, endTime, excludeId = null) {
    const query = {
        school: schoolId,
        status: { $ne: 'cancelled' },
        $or: [
            {
                startTime: { $lt: endTime },
                endTime: { $gt: startTime }
            }
        ]
    };
    
    if (excludeId) {
        query._id = { $ne: excludeId };
    }
    
    return this.find(query)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade')
        .populate('subject', 'name');
};

// Static method to find schedules by date range
scheduleSchema.statics.findByDateRange = function(schoolId, startDate, endDate, filters = {}) {
    const query = {
        school: schoolId,
        startTime: { $gte: startDate },
        endTime: { $lte: endDate }
    };
    
    if (filters.type) query.type = filters.type;
    if (filters.teacher) query.teacher = filters.teacher;
    if (filters.class) query.class = filters.class;
    if (filters.status) query.status = filters.status;
    if (filters.tags) query.tags = { $in: filters.tags };
    
    return this.find(query)
        .populate('teacher', 'firstName lastName email')
        .populate('class', 'name grade')
        .populate('subject', 'name')
        .sort({ startTime: 1 });
};

// Static method to get teacher schedule
scheduleSchema.statics.getTeacherSchedule = function(teacherId, startDate, endDate) {
    return this.find({
        teacher: teacherId,
        startTime: { $gte: startDate },
        endTime: { $lte: endDate },
        status: { $ne: 'cancelled' }
    })
    .populate('class', 'name grade')
    .populate('subject', 'name')
    .sort({ startTime: 1 });
};

// Static method to get student schedule
scheduleSchema.statics.getStudentSchedule = function(studentId, startDate, endDate) {
    return this.find({
        'participants.user': studentId,
        startTime: { $gte: startDate },
        endTime: { $lte: endDate },
        status: { $ne: 'cancelled' }
    })
    .populate('teacher', 'firstName lastName')
    .populate('class', 'name grade')
    .populate('subject', 'name')
    .sort({ startTime: 1 });
};

// Instance method to check attendance
scheduleSchema.methods.checkAttendance = function() {
    if (!this.requiresAttendance) return null;
    
    const total = this.attendance.length;
    const present = this.attendance.filter(a => a.status === 'present').length;
    const absent = this.attendance.filter(a => a.status === 'absent').length;
    const late = this.attendance.filter(a => a.status === 'late').length;
    const excused = this.attendance.filter(a => a.status === 'excused').length;
    
    return {
        total,
        present,
        absent,
        late,
        excused,
        attendanceRate: total > 0 ? ((present / total) * 100).toFixed(1) : 0
    };
};

// Instance method to generate occurrences for recurring events
scheduleSchema.methods.generateOccurrences = function(startDate, endDate) {
    if (!this.isRecurring) return [this];
    
    const occurrences = [];
    let currentDate = new Date(this.startTime);
    
    while (currentDate <= endDate && (!this.recurrenceEnd || currentDate <= this.recurrenceEnd)) {
        const occurrence = new this.constructor({
            ...this.toObject(),
            _id: undefined,
            startTime: new Date(currentDate),
            endTime: new Date(currentDate.getTime() + (this.endTime - this.startTime)),
            parentSchedule: this._id,
            isOccurrence: true
        });
        
        occurrences.push(occurrence);
        
        // Move to next occurrence based on pattern
        switch (this.recurrencePattern.type) {
            case 'daily':
                currentDate.setDate(currentDate.getDate() + this.recurrencePattern.interval);
                break;
            case 'weekly':
                currentDate.setDate(currentDate.getDate() + (7 * this.recurrencePattern.interval));
                break;
            case 'monthly':
                currentDate.setMonth(currentDate.getMonth() + this.recurrencePattern.interval);
                break;
            case 'yearly':
                currentDate.setFullYear(currentDate.getFullYear() + this.recurrencePattern.interval);
                break;
        }
        
        // Check max occurrences
        if (this.maxOccurrences && occurrences.length >= this.maxOccurrences) {
            break;
        }
    }
    
    return occurrences;
};

const Schedule = mongoose.model('Schedule', scheduleSchema);

export default Schedule;
