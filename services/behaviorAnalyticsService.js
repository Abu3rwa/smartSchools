import crypto from 'crypto';
import mongoose from 'mongoose';
import Behavior from '../models/Behavior.js';
import BehaviorSession from '../models/BehaviorSession.js';

const toObjectId = (value) => {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
    return new mongoose.Types.ObjectId(value);
};

export const resolveStartDateFromPeriod = (period = 'month') => {
    const startDate = new Date();
    switch (period) {
        case 'day':
            startDate.setDate(startDate.getDate() - 1);
            break;
        case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
        case 'quarter':
            startDate.setMonth(startDate.getMonth() - 3);
            break;
        case 'year':
            startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        case 'month':
        default:
            startDate.setMonth(startDate.getMonth() - 1);
            break;
    }
    return startDate;
};

export const sanitizeMetadata = (payload = {}) => {
    if (!payload || typeof payload !== 'object') return {};
    const blockedKeys = new Set(['password', 'token', 'authorization', 'cookie']);
    const sanitizedEntries = Object.entries(payload)
        .filter(([key]) => !blockedKeys.has(String(key).toLowerCase()))
        .slice(0, 40);
    return Object.fromEntries(sanitizedEntries);
};

export const buildBehaviorFilters = ({ school, user, eventType, startDate, endDate, statusCode }) => {
    const filters = {};
    const schoolId = toObjectId(school);
    const userId = toObjectId(user);

    if (schoolId) filters.school = schoolId;
    if (userId) filters.user = userId;
    if (eventType) filters.eventType = eventType;
    if (statusCode) filters.statusCode = Number(statusCode);

    if (startDate || endDate) {
        filters.timestamp = {};
        if (startDate) filters.timestamp.$gte = new Date(startDate);
        if (endDate) filters.timestamp.$lte = new Date(endDate);
    }

    return filters;
};

export const createBehaviorSession = async ({ userId, schoolId, ipAddress, userAgent, metadata = {} }) => {
    const sessionId = crypto.randomUUID();
    const session = await BehaviorSession.create({
        user: userId,
        school: schoolId,
        sessionId,
        ipAddress,
        userAgent,
        metadata: sanitizeMetadata(metadata)
    });

    await Behavior.logEvent({
        user: userId,
        school: schoolId,
        eventType: 'session_started',
        action: 'session_start',
        description: 'Behavior session started',
        resourceType: 'system',
        ipAddress,
        userAgent,
        sessionId,
        metadata: sanitizeMetadata(metadata)
    });

    return session;
};

export const heartbeatBehaviorSession = async ({ sessionId, userId }) => {
    const session = await BehaviorSession.findOne({ sessionId, user: userId, isActive: true });
    if (!session) return null;

    session.lastSeenAt = new Date();
    await session.save();

    await Behavior.logEvent({
        user: session.user,
        school: session.school,
        eventType: 'session_heartbeat',
        action: 'session_keepalive',
        description: 'Behavior session heartbeat received',
        resourceType: 'system',
        ipAddress: session.ipAddress || '127.0.0.1',
        userAgent: session.userAgent || 'unknown',
        sessionId: session.sessionId
    });

    return session;
};

export const endBehaviorSession = async ({ sessionId, userId, schoolId, ipAddress, userAgent }) => {
    const session = await BehaviorSession.findOne({ sessionId, user: userId, isActive: true });
    if (!session) return null;

    await session.end();

    await Behavior.logEvent({
        user: userId,
        school: schoolId,
        eventType: 'session_ended',
        action: 'session_end',
        description: 'Behavior session ended',
        resourceType: 'system',
        ipAddress,
        userAgent,
        sessionId,
        sessionDuration: session.durationSeconds,
        metadata: {
            durationSeconds: session.durationSeconds
        }
    });

    return session;
};

export const listBehaviorEvents = async ({ filters = {}, page = 1, limit = 50 }) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [events, total] = await Promise.all([
        Behavior.find(filters)
            .populate('user', 'firstName lastName email role')
            .populate('school', 'name')
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(safeLimit)
            .lean(),
        Behavior.countDocuments(filters)
    ]);

    return {
        events,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit)
        }
    };
};

