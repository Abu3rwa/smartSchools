import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const ATLAS_FREE_TIER_LIMIT_MB = 512;

/**
 * Helper to safely compute storage metrics
 */
const getDbOverview = async (db) => {
    const stats = await db.stats();
    const dataSizeMB = Number(((stats.dataSize || 0) / (1024 * 1024)).toFixed(2));
    const storageSizeMB = Number(((stats.storageSize || 0) / (1024 * 1024)).toFixed(2));
    const indexSizeMB = Number(((stats.indexSize || 0) / (1024 * 1024)).toFixed(2));
    const totalDiskMB = Number((storageSizeMB + indexSizeMB).toFixed(2));
    
    // Atlas Free Tier (M0) enforces 512MB limit based on uncompressed data size or storage
    const remainingMB = Math.max(0, Number((ATLAS_FREE_TIER_LIMIT_MB - dataSizeMB).toFixed(2)));
    const percentUsed = Math.min(100, Number(((dataSizeMB / ATLAS_FREE_TIER_LIMIT_MB) * 100).toFixed(1)));
    const remainingPercent = Number((100 - percentUsed).toFixed(1));

    let status = 'healthy';
    let statusMessage = 'Storage is within safe limits.';

    if (remainingPercent < 15 || percentUsed >= 85) {
        status = 'critical';
        statusMessage = `Critical storage warning: Only ${remainingPercent}% space remaining (${remainingMB} MB). Write operations may be blocked soon.`;
    } else if (remainingPercent < 35 || percentUsed >= 65) {
        status = 'warning';
        statusMessage = `Approaching storage limit: Less than 35% space remaining (${remainingMB} MB). We recommend deleting unneeded logs or sample data.`;
    }

    return {
        dataSizeMB,
        storageSizeMB,
        indexSizeMB,
        totalDiskMB,
        clusterLimitMB: ATLAS_FREE_TIER_LIMIT_MB,
        remainingMB,
        percentUsed,
        remainingPercent,
        status,
        statusMessage,
        collectionsCount: stats.collections || 0,
        documentsCount: stats.objects || 0
    };
};

/**
 * Fetch top collections by data size
 */
const getTopCollections = async (db) => {
    try {
        const collections = await db.listCollections().toArray();
        const results = [];

        for (const coll of collections) {
            if (coll.name.startsWith('system.')) continue;
            try {
                const s = await db.collection(coll.name).aggregate([
                    { $collStats: { storageStats: {} } }
                ]).toArray();

                if (s.length > 0 && s[0].storageStats) {
                    const st = s[0].storageStats;
                    const dataMB = Number(((st.size || 0) / (1024 * 1024)).toFixed(2));
                    const storageMB = Number(((st.storageSize || 0) / (1024 * 1024)).toFixed(2));
                    const totalMB = Number((((st.storageSize || 0) + (st.totalIndexSize || 0)) / (1024 * 1024)).toFixed(2));

                    results.push({
                        name: coll.name,
                        count: st.count || 0,
                        dataMB,
                        storageMB,
                        totalMB
                    });
                }
            } catch {
                // If collStats fails, fetch count
                try {
                    const count = await db.collection(coll.name).countDocuments();
                    results.push({
                        name: coll.name,
                        count,
                        dataMB: 0,
                        storageMB: 0,
                        totalMB: 0
                    });
                } catch {
                    // skip collection if count fails
                }
            }
        }

        results.sort((a, b) => b.dataMB - a.dataMB);
        return results.slice(0, 15);
    } catch (err) {
        logger.warn(`Could not list collection stats: ${err.message}`);
        return [];
    }
};

/**
 * @desc    Get detailed database and cluster storage usage statistics
 * @route   GET /api/system/storage/stats
 * @access  Private (Admin / Super Admin)
 */
