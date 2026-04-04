// BE-037: Migration directory. Place migration files here.
// Naming convention: YYYYMMDDHHMMSS_description.js
// Each file should export: { up(db), down(db) }
//
// Example:
//   export async function up(db) {
//     await db.collection('grades').updateMany(
//       { newField: { $exists: false } },
//       { $set: { newField: 'defaultValue' } }
//     );
//   }
//   export async function down(db) {
//     await db.collection('grades').updateMany(
//       {},
//       { $unset: { newField: '' } }
//     );
//   }
