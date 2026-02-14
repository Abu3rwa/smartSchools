import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import gradeService from "./gradeService.js";
import gmailOAuthService from "./gmailOAuthService.js";

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
    const percentage = ((gradeData.marks / gradeData.maxMarks) * 100).toFixed(
      1,
    );

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

    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 100%; margin: 0 auto; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 16px; text-align: center; color: white;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 600;">Grade Update</h2>
          <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">${student.fullName}</p>
        </div>
        
        <div style="background: #ffffff; padding: 16px 12px;">
          <p style="margin-top: 0; color: #555; font-size: 14px;">Dear ${student.firstName}'s Parent,</p>
          <p style="color: #555; line-height: 1.4; font-size: 14px;">A new grade has been posted for <strong>${student.firstName}</strong> by <strong>${authenticatedTeacherName}</strong>.</p>
          
          <div style="background: #f8f9fa; border-left: 3px solid #1e3c72; padding: 12px; margin: 16px 0; border-radius: 0 3px 3px 0;">
            <div style="margin-bottom: 8px;">
              <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888;">Subject</span>
              <div style="font-size: 16px; font-weight: 600; color: #333;">${gradeData.subjectName}</div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
              <div>
                <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888;">Category</span>
                <div style="font-size: 14px; color: #333;">${gradeData.gradeType}</div>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #888;">Date</span>
                <div style="font-size: 14px; color: #333;">${new Date(gradeData.date).toLocaleDateString()}</div>
              </div>
            </div>

            <div style="text-align: center; padding: 8px 0;">
               <div style="font-size: 28px; font-weight: 700; color: #1e3c72;">${gradeData.marks}<span style="font-size: 16px; color: #888; font-weight: 400;">/${gradeData.maxMarks}</span></div>
               <div style="font-size: 12px; color: #666; font-weight: 500;">${percentage}% Score</div>
            </div>

            ${
              gradeData.remarks
                ? `
            <div style="margin-top: 12px; background: #fff; padding: 8px; border-radius: 3px; border: 1px solid #eee;">
              <span style="font-size: 10px; text-transform: uppercase; color: #888; font-weight: 600;">Teacher's Remarks</span>
              <div style="font-size: 12px; color: #444; margin-top: 3px; font-style: italic;">"${gradeData.remarks}"</div>
            </div>
            `
                : ""
            }
          </div>
          
          <div style="text-align: center; margin-top: 16px;">
             <a href="${process.env.CLIENT_URL || "http://localhost:5173"}" style="background-color: #1e3c72; color: white; padding: 8px 16px; text-decoration: none; border-radius: 20px; font-weight: 600; font-size: 12px; display: inline-block;">View Full Gradebook</a>
          </div>
        </div>
        <div style="background-color: #f1f3f5; padding: 12px; text-align: center; font-size: 12px; color: #888;">
          &copy; ${new Date().getFullYear()} ${authenticatedTeacherName}. All rights reserved.
        </div>
      </div>
    `;
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

    const gradesHtml = grades
      .map((grade) => {
        const percentage = ((grade.marks / grade.maxMarks) * 100).toFixed(1);
        return `
        <tr>
          <td style="padding: 6px; border: 1px solid #dee2e6; font-size: 12px;">${grade.subject.name}</td>
          <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${grade.marks}/${grade.maxMarks}</td>
          <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${percentage}%</td>
        </tr>
      `;
      })
      .join("");

    return `
      <div style="font-family: Arial, sans-serif; max-width: 100%; margin: 0 auto; background: #f8f9fa; padding: 10px;">
        <div style="background: #2c3e50; color: white; padding: 12px 15px; border-radius: 6px 6px 0 0;">
          <h2 style="margin: 0; font-size: 16px;">Daily Report</h2>
          <p style="margin: 3px 0 0 0; font-size: 12px; opacity: 0.9;">${prettyDate}</p>
        </div>
        <div style="background: #ffffff; padding: 12px; border-radius: 0 0 6px 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
          <p style="margin: 0 0 8px 0; color: #333; font-size: 13px;">Dear ${student.firstName}'s Parent,</p>
          <p style="margin: 0 0 12px 0; color: #333; font-size: 13px;">
            Here is the summary of today's performance for <strong>${student.fullName}</strong> by <strong>${authenticatedTeacherName}</strong>:
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 8px 0 0 0; font-size: 12px;">
            <thead>
              <tr style="background: #e9ecef; color: #212529;">
                <th style="padding: 8px; border: 1px solid #dee2e6; text-align: left; font-size: 12px;">Subject</th>
                <th style="padding: 8px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">Marks</th>
                <th style="padding: 8px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">Percentage</th>
              </tr>
            </thead>
            <tbody>
              ${gradesHtml}
            </tbody>
          </table>
          <p style="color: #6c757d; font-size: 10px; margin-top: 12px; border-top: 1px solid #eee; padding-top: 6px;">
            This is an automated message from ${authenticatedTeacherName}.
          </p>
        </div>
      </div>
    `;
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

    const subjectsHtml = report.subjects
      .map((subject) => {
        const monthData = subject.monthlyAverages[month];
        const avg = monthData?.average || "N/A";
        const entries = monthData?.entries || 0;
        return `
        <tr>
          <td style="padding: 6px; border: 1px solid #dee2e6; font-size: 12px;">${subject.subjectName}</td>
          <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${avg}%</td>
          <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${entries}</td>
        </tr>
      `;
      })
      .join("");

    return `
      <div style="font-family: Arial, sans-serif; max-width: 100%; margin: 0 auto; background: #f8f9fa; padding: 5px;">
        <div style="background: #2c3e50; color: white; padding: 7px 15px; border-radius: 6px 6px 0 0;">
          <h2 style="margin: 0; font-size: 16px;">Monthly Report - ${monthName}</h2>
          <p style="margin: 3px 0 0 0; font-size: 12px; opacity: 0.9;">Student: ${student.fullName}</p>
        </div>
        <div style="background: #ffffff; padding: 12px; border-radius: 0 0 6px 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
          <p style="margin: 0 0 12px 0; color: #333; font-size: 13px;">
            Below is the average performance for <strong>${student.fullName}</strong> in each subject for <strong>${monthName}</strong> by <strong>${authenticatedTeacherName}</strong>:
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 6px 0 0 0; font-size: 12px;">
            <thead>
              <tr style="background: #e9ecef; color: #212529;">
                <th style="padding: 6px; border: 1px solid #dee2e6; text-align: left; font-size: 12px;">Subject</th>
                <th style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">Average (%)</th>
                <th style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">Entries</th>
              </tr>
            </thead>
            <tbody>
              ${subjectsHtml}
              <tr style="background: #28a745; color: white; font-weight: bold;">
                <td style="padding: 6px; border: 1px solid #dee2e6; font-size: 12px;">Overall Average</td>
                <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">${report.overallAverage}%</td>
                <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">&nbsp;</td>
              </tr>
            </tbody>
          </table>
          <p style="color: #6c757d; font-size: 10px; margin-top: 10px; border-top: 1px solid #eee; padding-top: 6px;">
            This report shows percentage averages based on recorded grades for the selected month by ${authenticatedTeacherName}.
          </p>
        </div>
      </div>
    `;
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

    // Fetch the authenticated user (teacher) who is sending the notification
    let authenticatedTeacherName = "Unknown Teacher";
    let authenticatedUser = { firstName: "", email: "" };

    if (createdBy) {
      try {
        const user = await User.findById(createdBy).select(
          "firstName lastName email",
        );
        if (user) {
          authenticatedUser = user;
          authenticatedTeacherName = user.firstName;
        }
      } catch (error) {
        console.error("Error fetching authenticated user:", error);
      }
    }

    // Calculate totals
    const totalMarks = grades.reduce((sum, g) => sum + g.marks, 0);
    const totalMaxMarks = grades.reduce((sum, g) => sum + g.maxMarks, 0);
    const overallPercentage =
      totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(1) : 0;
    const overallOutOfTen =
      totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 10).toFixed(1) : 0;

    // Get unique subjects
    const subjects = [
      ...new Set(grades.map((g) => g.subject?.name || "Unknown Subject")),
    ];

    // Use authenticated teacher name instead of individual grade teachers
    const teachers = [authenticatedTeacherName];

    // Group grades by subject and category with teacher info
    const grouped = {};
    grades.forEach((grade) => {
      const subjectName = grade.subject?.name || "Unknown Subject";
      const category = grade.category || grade.gradeType || "Classwork";

      if (!grouped[subjectName]) {
        grouped[subjectName] = {
          teacher: authenticatedTeacherName, // Use authenticated teacher name
          categories: {},
        };
      }

      if (!grouped[subjectName].categories[category]) {
        grouped[subjectName].categories[category] = [];
      }
      grouped[subjectName].categories[category].push(grade);
    });

    // Build grouped HTML sections
    const groupedSectionsHtml = Object.entries(grouped)
      .map(([subjectName, subjectData]) => {
        const { teacher, categories } = subjectData;

        // Generate category sections with individual averages
        const categorySections = Object.entries(categories)
          .map(([category, subjectGrades]) => {
            // Calculate category average
            const categoryTotalMarks = subjectGrades.reduce(
              (sum, g) => sum + g.marks,
              0,
            );
            const categoryTotalMaxMarks = subjectGrades.reduce(
              (sum, g) => sum + g.maxMarks,
              0,
            );
            const categoryAverage =
              categoryTotalMaxMarks > 0
                ? ((categoryTotalMarks / categoryTotalMaxMarks) * 10).toFixed(1)
                : 0;

            const rowsHtml = subjectGrades
              .map((grade, index) => {
                const gradeDate = new Date(grade.date).toLocaleDateString(
                  "en-US",
                  {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  },
                );
                const percentage = (
                  (grade.marks / grade.maxMarks) *
                  100
                ).toFixed(0);
                const outOfTen = ((grade.marks / grade.maxMarks) * 10).toFixed(
                  1,
                );
                const bgColor = index % 2 === 0 ? "#ffffff" : "#f8f9fa";

                let gradeColor = "#28a745";
                if (outOfTen < 5) gradeColor = "#dc3545";
                else if (outOfTen < 7) gradeColor = "#ffc107";

                return `
            <tr style="background: ${bgColor};">
              <td style="padding: 6px 4px; border: 1px solid #dee2e6; font-size: 12px;">${gradeDate}</td>
              <td style="padding: 6px 4px; border: 1px solid #dee2e6; text-align: center; font-size: 12px;">
                <div style="color: ${gradeColor}; font-weight: bold; font-size: 14px;">${outOfTen}/10</div>
                <div style="color: #6c757d; font-size: 10px;">(${grade.marks}/${grade.maxMarks})</div>
              </td>
              <td style="padding: 6px 4px; border: 1px solid #dee2e6; font-style: italic; color: #555; font-size: 12px; max-width: 120px; word-wrap: break-word;">
                ${grade.notes || "-"}
              </td>
            </tr>
          `;
              })
              .join("");

            return `
          <div style="margin: 3px 0; padding: 4px; background: #ffffff; border-radius: 4px; border: 1px solid #e5e7eb;">
            <h3 style="color: #2c3e50; font-size: 14px; margin: 0 0 6px 0; padding-bottom: 4px; border-bottom: 2px solid #3498db;">
              ${category.charAt(0).toUpperCase() + category.slice(1)}
            </h3>
            
            <div style="overflow-x: auto; margin-bottom: 6px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; min-width: 250px;">
                <thead>
                  <tr style="background: #3498db; color: white;">
                    <th style="padding: 4px 2px; border: 1px solid #2980b9; text-align: left; font-weight: 600; font-size: 12px;">Date</th>
                    <th style="padding: 4px 2px; border: 1px solid #2980b9; text-align: center; font-weight: 600; font-size: 12px;">Score (/10)</th>
                    <th style="padding: 4px 2px; border: 1px solid #2980b9; text-align: left; font-weight: 600; font-size: 12px;">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
            
            <!-- Category Average -->
            <div style="background: #e8f4fd; padding: 6px; border-radius: 3px; border-left: 3px solid #3498db; margin-top: 5px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #2c3e50; font-weight: 600; font-size: 12px;">  ${`Average: `} </span>
                 <span style="font-size: 14px; font-weight: bold; color: #3498db;"> ${categoryAverage}/10</span>
              </div>
            </div>
          </div>
        `;
          })
          .join("");

        return `
        <div style="margin: 6px 0; padding: 6px; background: #ffffff; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); border-left: 3px solid #3498db;">
          <div style="margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #eee;">
            <h2 style="color: #2c3e50; margin: 0 0 4px 0; font-size: 15px;">${subjectName}</h2>
            <div style="font-size: 12px; color: #7f8c8d;">
              <strong>Instructor:</strong> ${teacher}
            </div>
          </div>
          ${categorySections}
        </div>
      `;
      })
      .join("");

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 100%; margin: 0; background: #f5f5f5; padding: 4px; box-sizing: border-box;">
        <div style="background: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
          
          <!-- Mobile-Optimized Header -->
          <div style="background: linear-gradient(135deg,rgb(18, 41, 63) 0%,rgb(86, 52, 94) 100%); color: white; padding: 10px 8px;">
            <div style="text-align: center;">
              <h1 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 700;">${title}</h1>
              <p style="margin: 0; font-size: 12px; opacity: 0.9;">${todayStr}</p>
             
            </div>
          </div>

          <!-- Mobile Content -->
          <div style="padding: 6px 4px;">
            
            
            <!-- Mobile Subjects Info -->
            <div style="margin-bottom: 8px;">
              <h2 style="color: #2c3e50; font-size: 13px; margin: 0 0 4px 0; padding-bottom: 4px; border-bottom: 2px solid #3498db;">
                Academic Summary
              </h2>
               
             
            </div>

            <!-- Mobile-Optimized Grades -->
            ${groupedSectionsHtml}

            <!-- Mobile Footer Summary -->
            <div style="margin-top: 6px; padding: 6px; background: #f8f9fa; border-radius: 4px; border: 1px solid #e5e7eb;">
              <div style="text-align: start;">
                <strong style="color: #2c3e50; font-size: 12px; display: block; margin-bottom: 4px;">Best regards,</strong>
                <strong style="color: #2c3e50; font-size: 12px; display: block; margin-bottom: 4px;">${authenticatedUser.firstName},</strong>
                <strong style="color: #2c3e50; font-size: 12px; display: block; margin-bottom: 4px;">${authenticatedUser.email}</strong>

                </div>
            </div>
          </div>
        </div>
      </div>
    `;
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
    const htmlContent = `
      <p>A new attendance request has been submitted.</p>
      <p><strong>Requester:</strong> ${request.requesterName}<br/>
      <strong>Email:</strong> ${request.requesterEmail}<br/>
      <strong>Type:</strong> ${typeLabel}</p>
      ${request.notes ? `<p><strong>Notes:</strong> ${request.notes}</p>` : ""}
      <p>Please log in to review and approve or reject the request.</p>
    `;
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
    const htmlContent = `
      <p>Your attendance request has been <strong>${statusLabel}</strong>.</p>
      <p><strong>Type:</strong> ${typeLabel}</p>
      ${request.reviewNote ? `<p><strong>Review note:</strong> ${request.reviewNote}</p>` : ""}
    `;
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