export const getStorageStats = asyncHandler(async (req, res) => {
    const db = mongoose.connection.db;
    if (!db) {
        return res.status(503).json({ success: false, message: 'Database not connected' });
    }

    const overview = await getDbOverview(db);
    const topCollections = await getTopCollections(db);

    // Deep drill into cleanable categories
    const behaviorsColl = db.collection('behaviors');
    const [
        totalBehaviors,
        apiRequestsCount,
        heartbeatsCount,
        pageViewsCount,
        notificationsCount,
        readNotificationsCount,
        spellingEmailsTotal,
        spellingEmailsSent,
        emailReportsTotal,
        commLogsTotal,
        aiTokensTotal,
        importRunsTotal
    ] = await Promise.all([
        behaviorsColl.countDocuments().catch(() => 0),
        behaviorsColl.countDocuments({ eventType: 'api_request' }).catch(() => 0),
        behaviorsColl.countDocuments({ eventType: 'session_heartbeat' }).catch(() => 0),
        behaviorsColl.countDocuments({ eventType: 'page_view' }).catch(() => 0),
        db.collection('notifications').countDocuments().catch(() => 0),
        db.collection('notifications').countDocuments({ status: { $in: ['read', 'delivered'] } }).catch(() => 0),
        db.collection('spellingemaildeliveries').countDocuments().catch(() => 0),
        db.collection('spellingemaildeliveries').countDocuments({ status: 'sent' }).catch(() => 0),
        db.collection('emailreports').countDocuments().catch(() => 0),
        db.collection('communicationemaillogs').countDocuments().catch(() => 0),
        db.collection('aitokenusages').countDocuments().catch(() => 0),
        db.collection('importruns').countDocuments().catch(() => 0)
    ]);

    const routineTelemetryCount = apiRequestsCount + heartbeatsCount;

    // Estimate telemetry size (behaviors average object size is ~900 bytes to 1KB with metadata)
    const behaviorsEntry = topCollections.find((c) => c.name === 'behaviors');
    const behaviorsDataMB = behaviorsEntry?.dataMB || 0;
    const telemetryEstimatedMB = totalBehaviors > 0
        ? Number(((routineTelemetryCount / totalBehaviors) * behaviorsDataMB).toFixed(2))
        : 0;

    const notificationsEntry = topCollections.find((c) => c.name === 'notifications');
    const notificationsDataMB = notificationsEntry?.dataMB || 0;

    const emailDeliveriesEntry = topCollections.find((c) => c.name === 'spellingemaildeliveries');
    const emailDeliveriesMB = emailDeliveriesEntry?.dataMB || 0;

    const categories = {
        routineTelemetry: {
            id: 'routine_telemetry',
            label: 'Routine API & Heartbeat Logs',
            count: routineTelemetryCount,
            estimatedMB: telemetryEstimatedMB,
            safeToClean: true,
            description: 'Routine HTTP requests and session heartbeats. Removing these has zero effect on school operations and recovers the majority of your database space.'
        },
        sentEmails: {
            id: 'sent_emails',
            label: 'Sent Email Delivery History',
            count: spellingEmailsSent + emailReportsTotal + commLogsTotal,
            estimatedMB: emailDeliveriesMB,
            safeToClean: true,
            description: 'Full HTML snapshots and delivery records of emails already sent to parents and students. Deleting them does not affect grades, spellings, or future emails.'
        },
        oldNotifications: {
            id: 'old_notifications',
            label: 'Old Notification History',
            count: notificationsCount,
            estimatedMB: notificationsDataMB,
            safeToClean: true,
            description: 'Past notification logs and HTML payloads. Can be safely pruned (e.g., records older than 30 days).'
        },
        importLogs: {
            id: 'old_imports',
            label: 'CSV Import Runs & Error Logs',
            count: importRunsTotal,
            estimatedMB: 0.5,
            safeToClean: true,
            description: 'Completed import logs and error trace dumps from past roster/schedule imports.'
        },
        aiTokenLogs: {
            id: 'ai_tokens',
            label: 'AI Token Usage Logs',
            count: aiTokensTotal,
            estimatedMB: 0.7,
            safeToClean: true,
            description: 'Historical AI generation token counters and prompt telemetry.'
        }
    };

    res.json({
        success: true,
        data: {
            overview,
            categories,
            topCollections,
            details: {
                behaviors: {
                    total: totalBehaviors,
                    apiRequests: apiRequestsCount,
                    heartbeats: heartbeatsCount,
                    pageViews: pageViewsCount,
                    other: totalBehaviors - routineTelemetryCount
                },
                notifications: {
                    total: notificationsCount,
                    readOrDelivered: readNotificationsCount,
                    unread: notificationsCount - readNotificationsCount
                },
                emails: {
                    spellingDeliveriesTotal: spellingEmailsTotal,
                    spellingDeliveriesSent: spellingEmailsSent,
                    emailReportsTotal,
                    communicationLogsTotal: commLogsTotal
                }
            }
        }
    });
});

/**
 * @desc    Clean up unneeded or stale data to reclaim database storage
 * @route   POST /api/system/storage/clean
 * @access  Private (Admin / Super Admin)
 */
