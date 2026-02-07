import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    
    // Basic room information
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    building: {
        type: String,
        trim: true,
        maxlength: 100
    },
    floor: {
        type: String,
        trim: true,
        maxlength: 50
    },
    number: {
        type: String,
        trim: true,
        maxlength: 20
    },
    
    // Room type and capacity
    type: {
        type: String,
        enum: ['classroom', 'lab', 'lecture_hall', 'conference_room', 'library', 'gym', 'auditorium', 'office', 'other'],
        required: true
    },
    capacity: {
        type: Number,
        required: true,
        min: 1,
        max: 1000
    },
    
    // Room features and equipment
    equipment: [{
        type: String,
        enum: [
            'projector', 'smart_board', 'whiteboard', 'blackboard', 'computer', 'laptop',
            'microscope', 'bunsen_burner', 'safety_equipment', 'video_conference',
            'audio_system', 'wifi', 'air_conditioning', 'heating', 'wheelchair_accessible'
        ]
    }],
    
    // Room specifications
    dimensions: {
        length: {
            type: Number,
            min: 0
        },
        width: {
            type: Number,
            min: 0
        },
        height: {
            type: Number,
            min: 0
        },
        area: {
            type: Number,
            min: 0
        }
    },
    
    // Availability and scheduling
    isAvailable: {
        type: Boolean,
        default: true
    },
    availabilitySchedule: [{
        dayOfWeek: {
            type: Number,
            min: 0,
            max: 6,
            required: true
        },
        openTime: {
            type: String,
            required: true,
            match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
        },
        closeTime: {
            type: String,
            required: true,
            match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
        },
        isClosed: {
            type: Boolean,
            default: false
        }
    }],
    
    // Restrictions and permissions
    restrictions: [{
        type: {
            type: String,
            enum: ['subject_only', 'grade_only', 'teacher_only', 'capacity_limit'],
            required: true
        },
        value: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        },
        description: {
            type: String,
            trim: true,
            maxlength: 200
        }
    }],
    
    // Maintenance and status
    status: {
        type: String,
        enum: ['active', 'maintenance', 'renovation', 'closed'],
        default: 'active'
    },
    maintenanceSchedule: [{
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        type: {
            type: String,
            enum: ['cleaning', 'repair', 'renovation', 'inspection'],
            required: true
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500
        },
        contractor: {
            type: String,
            trim: true,
            maxlength: 200
        }
    }],
    
    // Location and contact
    location: {
        coordinates: {
            type: [Number], // [longitude, latitude]
            index: '2dsphere'
        },
        address: {
            type: String,
            trim: true,
            maxlength: 500
        },
        directions: {
            type: String,
            trim: true,
            maxlength: 1000
        }
    },
    
    // Room manager/contact
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    contactInfo: {
        phone: {
            type: String,
            trim: true
        },
        email: {
            type: String,
            trim: true,
            lowercase: true
        }
    },
    
    // Usage statistics
    usageStats: {
        totalBookings: {
            type: Number,
            default: 0
        },
        averageOccupancy: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        lastUsed: {
            type: Date
        },
        mostUsedSubject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject'
        }
    },
    
    // Images and media
    images: [{
        url: {
            type: String,
            required: true
        },
        caption: {
            type: String,
            trim: true,
            maxlength: 200
        },
        type: {
            type: String,
            enum: ['interior', 'exterior', 'layout', 'equipment'],
            default: 'interior'
        }
    }],
    
    // Additional notes
    notes: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    
    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
roomSchema.index({ school: 1, name: 1 }, { unique: true });
roomSchema.index({ school: 1, type: 1 });
roomSchema.index({ school: 1, isAvailable: 1 });
roomSchema.index({ school: 1, capacity: 1 });
roomSchema.index({ 'location.coordinates': '2dsphere' });

// Virtuals
roomSchema.virtual('fullName').get(function() {
    let fullName = this.name;
    if (this.building) {
        fullName = `${this.building} - ${fullName}`;
    }
    if (this.floor) {
        fullName = `${fullName} (Floor ${this.floor})`;
    }
    return fullName;
});

