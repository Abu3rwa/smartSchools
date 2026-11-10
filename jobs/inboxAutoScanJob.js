import logger from '../utils/logger.js';
import InboxAssistantSettings from '../models/InboxAssistantSettings.js';
import User from '../models/User.js';
import inboxScanService from '../services/inbox/inboxScanService.js';

const MINUTE_MS = 60 * 1000;

/**
 * Scans inboxes for teachers who have auto-scan enabled and whose last scan
 * is older than their configured interval. Runs every 15 minutes.
 */
export async function runInboxAutoScanJob({ now = new Date() } = {}) {
    const eligible = await InboxAssistantSettings.find({
        optedIn: true,
        autoScanEnabled: true,
    }).select('school user autoScanIntervalMinutes lastScanAt').lean();

    if (!eligible.length) {
        return { scanned: 0, skipped: 0, failed: 0 };
    }

    const userIds = eligible.map((row) => row.user);
    const users = await User.find({ _id: { $in: userIds } })
        .select('_id school email')
        .lean();
    const usersById = new Map(users.map((u) => [String(u._id), u]));

    let scanned = 0;
    let skipped = 0;
    let failed = 0;
    let noNewMail = 0;

    for (const settings of eligible) {
        const user = usersById.get(String(settings.user));
        if (!user) {
            skipped += 1;
            continue;
        }

        const intervalMs = (settings.autoScanIntervalMinutes || 60) * MINUTE_MS;
        const lastScan = settings.lastScanAt ? new Date(settings.lastScanAt) : null;
        const dueAt = lastScan ? new Date(lastScan.getTime() + intervalMs) : now;

        if (dueAt > now) {
            skipped += 1;
            continue;
        }

        try {
            // Background scans have no teacher in front of an estimate dialog,
            // so the job quotes itself and hands the quote straight to the scan.
            // The scan still refuses to run if the inbox grew past that quote.
            const estimate = await inboxScanService.estimateScan(user, { mode: 'refresh' });

            // An unchanged inbox costs nothing to scan, but a scan run still
            // spends one of the teacher's daily scans.
            if (!estimate?.newCount) {
                noNewMail += 1;
                continue;
            }

            await inboxScanService.runScan(user, {
                mode: 'refresh',
                acceptedEstimateCents: estimate.estimateCents,
                timeZone: null,
                uiLanguage: 'en',
                reanalyze: false,
            });
            scanned += 1;
        } catch (error) {
            failed += 1;
            logger.error('inbox_auto_scan_failed', {
                userId: String(user._id),
                code: error?.code,
                error: error?.message || String(error),
            });
        }
    }

    logger.info('inbox_auto_scan_completed', { scanned, skipped, failed, noNewMail });
    return { scanned, skipped, failed, noNewMail };
}
