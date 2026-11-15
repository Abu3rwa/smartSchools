import WritingAssessment from "../models/WritingAssessment.js";
import WritingAssignment from "../models/WritingAssignment.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingProject from "../models/WritingProject.js";
import { notifyFeedbackPublished } from "../services/writingFeedbackEmailService.js";
import logger from "../utils/logger.js";

const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 10 * 60 * 1000;

/**
 * Publish returns before the family email is sent, so a crashed or failed send
 * would otherwise stay silent: the teacher sees a published round and no one
 * knows whether the mail left. This sweep picks those records up and retries
 * them, up to MAX_ATTEMPTS, with the channels the teacher originally chose.
 * Skipped sends (school switch off, no addresses) are never retried by a job —
 * only the teacher's own resend can act on those.
 */
export const runWritingFeedbackEmailRetry = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - RETRY_AFTER_MS);
  const rows = await WritingAssessment.find({
    "publish.state": "published",
    "publish.email.status": { $in: ["pending", "failed"] },
    "publish.email.attempts": { $lt: MAX_ATTEMPTS },
    $or: [
      { "publish.email.lastAttemptAt": { $lte: cutoff } },
      { "publish.email.lastAttemptAt": null },
    ],
  })
    .select("_id school project assignment draft kind")
    .limit(50)
    .lean()
    .setOptions({ skipTenantFilter: true });

  const summary = { checked: rows.length, retried: 0, sent: 0, failed: 0 };
  for (const row of rows) {
    const [project, assignment, draft, assessment] = await Promise.all([
      WritingProject.findOne({ school: row.school, _id: row.project }).lean(),
      WritingAssignment.findOne({ school: row.school, _id: row.assignment }).lean(),
      WritingDraft.findOne({ school: row.school, _id: row.draft }).lean(),
      WritingAssessment.findOne({ school: row.school, _id: row._id })
        .select("-aiOriginal")
        .lean(),
    ]);
    if (!project || !assignment || !draft || !assessment) continue;

    const channels = assessment.publish?.email?.channels;
    const notify =
      channels && (channels.student || channels.parents)
        ? { student: channels.student, parents: channels.parents }
        : undefined;

    summary.retried += 1;
    try {
      const result = await notifyFeedbackPublished({
        schoolId: row.school,
        userId: assessment.publish?.publishedBy,
        project,
        assignment,
        draft,
        assessment,
        notify,
      });
      if (result?.results?.some((entry) => entry.status === "sent")) summary.sent += 1;
      else summary.failed += 1;
    } catch (error) {
      summary.failed += 1;
      logger.warn("writing_feedback_email_retry_failed", {
        assessmentId: String(row._id),
        error: error?.message,
      });
    }
  }
  return summary;
};