roomSchema.virtual('isCurrentlyAvailable').get(function() {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    if (!this.isAvailable || this.status !== 'active') {
        return false;
    }
    
    // Check if room is under maintenance
    const isUnderMaintenance = this.maintenanceSchedule.some(maintenance => {
        return now >= maintenance.startDate && now <= maintenance.endDate;
    });
    
    if (isUnderMaintenance) {
        return false;
    }
    
    // Check availability schedule
    const todaySchedule = this.availabilitySchedule.find(schedule => 
        schedule.dayOfWeek === currentDay && !schedule.isClosed
    );
    
    if (!todaySchedule) {
        return false;
    }
    
    return currentTime >= todaySchedule.openTime && currentTime <= todaySchedule.closeTime;
});

// Pre-save middleware
roomSchema.pre('save', function(next) {
    // Calculate area if dimensions are provided
    if (this.isModified('dimensions.length') || this.isModified('dimensions.width')) {
        if (this.dimensions.length && this.dimensions.width) {
            this.dimensions.area = this.dimensions.length * this.dimensions.width;
        }
    }
    
    next();
});

// Static methods
roomSchema.statics.findAvailableRooms = function(schoolId, startTime, endTime, requirements = {}) {
    const query = {
        school: new mongoose.Types.ObjectId(schoolId),
        isAvailable: true,
        status: 'active'
    };
    
    // Add capacity requirement
    if (requirements.minCapacity) {
        query.capacity = { $gte: requirements.minCapacity };
    }
    
    // Add room type requirement
    if (requirements.type) {
        query.type = requirements.type;
    }
    
    // Add equipment requirement
    if (requirements.equipment && requirements.equipment.length > 0) {
        query.equipment = { $all: requirements.equipment };
    }
    
    return this.find(query)
        .then(rooms => {
            // Filter rooms that don't have scheduling conflicts
            return Promise.all(rooms.map(async room => {
                const hasConflict = await this.checkRoomConflict(room._id, startTime, endTime);
                return { room, hasConflict };
            }))
            .then(results => {
                return results
                    .filter(result => !result.hasConflict)
                    .map(result => result.room);
            });
        });
};

roomSchema.statics.checkRoomConflict = function(roomId, startTime, endTime, excludeScheduleId = null) {
    const Schedule = mongoose.model('Schedule');
    
    const query = {
        room: new mongoose.Types.ObjectId(roomId),
        status: { $ne: 'cancelled' },
        $or: [
            {
                startTime: { $lt: new Date(endTime) },
                endTime: { $gt: new Date(startTime) }
            }
        ]
    };
    
    if (excludeScheduleId) {
        query._id = { $ne: new mongoose.Types.ObjectId(excludeScheduleId) };
    }
    
    return Schedule.findOne(query).then(schedule => !!schedule);
};

roomSchema.statics.getRoomUtilization = function(roomId, startDate, endDate) {
    const Schedule = mongoose.model('Schedule');
    
    return Schedule.aggregate([
        {
            $match: {
                room: new mongoose.Types.ObjectId(roomId),
                startTime: { $gte: new Date(startDate) },
                endTime: { $lte: new Date(endDate) },
                status: { $ne: 'cancelled' }
            }
        },
        {
            $group: {
                _id: null,
                totalBookings: { $sum: 1 },
                totalDuration: { $sum: { $subtract: ['$endTime', '$startTime'] } },
                averageDuration: { $avg: { $subtract: ['$endTime', '$startTime'] } }
            }
        }
    ]);
};

// Instance methods
roomSchema.methods.isAvailableAtTime = function(startTime, endTime) {
    // Check if room is under maintenance
    const isUnderMaintenance = this.maintenanceSchedule.some(maintenance => {
        return (startTime <= maintenance.endDate && endTime >= maintenance.startDate);
    });
    
    if (isUnderMaintenance) {
        return false;
    }
    
    // Check availability schedule for each day in the range
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = date.getDay();
        const daySchedule = this.availabilitySchedule.find(schedule => 
            schedule.dayOfWeek === dayOfWeek && !schedule.isClosed
        );
        
        if (!daySchedule) {
            return false;
        }
        
        // For the start and end dates, check specific times
        if (date.getTime() === start.getTime()) {
            const startTimeStr = start.toTimeString().slice(0, 5);
            if (startTimeStr < daySchedule.openTime || startTimeStr > daySchedule.closeTime) {
                return false;
            }
        }
        
        if (date.getTime() === end.getTime()) {
            const endTimeStr = end.toTimeString().slice(0, 5);
            if (endTimeStr < daySchedule.openTime || endTimeStr > daySchedule.closeTime) {
                return false;
            }
        }
    }
    
    return true;
};

const Room = mongoose.model('Room', roomSchema);

export default Room;
