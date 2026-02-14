import { asyncHandler } from "../middleware/errorHandler.js";
import logger from "../utils/logger.js";
import AttendanceTakingReminder from "../models/AttendanceTakingReminder.js";
import Attendance from "../models/Attendance.js";
import Schedule from "../models/Schedule.js";
import Notification from "../models/Notification.js";
import notificationService from "../services/notificationService.js";

/** Default reminder window: 10 hours after class end (run job every ~15 min so we catch "10h after end") */
const DEFAULT_REMINDER_HOURS = 10;
const REMINDER_WINDOW_END_MS = DEFAULT_REMINDER_HOURS * 60 * 60 * 1000;
const REMINDER_WINDOW_START_MS = REMINDER_WINDOW_END_MS + 15 * 60 * 1000; // Add 15 min window

/**
 * Build date at local midnight for schedule date (matches Attendance date storage).
 */
function toAttendanceDate(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}
/**
 * Run the missed-attendance reminder job (no req/res). Find classes that ended
 * X hours ago (default 10), no attendance taken, no reminder sent → create reminder, send email via SMTP.
 * Safe to call repeatedly (idempotent). Used by the API route and by the automatic scheduler.
 * @param {number} hoursAfterClass - Hours after class end to check (default: 10)
 */
export async function processAttendanceReminders(hoursAfterClass = DEFAULT_REMINDER_HOURS) {
  const now = new Date();
  const windowEndMs = hoursAfterClass * 60 * 60 * 1000;
  const windowStartMs = windowEndMs + 15 * 60 * 1000; // 15 min window
  const windowEnd = new Date(now.getTime() - windowEndMs);
  const windowStart = new Date(now.getTime() - windowStartMs);

  const schedules = await Schedule.find({
    type: "class",
    requiresAttendance: true,
    status: { $ne: "cancelled" },
    endTime: { $gte: windowStart, $lte: windowEnd },
  })
    .setOptions({ skipTenantFilter: true })
    .populate("teacher", "firstName lastName email")
    .populate("class", "name")
    .populate("subject", "name")
    .populate("room", "name")
    .lean();

  const results = { processed: 0, sent: 0, skipped: 0, failed: 0 };

  for (const schedule of schedules) {
    results.processed += 1;
    const attendanceDate = toAttendanceDate(schedule.startTime);
    const schoolId = schedule.school;

    const [hasAttendance, existingReminder] = await Promise.all([
      Attendance.findOne({
        school: schoolId,
        schedule: schedule._id,
        date: attendanceDate,
      }).setOptions({ skipTenantFilter: true }),
      AttendanceTakingReminder.findOne({
        school: schoolId,
        schedule: schedule._id,
        attendanceDate,
      }).setOptions({ skipTenantFilter: true }),
    ]);

    if (hasAttendance || existingReminder) {
      results.skipped += 1;
      continue;
    }

    const teacher = schedule.teacher;
    if (!teacher?.email) {
      results.skipped += 1;
      continue;
    }

    const className = schedule.class?.name || "N/A";
    const subjectName = schedule.subject?.name || "N/A";
    const roomName = schedule.room?.name || "N/A";
    const teacherName =
      [teacher.firstName, teacher.lastName].filter(Boolean).join(" ") ||
      "Teacher";
    const startTimeStr = new Date(schedule.startTime).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const subject = `Reminder: Record attendance for ${className} - ${subjectName}`;
    const message = `Hi ${teacherName}, this is a friendly reminder that you haven't recorded attendance for ${className} - ${subjectName} today. The class was scheduled for ${startTimeStr} in ${roomName}. Please record attendance as soon as possible.`;

    const notification = new Notification({
      school: schoolId,
      recipient: schedule.teacher._id,
      recipientEmail: teacher.email,
      type: "attendance",
      subject,
      message,
      metadata: {
        scheduleId: schedule._id,
        attendanceDate,
        className,
        subjectName,
        room: roomName,
      },
    });
    await notification.save();

    let reminderStatus = "sent";
    let failureReason = null;
    try {
      // Pass null as userId – sendEmail will auto-find a school admin with Gmail connected
      await notificationService.sendEmail(
        notification,
        null,
      );
    } catch (err) {
      logger.error("Attendance reminder email failed", {
        scheduleId: schedule._id,
        error: err.message,
      });
      reminderStatus = "failed";
      failureReason = err.message || "Send failed";
    }

    await AttendanceTakingReminder.create([
      {
        school: schoolId,
        schedule: schedule._id,
        attendanceDate,
        teacher: schedule.teacher._id,
        status: reminderStatus,
        failureReason,
        notification: notification._id,
      },
    ]);

    if (reminderStatus === "sent") results.sent += 1;
    else results.failed += 1;
  }

  return { 
    results,
    hoursAfterClass,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString()
  };
}

/**
 * HTTP handler: run the reminder job and return JSON.
 * Query params:
 *   - hours: Number of hours after class end to check (default: 10)
 *            Examples: 1, 1.5, 2, 10
 */
export const runReminderJob = asyncHandler(async (req, res) => {
  const hoursParam = req.query.hours || req.body.hours;
  const hours = hoursParam ? parseFloat(hoursParam) : DEFAULT_REMINDER_HOURS;
  
  // Validate hours parameter
  if (isNaN(hours) || hours <= 0 || hours > 24) {
    return res.status(400).json({
      success: false,
      message: "Invalid hours parameter. Must be between 0 and 24.",
    });
  }

  const result = await processAttendanceReminders(hours);
  res.json({
    success: true,
    message: `Reminder job completed for classes ending ${hours} hour(s) ago`,
    ...result,
  });
});

/**
 * List attendance-taking reminders (admin). Uses tenant context.
 */
export const getReminders = asyncHandler(async (req, res) => {
  const {
    startDate,
    endDate,
    teacherId,
    status,
    limit = 50,
    page = 1,
  } = req.query;
  const query = { school: req.schoolId };
  if (teacherId) query.teacher = teacherId;
  if (status) query.status = status;
  if (startDate || endDate) {
    query.attendanceDate = {};
    if (startDate) query.attendanceDate.$gte = new Date(startDate);
    if (endDate) query.attendanceDate.$lte = new Date(endDate);
  }

  const skip =
    (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
  const reminders = await AttendanceTakingReminder.find(query)
    .populate("schedule", "title startTime endTime")
    .populate("teacher", "firstName lastName email")
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(Math.min(100, Math.max(1, parseInt(limit, 10))))
    .lean();

  const total = await AttendanceTakingReminder.countDocuments(query);

  res.json({
    success: true,
    data: reminders,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / Math.max(1, parseInt(limit, 10))),
    },
  });
});
