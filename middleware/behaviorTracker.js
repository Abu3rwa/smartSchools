import asyncHandler from 'express-async-handler';
import Behavior from '../models/Behavior.js';

// Optional dependencies - will be used if available
let geoip, useragent;

try {
    geoip = require('geoip-lite');
} catch (error) {
    console.warn('geoip-lite not available, location tracking disabled');
}

try {
    useragent = require('useragent');
} catch (error) {
    console.warn('useragent not available, device tracking disabled');
}

// Helper function to extract device information
const extractDeviceInfo = (userAgentString) => {
    try {
        if (!useragent) {
            return {
                type: 'unknown',
                browser: 'Unknown',
                os: 'Unknown',
                platform: 'Unknown',
                isMobile: false,
                isTablet: false
            };
        }
        const ua = useragent.parse(userAgentString);
        return {
            type: ua.type,
            browser: ua.browser || 'Unknown',
            os: ua.os || 'Unknown',
            platform: ua.platform || 'Unknown',
            isMobile: ua.type === 'mobile',
            isTablet: ua.type === 'tablet'
        };
    } catch (error) {
        return {
            type: 'unknown',
            browser: 'Unknown',
            os: 'Unknown',
            platform: 'Unknown',
            isMobile: false,
            isTablet: false
        };
    }
};

// Helper function to extract location information
const extractLocationInfo = (ipAddress) => {
    try {
        if (!geoip) {
            return {
                country: 'Unknown',
                region: 'Unknown',
                city: 'Unknown',
                timezone: 'Unknown',
                ll: null
            };
        }
        const geo = geoip.lookup(ipAddress);
        if (geo) {
            return {
                country: geo.country || 'Unknown',
                region: geo.region || 'Unknown',
                city: geo.city || 'Unknown',
                timezone: geo.timezone || 'Unknown',
                ll: geo.ll || null
            };
        }
        return {
            country: 'Unknown',
            region: 'Unknown',
            city: 'Unknown',
            timezone: 'Unknown',
            ll: null
        };
    } catch (error) {
        return {
            country: 'Unknown',
            region: 'Unknown',
            city: 'Unknown',
            timezone: 'Unknown',
            ll: null
        };
    }
};

// Helper function to get client IP address
const getClientIP = (req) => {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.headers['x-client-ip'] ||
           req.headers['x-cluster-client-ip'] ||
           '127.0.0.1';
};

// Main behavior tracking middleware
const behaviorTracker = asyncHandler(async (req, res, next) => {
    // Skip tracking for certain routes
    const skipRoutes = [
        '/api/health',
        '/api/behavior',
        '/favicon.ico',
        '/static/',
        '/assets/'
    ];
    
    const shouldSkip = skipRoutes.some(route => req.path.startsWith(route));
    if (shouldSkip || req.method === 'OPTIONS') {
        return next();
    }
    
    // Only track authenticated users
    if (!req.user) {
        return next();
    }
    
    try {
        const startTime = Date.now();
        
        // Extract request information
        const ipAddress = getClientIP(req);
        const userAgentString = req.headers['user-agent'] || '';
        const device = extractDeviceInfo(userAgentString);
        const location = extractLocationInfo(ipAddress);
        
        // Store original res.end to capture response time
        const originalEnd = res.end;
        let statusCode = 200;
        
        res.end = function(...args) {
            statusCode = res.statusCode;
            originalEnd.apply(this, args);
            
            // Log the behavior event after response is sent
            setImmediate(() => {
                logBehaviorEvent(req, {
                    ipAddress,
                    userAgent: userAgentString,
                    device,
                    location,
                    statusCode,
                    responseTime: Date.now() - startTime
                });
            });
        };
        
        next();
    } catch (error) {
        console.error('Behavior tracking error:', error);
        next();
    }
});