export const cleanStorage = asyncHandler(async (req, res) => {
    const { targets = [], olderThanDays = 0, dryRun = false } = req.body || {};

    if (!Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Please specify at least one cleanup target (e.g., routine_telemetry, sent_emails, old_notifications, old_imports)'
        });
    }

    const db = mongoose.connection.db;
    if (!db) {
        return res.status(503).json({ success: false, message: 'Database not connected' });
    }

    const results = {};
    const cutoffDate = olderThanDays > 0
        ? new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000))
        : null;

    logger.info(`Starting storage cleanup: targets=[${targets.join(', ')}], olderThanDays=${olderThanDays}, dryRun=${dryRun}`);

    // 1. Routine Telemetry (api_request, session_heartbeat)
    if (targets.includes('routine_telemetry')) {
        const query = { eventType: { $in: ['api_request', 'session_heartbeat'] } };
        if (cutoffDate) {
            query.timestamp = { $lt: cutoffDate };
        }

        if (dryRun) {
            results.routineTelemetry = await db.collection('behaviors').countDocuments(query);
        } else {
            const delRes = await db.collection('behaviors').deleteMany(query);
            results.routineTelemetry = delRes.deletedCount;
            logger.success(`Deleted ${delRes.deletedCount} routine telemetry records from behaviors`);
        }
    }

    // 2. All Behaviors older than X days
    if (targets.includes('old_behaviors') && cutoffDate) {
        const query = { timestamp: { $lt: cutoffDate } };
        if (dryRun) {
            results.oldBehaviors = await db.collection('behaviors').countDocuments(query);
        } else {
            const delRes = await db.collection('behaviors').deleteMany(query);
            results.oldBehaviors = delRes.deletedCount;
            logger.success(`Deleted ${delRes.deletedCount} old behavior records`);
        }
    }

    // 3. Sent Emails
    if (targets.includes('sent_emails')) {
        let spellingDelQuery = { status: 'sent' };
        let emailReportsQuery = { status: 'sent' };
        let commLogsQuery = {};

        if (cutoffDate) {
            spellingDelQuery = { status: 'sent', sentAt: { $lt: cutoffDate } };
            emailReportsQuery = { status: 'sent', sentAt: { $lt: cutoffDate } };
            commLogsQuery = { createdAt: { $lt: cutoffDate } };
        }

        if (dryRun) {
            const sCount = await db.collection('spellingemaildeliveries').countDocuments(spellingDelQuery);
            const rCount = await db.collection('emailreports').countDocuments(emailReportsQuery);
            const cCount = await db.collection('communicationemaillogs').countDocuments(commLogsQuery);
            results.sentEmails = sCount + rCount + cCount;
        } else {
            const [sDel, rDel, cDel] = await Promise.all([
                db.collection('spellingemaildeliveries').deleteMany(spellingDelQuery),
                db.collection('emailreports').deleteMany(emailReportsQuery),
                db.collection('communicationemaillogs').deleteMany(commLogsQuery)
            ]);
            results.sentEmails = (sDel.deletedCount || 0) + (rDel.deletedCount || 0) + (cDel.deletedCount || 0);
            logger.success(`Deleted ${results.sentEmails} sent email history documents`);
        }
    }

    // 4. Old Notifications
    if (targets.includes('old_notifications')) {
        const notifCutoff = cutoffDate || new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
        const query = { createdAt: { $lt: notifCutoff } };

        if (dryRun) {
            results.oldNotifications = await db.collection('notifications').countDocuments(query);
        } else {
            const delRes = await db.collection('notifications').deleteMany(query);
            results.oldNotifications = delRes.deletedCount;
            logger.success(`Deleted ${delRes.deletedCount} notifications older than cutoff`);
        }
    }

    // 5. Old Import Runs & Jobs
    if (targets.includes('old_imports')) {
        const importCutoff = cutoffDate || new Date(Date.now() - (14 * 24 * 60 * 60 * 1000));
        const query = { createdAt: { $lt: importCutoff } };

        if (dryRun) {
            const i1 = await db.collection('importruns').countDocuments(query);
            const i2 = await db.collection('spellingimportjobs').countDocuments(query);
            results.oldImports = i1 + i2;
        } else {
            const [r1, r2] = await Promise.all([
                db.collection('importruns').deleteMany(query),
                db.collection('spellingimportjobs').deleteMany(query)
            ]);
            results.oldImports = (r1.deletedCount || 0) + (r2.deletedCount || 0);
        }
    }

    // 6. Old AI token usage logs
    if (targets.includes('ai_tokens')) {
        const aiCutoff = cutoffDate || new Date(Date.now() - (60 * 24 * 60 * 60 * 1000));
        const query = { createdAt: { $lt: aiCutoff } };

        if (dryRun) {
            results.aiTokens = await db.collection('aitokenusages').countDocuments(query);
        } else {
            const delRes = await db.collection('aitokenusages').deleteMany(query);
            results.aiTokens = delRes.deletedCount;
        }
    }

    // Recalculate stats
    const updatedOverview = await getDbOverview(db);

    const totalDeleted = Object.values(results).reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);

    res.json({
        success: true,
        data: {
            dryRun,
            deletedCounts: results,
            totalDeleted,
            overview: updatedOverview,
            message: dryRun
                ? `Dry run: Found ${totalDeleted} documents that can be safely deleted.`
                : `Successfully deleted ${totalDeleted} unneeded documents. Storage updated.`
        }
    });
});
