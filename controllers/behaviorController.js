import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import Behavior from '../models/Behavior.js';
import BehaviorSession from '../models/BehaviorSession.js';
import School from '../models/School.js';
import User from '../models/User.js';
import {
    buildBehaviorFilters,
    createBehaviorSession,
    endBehaviorSession,
    getBehaviorDashboardMetrics,
    heartbeatBehaviorSession,
    listBehaviorEvents as listBehaviorEventsService,
    resolveStartDateFromPeriod,
    sanitizeMetadata
} from '../services/behaviorAnalyticsService.js';

const getClientIP = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers['x-real-ip'] || req.ip || '127.0.0.1';
};

const toValidObjectId = (value) => (mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : undefined);

// @desc    Track a custom behavior event
// @route   POST /api/behavior/events
// @access  Private
export const trackBehaviorEvent = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const schoolId = req.school?._id;

    if (!userId || !schoolId) {
        return res.status(400).json({ success: false, message: 'User and school context required' });
    }

    const {
        eventType = 'feature_used',
        action,
        description,
        resourceType,
        resourceId,
        metadata = {},
        statusCode,
        responseTime
    } = req.body;

    // Restrict event types — security-sensitive types are system-only
    const ALLOWED_USER_EVENT_TYPES = [
        'feature_used', 'page_view', 'navigation', 'interaction',
        'form_submission', 'search', 'export', 'import', 'preference_change'
    ];
    const sanitizedEventType = ALLOWED_USER_EVENT_TYPES.includes(eventType) ? eventType : 'feature_used';

    const event = await Behavior.logEvent({
        user: userId,
        school: schoolId,
        eventType: sanitizedEventType,
        action,
        description: description || action,
        resourceType: resourceType || 'system',
        resourceId: toValidObjectId(resourceId),
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        sessionId: req.headers['x-session-id'] || 'unknown',
        statusCode: statusCode || 200,
        responseTime,
        metadata: sanitizeMetadata(metadata)
    });

    return res.status(201).json({
        success: true,
        data: event
    });
});

// @desc    List behavior events with pagination and filtering
// @route   GET /api/behavior/events
// @access  Private/Admin+Department Principal
export const listBehaviorEvents = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 50,
        school,
        user,
        eventType,
        statusCode,
        period,
        startDate,
        endDate
    } = req.query;

    const resolvedStartDate = startDate || (period ? resolveStartDateFromPeriod(period) : undefined);
    const resolvedSchool = req.user.role === 'super_admin' ? school : req.school?._id;

    const filters = buildBehaviorFilters({
        school: resolvedSchool,
        user,
        eventType,
        statusCode,
        startDate: resolvedStartDate,
        endDate
    });

    const result = await listBehaviorEventsService({
        filters,
        page,
        limit
    });

    res.json({
        success: true,
        data: result.events,
        pagination: result.pagination
    });
});

// @desc    Start a tracked behavior session
// @route   POST /api/behavior/sessions/start
// @access  Private
export const startBehaviorSession = asyncHandler(async (req, res) => {
    const session = await createBehaviorSession({
        userId: req.user._id,
        schoolId: req.school._id,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        metadata: req.body.metadata || {}
    });

    res.status(201).json({
        success: true,
        data: {
            sessionId: session.sessionId,
            startedAt: session.startedAt,
            isActive: session.isActive
        }
    });
});

// @desc    Keep a session alive
// @route   PATCH /api/behavior/sessions/:sessionId/heartbeat
// @access  Private
export const heartbeatSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const session = await heartbeatBehaviorSession({ sessionId, userId: req.user._id });

    if (!session) {
        return res.status(404).json({ success: false, message: 'Active session not found' });
    }

    res.json({
        success: true,
        data: {
            sessionId: session.sessionId,
            lastSeenAt: session.lastSeenAt,
            isActive: session.isActive
        }
    });
});

// @desc    End a tracked behavior session
// @route   POST /api/behavior/sessions/:sessionId/end
// @access  Private
export const endSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const session = await endBehaviorSession({
        sessionId,
        userId: req.user._id,
        schoolId: req.school._id,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown'
    });

    if (!session) {
        return res.status(404).json({ success: false, message: 'Active session not found' });
    }

    res.json({
        success: true,
        data: {
            sessionId: session.sessionId,
            endedAt: session.endedAt,
            durationSeconds: session.durationSeconds,
            isActive: session.isActive
        }
    });
});

