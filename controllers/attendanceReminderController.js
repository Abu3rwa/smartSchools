import { asyncHandler } from "../middleware/errorHandler.js";
import logger from "../utils/logger.js";
import AttendanceTakingReminder from "../models/AttendanceTakingReminder.js";
import Attendance from "../models/Attendance.js";
import TeacherPeriodAssignment from "../models/TeacherPeriodAssignment.js";
import Class from "../models/Class.js";
import School from "../models/School.js";
import SchoolCalendarConfig from "../models/SchoolCalendarConfig.js";
import Notification from "../models/Notification.js";
import notificationService from "../services/notificationService.js";
import { getAttendanceReminderSettingsFromSchool } from "../utils/attendanceReminderSettings.js";
import {
  DEFAULT_SCHOOL_TIMEZONE,
  resolveTimeZone,
  getDatePartsInTimeZone,
  ymdKey,
  shiftLocalYmd,
  zonedDateTimeToUtc,
  localYmdToServerMidnightDate,
} from "../utils/schoolTimezone.js";

/** Default: send reminder for classes that ended at least this many hours ago */
const DEFAULT_REMINDER_HOURS = 1;
/** How far back to look for missed classes (48h so we catch yesterday’s classes when job runs next day) */
const REMINDER_LOOKBACK_HOURS = 48;
const DEFAULT_TIMEZONE = DEFAULT_SCHOOL_TIMEZONE;

/**
 * Build HTML table for email that matches the timetable: Period, Class, Subject, Room, Date, Start time, End time.
 * @param {{ periodName: string, className: string, subjectName: string, roomName: string, classDate: string, startTime: string, endTime: string }}
 */
function buildEmailTable({ periodName, className, subjectName, roomName, classDate, startTime, endTime }) {
  return `
    <table>
      <tr>
        <td class="label">📅 Date</td>
        <td><strong>${classDate}</strong></td>
      </tr>
      <tr>
        <td class="label">🕐 Period</td>
        <td><strong>${periodName || "—"}</strong></td>
      </tr>
      <tr>
        <td class="label">🏫 Class</td>
        <td><strong>${className}</strong></td>
      </tr>
      <tr>
        <td class="label">📚 Subject</td>
        <td><strong>${subjectName}</strong></td>
      </tr>
      <tr>
        <td class="label">🕐 Start Time</td>
        <td><strong>${startTime}</strong></td>
      </tr>
      <tr>
        <td class="label">🕐 End Time</td>
        <td><strong>${endTime}</strong></td>
      </tr>
      <tr>
        <td class="label">📍 Room</td>
        <td><strong>${roomName}</strong></td>
      </tr>
    </table>`;
}
/**
 * Run the missed-attendance reminder job (no req/res). Find classes that ended
 * X hours ago (default 1), no attendance taken, no reminder sent → create reminder, send email via SMTP.
 * Safe to call repeatedly (idempotent). Used by the API route and by the automatic scheduler.
 * @param {number} hoursAfterClass - Hours after class end to check (default: 1)
 * @param {{ schoolId?: import('mongoose').Types.ObjectId, departmentId?: import('mongoose').Types.ObjectId }} options - When provided (e.g. from API), scope to school/department
 */
