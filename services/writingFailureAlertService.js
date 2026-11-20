/**
 * K8: one alert per outage.
 *
 * Failed runs are counted per school and failure class; the third failure in a
 * quarter of an hour notifies the school admins once, and the same outage is
 * silent for the next six hours. Without this, an outage is discovered student
 * by student by every teacher in the building.
 */
import Notification from "../models/Notification.js";
import School from "../models/School.js";
import User from "../models/User.js";
import WritingFailureAlert from "../models/WritingFailureAlert.js";
import logger from "../utils/logger.js";
import { assertCanSpend } from "./aiCreditService.js";
import notificationService from "./notificationService.js";

/** Only failures an admin can act on; a bad reply or a short draft is not an outage. */
export const ALERT_FAILURE_CODES = [
  "AI_PROVIDER_ERROR",
  "AI_PROVIDER_QUOTA",
  "CREDIT_EXHAUSTED",
];
export const ALERT_THRESHOLD = 3;
export const ALERT_WINDOW_MS = 15 * 60 * 1000;
export const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const COPY = {
  en: {
    AI_PROVIDER_ERROR: {
      subject: "Writing feedback AI is failing",
      message:
        "{count} writing assessments failed in the last {minutes} minutes because the AI provider did not answer. A failed provider call is not charged. Check the provider key and status, then run the Writing Assistant self-test from a teacher account. This is the only alert for this outage.",
    },
    AI_PROVIDER_QUOTA: {
      subject: "The AI provider account is out of balance",
      message:
        "{count} writing assessments failed in the last {minutes} minutes because the AI provider account is out of balance. A failed provider call is not charged to the school, and the school's own AI credit is untouched. The platform owner needs to top up the provider account. This is the only alert for this outage.",
    },
    CREDIT_EXHAUSTED: {
      subject: "AI credit is stopping writing feedback",
      message:
        "{count} writing assessments were stopped in the last {minutes} minutes because there is not enough AI credit to run them. Top up or allocate AI credit and the assessments run again; nothing else in the app is affected. This is the only alert for this outage.",
    },
  },
  ar: {
    AI_PROVIDER_ERROR: {
      subject: "تعذّر تقييم الكتابة بالذكاء الاصطناعي",
      message:
        "فشل {count} تقييم كتابة خلال آخر {minutes} دقيقة لأن مزوّد الذكاء الاصطناعي لم يستجب. المحاولة الفاشلة عند المزوّد لا تُحتسب على الرصيد. تحقّق من مفتاح المزوّد وحالته، ثم شغّل الاختبار الذاتي لمساعد الكتابة من حساب معلّم. هذا هو التنبيه الوحيد لهذا الانقطاع.",
    },
    AI_PROVIDER_QUOTA: {
      subject: "رصيد مزوّد الذكاء الاصطناعي نفد",
      message:
        "فشل {count} تقييم كتابة خلال آخر {minutes} دقيقة لأن رصيد مزوّد الذكاء الاصطناعي نفد. المحاولة الفاشلة عند المزوّد لا تُحتسب على المدرسة، ورصيد المدرسة من الذكاء الاصطناعي لم يُمسّ. يحتاج مالك المنصّة إلى تعبئة رصيد المزوّد. هذا هو التنبيه الوحيد لهذا الانقطاع.",
    },
    CREDIT_EXHAUSTED: {
      subject: "رصيد الذكاء الاصطناعي يوقف تقييم الكتابة",
      message:
        "توقّف {count} تقييم كتابة خلال آخر {minutes} دقيقة لأنه لا يوجد رصيد كافٍ من الذكاء الاصطناعي لتشغيلها. أضف رصيدًا أو خصّصه لتعود التقييمات، ولا يتأثر بقية التطبيق. هذا هو التنبيه الوحيد لهذا الانقطاع.",
    },
  },
};