// @desc    List active sessions
// @route   GET /api/behavior/sessions/active
// @access  Private/Admin+Department Principal
export const getActiveBehaviorSessions = asyncHandler(async (req, res) => {
    const schoolFilter = req.user.role === 'super_admin'
        ? (req.query.school ? { school: req.query.school } : {})
        : { school: req.school._id };

    const sessions = await BehaviorSession.find({
        ...schoolFilter,
        isActive: true
    })
        .populate('user', 'firstName lastName email role')
        .sort({ lastSeenAt: -1 })
        .limit(200)
        .lean();

    res.json({
        success: true,
        data: sessions
    });
});

// @desc    Get behavior dashboard metrics + actionable insights
// @route   GET /api/behavior/dashboard
// @access  Private/Admin+Department Principal
export const getBehaviorDashboard = asyncHandler(async (req, res) => {
    const { period = 'month', school, eventType } = req.query;
    const resolvedSchool = req.user.role === 'super_admin' ? school : req.school?._id;
    const data = await getBehaviorDashboardMetrics({ period, school: resolvedSchool, eventType });

    res.json({
        success: true,
        data
    });
});

// @desc    Lightweight live snapshot for near real-time dashboard updates
// @route   GET /api/behavior/live
// @access  Private/Admin+Department Principal
export const getBehaviorLiveSnapshot = asyncHandler(async (req, res) => {
    const school = req.user.role === 'super_admin' ? req.query.school : req.school?._id;
    const lastMinutes = Math.min(Math.max(Number(req.query.minutes) || 15, 1), 120);
    const startDate = new Date(Date.now() - lastMinutes * 60 * 1000);
    const filters = buildBehaviorFilters({ school, startDate });

    const [eventsLastWindow, activeSessions, errorsLastWindow] = await Promise.all([
        Behavior.countDocuments(filters),
        BehaviorSession.countDocuments({ ...(school ? { school } : {}), isActive: true }),
        Behavior.countDocuments({
            ...filters,
            statusCode: { $gte: 400 }
        })
    ]);

    res.json({
        success: true,
        data: {
            windowMinutes: lastMinutes,
            eventsLastWindow,
            activeSessions,
            errorsLastWindow,
            errorRate: eventsLastWindow ? (errorsLastWindow / eventsLastWindow) * 100 : 0,
            generatedAt: new Date().toISOString()
        }
    });
});

// @desc    Get behavior analytics dashboard
// @route   GET /api/behavior/analytics
// @access  Private/Super Admin
export const getBehaviorAnalytics = asyncHandler(async (req, res) => {
    const { period = 'month', school, eventType } = req.query;
    
    let startDate = new Date();
    switch (period) {
        case 'week': startDate.setDate(startDate.getDate() - 7); break;
        case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
        case 'quarter': startDate.setMonth(startDate.getMonth() - 3); break;
        case 'year': startDate.setFullYear(startDate.getFullYear() - 1); break;
        default: startDate.setMonth(startDate.getMonth() - 1);
    }
    
    const resolvedSchool = req.user.role === 'super_admin' ? school : req.school?._id;
    const schoolObjectId = toValidObjectId(resolvedSchool);

    const filters = { startDate };
    if (schoolObjectId) filters.school = schoolObjectId;
    if (eventType) filters.eventType = eventType;
    
    // Get event statistics
    const eventStats = await Behavior.getEventStats(filters);
    
    // Get top users by activity
    const topUsers = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate },
                ...(schoolObjectId && { school: schoolObjectId }),
                ...(eventType && { eventType })
            }
        },
        {
            $group: {
                _id: '$user',
                eventCount: { $sum: 1 },
                uniqueActions: { $addToSet: '$action' },
                lastActivity: { $max: '$timestamp' }
            }
        },
        { $sort: { eventCount: -1 } },
        { $limit: 10 },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'userInfo'
            }
        },
        {
            $lookup: {
                from: 'schools',
                localField: 'userInfo.school',
                foreignField: '_id',
                as: 'schoolInfo'
            }
        },
        {
            $project: {
                user: '$_id',
                eventCount: 1,
                uniqueActions: { $size: '$uniqueActions' },
                lastActivity: 1,
                userInfo: { $arrayElemAt: ['$userInfo', 0] },
                schoolInfo: { $arrayElemAt: ['$schoolInfo', 0] }
            }
        }
    ]);
    
    // Get security events
    const securityEvents = await Behavior.getSecurityEvents(filters);
    
    // Get daily activity trends
    const dailyTrends = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate },
                ...(schoolObjectId && { school: schoolObjectId })
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
                    }
                },
                totalEvents: { $sum: 1 },
                uniqueUsers: { $addToSet: '$user' },
                securityEvents: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    '$eventType',
                                    ['login_failed', 'suspicious_login', 'permission_denied']
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        { $sort: { _id: 1 } }
    ]);
    
    // Get event type distribution
    const eventTypeDistribution = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate },
                ...(schoolObjectId && { school: schoolObjectId })
            }
        },
        {
            $group: {
                _id: '$eventType',
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$user' }
            }
        },
        {
            $project: {
                eventType: '$_id',
                count: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        },
        { $sort: { count: -1 } }
    ]);
    
    res.json({
        success: true,
        data: {
            eventStats,
            topUsers,
            securityEvents,
            dailyTrends,
            eventTypeDistribution,
            period,
            filters
        }
    });
});

