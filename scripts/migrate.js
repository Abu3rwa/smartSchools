/**
 * BE-037: Lightweight database migration runner.
 * 
 * Tracks applied migrations in a `_migrations` collection.
 * Migration files are ordered by timestamp prefix (YYYYMMDDHHMMSS_name.js).
 * 
 * Each migration exports:  { up(db), down(db) }
 * 
 * Usage:
 *   node scripts/migrate.js up     # Apply pending migrations
 *   node scripts/migrate.js down   # Rollback last migration
 *   node scripts/migrate.js status # Show migration status
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
const COLLECTION = '_migrations';

async function getApplied(db) {
    const exists = (await db.listCollections({ name: COLLECTION }).toArray()).length > 0;
    if (!exists) return [];
    return db.collection(COLLECTION).find().sort({ appliedAt: 1 }).toArray();
}

async function getMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
        return [];
    }
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.js'))
        .sort();
}

async function run() {
    const command = process.argv[2] || 'status';
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const applied = await getApplied(db);
    const appliedNames = new Set(applied.map(m => m.name));
    const files = await getMigrationFiles();

    if (command === 'status') {
        console.log('Applied migrations:');
        for (const m of applied) console.log(`  ✓ ${m.name} (${m.appliedAt.toISOString()})`);
        const pending = files.filter(f => !appliedNames.has(f));
        if (pending.length) {
            console.log('Pending migrations:');
            for (const f of pending) console.log(`  ○ ${f}`);
        } else {
            console.log('No pending migrations.');
        }
    } else if (command === 'up') {
        const pending = files.filter(f => !appliedNames.has(f));
        if (!pending.length) { console.log('Nothing to migrate.'); }
        for (const file of pending) {
            console.log(`Applying: ${file}`);
            const mod = await import(path.join(MIGRATIONS_DIR, file));
            await mod.up(db);
            await db.collection(COLLECTION).insertOne({ name: file, appliedAt: new Date() });
            console.log(`  ✓ ${file} applied`);
        }
    } else if (command === 'down') {
        if (!applied.length) { console.log('Nothing to rollback.'); }
        else {
            const last = applied[applied.length - 1];
            console.log(`Rolling back: ${last.name}`);
            const mod = await import(path.join(MIGRATIONS_DIR, last.name));
            if (mod.down) await mod.down(db);
            await db.collection(COLLECTION).deleteOne({ _id: last._id });
            console.log(`  ✓ ${last.name} rolled back`);
        }
    } else {
        console.error(`Unknown command: ${command}. Use: up, down, status`);
    }

    await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
