/**
 * Test script to manually trigger attendance reminder job
 * Usage: node scripts/test-attendance-reminder-api.js
 * 
 * Make sure you have:
 * 1. An admin user account in your database
 * 2. The server running on localhost:5000
 */

import dotenv from 'dotenv';
dotenv.config();

// Using Node's built-in fetch (Node 18+)
// For older Node versions, install: npm install node-fetch
// Then change this line to: import fetch from 'node-fetch';

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api';

// ⚠️ UPDATE THESE WITH YOUR ADMIN CREDENTIALS
const ADMIN_EMAIL = 'your_admin_email@example.com'; // Change this!
const ADMIN_PASSWORD = 'your_admin_password'; // Change this!

async function testReminderJob() {
  try {
    console.log('🔐 Step 1: Logging in as admin...');
    
    // Login to get token
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      })
    });

    const loginData = await loginRes.json();
    
    if (!loginData.success) {
      console.error('❌ Login failed:', loginData.message);
      console.log('\n💡 Make sure:');
      console.log('   1. ADMIN_EMAIL and ADMIN_PASSWORD are correct in this script');
      console.log('   2. The user exists and has admin role');
      console.log('   3. The server is running on', BASE_URL);
      process.exit(1);
    }

    const token = loginData.data.token;
    const user = loginData.data.user;
    
    console.log('✅ Login successful!');
    console.log(`   User: ${user.fullName} (${user.role})`);
    console.log(`   School: ${user.school?.name || 'N/A'}\n`);

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      console.error('❌ Error: User must be admin or super_admin to run reminder job');
      console.log(`   Current role: ${user.role}`);
      process.exit(1);
    }

    console.log('📧 Step 2: Running attendance reminder job...');
    
    // Run the reminder job
    const reminderRes = await fetch(`${BASE_URL}/attendance-taking-reminders/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const reminderData = await reminderRes.json();
    
    if (reminderData.success) {
      console.log('✅ Reminder job completed successfully!');
      console.log('\n📊 Results:');
      console.log(`   Processed: ${reminderData.results.processed}`);
      console.log(`   Sent: ${reminderData.results.sent}`);
      console.log(`   Skipped: ${reminderData.results.skipped}`);
      console.log(`   Failed: ${reminderData.results.failed}`);
    } else {
      console.error('❌ Reminder job failed:', reminderData.message);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. The server is running on', BASE_URL);
    console.error('   2. You have internet connection');
    console.error('   3. MongoDB is connected');
    process.exit(1);
  }
}

testReminderJob();
