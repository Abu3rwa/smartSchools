import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import { DEFAULT_PRESENTATION_LAYOUT_SYSTEM } from "../config/presentationLayoutSystems.js";
import Presentation from "../models/Presentation.js";

const TARGET_SCHEMA_VERSION = 3;

const run = async () => {
  await connectDB();

  const result = await Presentation.updateMany(
    {},
    [
      {
        $set: {
          schemaVersion: {
            $cond: [
              { $lt: [{ $ifNull: ["$schemaVersion", 0] }, TARGET_SCHEMA_VERSION] },
              TARGET_SCHEMA_VERSION,
              "$schemaVersion",
            ],
          },
          layoutSystem: {
            $ifNull: ["$layoutSystem", DEFAULT_PRESENTATION_LAYOUT_SYSTEM],
          },
          comments: {
            $cond: [{ $isArray: "$comments" }, "$comments", []],
          },
        },
      },
    ]
  );

  console.log("Presentation schema migration complete:");
  console.log(`- matched: ${result.matchedCount}`);
  console.log(`- modified: ${result.modifiedCount}`);
  console.log(`- target schemaVersion: ${TARGET_SCHEMA_VERSION}`);
};

run()
  .catch((error) => {
    console.error("Failed to migrate presentation schema:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