// Function to log behavior events
const logBehaviorEvent = async (req, additionalData = {}) => {
    try {
        const { user, school, method, originalUrl, path } = req;
        const { ipAddress, userAgent, device, location, statusCode, responseTime } = additionalData;
        
        // Determine event type and action based on request
        let eventType = 'api_request';
        let action = `${method} ${path}`;
        let resourceType = null;
        let resourceId = null;
        
        // Extract more specific event information
        if (path.includes('/auth/login')) {
            eventType = 'login';
            action = 'user_login';
        } else if (path.includes('/auth/logout')) {
            eventType = 'logout';
            action = 'user_logout';
        } else if (path.includes('/grades')) {
            resourceType = 'grade';
            if (method === 'POST') {
                eventType = 'grade_created';
                action = 'create_grade';
            } else if (method === 'PUT') {
                eventType = 'grade_updated';
                action = 'update_grade';
            } else if (method === 'DELETE') {
                eventType = 'grade_deleted';
                action = 'delete_grade';
            }
        } else if (path.includes('/students')) {
            resourceType = 'student';
            if (method === 'POST') {
                eventType = 'student_enrolled';
                action = 'enroll_student';
            } else if (method === 'DELETE') {
                eventType = 'student_withdrawn';
                action = 'withdraw_student';
            }
        } else if (path.includes('/classes')) {
            resourceType = 'class';
            if (method === 'POST') {
                eventType = 'class_created';
                action = 'create_class';
            } else if (method === 'PUT') {
                eventType = 'class_updated';
                action = 'update_class';
            } else if (method === 'DELETE') {
                eventType = 'class_deleted';
                action = 'delete_class';
            }
        } else if (path.includes('/users')) {
            resourceType = 'user';
            if (method === 'POST') {
                eventType = 'user_created';
                action = 'create_user';
            } else if (method === 'PUT') {
                eventType = 'user_updated';
                action = 'update_user';
            } else if (method === 'DELETE') {
                eventType = 'user_deleted';
                action = 'delete_user';
            }
        } else if (path.includes('/reports')) {
            resourceType = 'report';
            eventType = 'report_generated';
            action = 'generate_report';
        } else if (path.includes('/export')) {
            eventType = 'data_exported';
            action = 'export_data';
        }
        
        // Check for security events
        if (statusCode === 401 || statusCode === 403) {
            eventType = statusCode === 401 ? 'login_failed' : 'permission_denied';
            action = statusCode === 401 ? 'unauthorized_access' : 'access_denied';
        }
        
        // Extract resource ID from URL parameters
        const urlParts = path.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart.match(/^[0-9a-fA-F]{24}$/)) {
            resourceId = lastPart;
        }
        
        // Prepare metadata
        const metadata = {
            method,
            path: originalUrl,
            statusCode,
            responseTime,
            query: req.query,
            body: method !== 'GET' ? req.body : undefined,
            headers: {
                'content-type': req.headers['content-type'],
                'accept': req.headers['accept'],
                'origin': req.headers['origin'],
                'referer': req.headers['referer']
            }
        };
        
        // Create behavior event
        const behaviorData = {
            user: user._id,
            school: school._id,
            eventType,
            action,
            description: `${method} ${originalUrl}`,
            resourceType,
            resourceId,
            ipAddress,
            userAgent,
            sessionId: req.sessionID || req.headers['x-session-id'] || 'unknown',
            location,
            device,
            responseTime,
            statusCode,
            metadata
        };
        
        // Log the event asynchronously (don't wait)
        Behavior.logEvent(behaviorData);
        
    } catch (error) {
        console.error('Error logging behavior event:', error);
    }
};

// Helper function to manually log custom events
const logCustomEvent = async (req, eventData) => {
    try {
        const { user, school } = req;
        if (!user || !school) return;
        
        const ipAddress = getClientIP(req);
        const userAgentString = req.headers['user-agent'] || '';
        const device = extractDeviceInfo(userAgentString);
        const location = extractLocationInfo(ipAddress);
        
        const behaviorData = {
            user: user._id,
            school: school._id,
            eventType: eventData.eventType || 'custom_event',
            action: eventData.action || 'custom_action',
            description: eventData.description || '',
            resourceType: eventData.resourceType || null,
            resourceId: eventData.resourceId || null,
            ipAddress,
            userAgent: userAgentString,
            sessionId: req.sessionID || req.headers['x-session-id'] || 'unknown',
            location,
            device,
            metadata: eventData.metadata || {}
        };
        
        await Behavior.logEvent(behaviorData);
    } catch (error) {
        console.error('Error logging custom event:', error);
    }
};

// Middleware for tracking page views (for frontend)
const trackPageView = asyncHandler(async (req, res, next) => {
    try {
        const { user, school } = req;
        if (!user || !school) return next();
        
        const { page, referrer, duration } = req.body;
        
        await logCustomEvent(req, {
            eventType: 'page_view',
            action: 'view_page',
            description: `Viewed page: ${page}`,
            metadata: {
                page,
                referrer,
                duration,
                timestamp: new Date().toISOString()
            }
        });
        
        res.json({ success: true, message: 'Page view tracked' });
    } catch (error) {
        console.error('Error tracking page view:', error);
        res.status(500).json({ success: false, message: 'Failed to track page view' });
    }
});

// Middleware for tracking feature usage
const trackFeatureUsage = asyncHandler(async (req, res, next) => {
    try {
        const { user, school } = req;
        if (!user || !school) return next();
        
        const { feature, action, metadata } = req.body;
        
        await logCustomEvent(req, {
            eventType: 'feature_used',
            action: action || 'use_feature',
            description: `Used feature: ${feature}`,
            resourceType: 'system',
            metadata: {
                feature,
                ...metadata
            }
        });
        
        res.json({ success: true, message: 'Feature usage tracked' });
    } catch (error) {
        console.error('Error tracking feature usage:', error);
        res.status(500).json({ success: false, message: 'Failed to track feature usage' });
    }
});

export {
    behaviorTracker,
    logCustomEvent,
    trackPageView,
    trackFeatureUsage
};
