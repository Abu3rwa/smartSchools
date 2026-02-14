import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import gradeService from "./gradeService.js";
import gmailOAuthService from "./gmailOAuthService.js";
import { renderTemplate } from "../emailTemplates/templateLoader.js";

/**
 * Sanitize email subject to plain ASCII (remove emojis and special characters)
 */
const sanitizeSubject = (subject) => {
  if (!subject) return "Notification";
  // Remove emojis and non-ASCII characters, keep only basic ASCII
  return subject.replace(/[^\x00-\x7F]/g, "").trim();
};

class NotificationService {
  constructor() {
    // Gmail OAuth is the sole email transport – no SMTP configuration needed.
  }

  /** Resolve teacher first name from userId (shared helper). */
  async _resolveTeacherName(userId) {
    if (!userId) return "Unknown Teacher";
    try {
      const user = await User.findById(userId).select("firstName lastName");
      return user?.firstName || "Unknown Teacher";
    } catch {
      return "Unknown Teacher";
    }
  }

  /** Resolve teacher first name + email from userId (shared helper). */
  async _resolveTeacherInfo(userId) {
    if (!userId) return { firstName: "", email: "" };
    try {
      const user = await User.findById(userId).select("firstName lastName email");
      return user || { firstName: "", email: "" };
    } catch {
      return { firstName: "", email: "" };
    }
  }

  /**
   * Send grade update notification to parent(s) and student
   */
  async sendGradeUpdateNotification(studentId, gradeData, createdBy) {
    const student = await Student.findById(studentId);
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) {
      console.log("No parent or student email found for student:", studentId);
      return null;
    }

    const contact = student.getPrimaryContact();

