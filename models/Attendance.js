import mongoose from 'mongoose';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import {
    DEFAULT_SCHOOL_TIMEZONE,
    resolveTimeZone,
    getSchoolDayRange,
    getViewRangeInTimeZone
} from '../utils/schoolTimezone.js';

const attendanceSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true // index covered by compound index below
    },
    schedule: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Schedule',
        index: true
    },
    period: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TimetablePeriod',
        index: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
        index: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: false // Period-based attendance may not have a subject
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    room: {
        type: String,
        required: true
    },
    
    // Attendance tracking
    totalStudents: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Student attendance records
    studentAttendance: [{
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student',
            required: true
        },
        status: {
            type: String,
            enum: ['present', 'absent', 'tardy', 'tardy_excused', 'absent_excused'],
            required: true
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
        },
        lastModifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        lastModifiedAt: {
            type: Date
        }
    }],
    
    // Summary statistics
    present: {
        type: Number,
        default: 0,
        min: 0
    },
    absent: {
        type: Number,
        default: 0,
        min: 0
    },
    late: {
        type: Number,
        default: 0,
        min: 0
    },
    excused: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // Attendance rate calculation
    attendanceRate: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    
    // Metadata
    recordedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recordedAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastModifiedAt: {
        type: Date
    },
    
    // Status tracking
    status: {
        type: String,
        enum: ['draft', 'submitted', 'locked'],
        default: 'draft'
    },
    
    // Notifications sent
    notificationsSent: [{
        type: {
            type: String,
            enum: ['parent_notification', 'missed_attendance_reminder'],
            required: true
        },
        sentAt: {
            type: Date,
            default: Date.now
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'type'
        }
    }],
    
    // Audit trail
    auditTrail: [{
        action: {
            type: String,
            enum: ['created', 'updated', 'student_added', 'student_updated', 'status_changed'],
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
        }
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
attendanceSchema.index({ school: 1, date: 1 });
attendanceSchema.index({ teacher: 1, date: 1 });
attendanceSchema.index({ class: 1, date: 1 });
// BE-012: Compound index for teacher attendance by class range + date range query
attendanceSchema.index({ school: 1, teacher: 1, class: 1, date: 1 });
attendanceSchema.index(
    { schedule: 1, date: 1 },
    {
        unique: true,
        partialFilterExpression: { schedule: { $exists: true, $ne: null } }
    }
);
attendanceSchema.index({ teacher: 1, period: 1, date: 1 }, { unique: true, sparse: true });
attendanceSchema.index({ 'studentAttendance.student': 1, date: 1 });

// Virtual for attendance summary
attendanceSchema.virtual('summary').get(function() {
    return {
        total: this.totalStudents,
        present: this.present,
        absent: this.absent,
        late: this.late,
        excused: this.excused,
        rate: this.attendanceRate
    };
});

// Pre-save middleware to calculate attendance statistics
attendanceSchema.pre('save', function(next) {
    if (this.isModified('studentAttendance') || this.isModified('totalStudents')) {
        this.present = this.studentAttendance.filter(s => s.status === 'present').length;
        this.absent = this.studentAttendance.filter(s => s.status === 'absent').length;
        this.late = this.studentAttendance.filter(s => ['tardy', 'tardy_excused', 'late'].includes(s.status)).length;
        this.excused = this.studentAttendance.filter(s => ['absent_excused', 'tardy_excused', 'excused'].includes(s.status)).length;
        
        // Calculate attendance rate (present + tardy variants) / totalStudents * 100
        const attendedCount = this.present + this.late;
        this.attendanceRate = this.totalStudents > 0 ? Math.round((attendedCount / this.totalStudents) * 100) : 0;
    }
    
    // Update last modified timestamp
    if (this.isModified() && !this.isNew) {
        this.lastModifiedAt = new Date();
    }
    
    next();
});

// Static methods
attendanceSchema.statics.findByTeacherAndDate = function(teacherId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return this.find({
        teacher: teacherId,
        date: {
            $gte: startOfDay,
            $lte: endOfDay
        }
    }).populate('schedule class subject');
};

// Missed attendance is schedule-centric; period-based expectations not included.
attendanceSchema.statics.findMissedAttendance = async function(schoolId, date, filters = {}) {
    const targetDate = date ? new Date(date) : new Date();
    const config = await SchoolCalendarConfig.findOne({ school: schoolId, isActive: true })
        .select('timezone')
        .lean();
    const timeZone = resolveTimeZone(config?.timezone) || DEFAULT_SCHOOL_TIMEZONE;
    const dayRange = getSchoolDayRange(targetDate, timeZone);

    const matchStage = {
        school: new mongoose.Types.ObjectId(schoolId),
        date: {
            $gte: dayRange.start,
            $lte: dayRange.end
        }
    };
    if (Array.isArray(filters.classIds) && filters.classIds.length > 0) {
        matchStage.class = {
            $in: filters.classIds.map((id) => new mongoose.Types.ObjectId(id))
        };
    }

    return this.aggregate([
        {
            $match: matchStage
        },
        {
            $lookup: {
                from: 'schedules',
                localField: 'schedule',
                foreignField: '_id',
                as: 'scheduleInfo'
            }
        },
        {
            $unwind: '$scheduleInfo'
        },
        {
            $match: {
                'scheduleInfo.requiresAttendance': true,
                'scheduleInfo.startTime': { $lte: new Date() }
            }
        },
        {
            $group: {
                _id: '$teacher',
                missedClasses: {
                    $push: {
                        scheduleId: '$schedule',
                        className: '$scheduleInfo.class.name',
                        subjectName: '$scheduleInfo.subject.name',
                        startTime: '$scheduleInfo.startTime',
                        room: '$room'
                    }
                },
                totalMissed: { $sum: 1 }
            }
        }
    ]);
};

attendanceSchema.statics.getAttendanceAnalytics = async function(schoolId, startDate, endDate, filters = {}) {
    const config = await SchoolCalendarConfig.findOne({ school: schoolId, isActive: true })
        .select('timezone')
        .lean();
    const timeZone = resolveTimeZone(config?.timezone) || DEFAULT_SCHOOL_TIMEZONE;
    const range = getViewRangeInTimeZone({
        viewMode: 'range',
        startDate,
        endDate,
        now: new Date(),
        timeZone
    });

    const matchStage = {
        school: new mongoose.Types.ObjectId(schoolId),
        date: {
            $gte: range.start,
            $lte: range.end
        }
    };
    
    if (filters.teacher) {
        matchStage.teacher = new mongoose.Types.ObjectId(filters.teacher);
    }
    if (Array.isArray(filters.classIds) && filters.classIds.length > 0) {
        matchStage.class = {
            $in: filters.classIds.map((id) => new mongoose.Types.ObjectId(id))
        };
    }
    if (filters.class) {
        matchStage.class = new mongoose.Types.ObjectId(filters.class);
    }
    if (filters.subject) {
        matchStage.subject = new mongoose.Types.ObjectId(filters.subject);
    }
    
    return this.aggregate([
        { $match: matchStage },
        {
            $lookup: {
                from: 'schedules',
                localField: 'schedule',
                foreignField: '_id',
                as: 'scheduleInfo'
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'teacher',
                foreignField: '_id',
                as: 'teacherInfo'
            }
        },
        {
            $lookup: {
                from: 'classes',
                localField: 'class',
                foreignField: '_id',
                as: 'classInfo'
            }
        },
        {
            $lookup: {
                from: 'subjects',
                localField: 'subject',
                foreignField: '_id',
                as: 'subjectInfo'
            }
        },
        {
            $unwind: {
                path: '$scheduleInfo',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $unwind: '$teacherInfo'
        },
        {
            $unwind: '$classInfo'
        },
        {
            $unwind: {
                path: '$subjectInfo',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $group: {
                _id: {
                    date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                    teacher: '$teacherInfo._id'
                },
                totalClasses: { $sum: 1 },
                totalStudents: { $sum: '$totalStudents' },
                totalPresent: { $sum: '$present' },
                totalAbsent: { $sum: '$absent' },
                totalLate: { $sum: '$late' },
                avgAttendanceRate: { $avg: '$attendanceRate' },
                teacherName: { $first: { $concat: ['$teacherInfo.firstName', ' ', '$teacherInfo.lastName'] } }
            }
        },
        {
            $group: {
                _id: '$_id.date',
                teachers: {
                    $push: {
                        teacherId: '$_id.teacher',
                        teacherName: '$teacherName',
                        totalClasses: '$totalClasses',
                        totalStudents: '$totalStudents',
                        totalPresent: '$totalPresent',
                        totalAbsent: '$totalAbsent',
                        totalLate: '$totalLate',
                        avgAttendanceRate: '$avgAttendanceRate'
                    }
                },
                dailyStats: {
                    $push: {
                        totalClasses: '$totalClasses',
                        totalStudents: '$totalStudents',
                        totalPresent: '$totalPresent',
                        totalAbsent: '$totalAbsent',
                        totalLate: '$totalLate',
                        avgAttendanceRate: '$avgAttendanceRate'
                    }
                }
            }
        },
        {
            $addFields: {
                totalClasses: { $sum: '$dailyStats.totalClasses' },
                totalStudents: { $sum: '$dailyStats.totalStudents' },
                totalPresent: { $sum: '$dailyStats.totalPresent' },
                totalAbsent: { $sum: '$dailyStats.totalAbsent' },
                totalLate: { $sum: '$dailyStats.totalLate' },
                overallAttendanceRate: {
                    $cond: {
                        if: { $gt: [{ $sum: '$dailyStats.totalStudents' }, 0] },
                        then: {
                            $multiply: [
                                { $divide: [{ $sum: '$dailyStats.totalPresent' }, { $sum: '$dailyStats.totalStudents' }] },
                                100
                            ]
                        },
                        else: 0
                    }
                }
            }
        },
        { $sort: { '_id': 1 } }
    ]);
};

attendanceSchema.plugin(tenantIsolationPlugin);

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;
