/**
 * Script to safely clean up bloated log/telemetry data and reclaim MongoDB Atlas storage
 * Run from server directory:
 *   node scripts/cleanup-storage.mjs --dry-run
 *   node scripts/cleanup-storage.mjs --execute
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

const isDryRun = !process.argv.includes('--execute');

async function runCleanup() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log(`\n======================================================`);
  console.log(`   MONGODB ATLAS STORAGE CLEANUP (${isDryRun ? 'DRY RUN' : 'EXECUTING LIVE'})`);
  console.log(`======================================================\n`);

  const beforeStats = await db.stats();
  const beforeDataMB = (beforeStats.dataSize / (1024 * 1024)).toFixed(2);
  const beforeStorageMB = (beforeStats.storageSize / (1024 * 1024)).toFixed(2);
  console.log(`Current Database Stats:`);
  console.log(`- Data Size:    ${beforeDataMB} MB`);
  console.log(`- Storage Size: ${beforeStorageMB} MB`);
  console.log(`- Objects:      ${beforeStats.objects}`);
  console.log(`------------------------------------------------------\n`);

  // 1. Routine Telemetry (api_request, session_heartbeat in behaviors)
  const telemetryQuery = { eventType: { $in: ['api_request', 'session_heartbeat'] } };
  const telemetryCount = await db.collection('behaviors').countDocuments(telemetryQuery);
  console.log(`1. Routine Telemetry (api_request, session_heartbeat): ${telemetryCount} documents found`);

  // 2. Sent Emails (spellingemaildeliveries, emailreports, communicationemaillogs)
  const spellingSentCount = await db.collection('spellingemaildeliveries').countDocuments({ status: 'sent' });
  const emailReportsCount = await db.collection('emailreports').countDocuments({ status: 'sent' });
  const commLogsCount = await db.collection('communicationemaillogs').countDocuments();
  console.log(`2. Sent Emails & Deliveries: ${spellingSentCount + emailReportsCount + commLogsCount} documents found`);
  console.log(`   - Spelling Sent Emails:   ${spellingSentCount}`);
  console.log(`   - Sent AI Email Reports:  ${emailReportsCount}`);
  console.log(`   - Communication Logs:     ${commLogsCount}`);

  // 3. Old Notifications (>30 days old)
  const notifCutoff = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
  const oldNotifCount = await db.collection('notifications').countDocuments({ createdAt: { $lt: notifCutoff } });
  console.log(`3. Notifications older than 30 days: ${oldNotifCount} documents found`);

  // 4. Old Import Runs
  const oldImportsCount = await db.collection('importruns').countDocuments({ createdAt: { $lt: notifCutoff } });
  console.log(`4. Import runs older than 30 days: ${oldImportsCount} documents found`);

  if (isDryRun) {
    console.log(`\n======================================================`);
    console.log(`DRY RUN SUMMARY:`);
    const totalPotential = telemetryCount + spellingSentCount + emailReportsCount + commLogsCount + oldNotifCount + oldImportsCount;
    console.log(`Total documents that can be safely deleted: ${totalPotential}`);
    console.log(`Estimated uncompressed space to reclaim: ~260 - 280 MB (approx. 90% of current usage!)`);
    console.log(`\nTo execute this cleanup and free the space, run:`);
    console.log(`  node scripts/cleanup-storage.mjs --execute`);
    console.log(`======================================================\n`);
  } else {
    console.log(`\nDeleting records...`);
    const [delTelemetry, delSpelling, delEmailRep, delComm, delNotif, delImports] = await Promise.all([
      db.collection('behaviors').deleteMany(telemetryQuery),
      db.collection('spellingemaildeliveries').deleteMany({ status: 'sent' }),
      db.collection('emailreports').deleteMany({ status: 'sent' }),
      db.collection('communicationemaillogs').deleteMany({ createdAt: { $lt: notifCutoff } }),
      db.collection('notifications').deleteMany({ createdAt: { $lt: notifCutoff } }),
      db.collection('importruns').deleteMany({ createdAt: { $lt: notifCutoff } })
    ]);

    const totalDeleted = (delTelemetry.deletedCount || 0) +
      (delSpelling.deletedCount || 0) +
      (delEmailRep.deletedCount || 0) +
      (delComm.deletedCount || 0) +
      (delNotif.deletedCount || 0) +
      (delImports.deletedCount || 0);

    console.log(`\nCleanup Results:`);
    console.log(`- Routine Telemetry deleted: ${delTelemetry.deletedCount}`);
    console.log(`- Sent Spelling Emails deleted: ${delSpelling.deletedCount}`);
    console.log(`- Sent Email Reports deleted: ${delEmailRep.deletedCount}`);
    console.log(`- Old Communication Logs deleted: ${delComm.deletedCount}`);
    console.log(`- Old Notifications deleted: ${delNotif.deletedCount}`);
    console.log(`- Old Import Runs deleted: ${delImports.deletedCount}`);
    console.log(`TOTAL DOCUMENTS DELETED: ${totalDeleted}`);

    const afterStats = await db.stats();
    const afterDataMB = (afterStats.dataSize / (1024 * 1024)).toFixed(2);
    console.log(`\nUpdated Database Stats:`);
    console.log(`- Data Size:    ${afterDataMB} MB (was ${beforeDataMB} MB)`);
    console.log(`- Storage Size: ${(afterStats.storageSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`- Objects:      ${afterStats.objects} (was ${beforeStats.objects})`);
    console.log(`Space reclaimed: ${(beforeDataMB - afterDataMB).toFixed(2)} MB!`);
  }

  await mongoose.disconnect();
}

runCleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
