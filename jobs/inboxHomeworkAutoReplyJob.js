/**
 * Scans a teacher's already-scanned inbox emails for homework/"what's due"
 * questions. Each run only acts on emails a normal scan already found; the
 * atomic claim in the service is the real safety net against double-sends.
 */
import process from "node:process";
import InboxAssistantSettings from "../models/InboxAssistantSettings.js";
import User from "../models/User.js";
import { runHomeworkAutoReplyForUser } from "../services/inbox/inboxHomeworkAutoReplyService.js";
import logger from "../utils/logger.js";

export const runInboxHomeworkAutoReplyJob = async (
  now = new Date(),
  { env = process.env, pushSender } = {},
) => {
  if (String(env?.RUN_INBOX_HOMEWORK_AUTOREPLY_JOB).toLowerCase() === "false") {
    return { skipped: true, teachers: 0, sent: 0, drafted: 0, failed: 0 };
  }

  const rows = await InboxAssistantSettings.find({
    optedIn: true,
    "homeworkAutoReply.enabled": true,
    "homeworkAutoReply.confirmedRisk": true,
  }).lean();

  const totals = { teachers: 0, sent: 0, drafted: 0, skipped: 0, failed: 0 };
  for (const settings of rows) {
    try {
      const user = await User.findOne({
        _id: settings.user,
        school: settings.school,
      })
        .select("_id school email firstName lastName")
        .lean();
      if (!user) continue;

      const result = await runHomeworkAutoReplyForUser(user, settings, {
        now,
        ...(pushSender ? { pushSender } : {}),
      });
      totals.teachers += 1;
      totals.sent += result.sent;
      totals.drafted += result.drafted;
      totals.skipped += result.skipped;
      totals.failed += result.failed;
    } catch (error) {
      logger.error("inbox_homework_autoreply_teacher_failed", {
        user: String(settings.user),
        school: String(settings.school),
        error: error?.message,
      });
    }
  }

  logger.info("inbox_homework_autoreply_job_completed", totals);
  return totals;
};

export default { runInboxHomeworkAutoReplyJob };