// @desc    Get user behavior details
// @route   GET /api/behavior/users/:userId
// @access  Private/Super Admin or School Admin
export const getUserBehavior = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { days = 30 } = req.query;
    
    // Verify user exists and user has permission
    const user = await User.findById(userId).populate('school');
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.school._id.toString() !== user.school._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    
    // Get user activity summary
    const activitySummary = await Behavior.getUserActivitySummary(userId, parseInt(days));
    
    // Get recent events
    const recentEvents = await Behavior.find({ user: userId })
        .populate('school', 'name')
        .sort({ timestamp: -1 })
        .limit(50);
    
    // Get event type breakdown
    const eventTypeBreakdown = await Behavior.aggregate([
        { $match: { user: mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$eventType',
                count: { $sum: 1 },
                lastOccurrence: { $max: '$timestamp' }
            }
        },
        { $sort: { count: -1 } }
    ]);
    
    // Get session statistics
    const sessionStats = await Behavior.aggregate([
        {
            $match: {
                user: mongoose.Types.ObjectId(userId),
                eventType: { $in: ['login', 'logout', 'session_started', 'session_ended'] }
            }
        },
        {
            $group: {
                _id: null,
                totalLogins: {
                    $sum: {
                        $cond: [
                            { $in: ['$eventType', ['login', 'session_started']] },
                            1,
                            0
                        ]
                    }
                },
                uniqueIPs: { $addToSet: '$ipAddress' },
                uniqueDevices: { $addToSet: '$device.platform' },
                avgSessionDuration: {
                    $avg: {
                        $cond: [
                            { $in: ['$eventType', ['logout', 'session_ended']] },
                            '$sessionDuration',
                            null
                        ]
                    }
                }
            }
        }
    ]);
    
    res.json({
        success: true,
        data: {
            user: {
                id: user._id,
                name: `${user.firstName} ${user.lastName}`,
                email: user.email,
                role: user.role,
                school: user.school.name
            },
            activitySummary,
            recentEvents,
            eventTypeBreakdown,
            sessionStats: sessionStats[0] || {
                totalLogins: 0,
                uniqueIPs: [],
                uniqueDevices: [],
                avgSessionDuration: 0
            },
            period: days
        }
    });
});

