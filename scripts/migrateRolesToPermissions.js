/**
 * Migration script to convert legacy role-based users to permission-based model
 * 
 * This script:
 * 1. Finds all users with legacy staff roles
 * 2. Converts their role to 'staff' 
 * 3. Assigns appropriate permissions based on their old role
 * 4. Preserves all other user data
 * 
 * Usage: node scripts/migrateRolesToPermissions.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import { ROLE_TO_PERMISSIONS } from '../config/permissions.js';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const LEGACY_ROLES = [
    'attendance_manager',
    'lesson_plan_reviewer',
    'report_viewer',
    'event_coordinator',
    'behavior_manager',
    'transportation_coordinator',
    'cafeteria_manager',
    'library_manager',
    'it_support',
    'counselor',
    'nurse'
];

async function migrateRolesToPermissions() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✓ Connected to MongoDB');

        // Find all users with legacy roles
        const usersToMigrate = await User.find({
            role: { $in: LEGACY_ROLES }
        }).setOptions({ skipTenantFilter: true });

        console.log(`\nFound ${usersToMigrate.length} users to migrate`);

        if (usersToMigrate.length === 0) {
            console.log('No users need migration. Exiting.');
            await mongoose.disconnect();
            return;
        }

        // Show preview
        console.log('\nPreview of changes:');
        console.log('─'.repeat(80));
        usersToMigrate.forEach(user => {
            const permissions = ROLE_TO_PERMISSIONS[user.role] || [];
            console.log(`${user.email}`);
            console.log(`  Old role: ${user.role}`);
            console.log(`  New role: staff`);
            console.log(`  Permissions: ${permissions.join(', ') || 'none'}`);
            console.log('');
        });
        console.log('─'.repeat(80));

        // Ask for confirmation (in production, you might want to add a CLI prompt)
        console.log('\nStarting migration...\n');

        let migratedCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const user of usersToMigrate) {
            try {
                const oldRole = user.role;
                const permissions = ROLE_TO_PERMISSIONS[oldRole] || [];

                // Update user
                user.role = 'staff';
                user.permissions = permissions;
                
                await user.save();
                
                migratedCount++;
                console.log(`✓ Migrated: ${user.email} (${oldRole} → staff + ${permissions.length} permissions)`);
            } catch (error) {
                errorCount++;
                errors.push({ email: user.email, error: error.message });
                console.error(`✗ Failed: ${user.email} - ${error.message}`);
            }
        }

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('Migration Summary');
        console.log('='.repeat(80));
        console.log(`Total users found: ${usersToMigrate.length}`);
        console.log(`Successfully migrated: ${migratedCount}`);
        console.log(`Failed: ${errorCount}`);
        
        if (errors.length > 0) {
            console.log('\nErrors:');
            errors.forEach(({ email, error }) => {
                console.log(`  - ${email}: ${error}`);
            });
        }

        console.log('\n✓ Migration complete!');

        // Disconnect
        await mongoose.disconnect();
        console.log('✓ Disconnected from MongoDB');

    } catch (error) {
        console.error('Migration failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run migration
migrateRolesToPermissions();
