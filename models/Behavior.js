import mongoose from 'mongoose';

const behaviorSchema = new mongoose.Schema({
    // User Information
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true // index covered by compound indexes below
    },
    
    // Event Information
    eventType: {
        type: String,
        required: true,
        enum: [
            // Authentication Events
            'login',
            'logout',
            'login_failed',
            'password_change',
            'password_reset_request',
            
            // Academic Events
            'grade_created',
            'grade_updated',
            'grade_deleted',
            'attendance_marked',
            'assignment_created',
            'assignment_updated',
            'assignment_deleted',
            'student_enrolled',
            'student_withdrawn',
            
            // System Events
            'profile_updated',
            'settings_changed',
            'data_exported',
            'report_generated',
            'notification_sent',
            
            // Administrative Events
            'user_created',
            'user_updated',
            'user_deleted',
            'class_created',
            'class_updated',
            'class_deleted',
            'subject_created',
            'subject_updated',
            'subject_deleted',
            
            // Subscription Events
            'subscription_created',
            'subscription_updated',
            'subscription_cancelled',
            'payment_recorded',
            
            // Security Events
            'suspicious_login',
            'permission_denied',
            'data_access_attempt',
            'api_key_used',
            
            // UI Events
            'page_view',
            'feature_used',
            'search_performed',
            'filter_applied',
            'export_downloaded',

            // Behavior Tracking Events
            'api_request',
            'custom_event',
            'session_started',
            'session_heartbeat',
            'session_ended'
        ]
    },
    
    // Event Details
    action: {
        type: String,
        required: true,
        maxlength: 100
    },
    description: {
        type: String,
        maxlength: 500
    },
    
    // Context Information
    resourceType: {
        type: String,
        enum: ['user', 'student', 'grade', 'class', 'subject', 'school', 'subscription', 'report', 'assignment', 'system']
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId
    },
    
    // Request Information
    ipAddress: {
        type: String,
        required: true
    },
    userAgent: {
        type: String,
        maxlength: 500
    },
    sessionId: {
        type: String,
        index: true
    },
    
    // Geographic Information
    location: {
        country: String,
        region: String,
        city: String,
        timezone: String
    },
    
    // Device Information
    device: {
        type: {
            type: String,
            default: 'unknown'
        },
        browser: String,
        os: String,
        platform: String,
        isMobile: Boolean,
        isTablet: Boolean
    },
    
    // Performance Metrics
    responseTime: {
        type: Number,
        min: 0
    },
    statusCode: {
        type: Number,
        min: 100,
        max: 599
    },
    
    // Additional Metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Timestamp
    timestamp: {
        type: Date,
        default: Date.now // index covered by compound indexes and TTL index below
    },
    
    // Session Information
    sessionDuration: {
        type: Number,
        min: 0
    },
    pageViews: {
        type: Number,
        min: 0,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes for performance
behaviorSchema.index({ user: 1, timestamp: -1 });
behaviorSchema.index({ school: 1, timestamp: -1 });
behaviorSchema.index({ eventType: 1, timestamp: -1 });
behaviorSchema.index({ action: 1, timestamp: -1 });
behaviorSchema.index({ resourceType: 1, resourceId: 1 });
behaviorSchema.index({ ipAddress: 1, timestamp: -1 });
behaviorSchema.index({ sessionId: 1, timestamp: -1 });
behaviorSchema.index({ timestamp: -1 });

// TTL Index - automatically delete records older than 2 years
behaviorSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 }); // 2 years in seconds

// Static methods
behaviorSchema.statics.logEvent = async function(eventData) {
    try {
        const behavior = new this(eventData);
        await behavior.save();
        return behavior;
    } catch (error) {
        console.error('Failed to log behavior event:', error);
        // Don't throw error to avoid breaking main application flow
    }
};

behaviorSchema.statics.getEventStats = function(filters = {}) {
    const matchStage = {};
    
    if (filters.school) matchStage.school = filters.school;
    if (filters.user) matchStage.user = filters.user;
    if (filters.eventType) matchStage.eventType = filters.eventType;
    if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) matchStage.timestamp.$gte = filters.startDate;
        if (filters.endDate) matchStage.timestamp.$lte = filters.endDate;
    }
    
    return this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    eventType: '$eventType',
                    date: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$timestamp'
                        }
                    }
                },
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$user' }
            }
        },
        {
            $group: {
                _id: '$_id.eventType',
                dailyStats: {
                    $push: {
                        date: '$_id.date',
                        count: '$count',
                        uniqueUsers: { $size: '$uniqueUsers' }
                    }
                },
                totalCount: { $sum: '$count' },
                userBuckets: { $push: '$uniqueUsers' }
            }
        },
        {
            $project: {
                eventType: '$_id',
                dailyStats: 1,
                totalCount: 1,
                totalUniqueUsers: {
                    $size: {
                        $reduce: {
                            input: '$userBuckets',
                            initialValue: [],
                            in: { $setUnion: ['$$value', '$$this'] }
                        }
                    }
                }
            }
        },
        { $sort: { totalCount: -1 } }
    ]);
};

behaviorSchema.statics.getUserActivitySummary = function(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return this.aggregate([
        {
            $match: {
                user: userId,
                timestamp: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: {
                    date: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$timestamp'
                        }
                    },
                    eventType: '$eventType'
                },
                count: { $sum: 1 },
                firstActivity: { $min: '$timestamp' },
                lastActivity: { $max: '$timestamp' }
            }
        },
        {
            $group: {
                _id: '$_id.date',
                events: {
                    $push: {
                        eventType: '$_id.eventType',
                        count: '$count'
                    }
                },
                totalEvents: { $sum: '$count' },
                firstActivity: { $min: '$firstActivity' },
                lastActivity: { $max: '$lastActivity' }
            }
        },
        { $sort: { _id: 1 } }
    ]);
};

behaviorSchema.statics.getSecurityEvents = function(filters = {}) {
    const securityEventTypes = [
        'login_failed',
        'suspicious_login',
        'permission_denied',
        'data_access_attempt'
    ];
    
    const matchStage = {
        eventType: { $in: securityEventTypes }
    };
    
    if (filters.school) matchStage.school = filters.school;
    if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) matchStage.timestamp.$gte = filters.startDate;
        if (filters.endDate) matchStage.timestamp.$lte = filters.endDate;
    }
    
    return this.find(matchStage)
        .populate('user', 'firstName lastName email')
        .populate('school', 'name')
        .sort({ timestamp: -1 })
        .limit(100);
};

// Instance methods
behaviorSchema.methods.getRiskScore = function() {
    const highRiskEvents = ['login_failed', 'suspicious_login', 'permission_denied'];
    const mediumRiskEvents = ['data_access_attempt', 'user_deleted'];
    
    if (highRiskEvents.includes(this.eventType)) return 3;
    if (mediumRiskEvents.includes(this.eventType)) return 2;
    return 1;
};

const Behavior = mongoose.model('Behavior', behaviorSchema);

export default Behavior;