export async function processAttendanceReminders(hoursAfterClass = DEFAULT_REMINDER_HOURS, options = {}) {
  const now = new Date();
  const minHoursAgoMs = hoursAfterClass * 60 * 60 * 1000;
  const lookbackMs = REMINDER_LOOKBACK_HOURS * 60 * 60 * 1000;
  const windowEnd = new Date(now.getTime() - minHoursAgoMs);
  const windowStart = new Date(now.getTime() - lookbackMs);

  const results = { processed: 0, sent: 0, skipped: 0, failed: 0 };

  let assignmentQuery = { isActive: true };
  if (options.schoolId && options.departmentId) {
    const classIds = await Class.find({ school: options.schoolId, department: options.departmentId }).select("_id").lean();
    assignmentQuery.class = { $in: classIds.map((c) => c._id) };
  } else if (options.schoolId) {
    const classIds = await Class.find({ school: options.schoolId }).select("_id").lean();
    assignmentQuery.class = { $in: classIds.map((c) => c._id) };
  }

  const assignments = await TeacherPeriodAssignment.find(assignmentQuery)
    .setOptions({ skipTenantFilter: true })
    .populate("teacher", "firstName lastName email")
    .populate("class", "name department")
    .populate("subject", "name")
    .populate("room", "name")
    .populate("period", "name startTime endTime order")
    .lean();

  const schoolIds = [...new Set(assignments.map((assignment) => String(assignment.school)).filter(Boolean))];
  const schoolConfigs = schoolIds.length
    ? await SchoolCalendarConfig.find({ school: { $in: schoolIds }, isActive: true })
        .select("school timezone")
        .setOptions({ skipTenantFilter: true })
        .lean()
    : [];
  const timeZoneBySchool = new Map(
    schoolConfigs.map((config) => {
      const resolved = resolveTimeZone(config.timezone) || DEFAULT_TIMEZONE;
      return [String(config.school), resolved];
    })
  );

  for (const assignment of assignments) {
    const period = assignment.period;
    const teacher = assignment.teacher;
    if (!period?.startTime || !period?.endTime || !teacher?.email) continue;

    const [startH, startM] = (period.startTime || "").split(":").map(Number);
    const [endH, endM] = (period.endTime || "").split(":").map(Number);
    const schoolId = assignment.school;
    const schoolIdKey = String(schoolId);
    const schoolTimeZone = timeZoneBySchool.get(schoolIdKey) || DEFAULT_TIMEZONE;
    const daysOfWeek = assignment.daysOfWeek && assignment.daysOfWeek.length > 0 ? assignment.daysOfWeek : [1, 2, 3, 4, 5];
    const assignStartParts = getDatePartsInTimeZone(new Date(assignment.startDate), schoolTimeZone);
    const assignEndParts = getDatePartsInTimeZone(new Date(assignment.endDate), schoolTimeZone);
    const assignStartKey = ymdKey(assignStartParts);
    const assignEndKey = ymdKey(assignEndParts);
    const nowInSchoolTz = getDatePartsInTimeZone(now, schoolTimeZone);

    // Check last 3 days for an occurrence whose period end falls in the reminder window
    for (let d = 0; d <= 2; d++) {
      const candidateLocal = shiftLocalYmd(
        { year: nowInSchoolTz.year, month: nowInSchoolTz.month, day: nowInSchoolTz.day },
        -d
      );
      const dayOfWeek = candidateLocal.weekday;
      if (!daysOfWeek.includes(dayOfWeek)) continue;
      const candidateKey = ymdKey(candidateLocal);
      if (candidateKey < assignStartKey || candidateKey > assignEndKey) continue;

      const periodEnd = zonedDateTimeToUtc(
        {
          year: candidateLocal.year,
          month: candidateLocal.month,
          day: candidateLocal.day,
          hour: endH,
          minute: endM || 0,
        },
        schoolTimeZone
      );
      if (periodEnd < windowStart || periodEnd > windowEnd) continue;

      results.processed += 1;
      const attendanceDate = localYmdToServerMidnightDate(candidateLocal);
      const attendanceDayStart = zonedDateTimeToUtc(
        {
          year: candidateLocal.year,
          month: candidateLocal.month,
          day: candidateLocal.day,
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0,
        },
        schoolTimeZone
      );
      const attendanceDayEnd = zonedDateTimeToUtc(
        {
          year: candidateLocal.year,
          month: candidateLocal.month,
          day: candidateLocal.day,
          hour: 23,
          minute: 59,
          second: 59,
          millisecond: 999,
        },
        schoolTimeZone
      );

      const hasAttendance = await Attendance.findOne({
        school: schoolId,
        teacher: assignment.teacher._id,
        period: assignment.period._id,
        date: { $gte: attendanceDayStart, $lte: attendanceDayEnd },
      }).setOptions({ skipTenantFilter: true });

      if (hasAttendance) {
        results.skipped += 1;
        continue;
      }

      const alreadySent = await AttendanceTakingReminder.findOne({
        school: schoolId,
        assignment: assignment._id,
        period: assignment.period._id,
        attendanceDate: { $gte: attendanceDayStart, $lte: attendanceDayEnd },
      }).setOptions({ skipTenantFilter: true });

      if (alreadySent) {
        results.skipped += 1;
        continue;
      }

      const className = assignment.class?.name || "N/A";
      const subjectName = assignment.subject?.name || "N/A";
      const roomName = assignment.room?.name || "N/A";
      const periodName = period.name || "Period";
      const teacherName = [teacher.firstName, teacher.lastName].filter(Boolean).join(" ") || "Teacher";

      const classDate = attendanceDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: schoolTimeZone,
      });
      const periodStartDate = zonedDateTimeToUtc(
        {
          year: candidateLocal.year,
          month: candidateLocal.month,
          day: candidateLocal.day,
          hour: startH,
          minute: startM || 0,
        },
        schoolTimeZone
      );
      const periodEndDate = zonedDateTimeToUtc(
        {
          year: candidateLocal.year,
          month: candidateLocal.month,
          day: candidateLocal.day,
          hour: endH,
          minute: endM || 0,
        },
        schoolTimeZone
      );
      const startTimeStr = periodStartDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: schoolTimeZone,
      });
      const endTimeStr = periodEndDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: schoolTimeZone,
      });

      const subject = `Reminder: Record attendance for ${className} - ${subjectName}`;
      const message = `Hi ${teacherName}, this is a friendly reminder that you haven't recorded attendance for ${periodName} — ${className} - ${subjectName} on ${classDate}. The class was scheduled from ${startTimeStr} to ${endTimeStr} in ${roomName}. Please record attendance as soon as possible.`;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; border-radius: 10px 10px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
    .greeting { font-size: 16px; margin-bottom: 20px; color: #555; }
    .message { background: #f8f9fa; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
    th { background: #667eea; color: white; padding: 12px; text-align: left; font-weight: 600; font-size: 14px; }
    td { padding: 12px; border-bottom: 1px solid #e0e0e0; font-size: 14px; }
    tr:last-child td { border-bottom: none; }
    .label { font-weight: 600; color: #667eea; width: 40%; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none; font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <div class="header"><h1>📋 Attendance Reminder</h1></div>
  <div class="content">
    <div class="greeting"><p>Dear ${teacherName},</p><p>We hope this message finds you well.</p></div>
    <div class="message"><p><strong>This is a friendly reminder</strong> that attendance has not yet been recorded for the following class (from your timetable):</p></div>
    ${buildEmailTable({ periodName, className, subjectName, roomName, classDate, startTime: startTimeStr, endTime: endTimeStr })}
    <p>Please take a moment to record the attendance for this class as soon as possible.</p>
    <p style="margin-top: 30px;">Thank you for your attention to this matter!</p>
    <p style="margin-top: 20px; color: #666;">Best regards,<br><strong>School Administration</strong></p>
  </div>
  <div class="footer"><p>This is an automated reminder. Please do not reply to this email.</p></div>
</body>
</html>`;

      const notification = new Notification({
        school: schoolId,
        recipient: teacher._id,
        recipientEmail: teacher.email,
        type: "attendance",
        subject,
        message,
        htmlContent,
        metadata: {
          assignmentId: assignment._id,
          periodId: assignment.period._id,
          attendanceDate,
          periodName,
          className,
          subjectName,
          room: roomName,
          startTime: periodStartDate,
          endTime: periodEndDate,
        },
      });
      await notification.save();

      let reminderStatusT = "sent";
      let failureReasonT = null;
      try {
        await notificationService.sendEmail(notification, null);
      } catch (err) {
        logger.error("Attendance reminder email failed (timetable)", {
          assignmentId: assignment._id,
          error: err.message,
        });
        reminderStatusT = "failed";
        failureReasonT = err.message || "Send failed";
      }

      await AttendanceTakingReminder.create({
        school: schoolId,
        assignment: assignment._id,
        period: assignment.period._id,
        attendanceDate,
        teacher: teacher._id,
        status: reminderStatusT,
        failureReason: failureReasonT,
        notification: notification._id,
      });

      if (reminderStatusT === "sent") results.sent += 1;
      else results.failed += 1;
      break; // one reminder per assignment per run
    }
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
 */
export const runReminderJob = asyncHandler(async (req, res) => {
  const school = await School.findById(req.schoolId).select("settings.attendanceReminders");
  if (!school) {
    return res.status(404).json({
      success: false,
      message: "School not found",
    });
  }

  const reminderSettings = getAttendanceReminderSettingsFromSchool(school);
  if (reminderSettings.enabled !== true) {
    return res.status(409).json({
      success: false,
      code: "ATTENDANCE_REMINDERS_DISABLED",
      message: "Attendance reminders are disabled in school settings.",
    });
  }

  const hours = reminderSettings.delayMinutes / 60;
  const scopeOptions = {};
  if (req.schoolId) scopeOptions.schoolId = req.schoolId;
  if (req.departmentId) scopeOptions.departmentId = req.departmentId;

  const result = await processAttendanceReminders(hours, scopeOptions);
  res.json({
    success: true,
    message: `Reminder job completed for classes ending at least ${reminderSettings.delayMinutes} minute(s) ago`,
    delayMinutes: reminderSettings.delayMinutes,
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

  if (req.departmentId) {
    const classIds = await Class.find({ school: req.schoolId, department: req.departmentId }).select("_id").lean();
    const assignmentIds = await TeacherPeriodAssignment.find({ class: { $in: classIds.map((c) => c._id) } }).select("_id").lean();
    query.assignment = { $in: assignmentIds.map((a) => a._id) };
  }

  const skip =
    (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
  const reminders = await AttendanceTakingReminder.find(query)
    .populate("schedule", "title startTime endTime")
    .populate("assignment", "class subject room period")
    .populate("period", "name startTime endTime")
    .populate("teacher", "firstName lastName email")
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(Math.min(100, Math.max(1, parseInt(limit, 10))))
    .lean();

  // Check attendance status for each reminder (schedule-based or timetable-based)
  const remindersWithStatus = await Promise.all(
    reminders.map(async (reminder) => {
      let attendanceTaken = false;
      if (reminder.schedule?._id) {
        const attendance = await Attendance.findOne({
          school: reminder.school,
          schedule: reminder.schedule._id,
          date: reminder.attendanceDate,
        }).setOptions({ skipTenantFilter: true });
        attendanceTaken = !!attendance;
      } else if (reminder.assignment && reminder.period?._id && reminder.teacher?._id) {
        const attendance = await Attendance.findOne({
          school: reminder.school,
          teacher: reminder.teacher._id,
          period: reminder.period._id,
          date: reminder.attendanceDate,
        }).setOptions({ skipTenantFilter: true });
        attendanceTaken = !!attendance;
      }
      return {
        ...reminder,
        attendanceTaken,
      };
    })
  );

  const total = await AttendanceTakingReminder.countDocuments(query);

  res.json({
    success: true,
    data: remindersWithStatus,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / Math.max(1, parseInt(limit, 10))),
    },
  });
});