// @desc    Get security events
// @route   GET /api/behavior/security
// @access  Private/Super Admin
export const getSecurityEvents = asyncHandler(async (req, res) => {
    const { period = 'week', riskLevel, school } = req.query;
    const schoolObjectId = toValidObjectId(school);
    
    let startDate = new Date();
    switch (period) {
        case 'day': startDate.setDate(startDate.getDate() - 1); break;
        case 'week': startDate.setDate(startDate.getDate() - 7); break;
        case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
        default: startDate.setDate(startDate.getDate() - 7);
    }
    
    const filters = { startDate };
    if (schoolObjectId) filters.school = schoolObjectId;
    
    const securityEvents = await Behavior.getSecurityEvents(filters);
    
    // Calculate risk scores
    const eventsWithRisk = securityEvents.map(event => ({
        ...event.toObject(),
        riskScore: event.getRiskScore()
    }));
    
    // Filter by risk level if specified
    let filteredEvents = eventsWithRisk;
    if (riskLevel) {
        const riskThreshold = parseInt(riskLevel);
        filteredEvents = eventsWithRisk.filter(event => event.riskScore >= riskThreshold);
    }
    
    // Get security statistics
    const securityStatsRows = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate },
                eventType: { $in: ['login_failed', 'suspicious_login', 'permission_denied', 'data_access_attempt'] },
                ...(schoolObjectId && { school: schoolObjectId })
            }
        },
        {
            $facet: {
                events: [
                    {
                        $group: {
                            _id: '$eventType',
                            count: { $sum: 1 },
                            uniqueIPs: { $addToSet: '$ipAddress' },
                            uniqueUsers: { $addToSet: '$user' }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            eventType: '$_id',
                            count: 1,
                            uniqueIPs: { $size: '$uniqueIPs' },
                            uniqueUsers: { $size: '$uniqueUsers' }
                        }
                    }
                ],
                totals: [
                    {
                        $group: {
                            _id: null,
                            totalSecurityEvents: { $sum: 1 },
                            totalUniqueIPs: { $addToSet: '$ipAddress' },
                            totalUniqueUsers: { $addToSet: '$user' }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            totalSecurityEvents: 1,
                            totalUniqueIPs: { $size: '$totalUniqueIPs' },
                            totalUniqueUsers: { $size: '$totalUniqueUsers' }
                        }
                    }
                ]
            }
        }
    ]);
    const securityStats = securityStatsRows[0];
    
    // Get high risk activities
    const highRiskActivities = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate },
                $or: [
                    { eventType: 'login_failed' },
                    { eventType: 'suspicious_login' },
                    { eventType: 'permission_denied' }
                ],
                ...(schoolObjectId && { school: schoolObjectId })
            }
        },
        {
            $group: {
                _id: '$ipAddress',
                eventCount: { $sum: 1 },
                eventTypes: { $addToSet: '$eventType' },
                users: { $addToSet: '$user' },
                lastActivity: { $max: '$timestamp' }
            }
        },
        {
            $match: { eventCount: { $gte: 5 } }
        },
        { $sort: { eventCount: -1 } },
        { $limit: 20 }
    ]);
    
    res.json({
        success: true,
        data: {
            securityEvents: filteredEvents,
            securityStats: {
                events: securityStats?.events || [],
                totalSecurityEvents: securityStats?.totals?.[0]?.totalSecurityEvents || 0,
                totalUniqueIPs: securityStats?.totals?.[0]?.totalUniqueIPs || 0,
                totalUniqueUsers: securityStats?.totals?.[0]?.totalUniqueUsers || 0
            },
            highRiskActivities,
            period,
            filters
        }
    });
});