const fill = (template, values) =>
  String(template || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

/** Pure: the admin-facing sentence for one outage. */
export const buildFailureAlertCopy = ({
  errorCode,
  count,
  language = "en",
  minutes = ALERT_WINDOW_MS / 60000,
}) => {
  const tier = COPY[language === "ar" ? "ar" : "en"][errorCode];
  return {
    subject: tier.subject,
    message: fill(tier.message, { count, minutes }),
  };
};

/** Pure: the third failure claims the alert, the rest of the outage stays quiet. */
export const alertDecision = ({ count, alertedAt }, now = new Date()) => {
  if (!(Number(count) >= ALERT_THRESHOLD)) return false;
  if (alertedAt && now - new Date(alertedAt) < ALERT_COOLDOWN_MS) return false;
  return true;
};

const recordFailure = async ({ schoolId, errorCode, now }) => {
  // A failure after a cold window starts a new count, so a burst last month
  // cannot make this week's first failure look like an outage.
  await WritingFailureAlert.updateOne(
    {
      school: schoolId,
      code: errorCode,
      firstAt: { $lt: new Date(now.getTime() - ALERT_WINDOW_MS) },
    },
    { $set: { count: 0, firstAt: now } },
  );
  return WritingFailureAlert.findOneAndUpdate(
    { school: schoolId, code: errorCode },
    { $setOnInsert: { firstAt: now }, $set: { lastAt: now }, $inc: { count: 1 } },
    { upsert: true, new: true },
  );
};

const sendAdminAlert = async ({ schoolId, errorCode, count }) => {
  const [school, admins] = await Promise.all([
    School.findOne({ _id: schoolId }).select("name reportSettings.defaultLanguage").lean(),
    User.find({
      school: schoolId,
      isActive: true,
      email: { $exists: true, $ne: "" },
      $or: [{ role: "admin" }, { roles: "admin" }],
    })
      .select("_id email")
      .lean(),
  ]);
  if (!admins || admins.length === 0) return;

  const language =
    String(school?.reportSettings?.defaultLanguage || "").toLowerCase() === "arabic"
      ? "ar"
      : "en";
  const message = buildFailureAlertCopy({ errorCode, count, language });

  for (const admin of admins) {
    try {
      const notification = await Notification.create({
        school: schoolId,
        recipient: admin._id,
        recipientEmail: admin.email,
        type: "custom",
        subject: message.subject,
        message: message.message,
        channels: ["email"],
        priority: "high",
        metadata: { kind: "writing_ai_alert", code: errorCode, count },
      });
      await notificationService.sendEmail(notification);
    } catch (error) {
      // The row is the record; a mail hiccup must never break the run path.
      logger.warn("writing_failure_alert_email_failed", {
        schoolId: String(schoolId),
        admin: String(admin._id),
        message: error?.message,
      });
    }
  }
};

/**
 * Counts one failed writing AI run and alerts the school admins when the same
 * failure repeats. Never throws: monitoring must not break the failure path.
 */
export const noteWritingFailure = async ({
  schoolId,
  errorCode,
  now = new Date(),
}) => {
  if (!ALERT_FAILURE_CODES.includes(errorCode)) return null;
  try {
    const row = await recordFailure({ schoolId, errorCode, now });
    if (!row) return null;
    if (!alertDecision(row, now)) return { alerted: false, count: row.count };

    // Claim the alert before sending so parallel failures cannot send it twice.
    const claim = await WritingFailureAlert.updateOne(
      {
        _id: row._id,
        $or: [
          { alertedAt: null },
          { alertedAt: { $lte: new Date(now.getTime() - ALERT_COOLDOWN_MS) } },
        ],
      },
      { $set: { alertedAt: now } },
    );
    if (claim?.modifiedCount !== 1) return { alerted: false, count: row.count };

    await sendAdminAlert({ schoolId, errorCode, count: row.count });
    return { alerted: true, count: row.count };
  } catch (error) {
    logger.warn("writing_failure_alert_failed", {
      schoolId: String(schoolId),
      errorCode,
      message: error?.message,
    });
    return null;
  }
};

/** A credit refusal on a writing AI path feeds the same monitor, then rethrows. */
export const assertWritingCredit = async ({
  schoolId,
  userId,
  assertSpend = assertCanSpend,
}) => {
  try {
    return await assertSpend({ schoolId, userId });
  } catch (error) {
    // Only "out of credit" is the repeated failure an admin can fix by topping
    // up; a paused account or missing pricing is a deliberate state, not an outage.
    if (error?.code === "AI_CREDIT_REQUIRED") {
      void noteWritingFailure({ schoolId, errorCode: "CREDIT_EXHAUSTED" });
    }
    throw error;
  }
};
