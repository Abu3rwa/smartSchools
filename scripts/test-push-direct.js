/**
 * test-push-direct.js
 * ─────────────────────────────────────────────────────────────────
 * One-shot script to send a push notification directly to a device
 * token using the FCM v1 API + your service account JSON.
 *
 * Run from the server folder:
 *   node scripts/test-push-direct.js
 * ─────────────────────────────────────────────────────────────────
 */

import { google } from 'googleapis';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── 1. Load service account ──────────────────────────────────────
const sa = require(path.resolve(__dirname, '../smile3-service-account.json'));

// ── 2. Hardcode the device token you want to test ────────────────
const DEVICE_TOKEN = 'fDzO71-vSuqWuaCmso5ibe:APA91bH3QsK8rr8qOMVuqfxzWBo3Lkg0nrCZw0-nXKbDQZQIOp1hIfM5TG6Yys-D8rY9b2a5aURUf4U-EgjsvT9vNmTRauvGD3T4kDOfH4ZZ-9T0TJRa7Ic';

// ── 3. Notification payload ──────────────────────────────────────
const TITLE = '🔔 Test from backend';
const BODY = 'If you see this — push notifications are working! 🎉';

// ────────────────────────────────────────────────────────────────
async function main() {
    // Get an OAuth2 access token via the service account
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: sa.client_email,
            private_key: sa.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });

    const accessToken = await auth.getAccessToken();
    if (!accessToken) throw new Error('Failed to get access token from service account');

    console.log('✅ Got FCM access token');

    // Build FCM v1 message
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const payload = {
        message: {
            token: DEVICE_TOKEN,
            notification: { title: TITLE, body: BODY },
            android: {
                priority: 'HIGH',
                notification: { channelId: 'parent_updates' },
            },
        },
    };

    console.log(`📡 Sending to token: ${DEVICE_TOKEN.substring(0, 20)}...`);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
    });

    const json = await response.json();

    if (response.ok) {
        console.log('🎉 Push sent successfully!');
        console.log('   Message ID:', json.name);
        console.log('\n👉 Check your device — a notification should have appeared.');
    } else {
        console.error('❌ FCM returned an error:');
        console.error(JSON.stringify(json, null, 2));
    }
}

main().catch((err) => {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
});
