/**
 * Read-only audit: compares the embedded `School.subscription` (what the platform
 * dashboard and feature gates display) with the `Subscription` collection (the
 * billing record). Prints every drift and exits non-zero when anything differs.
 *
 * Usage: node scripts/audit-subscription-drift.js
 * Reads, never writes. Point it at a database you are allowed to inspect.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import School from '../models/School.js';
import Subscription from '../models/Subscription.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
}

const run = async () => {
    await mongoose.connect(MONGO_URI);

    const [schools, subscriptions] = await Promise.all([
        School.find({}).select('name subscription.status subscription.plan').lean(),
        Subscription.find({}).select('school plan status').lean(),
    ]);

    const bySchool = new Map(
        subscriptions.map((subscription) => [String(subscription.school), subscription])
    );

    const rows = [];

    for (const school of schools) {
        const embeddedStatus = String(school?.subscription?.status || '').toLowerCase();
        const embeddedPlan = String(school?.subscription?.plan || '').toLowerCase();
        const contract = bySchool.get(String(school._id));

        if (!contract) {
            if (embeddedStatus === 'active') {
                rows.push({ school: school.name, issue: 'no billing record', embedded: embeddedStatus, billing: '—' });
            }
            continue;
        }

        const billingStatus = String(contract.status || '').toLowerCase();
        const billingPlan = String(contract.plan || '').toLowerCase();

        if (embeddedStatus !== billingStatus) {
            rows.push({ school: school.name, issue: 'status', embedded: embeddedStatus, billing: billingStatus });
        }
        if (embeddedPlan !== billingPlan) {
            rows.push({ school: school.name, issue: 'plan', embedded: embeddedPlan, billing: billingPlan });
        }
    }

    if (rows.length === 0) {
        console.log(`No drift: ${schools.length} schools, ${subscriptions.length} billing records.`);
    } else {
        console.table(rows);
        console.log(`${rows.length} drift row(s) across ${schools.length} schools.`);
    }

    await mongoose.connection.close();
    process.exitCode = rows.length === 0 ? 0 : 1;
};

run().catch(async (error) => {
    console.error(error);
    await mongoose.connection.close().catch(() => {});
    process.exitCode = 1;
});