// @desc    Get system usage statistics
// @route   GET /api/behavior/usage
// @access  Private/Super Admin
export const getUsageStatistics = asyncHandler(async (req, res) => {
    const { period = 'month' } = req.query;
    
    let startDate = new Date();
    switch (period) {
        case 'week': startDate.setDate(startDate.getDate() - 7); break;
        case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
        case 'quarter': startDate.setMonth(startDate.getMonth() - 3); break;
        case 'year': startDate.setFullYear(startDate.getFullYear() - 1); break;
        default: startDate.setMonth(startDate.getMonth() - 1);
    }
    
    // Get active users
    const activeUsers = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: '$user',
                lastActivity: { $max: '$timestamp' },
                eventCount: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'userInfo'
            }
        },
        {
            $lookup: {
                from: 'schools',
                localField: 'userInfo.school',
                foreignField: '_id',
                as: 'schoolInfo'
            }
        },
        { $sort: { lastActivity: -1 } }
    ]);
    
    // Get feature usage
    const featureUsage = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate },
                eventType: { $in: ['feature_used', 'page_view'] }
            }
        },
        {
            $group: {
                _id: '$action',
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$user' }
            }
        },
        {
            $project: {
                feature: '$_id',
                usage: '$count',
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        },
        { $sort: { usage: -1 } },
        { $limit: 20 }
    ]);
    
    // Get device statistics
    const deviceStats = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate },
                'device.platform': { $exists: true }
            }
        },
        {
            $group: {
                _id: '$device.platform',
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$user' }
            }
        },
        {
            $project: {
                platform: '$_id',
                usage: '$count',
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        },
        { $sort: { usage: -1 } }
    ]);
    
    // Get geographic distribution
    const geoDistribution = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate },
                'location.country': { $exists: true }
            }
        },
        {
            $group: {
                _id: '$location.country',
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$user' },
                cities: { $addToSet: '$location.city' }
            }
        },
        {
            $project: {
                country: '$_id',
                usage: '$count',
                uniqueUsers: { $size: '$uniqueUsers' },
                cities: { $size: '$cities' }
            }
        },
        { $sort: { usage: -1 } },
        { $limit: 10 }
    ]);
    
    // Get hourly activity pattern
    const hourlyActivity = await Behavior.aggregate([
        {
            $match: {
                timestamp: { $gte: startDate }
            }
        },
        {
            $project: {
                hour: { $hour: '$timestamp' },
                eventType: 1
            }
        },
        {
            $group: {
                _id: '$hour',
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);
    
    res.json({
        success: true,
        data: {
            activeUsers: activeUsers.length,
            activeUsersDetails: activeUsers,
            featureUsage,
            deviceStats,
            geoDistribution,
            hourlyActivity,
            period
        }
    });
});

// @desc    Export behavior data
// @route   GET /api/behavior/export
// @access  Private/Super Admin
export const exportBehaviorData = asyncHandler(async (req, res) => {
    const { format = 'json', period = 'month', school, eventType } = req.query;
    
    let startDate = new Date();
    switch (period) {
        case 'week': startDate.setDate(startDate.getDate() - 7); break;
        case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
        case 'quarter': startDate.setMonth(startDate.getMonth() - 3); break;
        case 'year': startDate.setFullYear(startDate.getFullYear() - 1); break;
        default: startDate.setMonth(startDate.getMonth() - 1);
    }
    
    const matchStage = { timestamp: { $gte: startDate } };
    if (school) matchStage.school = mongoose.Types.ObjectId(school);
    if (eventType) matchStage.eventType = eventType;
    
    const behaviorData = await Behavior.find(matchStage)
        .populate('user', 'firstName lastName email')
        .populate('school', 'name')
        .sort({ timestamp: -1 })
        .limit(10000); // Limit for performance
    
    if (format === 'csv') {
        // Convert to CSV format
        const csvHeader = 'Timestamp,User Email,School,Event Type,Action,IP Address,User Agent,Resource Type,Resource ID,Metadata\n';
        const csvData = behaviorData.map(event => {
            const metadata = JSON.stringify(event.metadata || {}).replace(/"/g, '""');
            return [
                event.timestamp.toISOString(),
                event.user?.email || '',
                event.school?.name || '',
                event.eventType,
                event.action,
                event.ipAddress,
                (event.userAgent || '').replace(/"/g, '""'),
                event.resourceType || '',
                event.resourceId || '',
                metadata
            ].join(',').replace(/\n/g, '\\n');
        }).join('\n');
        
        const csv = csvHeader + csvData;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=behavior_data_${startDate.toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } else {
        // Return JSON
        res.json({
            success: true,
            data: behaviorData,
            count: behaviorData.length,
            period,
            filters: { startDate, school, eventType }
        });
    }
});

// @desc    Clean up old behavior data
// @route   DELETE /api/behavior/cleanup
// @access  Private/Super Admin
export const cleanupBehaviorData = asyncHandler(async (req, res) => {
    const { days = 730, school } = req.query; // Default to 2 years
    const retentionDays = Math.min(Math.max(parseInt(days, 10) || 730, 30), 3650);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const resolvedSchool = req.user.role === 'super_admin' ? school : req.school?._id;
    const schoolObjectId = toValidObjectId(resolvedSchool);
    
    const deleteFilter = {
        timestamp: { $lt: cutoffDate }
    };
    if (schoolObjectId) {
        deleteFilter.school = schoolObjectId;
    }

    const result = await Behavior.deleteMany(deleteFilter);
    
    res.json({
        success: true,
        message: `Deleted ${result.deletedCount} behavior records older than ${retentionDays} days`,
        deletedCount: result.deletedCount,
        cutoffDate,
        scope: schoolObjectId ? 'school' : 'global'
    });
});