    const subject = `Grade Update for ${student.fullName}`;
    const message = this.formatGradeUpdateMessage(student, gradeData);
    const htmlContent = await this.formatGradeUpdateHtml(
      student,
      gradeData,
      createdBy,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      recipientPhone: contact?.phone,
      student: studentId,
      type: "grade_update",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      createdBy,
    });

    await notification.save();
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send daily report for a student to all contact emails
   */
  async sendDailyReport(studentId, date, createdBy) {
    const student = await Student.findById(studentId).populate("currentClass");
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) return null;

    // Get today's grades
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const grades = await gradeService.getStudentGrades(studentId, {
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    if (grades.length === 0) return null;

    const subject = `Daily Report for ${student.fullName} - ${date.toLocaleDateString()}`;
    const message = this.formatDailyReportMessage(student, grades, date);
    const htmlContent = await this.formatDailyReportHtml(
      student,
      grades,
      date,
      createdBy,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: "daily_report",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      createdBy,
    });

    await notification.save();
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send daily classwork update - cumulative monthly report
   * Includes all classwork grades from the 1st of the month to today
   */
  async sendDailyClassworkUpdate(studentId, date, createdBy, filters = {}) {
    const student = await Student.findById(studentId).populate("currentClass");
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) return null;

    // Get all classwork grades for the current month up to today, with optional filters
    const grades = await gradeService.getMonthlyClassworkGrades(
      studentId,
      date,
      {
        subject: filters.subject,
        category: filters.category,
      },
    );

    if (grades.length === 0) return null;

    const monthName = date.toLocaleString("default", { month: "long" });
    const dayName = date.toLocaleString("default", { weekday: "long" });
    const todayDate = date.getDate();
    const year = date.getFullYear();
    const today = `${dayName}, ${monthName} ${todayDate}, ${year}`;
    console.log("today", today);
    const todayFormatted = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Customize subject line based on filters
    let reportTitle = "Class Update";
    if (filters.category) {
      // Capitalize first letter
      const categoryTitle =
        filters.category.charAt(0).toUpperCase() + filters.category.slice(1);
      reportTitle = `${categoryTitle} Report`;
    }

    const subject = `${reportTitle} - ${student.fullName} (${today})`;
    const message = await this.formatDailyClassworkUpdateMessage(
      student,
      grades,
      date,
      monthName,
      year,
      reportTitle,
      createdBy,
    );
    const htmlContent = await this.formatDailyClassworkUpdateHtml(
      student,
      grades,
      date,
      monthName,
      year,
      reportTitle,
      createdBy,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: "daily_classwork_update",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      metadata: {
        month: date.getMonth() + 1,
        year,
        gradesCount: grades.length,
        filterCategory: filters.category,
      },
      createdBy,
    });

    await notification.save();
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send monthly report to all contact emails
   */
  async sendMonthlyReport(studentId, month, academicYear, createdBy) {
    const student = await Student.findById(studentId).populate("currentClass");
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) return null;

    const report = await gradeService.getStudentGradeReport(
      studentId,
      academicYear,
    );
    const monthName = new Date(2024, month - 1).toLocaleString("default", {
      month: "long",
    });

    const subject = `Monthly Report for ${student.fullName} - ${monthName} ${academicYear}`;
    const message = this.formatMonthlyReportMessage(
      student,
      report,
      month,
      monthName,
    );
    const htmlContent = await this.formatMonthlyReportHtml(
      student,
      report,
      month,
      monthName,
      createdBy,
    );

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: "monthly_report",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      metadata: { month, academicYear },
      createdBy,
    });

    await notification.save();
    await this.sendEmail(notification, createdBy);

    return notification;
  }

  /**
   * Send AI-generated report to parent
   * @param {String} studentId - Student ID
   * @param {String} reportContent - HTML content of the AI report
   * @param {String} period - Period covered by the report
   * @param {String} userId - User ID of the sender
   * @returns {Promise<Object>} Notification document
   */
  async sendAIReportToParent(studentId, reportContent, period, userId) {
    const student = await Student.findById(studentId).populate("currentClass");
    if (!student) throw new Error("Student not found");

    const recipients = student.getAllContactEmails();
    if (recipients.length === 0) {
      throw new Error("No parent or student email found for student");
    }

    const subject = `Progress Report for ${student.fullName} - ${period}`;

    // Extract text content from HTML for plain text version
    const plainText = reportContent
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const notification = new Notification({
      school: student.school,
      recipientEmail: recipients.join(","),
      student: studentId,
      type: "ai_report",
      subject,
      message: plainText,
      htmlContent: reportContent,
      channels: ["email"],
      metadata: {
        period,
        reportType: "ai_generated",
      },
      createdBy: userId,
    });

    await notification.save();
    await this.sendEmail(notification, userId);

    return notification;
  }

  /**
   * Send email using Gmail OAuth.
   * If userId is provided, tries that user's Gmail first.
   * If userId is null or that user has no Gmail, finds any admin in the same
   * school with a connected Gmail account to send on behalf of the school.
   *
   * @param {Object} notification - Notification document
   * @param {string} userId - User ID for Gmail OAuth (optional)
   */
  async sendEmail(notification, userId = null) {
    const mailOptions = {
      to: notification.recipientEmail,
      subject: sanitizeSubject(notification.subject),
      text: notification.message,
      html: notification.htmlContent || notification.message,
    };

    // 1. Try the provided userId first
    if (userId) {
      try {
        const hasGmail = await gmailOAuthService.hasValidTokens(userId);
        if (hasGmail) {
          const result = await gmailOAuthService.sendEmail(userId, mailOptions);
          await notification.markAsSent("email");
          console.log(
            "✅ Email sent via Gmail OAuth to:",
            notification.recipientEmail,
            "MessageId:",
            result.messageId,
          );
          return;
        }
      } catch (error) {
        console.error("Gmail OAuth send failed for provided user:", error.message);
        // Fall through to admin fallback
      }
    }

    // 2. Fallback: find an admin in the school with Gmail connected
    const schoolId = notification.school;
    if (schoolId) {
      try {
        const adminsWithGmail = await User.find({
          school: schoolId,
          role: "admin",
          isActive: true,
          "gmailTokens.refreshToken": { $exists: true, $ne: null },
        })
          .select("_id")
          .setOptions({ skipTenantFilter: true })
          .lean();

        for (const admin of adminsWithGmail) {
          try {
            const hasGmail = await gmailOAuthService.hasValidTokens(admin._id);
            if (hasGmail) {
              const result = await gmailOAuthService.sendEmail(
                admin._id.toString(),
                mailOptions,
              );
              await notification.markAsSent("email");
              console.log(
                "✅ Email sent via admin Gmail fallback to:",
                notification.recipientEmail,
                "MessageId:",
                result.messageId,
              );
              return;
            }
          } catch (innerErr) {
            console.error(
              `Admin ${admin._id} Gmail send failed:`,
              innerErr.message,
            );
            // Try next admin
          }
        }
      } catch (error) {
        console.error("Error finding admin Gmail sender:", error.message);
      }
    }

    // 3. No Gmail sender available
    const errorMsg =
      "No Gmail account available to send email. An admin must connect their Gmail in Settings > Gmail Integration.";
    console.error("❌", errorMsg);
    notification.status = "failed";
    notification.lastError = errorMsg;
    await notification.save();
    throw new Error(errorMsg);
  }

  // Message formatters
  formatGradeUpdateMessage(student, gradeData) {
    return `
Dear ${student.firstName}'s Parent,

This is to inform you that ${student.fullName} received a grade update:

Subject: ${gradeData.subjectName}
Type: ${gradeData.gradeType}
Marks: ${gradeData.marks}/${gradeData.maxMarks}
Date: ${new Date(gradeData.date).toLocaleDateString()}
${gradeData.remarks ? `Remarks: ${gradeData.remarks}` : ""}

Best regards,
    `.trim();
  }

  async formatGradeUpdateHtml(student, gradeData, createdBy = null) {
    const percentage = ((gradeData.marks / gradeData.maxMarks) * 100).toFixed(1);
    const teacherName = await this._resolveTeacherName(createdBy);

    const remarksSection = gradeData.remarks
      ? renderTemplate("gradeUpdateRemarks", { remarks: gradeData.remarks })
      : "";

    return renderTemplate("gradeUpdate", {
      studentFullName: student.fullName,
      studentFirstName: student.firstName,
      teacherName,
      subjectName: gradeData.subjectName,
      gradeType: gradeData.gradeType,
      gradeDate: new Date(gradeData.date).toLocaleDateString(),
      marks: gradeData.marks,
      maxMarks: gradeData.maxMarks,
      percentage,
      remarksSection,
      clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
      year: new Date().getFullYear(),
    });
  }

  formatDailyReportMessage(student, grades, date) {
    const prettyDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    let message = `Daily Report for ${student.fullName}\n`;
    message += `Date: ${prettyDate}\n\n`;

    grades.forEach((grade) => {
      const percentage = ((grade.marks / grade.maxMarks) * 100).toFixed(1);
      message += `${grade.subject.name}: ${grade.marks}/${grade.maxMarks} (${percentage}%)\n`;
    });

    return message.trim();
  }

  async formatDailyReportHtml(student, grades, date, createdBy = null) {
    const prettyDate = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const teacherName = await this._resolveTeacherName(createdBy);

    const gradesRows = grades
      .map((grade) => {
        const percentage = ((grade.marks / grade.maxMarks) * 100).toFixed(1);
        return `<tr>
          <td style="padding: 6px; border: 1px solid #dee2e6; font-size: 12px;">${grade.subject.name}</td>
          <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${grade.marks}/${grade.maxMarks}</td>
          <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${percentage}%</td>
        </tr>`;
      })
      .join("");

    return renderTemplate("dailyReport", {
      prettyDate,
      studentFirstName: student.firstName,
      studentFullName: student.fullName,
      teacherName,
      gradesRows,
    });
  }

  formatMonthlyReportMessage(student, report, month, monthName) {
    let message = `Monthly Report for ${student.fullName} - ${monthName}\n\n`;

    report.subjects.forEach((subject) => {
      const monthData = subject.monthlyAverages[month];
      if (monthData) {
        message += `${subject.subjectName}: ${monthData.average}% (based on ${monthData.entries} entries)\n`;
      }
    });

    message += `\nOverall Average: ${report.overallAverage}%`;
    return message.trim();
  }

  async formatMonthlyReportHtml(
    student,
    report,
    month,
    monthName,
    createdBy = null,
  ) {
    const teacherName = await this._resolveTeacherName(createdBy);

    const subjectsRows = report.subjects
      .map((subject) => {
        const monthData = subject.monthlyAverages[month];
        const avg = monthData?.average || "N/A";
        const entries = monthData?.entries || 0;
        return `<tr>
          <td style="padding: 6px; border: 1px solid #dee2e6; font-size: 12px;">${subject.subjectName}</td>
          <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${avg}%</td>
          <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${entries}</td>
        </tr>`;
      })
      .join("");

    return renderTemplate("monthlyReport", {
      monthName,
      studentFullName: student.fullName,
      teacherName,
      subjectsRows,
      overallAverage: report.overallAverage,
    });
  }

  // Daily Classwork Update formatters
  async formatDailyClassworkUpdateMessage(
    student,
    grades,
    date,
    monthName,
    year,
    title = "Class Update",
    createdBy = null,
  ) {
    const todayStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Fetch the authenticated user (teacher) who is sending the notification
    let authenticatedTeacherName = "Unknown Teacher";
    if (createdBy) {
      try {
        const authenticatedUser =
          await User.findById(createdBy).select("firstName lastName");
        if (authenticatedUser) {
          authenticatedTeacherName = authenticatedUser.firstName;
        }
      } catch (error) {
        console.error("Error fetching authenticated user:", error);
      }
    }

    let message = `${title} for ${student.fullName}\n`;
    message += `Report Date: ${todayStr}\n`;
    message += `Month: ${monthName} ${year}\n\n`;
    message += `Classwork Summary (${grades.length} entries this month) by ${authenticatedTeacherName}:\n`;
    message += "─".repeat(50) + "\n";

    // Group grades by subject and category
    const grouped = {};
    grades.forEach((grade) => {
      const subjectName = grade.subject?.name || "Unknown Subject";
      const category = grade.category || grade.gradeType || "Classwork";
      if (!grouped[subjectName]) {
        grouped[subjectName] = {};
      }
      if (!grouped[subjectName][category]) {
        grouped[subjectName][category] = [];
      }
      grouped[subjectName][category].push(grade);
    });

    Object.entries(grouped).forEach(([subjectName, categories]) => {
      message += `\n${subjectName}\n`;
      Object.entries(categories).forEach(([category, subjectGrades]) => {
        message += `  ${category}:\n`;
        subjectGrades.forEach((grade) => {
          const gradeDate = new Date(grade.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const percentage = ((grade.marks / grade.maxMarks) * 100).toFixed(0);
          message += `    ${gradeDate} | ${grade.marks}/${grade.maxMarks} (${percentage}%)`;
          if (grade.notes) {
            message += ` | ${grade.notes}`;
          }
          message += "\n";
        });
      });
      message += "─".repeat(50) + "\n";
    });

    const totalMarks = grades.reduce((sum, g) => sum + g.marks, 0);
    const totalMaxMarks = grades.reduce((sum, g) => sum + g.maxMarks, 0);
    const overallPercentage =
      totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(1) : 0;

    message += "─".repeat(50) + "\n";
    message += `Monthly Average: ${overallPercentage}%\n\n`;
    message += "Best regards,\n" + authenticatedTeacherName;

    return message;
  }

  async formatDailyClassworkUpdateHtml(
    student,
    grades,
    date,
    monthName,
    year,
    title = "Class Update",
    createdBy = null,
  ) {
    const todayStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const teacherInfo = await this._resolveTeacherInfo(createdBy);
    const teacherName = teacherInfo.firstName || "Unknown Teacher";

    // Group grades by subject and category
    const grouped = {};
    grades.forEach((grade) => {
      const subjectName = grade.subject?.name || "Unknown Subject";
      const category = grade.category || grade.gradeType || "Classwork";
      if (!grouped[subjectName]) {
        grouped[subjectName] = { teacher: teacherName, categories: {} };
      }
      if (!grouped[subjectName].categories[category]) {
        grouped[subjectName].categories[category] = [];
      }
      grouped[subjectName].categories[category].push(grade);
    });

    // Build grouped HTML using partial templates
    const groupedSectionsHtml = Object.entries(grouped)
      .map(([subjectName, subjectData]) => {
        const { teacher, categories } = subjectData;

        const categorySections = Object.entries(categories)
          .map(([category, subjectGrades]) => {
            const catTotal = subjectGrades.reduce((s, g) => s + g.marks, 0);
            const catMax = subjectGrades.reduce((s, g) => s + g.maxMarks, 0);
            const categoryAverage = catMax > 0 ? ((catTotal / catMax) * 10).toFixed(1) : 0;

            const gradeRows = subjectGrades
              .map((grade, index) => {
                const gradeDate = new Date(grade.date).toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                });
                const outOfTen = ((grade.marks / grade.maxMarks) * 10).toFixed(1);
                const bgColor = index % 2 === 0 ? "#ffffff" : "#f8f9fa";
                let gradeColor = "#28a745";
                if (outOfTen < 5) gradeColor = "#dc3545";
                else if (outOfTen < 7) gradeColor = "#ffc107";

                return renderTemplate("classworkGradeRow", {
                  bgColor, gradeDate, gradeColor, outOfTen,
                  marks: grade.marks, maxMarks: grade.maxMarks,
                  notes: grade.notes || "-",
                });
              })
              .join("");

            return renderTemplate("classworkCategorySection", {
              categoryName: category.charAt(0).toUpperCase() + category.slice(1),
              gradeRows,
              categoryAverage,
            });
          })
          .join("");

        return renderTemplate("classworkSubjectSection", {
          subjectName, teacher, categorySections,
        });
      })
      .join("");

    return renderTemplate("dailyClassworkUpdate", {
      title,
      todayStr,
      groupedSectionsHtml,
      teacherFirstName: teacherInfo.firstName,
      teacherEmail: teacherInfo.email,
    });
  }

  /**
   * Notify principals (admins + department principals) of a new attendance request.
   * @param {Object} request - AttendanceRequest document (with populated requestType)
   * @param {Array} principalUsers - Array of User documents to notify
   * @param {string} createdBy - User id (for Gmail OAuth sender, optional)
   */
  async sendAttendanceRequestNewToPrincipals(request, principalUsers, createdBy = null) {
    const typeLabel = request.requestType?.labelEn || request.requestType?.labelAr || "Attendance Request";
    const subject = `New attendance request from ${request.requesterName} - ${typeLabel}`;
    const message = `A new attendance request has been submitted.\n\nRequester: ${request.requesterName}\nEmail: ${request.requesterEmail}\nType: ${typeLabel}\nNotes: ${request.notes || "(none)"}`;
    const notesSection = request.notes ? `<p><strong>Notes:</strong> ${request.notes}</p>` : "";
    const htmlContent = renderTemplate("attendanceRequestNew", {
      requesterName: request.requesterName,
      requesterEmail: request.requesterEmail,
      typeLabel,
      notesSection,
    });
    for (const principal of principalUsers) {
      const notification = new Notification({
        school: request.school,
        recipient: principal._id,
        recipientEmail: principal.email,
        type: "attendance_request",
        subject,
        message,
        htmlContent,
        channels: ["email"],
        metadata: { attendanceRequest: request._id },
        createdBy: createdBy || request.requester,
      });
      await notification.save();
      await this.sendEmail(notification, principal._id.toString());
    }
  }

  /**
   * Notify requester that their attendance request was approved or rejected.
   * @param {Object} request - AttendanceRequest document (with populated requestType, reviewedBy)
   * @param {string} createdBy - User id of the reviewer (for Gmail OAuth sender)
   */
  async sendAttendanceRequestStatusToRequester(request, createdBy) {
    const typeLabel = request.requestType?.labelEn || request.requestType?.labelAr || "Attendance Request";
    const statusLabel = request.status === "approved" ? "Approved" : "Rejected";
    const subject = `Attendance request ${statusLabel} - ${typeLabel}`;
    const message = `Your attendance request (${typeLabel}) has been ${statusLabel.toLowerCase()}.\n\n${request.reviewNote ? `Review note: ${request.reviewNote}` : ""}`;
    const reviewNoteSection = request.reviewNote ? `<p><strong>Review note:</strong> ${request.reviewNote}</p>` : "";
    const htmlContent = renderTemplate("attendanceRequestStatus", {
      statusLabel,
      typeLabel,
      reviewNoteSection,
    });
    const notification = new Notification({
      school: request.school,
      recipient: request.requester,
      recipientEmail: request.requesterEmail,
      type: "attendance_request_status",
      subject,
      message,
      htmlContent,
      channels: ["email"],
      metadata: { attendanceRequest: request._id, status: request.status },
      createdBy,
    });
    await notification.save();
    await this.sendEmail(notification, createdBy);
    return notification;
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(filters = {}, page = 1, limit = 20) {
    const query = {};
    if (filters.student) query.student = filters.student;
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.createdBy) query.createdBy = filters.createdBy;

    const notifications = await Notification.find(query)
      .populate("student", "firstName lastName studentId")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Notification.countDocuments(query);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

export default new NotificationService();
