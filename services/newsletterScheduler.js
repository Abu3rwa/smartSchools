import ClassModel from "../models/Class.js";
import NewsletterIssue from "../models/NewsletterIssue.js";
import { getWeekRange } from "../utils/newsletterWeek.js";

/**
 * Idempotently ensure a NewsletterIssue exists for every class for the current week.
 * Safe to run repeatedly (unique index prevents duplicates).
 */
export async function ensureCurrentWeekIssuesForAllClasses(dateLike = new Date()) {
  const { weekStart, weekEnd } = getWeekRange(dateLike);

  const classes = await ClassModel.find({})
    .setOptions({ skipTenantFilter: true })
    .select("_id school academicYear")
    .lean();

  if (!classes.length) return { ensured: 0 };

  const ops = classes.map((cls) => ({
    updateOne: {
      filter: {
        school: cls.school,
        class: cls._id,
        academicYear: cls.academicYear,
        weekStart,
      },
      update: {
        $setOnInsert: {
          school: cls.school,
          class: cls._id,
          academicYear: cls.academicYear,
          weekStart,
          status: "draft",
        },
        $set: { weekEnd },
      },
      upsert: true,
    },
  }));

  const result = await NewsletterIssue.bulkWrite(ops, {
    ordered: false,
  });

  return { ensured: result.upsertedCount || 0 };
}

