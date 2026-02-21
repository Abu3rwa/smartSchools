/**
 * Manual test script for staff messaging endpoints
 * Usage: node scripts/test-messages-api.js
 *
 * Make sure you have:
 * 1. A staff user account (teacher/admin/staff) in your database
 * 2. At least one parent user in the same school
 * 3. The server running on localhost:5000
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api';

// UPDATE THESE WITH A STAFF ACCOUNT IN YOUR DB
const STAFF_EMAIL = 'your_staff_email@example.com';
const STAFF_PASSWORD = 'your_staff_password';

async function loginAsStaff() {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: STAFF_EMAIL,
            password: STAFF_PASSWORD
        })
    });

    const loginData = await loginRes.json();
    if (!loginData.success) {
        throw new Error(`Login failed: ${loginData.message || 'Unknown error'}`);
    }

    return loginData.data?.token || loginData.token;
}

async function findParent(token) {
    const res = await fetch(`${BASE_URL}/messages/parents?limit=1`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success || !data.data?.parents?.length) {
        throw new Error('No parent users found for messaging.');
    }

    return data.data.parents[0];
}

async function createThread(token, parentId) {
    const res = await fetch(`${BASE_URL}/messages/threads`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            subject: 'Messaging Portal Test',
            body: 'Hello from the staff test script.',
            recipientUserIds: [parentId]
        })
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(`Create thread failed: ${data.message || 'Unknown error'}`);
    }

    return data.data?.threadId;
}

async function listThreads(token) {
    const res = await fetch(`${BASE_URL}/messages/threads?limit=5`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(`List threads failed: ${data.message || 'Unknown error'}`);
    }

    return data.data?.items || [];
}

async function getThreadDetail(token, threadId) {
    const res = await fetch(`${BASE_URL}/messages/threads/${threadId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(`Get thread detail failed: ${data.message || 'Unknown error'}`);
    }

    return data.data;
}

async function replyToThread(token, threadId) {
    const res = await fetch(`${BASE_URL}/messages/threads/${threadId}/replies`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            body: 'Follow-up reply from staff test script.'
        })
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(`Reply failed: ${data.message || 'Unknown error'}`);
    }

    return data.data?.message;
}

async function markThreadRead(token, threadId) {
    const res = await fetch(`${BASE_URL}/messages/threads/${threadId}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(`Mark read failed: ${data.message || 'Unknown error'}`);
    }

    return data.data?.unreadCount;
}

async function run() {
    try {
        console.log('1) Logging in as staff...');
        const token = await loginAsStaff();
        console.log('   ✅ Login success');

        console.log('2) Finding a parent...');
        const parent = await findParent(token);
        console.log(`   ✅ Parent: ${parent.displayName} (${parent.id})`);

        console.log('3) Creating a new thread...');
        const threadId = await createThread(token, parent.id);
        console.log(`   ✅ Thread created: ${threadId}`);

        console.log('4) Listing threads...');
        const threads = await listThreads(token);
        console.log(`   ✅ Threads returned: ${threads.length}`);

        console.log('5) Fetching thread detail...');
        const detail = await getThreadDetail(token, threadId);
        console.log(`   ✅ Detail subject: ${detail.thread?.subject}`);

        console.log('6) Replying to thread...');
        const reply = await replyToThread(token, threadId);
        console.log(`   ✅ Reply sent: ${reply?.id || 'ok'}`);

        console.log('7) Marking thread read...');
        const unreadCount = await markThreadRead(token, threadId);
        console.log(`   ✅ Unread count: ${unreadCount}`);

        console.log('\nAll messaging endpoints responded successfully.');
    } catch (error) {
        console.error('Test failed:', error.message);
        console.log('\nMake sure:');
        console.log(`- The server is running on ${BASE_URL}`);
        console.log('- STAFF_EMAIL and STAFF_PASSWORD are set in this script');
        console.log('- There is at least one parent user in the same school');
        process.exit(1);
    }
}

run();