const generateActionableInsights = ({ totalEvents, errorRate, avgResponseTime, activeUsers, topEventTypes, staleSessions }) => {
    const insights = [];

    if (errorRate >= 10) {
        insights.push({
            level: 'high',
            title: 'High API error rate',
            action: 'Investigate failed endpoints and add retries/guardrails for unstable integrations.',
            value: `${errorRate.toFixed(1)}%`
        });
    }

    if (avgResponseTime >= 1200) {
        insights.push({
            level: 'medium',
            title: 'Response time degradation',
            action: 'Profile slow queries on high-volume endpoints and add query indexes for hot paths.',
            value: `${Math.round(avgResponseTime)} ms`
        });
    }

    if (staleSessions > 0) {
        insights.push({
            level: 'medium',
            title: 'Stale active sessions detected',
            action: 'Expire sessions inactive for more than 30 minutes to improve security and analytics accuracy.',
            value: `${staleSessions} sessions`
        });
    }

    if (totalEvents > 0 && activeUsers <= 2) {
        insights.push({
            level: 'low',
            title: 'Low user spread',
            action: 'Review role adoption and onboarding for underutilized user groups.',
            value: `${activeUsers} active users`
        });
    }

    if (!insights.length) {
        const dominantEvent = topEventTypes[0];
        insights.push({
            level: 'info',
            title: 'System operating normally',
            action: 'Continue monitoring usage trends and maintain current event coverage.',
            value: dominantEvent ? `${dominantEvent.eventType}: ${dominantEvent.count}` : 'No issues detected'
        });
    }

    return insights;
};

export const getBehaviorDashboardMetrics = async ({ period = 'month', school, eventType }) => {
    const startDate = resolveStartDateFromPeriod(period);
    const filters = buildBehaviorFilters({ school, eventType, startDate });

    const [summaryRows, topEventTypes, timeline, activeSessions, staleSessions] = await Promise.all([
        Behavior.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: null,
                    totalEvents: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$user' },
                    avgResponseTime: { $avg: '$responseTime' },
                    errorCount: {
                        $sum: {
                            $cond: [{ $gte: ['$statusCode', 400] }, 1, 0]
                        }
                    }
                }
            }
        ]),
        Behavior.aggregate([
            { $match: filters },
            { $group: { _id: '$eventType', count: { $sum: 1 } } },
            { $project: { _id: 0, eventType: '$_id', count: 1 } },
            { $sort: { count: -1 } },
            { $limit: 12 }
        ]),
        Behavior.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: period === 'day' ? '%Y-%m-%d %H:00' : '%Y-%m-%d',
                            date: '$timestamp'
                        }
                    },
                    totalEvents: { $sum: 1 },
                    errors: {
                        $sum: {
                            $cond: [{ $gte: ['$statusCode', 400] }, 1, 0]
                        }
                    }
                }
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, interval: '$_id', totalEvents: 1, errors: 1 } }
        ]),
        BehaviorSession.countDocuments({
            ...(school ? { school: toObjectId(school) } : {}),
            isActive: true
        }),
        BehaviorSession.countDocuments({
            ...(school ? { school: toObjectId(school) } : {}),
            isActive: true,
            lastSeenAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) }
        })
    ]);

    const summary = summaryRows[0] || {
        totalEvents: 0,
        uniqueUsers: [],
        avgResponseTime: 0,
        errorCount: 0
    };

    const totalEvents = summary.totalEvents || 0;
    const errorCount = summary.errorCount || 0;
    const errorRate = totalEvents ? (errorCount / totalEvents) * 100 : 0;
    const avgResponseTime = summary.avgResponseTime || 0;
    const activeUsers = (summary.uniqueUsers || []).length;

    const insights = generateActionableInsights({
        totalEvents,
        errorRate,
        avgResponseTime,
        activeUsers,
        topEventTypes,
        staleSessions
    });

    return {
        period,
        startDate,
        filters: { school: school || null, eventType: eventType || null },
        summary: {
            totalEvents,
            activeUsers,
            activeSessions,
            avgResponseTime,
            errorRate,
            errorCount
        },
        topEventTypes,
        timeline,
        insights
    };
};
