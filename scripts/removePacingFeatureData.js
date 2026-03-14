import 'dotenv/config';
import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import School from '../models/School.js';
import User from '../models/User.js';

const OBSOLETE_PERMISSIONS = [
  'view_pacing_guides',
  'edit_pacing_guides',
  'review_pacing_guides',
  'publish_pacing_guides',
  'approve_pacing_overrides',
];

const OBSOLETE_COLLECTIONS = ['pacingguides', 'pacingoverriderequests'];

const run = async () => {
  await connectDB();

  const userResult = await User.updateMany(
    { permissions: { $in: OBSOLETE_PERMISSIONS } },
    { $pull: { permissions: { $in: OBSOLETE_PERMISSIONS } } }
  );

  const schoolResult = await School.updateMany(
    { 'settings.curriculum.overridePolicy': { $exists: true } },
    { $unset: { 'settings.curriculum.overridePolicy': '' } }
  );

  const existingCollections = await mongoose.connection.db.listCollections().toArray();
  const existingNames = new Set(existingCollections.map((collection) => collection.name));
  const droppedCollections = [];

  for (const collectionName of OBSOLETE_COLLECTIONS) {
    if (!existingNames.has(collectionName)) continue;
    await mongoose.connection.db.dropCollection(collectionName);
    droppedCollections.push(collectionName);
  }

  console.log('Removed pacing feature data:');
  console.log(`- users updated: ${userResult.modifiedCount}`);
  console.log(`- schools updated: ${schoolResult.modifiedCount}`);
  console.log(`- collections dropped: ${droppedCollections.join(', ') || 'none'}`);
};

run()
  .catch((error) => {
    console.error('Failed to remove pacing feature data:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
