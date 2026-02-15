/**
 * Check if admin has Gmail connected for sending attendance reminders
 * Run from server folder: node scripts/check-gmail-setup.js
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import School from '../models/School.js';
import gmailOAuthService from '../services/gmailOAuthService.js';

async function checkGmailSetup() {
  await connectDB();

  console.log('=== GMAIL OAUTH SETUP CHECK ===\n');

  // Find all schools
  const schools = await School.find().lean();
  console.log(`Found ${schools.length} school(s)\n`);

  for (const school of schools) {
    console.log(`School: ${school.name}`);
    console.log(`School ID: ${school._id}\n`);

    // Find all admins in this school
    const admins = await User.find({
      school: school._id,
      role: 'admin',
      isActive: true
    })
      .select('firstName lastName email gmailTokens')
      .setOptions({ skipTenantFilter: true })
      .lean();

    console.log(`  Found ${admins.length} active admin(s):`);

    if (admins.length === 0) {
      console.log('  ❌ NO ADMINS FOUND - Cannot send emails!\n');
      continue;
    }

    let hasWorkingGmail = false;

    for (const admin of admins) {
      const hasRefreshToken = admin.gmailTokens?.refreshToken ? true : false;
      console.log(`\n  Admin: ${admin.firstName} ${admin.lastName}`);
      console.log(`    Email: ${admin.email}`);
      console.log(`    Has Gmail Refresh Token: ${hasRefreshToken ? '✅ YES' : '❌ NO'}`);

      if (hasRefreshToken) {
        try {
          const hasValid = await gmailOAuthService.hasValidTokens(admin._id.toString());
          console.log(`    Gmail Tokens Valid: ${hasValid ? '✅ YES' : '❌ NO (expired or invalid)'}`);
          
          if (hasValid) {
            hasWorkingGmail = true;
            console.log(`    ✅ THIS ADMIN CAN SEND EMAILS`);
          }
        } catch (error) {
          console.log(`    ❌ Error checking tokens: ${error.message}`);
        }
      } else {
        console.log(`    ⚠️  Admin needs to connect Gmail in Settings > Gmail Integration`);
      }
    }

    console.log(`\n  School Email Status: ${hasWorkingGmail ? '✅ READY TO SEND' : '❌ NO WORKING GMAIL'}`);
    
    if (!hasWorkingGmail) {
      console.log(`  ⚠️  ACTION REQUIRED: At least one admin must connect their Gmail account`);
      console.log(`     1. Login as admin`);
      console.log(`     2. Go to Settings > Gmail Integration`);
      console.log(`     3. Click "Connect Gmail"`);
      console.log(`     4. Authorize the app to send emails on your behalf`);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
  }

  // Check if Google OAuth is configured
  console.log('=== GOOGLE OAUTH CONFIGURATION ===\n');
  console.log(`GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`GOOGLE_REDIRECT_URI: ${process.env.GOOGLE_REDIRECT_URI || 'Not set'}`);

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log('\n⚠️  Google OAuth credentials not configured!');
    console.log('   Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    console.log('   Get these from: https://console.cloud.google.com/');
  }

  console.log('\n=== CHECK COMPLETE ===');
  process.exit(0);
}

checkGmailSetup().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
